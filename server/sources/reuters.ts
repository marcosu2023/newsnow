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
  const xml: string = await myFetch(url, { responseType: "text" })

  const entries: SitemapEntry[] = []
  const urlBlocks = xml.split("<url>").slice(1)
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? ""
    const title = block.match(/<news:title><!\[CDATA\[(.+?)\]\]><\/news:title>/)?.[1] ?? ""
    const pubDate = block.match(/<news:publication_date>([^<]+)<\/news:publication_date>/)?.[1] ?? ""
    if (loc && title) {
      entries.push({ loc, title, pubDate })
    }
  }
  return entries
}

async function translateTitle(title: string): Promise<string | undefined> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(title)}`
    const res: any = await myFetch(url)
    return res?.[0]?.[0]?.[0]
  } catch {
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
