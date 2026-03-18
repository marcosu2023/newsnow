import { scoreAndRank } from "../lib/viral-scorer"
import { shouldRefresh, getCachedPicks, savePicks, isRedisConfigured } from "../lib/redis-cache"

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
  { id: "xueqiu-hotstock", name: "雪球-热门股票" },
  { id: "mktnews-flash", name: "MKTNews-快讯" },
]

async function fetchAllSources(debug: boolean) {
  const debugLogs: { id: string; status: string; itemCount: number; error?: string }[] = []

  const results = await Promise.allSettled(
    SCAN_SOURCES.map(async (src) => {
      try {
        const res = await $fetch<{ items?: { id?: string | number; title?: string; url?: string; pubDate?: number | string; extra?: { date?: string | number } }[] }>(`/api/s`, {
          query: { id: src.id, latest: "true" },
        })
        const items = (res.items || [])
          .filter(item => item.title && [...(item.title)].length >= 6)
          .map(item => ({
            title: item.title!,
            url: item.url || "",
            sourceId: src.id,
            sourceName: src.name,
            pubDate: typeof item.pubDate === "string" ? Date.parse(item.pubDate) || undefined
              : typeof item.pubDate === "number" ? item.pubDate
              : typeof item.extra?.date === "string" ? Date.parse(item.extra.date) || undefined
              : item.extra?.date,
          }))
        if (debug) {
          debugLogs.push({ id: src.id, status: "ok", itemCount: items.length })
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

  const allItems: { title: string; url: string; sourceId: string; sourceName: string; pubDate?: number }[] = []
  let sourcesScanned = 0

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      allItems.push(...r.value)
      sourcesScanned++
    }
  }

  return { allItems, sourcesScanned, debugLogs, results }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const debug = query.debug === "1"
  const forceRefresh = query.refresh === "1"

  const redisOk = isRedisConfigured()

  // --- Try cached response first ---
  if (redisOk && !forceRefresh && !debug) {
    try {
      const needRefresh = await shouldRefresh()
      if (!needRefresh) {
        const cached = await getCachedPicks()
        if (cached && cached.length > 0) {
          return {
            timestamp: new Date().toISOString(),
            totalScanned: cached.length,
            sourcesScanned: 0,
            fromCache: true,
            picks: cached,
          }
        }
      }
    } catch {
      // Redis error → fall through to live scan
    }
  }

  // --- Live scan ---
  const { allItems, sourcesScanned, debugLogs, results } = await fetchAllSources(debug)

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

  const ranked = scoreAndRank(allItems)
  const picks = ranked.slice(0, 50) // keep more for 24h accumulation

  // --- Save to Redis (merge with existing) ---
  if (redisOk && picks.length > 0) {
    try {
      await savePicks(picks)
    } catch {
      // Redis save failed → continue with live data
    }
  }

  // --- Return merged data if Redis available ---
  let finalPicks = picks
  if (redisOk) {
    try {
      const merged = await getCachedPicks()
      if (merged && merged.length > 0) {
        finalPicks = merged
      }
    } catch {
      // fallback to live picks
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalScanned: allItems.length,
    sourcesScanned,
    fromCache: false,
    picks: finalPicks.slice(0, 50),
  }
})
