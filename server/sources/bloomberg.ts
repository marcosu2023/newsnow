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
  const getter = defineRSSHubSource("/bloomberg")
  const items = await getter()
  const sliced = items.slice(0, 15)
  const news: NewsItem[] = await Promise.all(sliced.map(async (item) => {
    const hover = await translateTitle(item.title)
    return {
      ...item,
      extra: {
        hover,
      },
    }
  }))
  return news
})
