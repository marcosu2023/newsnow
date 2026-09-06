import { beforeEach, describe, expect, it, vi } from "vitest"
import { fetchGoogleNewsSite, getGoogleNewsSiteRssUrl } from "./google-news"
import { proxyRss2json } from "./rss2json"

vi.mock("./rss2json", () => ({
  proxyRss2json: vi.fn(),
}))

describe("google News site RSS", () => {
  beforeEach(() => {
    vi.mocked(proxyRss2json).mockReset()
  })

  it("builds the working site query instead of the obsolete allinurl query", () => {
    const url = new URL(getGoogleNewsSiteRssUrl("wsj.com"))

    expect(url.origin + url.pathname).toBe("https://news.google.com/rss/search")
    expect(url.searchParams.get("q")).toBe("site:wsj.com when:1d")
    expect(url.searchParams.get("ceid")).toBe("US:en")
    expect(url.searchParams.get("hl")).toBe("en-US")
    expect(url.searchParams.get("gl")).toBe("US")
  })

  it("maps RSS entries to NewsNow items", async () => {
    vi.mocked(proxyRss2json).mockResolvedValue({
      title: "WSJ",
      description: "",
      link: "https://news.google.com",
      image: "",
      updatedTime: "2026-07-19T00:00:00Z",
      items: [{
        title: "Current story - WSJ",
        description: "",
        link: "https://news.google.com/articles/current",
        created: "Sun, 19 Jul 2026 02:26:00 GMT",
      }],
    })

    await expect(fetchGoogleNewsSite("wsj.com")).resolves.toEqual([{
      title: "Current story - WSJ",
      url: "https://news.google.com/articles/current",
      id: "https://news.google.com/articles/current",
      pubDate: "Sun, 19 Jul 2026 02:26:00 GMT",
    }])
  })

  it("fails explicitly when Google News returns an empty feed", async () => {
    vi.mocked(proxyRss2json).mockResolvedValue({
      title: "Empty",
      description: "",
      link: "https://news.google.com",
      image: "",
      updatedTime: "2026-07-19T00:00:00Z",
      items: [],
    })

    await expect(fetchGoogleNewsSite("wsj.com")).rejects.toThrow("Cannot fetch Google News RSS for wsj.com")
  })
})
