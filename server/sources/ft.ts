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
  const getter = defineRSSSource("https://www.ft.com/?format=rss")
  const items = await getter()

  const sorted = items.sort((a, b) => {
    const aChina = chinaKeywords.test(a.title) ? 0 : 1
    const bChina = chinaKeywords.test(b.title) ? 0 : 1
    return aChina - bChina
  })

  const sliced = sorted.slice(0, 20)
  const news: NewsItem[] = []
  for (const item of sliced) {
    const zh = await translateTitle(item.title)
    news.push({
      ...item,
      title: zh || item.title,
      extra: {
        hover: zh ? item.title : undefined,
      },
    })
    await new Promise(r => setTimeout(r, 100))
  }
  return news
})
