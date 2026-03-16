import type { NewsItem } from "@shared/types"

const chinaKeywords = /china|chinese|beijing|shanghai|hong kong|taiwan|yuan|renminbi|xi jinping|trade war|tariff/i

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
  const data = await rss2json("https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en-US&gl=US")
  if (!data?.items.length) throw new Error("Cannot fetch rss data")

  const sorted = data.items.sort((a, b) => {
    const aChina = chinaKeywords.test(a.title) ? 0 : 1
    const bChina = chinaKeywords.test(b.title) ? 0 : 1
    return aChina - bChina
  })

  const items = sorted.slice(0, 20)
  const news: NewsItem[] = []
  for (const item of items) {
    const zh = await translateTitle(item.title)
    news.push({
      title: zh || item.title,
      url: item.link,
      id: item.link,
      pubDate: item.created,
      extra: {
        hover: zh ? item.title : undefined,
      },
    })
    await new Promise(r => setTimeout(r, 100))
  }
  return news
})
