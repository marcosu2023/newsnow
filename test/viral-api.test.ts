import { runInNewContext } from "node:vm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { scoreAndRank } from "../server/lib/viral-scorer"
import { CACHE_KEY, savePicks } from "../server/lib/redis-cache"
import { recordAdoption, recordRecommendations } from "../server/lib/news4-recommendations"

import scan from "../server/api/viral-scan"
import picksPage from "../server/api/viral-picks"
import adoption from "../server/api/news4-adoptions.post"

vi.mock("../server/lib/news4-recommendations", () => ({ recordRecommendations: vi.fn(), recordAdoption: vi.fn() }))

vi.mock("h3", async (importOriginal) => {
  const original = await importOriginal<typeof import("h3")>()
  return { ...original, getQuery: (event: any) => event.context.testQuery ?? {}, getHeader: (event: any, key: string) => event.context.headers?.[key], getRequestURL: () => new URL("http://example.test/api/news4-adoptions"), readBody: (event: any) => Promise.resolve(event.context.body) }
})

const NOW = Date.parse("2026-10-05T04:00:00Z")
const row = { title: "华为宣布推出全新手机产品", url: "https://example.com/news/1", pubDate: NOW }
const event = (query = {}) => ({ context: { testQuery: query }, node: { res: { setHeader: vi.fn() } } }) as any
let sourceRows: Record<string, unknown[]>
let db: Map<string, string>
let sourceCalls: string[]
let redisCalls: string[][]

beforeEach(() => {
  vi.mocked(recordRecommendations).mockReset().mockResolvedValue({ recommendationBatchId: "a".repeat(64), recommendationRecordStatus: "persisted", scorerVersion: "news4-scorer-v1.0.0-20261019" })
  vi.mocked(recordAdoption).mockReset()
  vi.useFakeTimers({ now: NOW })
  sourceRows = { "reuters": [row], "cls-depth": [row] }
  db = new Map()
  sourceCalls = []
  redisCalls = []
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
    if (url !== "https://redis.invalid") throw new Error(`Unexpected network request: ${url}`)
    const command = JSON.parse(options.body as string) as string[]
    redisCalls.push(command)
    if (command[0] === "GET") return new Response(JSON.stringify({ result: db.get(command[1]) ?? null }))
    if (command[0] === "SET") {
      db.set(command[1], command[2])
      return new Response(JSON.stringify({ result: "OK" }))
    }
    throw new Error(`Unexpected Redis command: ${command[0]}`)
  }))
  vi.stubGlobal("$fetch", vi.fn(async (url: string, options: any = {}) => {
    if (url === "/api/viral-scan") return scan(event(options.query))
    if (url !== "/api/s" || options.query?.latest !== "true") throw new Error(`Unexpected source request: ${url}`)
    sourceCalls.push(options.query.id)
    return { items: sourceRows[options.query.id] ?? [] }
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function configureRedis() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.invalid")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "offline-fixture")
}

function embeddedData(html: string) {
  const json = html.match(/<script id="__VIRAL_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
  expect(json).toBeDefined()
  return JSON.parse(json!)
}

describe("nEWS-3 offline scan and picks API contracts", () => {
  it("renders adoption IDs/buttons for cards, visible rows and folded rows without Dify/copy prompts", async () => {
    sourceRows = { reuters: Array.from({ length: 12 }, (_, i) => ({ ...row, title: `中国企业项目公告编号${i}`, url: `${row.url}/${i}` })) }
    const html = await picksPage(event()) as string
    expect(html.match(/class="btn adopt"/g)).toHaveLength(12)
    expect(html).toContain("推荐 ID aaaaaaaa:12")
    expect(html).not.toMatch(/建议发布时段|Dify|复制/)
  })
  it("accepts only an ID and rejects cross-origin or forged metadata", async () => {
    const e = event()
    e.context.body = { recommendationId: `${"a".repeat(64)}:1` }
    vi.mocked(recordAdoption).mockResolvedValue({ recommendationId: e.context.body.recommendationId, clickedAt: new Date(NOW).toISOString(), status: "recorded", alreadyRecorded: false })
    expect(await adoption(e)).toMatchObject({ status: "recorded" })
    expect(recordAdoption).toHaveBeenCalledWith(e.context.body.recommendationId)
    e.context.body.score = 100
    await expect(adoption(e)).rejects.toMatchObject({ statusCode: 400 })
    e.context.headers = { origin: "http://evil.test" }
    await expect(adoption(e)).rejects.toMatchObject({ statusCode: 403 })
  })
  it("reports storage failure as 503", async () => {
    const e = event()
    e.context.body = { recommendationId: `${"a".repeat(64)}:1` }
    vi.mocked(recordAdoption).mockRejectedValue(new Error("disk full"))
    await expect(adoption(e)).rejects.toMatchObject({ statusCode: 503 })
  })
  it("shows success only after an acknowledged write, permits retry and shows failures", async () => {
    const html = await picksPage(event()) as string
    const script = html.match(/<script id="__NEWS4_ADOPTION__">([\s\S]*?)<\/script>/)![1]
    const status = { textContent: "" }
    const button = { disabled: false, dataset: { recommendationId: `${"a".repeat(64)}:1` }, parentElement: { querySelector: () => status } }
    let click: (e: any) => Promise<void> = async () => {}
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "recorded", recommendationId: button.dataset.recommendationId }) })
    runInNewContext(script, { document: { addEventListener: (_: string, cb: typeof click) => {
      click = cb
    } }, fetch: fetcher })
    await click({ target: { closest: () => button } })
    expect(status.textContent).toBe("已记录")
    expect(button.disabled).toBe(false)
    await click({ target: { closest: () => button } })
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockRejectedValue(new Error("network"))
    await click({ target: { closest: () => button } })
    expect(status.textContent).toBe("记录失败，请重试")
    expect(button.disabled).toBe(false)
  })
  it("fails closed on receipt failure and distinguishes service failure from an empty result", async () => {
    vi.mocked(recordRecommendations).mockRejectedValue(new Error("disk full"))
    await expect(scan(event())).rejects.toMatchObject({ statusCode: 503 })
    const html = await picksPage(event()) as string
    expect(html).toContain("推荐服务暂不可用")
    expect(html).not.toContain("暂无匹配选题")
    expect(embeddedData(html).picks).toEqual([])
  })
  it("records scores/versions, preserves explicit summaries, escapes HTML and keeps low scores", async () => {
    sourceRows = { reuters: [
      { ...row, title: "美国经济下滑 <img src=x onerror=\"alert(1)\">", summary: "日本消费者支出下降" },
      { ...row, title: "中国企业融资需求增长", url: `${row.url}/cn` },
    ] }
    const html = await picksPage(event()) as string
    const data = embeddedData(html)
    expect(data.picks).toHaveLength(2)
    expect(data.picks.map((p: any) => p.finalScore)).toEqual([...data.picks.map((p: any) => p.finalScore)].sort((a: number, b: number) => b - a))
    expect(data.picks.some((p: any) => p.finalScore < 50)).toBe(true)
    expect(data.picks.every((p: any) => p.recommendationId && p.scorerVersion === data.scorerVersion)).toBe(true)
    expect(vi.mocked(recordRecommendations).mock.calls[0][0].picks.some((p: { summary?: string }) => p.summary === "日本消费者支出下降")).toBe(true)
    expect(html).toContain("&lt;img")
    expect(html).not.toContain("<img src=x onerror=\"alert(1)\">")
  })
  it("retains the scan response fields and aggregates provenance before ranking", async () => {
    const data = await scan(event()) as any
    expect(data).toMatchObject({ timestamp: new Date(NOW).toISOString(), fetchedAt: NOW, totalScanned: 2, sourcesScanned: 2, fromCache: false })
    expect(data.picks).toHaveLength(1)
    expect(data.picks[0]).toMatchObject({ sourceCount: 2, hotLevel: 1, isExclusive: false })
    expect(data.picks[0].sources.map((s: any) => s.sourceId).sort()).toEqual(["cls-depth", "reuters"])
    expect(sourceCalls).toHaveLength(15)
    expect(sourceCalls).not.toContain("xueqiu-hotstock")
  })
  it("counts valid source rows and shows rejection reasons in debug responses", async () => {
    sourceRows = { reuters: [row, { ...row, title: "印刷版 |华尔街日报 - WSJ" }, { ...row, pubDate: NOW + 1 }, { ...row, pubDate: "bad" }] }
    const data = await scan(event({ debug: "1" })) as any
    expect(data).toMatchObject({ _debug: true, totalItems: 1, sourcesScanned: 1 })
    expect(data.sourceLogs.find((s: any) => s.id === "reuters").rejected).toEqual({ "navigation": 1, "future-date": 1, "invalid-date": 1 })
    expect(data).not.toHaveProperty("picks")
  })
  it("converts verified Jin10 local time and retains undated rows explicitly", async () => {
    sourceRows = { jin10: [{ ...row, pubDate: "2026-10-05 11:00:00" }, { ...row, title: "央行宣布下调存款准备金率", url: `${row.url}/undated`, pubDate: undefined }] }
    const data = await scan(event()) as any
    expect(data.picks.find((p: any) => p.title === row.title)).toMatchObject({ pubDate: NOW - 3600000, hoursAgo: 1, dateStatus: "valid" })
    expect(data.picks.find((p: any) => p.title.startsWith("央行"))).toMatchObject({ dateStatus: "missing", _scanTime: NOW })
  })
  it("serves cache with original scan metadata and scores recomputed at the read time", async () => {
    configureRedis()
    const inputs = ["reuters", "cls-depth"].map(sourceId => ({ ...row, sourceId, sourceName: sourceId, _scanTime: NOW }))
    await savePicks(scoreAndRank(inputs, NOW), { fetchedAt: NOW, totalScanned: 42, sourcesScanned: 2 }, NOW)
    vi.setSystemTime(NOW + 29 * 60000)
    const data = await scan(event()) as any
    expect(data).toMatchObject({ fromCache: true, fetchedAt: NOW, totalScanned: 42, sourcesScanned: 2 })
    expect(data.picks.map(({ recommendationId, ...p }: any) => p)).toEqual(scoreAndRank(inputs, Date.now()))
    expect(sourceCalls).toEqual([])
  })
  it("refreshes at exactly 30 minutes and refresh=1 bypasses a fresh cache", async () => {
    configureRedis()
    await scan(event())
    sourceCalls = []
    vi.setSystemTime(NOW + 30 * 60000)
    expect(await scan(event())).toMatchObject({ fromCache: false, fetchedAt: Date.now() })
    expect(sourceCalls).toHaveLength(15)
    sourceCalls = []
    expect(await scan(event({ refresh: "1" }))).toMatchObject({ fromCache: false })
    expect(sourceCalls).toHaveLength(15)
  })
  it("falls back to fresh scan when the cache is corrupt or Redis fails", async () => {
    configureRedis()
    db.set(CACHE_KEY, "{corrupt")
    expect(await scan(event())).toMatchObject({ fromCache: false, sourcesScanned: 2 })
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline Redis failure")
    }))
    expect(await scan(event())).toMatchObject({ fromCache: false, sourcesScanned: 2 })
  })
  it("retains unexpired observations on a successful empty scan and advances metadata once", async () => {
    configureRedis()
    await scan(event())
    sourceRows = {}
    sourceCalls = []
    vi.setSystemTime(NOW + 30 * 60000)
    const data = await scan(event()) as any
    expect(data).toMatchObject({ fromCache: false, fetchedAt: Date.now(), totalScanned: 0, sourcesScanned: 0 })
    expect(data.picks).toHaveLength(1)
    expect(sourceCalls).toHaveLength(15)
    sourceCalls = []
    expect(await scan(event())).toMatchObject({ fromCache: true, fetchedAt: Date.now(), sourcesScanned: 0 })
    expect(sourceCalls).toEqual([])
  })
  it("caches a successfully empty result instead of repeatedly scanning", async () => {
    configureRedis()
    sourceRows = {}
    expect(await scan(event())).toMatchObject({ fromCache: false, picks: [] })
    sourceCalls = []
    expect(await scan(event())).toMatchObject({ fromCache: true, fetchedAt: NOW, picks: [] })
    expect(sourceCalls).toEqual([])
  })
  it("retains original metadata and current cached scores when every source fails", async () => {
    configureRedis()
    await scan(event())
    vi.setSystemTime(NOW + 30 * 60000)
    const expected = await import("../server/lib/redis-cache").then(m => m.getCachedSnapshot(Date.now()))
    vi.stubGlobal("$fetch", vi.fn(async () => {
      throw new Error("offline fixture source failure")
    }))
    expect(await scan(event())).toMatchObject({ fromCache: true, fetchedAt: NOW, totalScanned: 2, sourcesScanned: 2, picks: expected?.picks })
    expect(JSON.parse(db.get(CACHE_KEY)!).fetchedAt).toBe(NOW)
  })
  it("keeps the embedded version and legacy fields while adding source/time evidence", async () => {
    const responseEvent = event({ refresh: "1" })
    const html = await picksPage(responseEvent) as string
    expect(responseEvent.node.res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8")
    const data = embeddedData(html)
    expect(data).toMatchObject({ version: "4.0", fetchedAt: NOW, windowHours: 8, totalScanned: 2, sourcesScanned: 2 })
    expect(data.picks[0]).toMatchObject({ title: row.title, url: row.url, sourceCount: 2, isExclusive: false, dateStatus: "valid", observedAt: NOW })
    for (const key of ["source", "finalScore", "grade", "mechanism", "hoursAgo", "pubDate", "domainHits", "scaleHits", "socialHits", "narrativeHits", "chinaBoost", "sourceWeight", "hotLevel", "riskHits", "svPenalty"]) expect(data.picks[0]).toHaveProperty(key)
    expect(data.picks[0].sources).toHaveLength(2)
    expect(sourceCalls).toHaveLength(15)
  })
  it("renders unknown publication time without inventing a publication timestamp", async () => {
    sourceRows = { reuters: [{ ...row, pubDate: undefined }] }
    const html = await picksPage(event()) as string
    expect(html).toContain("发布时间未知")
    expect(embeddedData(html).picks[0]).toMatchObject({ pubDate: null, dateStatus: "missing", observedAt: NOW })
  })
  it("omits expired cached candidates from both HTML and embedded JSON", async () => {
    configureRedis()
    await scan(event())
    vi.setSystemTime(NOW + 8 * 3600000)
    sourceRows = {}
    const html = await picksPage(event()) as string
    expect(embeddedData(html).picks).toEqual([])
    expect(html).not.toContain(row.title)
    expect(redisCalls.every(command => command[1] === CACHE_KEY)).toBe(true)
  })
})
