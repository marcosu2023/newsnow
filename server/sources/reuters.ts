import type { NewsItem } from "@shared/types"

const chinaPath = /\/world\/china\//
const chinaKeywords = /china|chinese|beijing|shanghai|hong\s*kong|taiwan|tibetan|tibet|xinjiang|yuan|renminbi|xi\s*jinping|trade\s*war|tariff.*chin|chin.*tariff/i

interface SitemapEntry {
  loc: string
  title: string
  pubDate: string
}

async function fetchSitemapPage(from?: number): Promise<SitemapEntry[]> {
  const url = from
    ? `https://www.reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml&from=${from}`
    : `https://www.reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml`
  const xml: string = await proxyFetch(url, { responseType: "text" }) as string

  const entries: SitemapEntry[] = []
  const urlBlocks = xml.split("<url>").slice(1)
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? ""
    // Reuters 已不再用 CDATA 包裹标题，两种格式都兼容
    const rawTitle = block.match(/<news:title>(?:<!\[CDATA\[)?([\s\S]+?)(?:\]\]>)?<\/news:title>/)?.[1] ?? ""
    const title = rawTitle
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;|&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .trim()
    const pubDate = block.match(/<news:publication_date>([^<]+)<\/news:publication_date>/)?.[1] ?? ""
    if (loc && title) {
      entries.push({ loc, title, pubDate })
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
    console.warn("[reuters] Google title translation failed:", error instanceof Error ? error.message : String(error))
    return undefined
  }
}

export default defineSource(async () => {
  // Fetch multiple sitemap pages in parallel to find China-related articles
  const pages = await Promise.all([
    fetchSitemapPage(),
    fetchSitemapPage(100),
    fetchSitemapPage(200),
    fetchSitemapPage(300),
    fetchSitemapPage(400),
    fetchSitemapPage(500),
  ])
  const allEntries = pages.flat()

  // Prioritize: China section first, then keyword matches from other sections
  const chinaSection = allEntries.filter(e => chinaPath.test(e.loc))
  const chinaKeyword = allEntries.filter(e => !chinaPath.test(e.loc) && chinaKeywords.test(e.title))
  const combined = [...chinaSection, ...chinaKeyword].slice(0, 20)

  if (!combined.length) throw new Error("No China-related articles found")

  const news: NewsItem[] = []
  for (const item of combined) {
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
