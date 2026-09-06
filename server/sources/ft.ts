import type { NewsItem } from "@shared/types"

const chinaKeywords = /china|chinese|beijing|shanghai|hong kong|taiwan|yuan|renminbi|xi jinping|trade war|tariff/i

async function translateTitle(title: string): Promise<string | undefined> {
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-CN&q=${encodeURIComponent(title)}`
    const res: any = await proxyFetch(url)
    return typeof res?.[0] === "string" ? res[0] : undefined
  } catch (error) {
    console.warn("[ft] Google title translation failed:", error instanceof Error ? error.message : String(error))
    return undefined
  }
}

export default defineSource(async () => {
  const getter = defineProxyRSSSource("https://www.ft.com/?format=rss")
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
