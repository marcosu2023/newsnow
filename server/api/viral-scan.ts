import type { SourceID } from "@shared/types"
import { getters } from "#/getters"
import { getCacheTable } from "#/database/cache"
import { scoreAndRank } from "../lib/viral-scorer"

// Sources to scan — premium + Chinese finance/business sources
const SCAN_SOURCES: { id: string; name: string }[] = [
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

async function fetchSourceItems(sourceId: string): Promise<{ title: string; url: string; pubDate?: string | number }[]> {
  const id = sourceId as SourceID
  // Try cache first
  const cacheTable = await getCacheTable()
  if (cacheTable) {
    const cache = await cacheTable.get(id)
    if (cache && cache.items?.length) {
      return cache.items.map(item => ({
        title: item.title || "",
        url: item.url || "",
        pubDate: item.extra?.date,
      }))
    }
  }
  // Fall back to getter
  const getter = getters[id]
  if (!getter) return []
  try {
    const items = (await getter()).slice(0, 30)
    return items.map(item => ({
      title: item.title || "",
      url: item.url || "",
      pubDate: item.extra?.date,
    }))
  } catch {
    return []
  }
}

export default defineEventHandler(async () => {
  const results = await Promise.allSettled(
    SCAN_SOURCES.map(async (src) => {
      const rawItems = await fetchSourceItems(src.id)
      return rawItems
        .filter(item => item.title && [...item.title].length >= 6)
        .map(item => ({
          title: item.title,
          url: item.url,
          sourceId: src.id,
          source: src.name,
          pubDate: item.pubDate,
        }))
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
