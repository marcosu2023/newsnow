import type { NewsItem } from "@shared/types"

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
  const data = await rss2json("https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com+china+OR+chinese+OR+beijing&ceid=US:en&hl=en-US&gl=US")
  if (!data?.items.length) throw new Error("Cannot fetch rss data")
  const items = data.items.slice(0, 15)
  const news: NewsItem[] = await Promise.all(items.map(async (item) => {
    const hover = await translateTitle(item.title)
    return {
      title: item.title,
      url: item.link,
      id: item.link,
      pubDate: item.created,
      extra: {
        hover,
      },
    }
  }))
  return news
})
