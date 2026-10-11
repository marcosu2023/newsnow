import type { NewsItem } from "@shared/types"

const chinaKeywords = /china|chinese|beijing|shanghai|hong kong|taiwan|yuan|renminbi|xi jinping|trade war|tariff/i
// Google News 会把旧文章重新收录并给出新时间，改用 WSJ 自己的新闻 sitemap 拿原始发布时间
const SITEMAP_URL = "https://www.wsj.com/wsjsitemaps/wsj_google_news.xml"
const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface SitemapEntry {
  loc: string
  title: string
  pubDate: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()
}

async function fetchSitemap(): Promise<SitemapEntry[]> {
  const xml: string = await proxyFetch(SITEMAP_URL, { responseType: "text" }) as string
  const entries: SitemapEntry[] = []
  for (const block of xml.split("<url>").slice(1)) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? ""
    const title = block.match(/<news:title>(?:<!\[CDATA\[)?([\s\S]+?)(?:\]\]>)?<\/news:title>/)?.[1] ?? ""
    const pubDate = block.match(/<news:publication_date>([^<]+)<\/news:publication_date>/)?.[1]?.trim() ?? ""
    if (loc && title && pubDate) {
      entries.push({ loc: decodeEntities(loc), title: decodeEntities(title), pubDate })
    }
  }
  return entries
}

async function translateTitle(title: string): Promise<string | undefined> {
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-CN&q=${encodeURIComponent(title)}`
    const res: any = await proxyFetch(url)
    return typeof res?.[0] === "string" ? res[0] : undefined
  } catch (error) {
    console.warn("[wsj] Google title translation failed:", error instanceof Error ? error.message : String(error))
    return undefined
  }
}

export default defineSource(async () => {
  const now = Date.now()
  const data = (await fetchSitemap()).filter((e) => {
    const t = Date.parse(e.pubDate)
    return !Number.isNaN(t) && now - t <= MAX_AGE_MS
  })
  if (!data.length) throw new Error("Cannot fetch recent WSJ articles from sitemap")

  // 中国相关优先，组内按发布时间倒序
  const sorted = data.sort((a, b) => {
    const aChina = chinaKeywords.test(a.title) ? 0 : 1
    const bChina = chinaKeywords.test(b.title) ? 0 : 1
    return aChina - bChina || Date.parse(b.pubDate) - Date.parse(a.pubDate)
  })

  const items = sorted.slice(0, 20)
  const news: NewsItem[] = []
  for (const item of items) {
    const zh = await translateTitle(item.title)
    news.push({
      title: zh || item.title,
      url: item.loc,
      id: item.loc,
      pubDate: item.pubDate,
      extra: {
        hover: zh ? item.title : undefined,
      },
    })
    await new Promise(r => setTimeout(r, 100))
  }
  return news
})
