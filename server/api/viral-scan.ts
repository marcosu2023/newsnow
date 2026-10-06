import { defineEventHandler, getQuery } from "h3"
import { type CandidateInput, scoreAndRank } from "../lib/viral-scorer"
import { candidateRejection, parseSourceDate } from "../lib/viral-input"
import { getCachedSnapshot, isRedisConfigured, savePicks } from "../lib/redis-cache"

// Sources to scan — premium + Chinese finance/business sources
const SCAN_SOURCES = [
  // Premium 5
  { id: "caixin", name: "财新网" },
  { id: "reuters", name: "路透社" },
  { id: "bloomberg", name: "彭博社" },
  { id: "wsj", name: "华尔街日报" },
  { id: "ft", name: "金融时报" },
  // Chinese finance sources
  { id: "cls-telegraph", name: "财联社-电报" },
  { id: "cls-depth", name: "财联社-深度" },
  { id: "wallstreetcn-quick", name: "华尔街见闻-快讯" },
  { id: "wallstreetcn-news", name: "华尔街见闻-最新" },
  { id: "36kr-quick", name: "36氪-快讯" },
  { id: "gelonghui", name: "格隆汇" },
  { id: "fastbull-express", name: "法布财经-快讯" },
  { id: "fastbull-news", name: "法布财经-头条" },
  { id: "jin10", name: "金十数据" },
  // Stock quote/rank rows are not event headlines.
  { id: "mktnews-flash", name: "MKTNews-快讯" },
]

async function fetchAllSources(debug: boolean, observedAt: number) {
  const debugLogs: { id: string, status: string, itemCount: number, rejected?: Record<string, number>, error?: string }[] = []

  const results = await Promise.allSettled(
    SCAN_SOURCES.map(async (src) => {
      try {
        const res = await $fetch<{ items?: { id?: string | number, title?: string, url?: string, pubDate?: number | string, extra?: { date?: string | number } }[] }>(`/api/s`, {
          query: { id: src.id, latest: "true" },
        })
        const rejected: Record<string, number> = {}
        const items = (res.items || [])
          .map(item => ({
            title: item.title || "",
            url: item.url || "",
            sourceId: src.id,
            sourceName: src.name,
            ...parseSourceDate(item.pubDate ?? item.extra?.date, src.id),
            _scanTime: observedAt,
          }))
          .filter((item) => {
            const reason = candidateRejection(item, Date.now())
            if (reason) rejected[reason] = (rejected[reason] ?? 0) + 1
            return !reason
          })
        if (debug) {
          debugLogs.push({ id: src.id, status: "ok", itemCount: items.length, rejected })
        }
        return items
      } catch (e: any) {
        if (debug) {
          debugLogs.push({ id: src.id, status: "error", itemCount: 0, error: String(e.message || e).slice(0, 200) })
        }
        throw e
      }
    }),
  )

  const allItems: CandidateInput[] = []
  let sourcesScanned = 0
  let sourcesSucceeded = 0

  for (const r of results) {
    if (r.status === "fulfilled") sourcesSucceeded++
    if (r.status === "fulfilled" && r.value.length > 0) {
      allItems.push(...r.value)
      sourcesScanned++
    }
  }

  return { allItems, sourcesScanned, sourcesSucceeded, debugLogs, results }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const debug = query.debug === "1"
  const forceRefresh = query.refresh === "1"

  const redisOk = isRedisConfigured()

  // --- Try cached response first ---
  if (redisOk && !forceRefresh && !debug) {
    try {
      const now = Date.now()
      const cached = await getCachedSnapshot(now)
      if (cached && now - cached.fetchedAt < 30 * 60 * 1000) {
        return {
          timestamp: new Date().toISOString(),
          fetchedAt: cached.fetchedAt,
          totalScanned: cached.totalScanned,
          sourcesScanned: cached.sourcesScanned,
          fromCache: true,
          picks: cached.picks,
        }
      }
    } catch {
      // Redis error → fall through to live scan
    }
  }

  // --- Live scan ---
  const observedAt = Date.now()
  const { allItems, sourcesScanned, sourcesSucceeded, debugLogs, results } = await fetchAllSources(debug, observedAt)

  if (debug) {
    const rejectedSources = results
      .map((r, i) => r.status === "rejected" ? { id: SCAN_SOURCES[i].id, error: String(r.reason).slice(0, 200) } : null)
      .filter(Boolean)

    return {
      _debug: true,
      redisConfigured: redisOk,
      totalSources: SCAN_SOURCES.length,
      sourcesScanned,
      totalItems: allItems.length,
      rejectedCount: rejectedSources.length,
      rejectedSources,
      sourceLogs: debugLogs,
    }
  }

  const now = Date.now()
  if (redisOk && sourcesSucceeded === 0) {
    try {
      const cached = await getCachedSnapshot(now)
      if (cached) return { timestamp: new Date(now).toISOString(), fetchedAt: cached.fetchedAt, totalScanned: cached.totalScanned, sourcesScanned: cached.sourcesScanned, fromCache: true, picks: cached.picks }
    } catch {}
  }
  const ranked = scoreAndRank(allItems, now)
  const picks = ranked.slice(0, 50)
  let finalPicks = picks

  // --- Save to Redis (merge with existing) ---
  if (redisOk && sourcesSucceeded > 0) {
    try {
      finalPicks = await savePicks(ranked, { fetchedAt: now, totalScanned: allItems.length, sourcesScanned }, now)
    } catch {
      // Redis save failed → continue with live data
    }
  }

  return {
    timestamp: new Date().toISOString(),
    fetchedAt: now,
    totalScanned: allItems.length,
    sourcesScanned,
    fromCache: false,
    picks: finalPicks.slice(0, 50),
  }
})
