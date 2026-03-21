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
  const data = await rss2json("https://news.google.com/rss/search?q=site:reuters.com/world/china+when:24h&ceid=US:en&hl=en-US&gl=US")
  if (!data?.items.length) throw new Error("Cannot fetch rss data")

  const items = data.items.slice(0, 20)
  const news: NewsItem[] = []
  for (const item of items) {
    const title = item.title.replace(/\s*-\s*Reuters$/, "")
    const zh = await translateTitle(title)
    news.push({
      title: zh || title,
      url: item.link,
      id: item.link,
      pubDate: item.created,
      extra: {
        hover: zh ? title : undefined,
      },
    })
    await new Promise(r => setTimeout(r, 100))
  }
  return news
})
