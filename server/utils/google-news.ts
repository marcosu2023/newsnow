import type { NewsItem } from "@shared/types"
import { proxyRss2json } from "./rss2json"

export function getGoogleNewsSiteRssUrl(domain: string): string {
  const url = new URL("https://news.google.com/rss/search")
  url.searchParams.set("q", `site:${domain} when:1d`)
  url.searchParams.set("ceid", "US:en")
  url.searchParams.set("hl", "en-US")
  url.searchParams.set("gl", "US")
  return url.toString()
}

export async function fetchGoogleNewsSite(domain: string): Promise<NewsItem[]> {
  const data = await proxyRss2json(getGoogleNewsSiteRssUrl(domain))
  if (!data?.items.length) throw new Error(`Cannot fetch Google News RSS for ${domain}`)

  return data.items.map(item => ({
    title: item.title,
    url: item.link,
    id: item.link,
    pubDate: item.created,
  }))
}
