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

export default defineEventHandler(async () => {
  const baseUrl = getBaseUrl()

  const results = await Promise.allSettled(
    SCAN_SOURCES.map(async (src) => {
      const url = `${baseUrl}/api/s?id=${encodeURIComponent(src.id)}&latest=true`
      const res = await $fetch<{ items?: { title?: string; url?: string; extra?: { date?: string | number } }[] }>(url)
      const items = (res.items || [])
        .filter(item => item.title && [...(item.title)].length >= 6)
        .map(item => ({
          title: item.title!,
          url: item.url || "",
          sourceId: src.id,
          source: src.name,
          pubDate: item.extra?.date,
        }))
      return items
    }),
  )

  const allItems: { title: string; url: string; sourceId: string; source: string; pubDate?: string | number }[] = []
  let sourcesScanned = 0

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      allItems.push(...r.value)
      sourcesScanned++
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
