import process from "node:process"
import { scoreAndRank } from "../lib/viral-scorer"

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

function getBaseUrl(): string {
  if (process.env.NUXT_SITE_URL) return process.env.NUXT_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const debug = query.debug === "1"
  const baseUrl = getBaseUrl()

  const debugLogs: { id: string; url: string; status: string; bodyPreview: string; itemCount: number }[] = []

  const results = await Promise.allSettled(
    SCAN_SOURCES.map(async (src) => {
      const url = `${baseUrl}/api/s?id=${encodeURIComponent(src.id)}&latest=true`

      if (debug) {
        // Use native fetch for debug to capture raw response details
        try {
          const res = await fetch(url)
          const text = await res.text()
          let parsed: any = {}
          try { parsed = JSON.parse(text) } catch {}
          const items = (parsed.items || [])
            .filter((item: any) => item.title && [...(item.title)].length >= 6)
            .map((item: any) => ({
              title: item.title,
              url: item.url || "",
              sourceId: src.id,
              sourceName: src.name,
              pubDate: typeof item.pubDate === "string" ? Date.parse(item.pubDate) || undefined
                : typeof item.pubDate === "number" ? item.pubDate
                : typeof item.extra?.date === "string" ? Date.parse(item.extra.date) || undefined
                : item.extra?.date,
            }))
          debugLogs.push({
            id: src.id,
            url,
            status: `${res.status} ${res.statusText}`,
            bodyPreview: text.slice(0, 200),
            itemCount: items.length,
          })
          return items
        } catch (e: any) {
          debugLogs.push({
            id: src.id,
            url,
            status: `FETCH_ERROR: ${e.message || e}`,
            bodyPreview: "",
            itemCount: 0,
          })
          throw e
        }
      }

      // Normal mode: use $fetch
      const res = await $fetch<{ items?: { id?: string | number; title?: string; url?: string; pubDate?: number | string; extra?: { date?: string | number } }[] }>(url)
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
      return items
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

  if (debug) {
    const rejectedSources = results
      .map((r, i) => r.status === "rejected" ? { id: SCAN_SOURCES[i].id, error: String(r.reason).slice(0, 200) } : null)
      .filter(Boolean)

    return {
      _debug: true,
      baseUrl,
      env: {
        NUXT_SITE_URL: process.env.NUXT_SITE_URL || "(not set)",
        VERCEL_URL: process.env.VERCEL_URL || "(not set)",
      },
      totalSources: SCAN_SOURCES.length,
      sourcesScanned,
      totalItems: allItems.length,
      rejectedCount: rejectedSources.length,
      rejectedSources,
      sourceLogs: debugLogs,
    }
  }

  const ranked = scoreAndRank(allItems)
  const picks = ranked.slice(0, 20)

  return {
    timestamp: new Date().toISOString(),
    totalScanned: allItems.length,
    sourcesScanned,
    picks,
  }
})
