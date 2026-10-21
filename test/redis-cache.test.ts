import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CACHE_KEY, getCachedPicks, getCachedSnapshot, savePicks, shouldRefresh } from "../server/lib/redis-cache"
import { scoreAndRank } from "../server/lib/viral-scorer"

const NOW = Date.parse("2026-10-05T04:00:00Z")
const input = (title = "华为宣布推出全新手机产品", sourceId = "reuters", pubDate: number | undefined = NOW) => ({ title, sourceId, sourceName: sourceId, url: `https://example.com/${sourceId}/${title}`, pubDate, _scanTime: NOW })
let db: Map<string, string>
let requests: string[][]

beforeEach(() => {
  db = new Map()
  requests = []
  vi.useFakeTimers({ now: NOW })
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.invalid")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "offline-fixture")
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("https://redis.invalid")
    const cmd = JSON.parse(init.body as string) as string[]
    requests.push(cmd)
    if (cmd[0] === "GET") return new Response(JSON.stringify({ result: db.get(cmd[1]) ?? null }))
    if (cmd[0] === "SET") {
      db.set(cmd[1], cmd[2])
      return new Response(JSON.stringify({ result: "OK" }))
    }
    throw new Error(`Unexpected command: ${cmd[0]}`)
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("cache recomputes the same pipeline as a fresh scan", () => {
  it("recomputes score, grade, age, rank and aggregation at the current time", async () => {
    const rows = [input(), input(undefined, "cls-depth"), input("北京企业宣布裁员并拖欠员工工资", "cls-telegraph", NOW - 5 * 3600000)]
    await savePicks(scoreAndRank(rows, NOW), { fetchedAt: NOW, totalScanned: 123, sourcesScanned: 3 }, NOW)
    const later = NOW + 2 * 3600000
    const snapshot = await getCachedSnapshot(later)
    expect(snapshot?.picks).toEqual(scoreAndRank(rows, later))
    expect(snapshot).toMatchObject({ fetchedAt: NOW, totalScanned: 123, sourcesScanned: 3 })
    expect(snapshot?.picks.find(p => p.title === rows[0].title)).toMatchObject({ sourceCount: 2, isExclusive: false })
  })
  it("recomputes the versioned score without unapproved time decay", async () => {
    const rows = [input()]
    const first = scoreAndRank(rows, NOW)
    await savePicks(first, undefined, NOW)
    const later = NOW + 3600000
    const fresh = scoreAndRank(rows, later)
    const merged = await savePicks(fresh, undefined, later)
    expect(merged[0].finalScore).toBe(fresh[0].finalScore)
    expect(merged[0].finalScore).toBe(first[0].finalScore)
    expect(merged[0].hoursAgo).toBe(1)
  })
  it("uses the same normalized group key and preserves different sources", async () => {
    await savePicks(scoreAndRank([input("快讯：华为宣布推出全新手机产品")], NOW), undefined, NOW)
    const merged = await savePicks(scoreAndRank([input("华为宣布推出全新手机产品", "cls-depth")], NOW), undefined, NOW)
    expect(merged).toHaveLength(1)
    expect(merged[0].sources).toHaveLength(2)
    expect(merged[0].sourceCount).toBe(2)
  })
  it("expires published items on cache reads without waiting for a new write", async () => {
    await savePicks(scoreAndRank([input()], NOW), undefined, NOW)
    expect(await getCachedPicks(NOW + 8 * 3600000)).toEqual([])
  })
  it("does not renew missing publication times on repeated scans", async () => {
    const row = { ...input(), pubDate: undefined }
    await savePicks(scoreAndRank([row], NOW), undefined, NOW)
    const later = NOW + 8 * 3600000
    expect(await savePicks(scoreAndRank([{ ...row, _scanTime: later }], later), undefined, later)).toEqual([])
    expect(await getCachedPicks(later)).toEqual([])
    const again = later + 3600000
    expect(await savePicks(scoreAndRank([{ ...row, _scanTime: again }], again), undefined, again)).toEqual([])
  })
  it("expires an individual source without keeping its former hot badge", async () => {
    await savePicks(scoreAndRank([input(undefined, "reuters", NOW - 7 * 3600000), input(undefined, "cls-depth")], NOW), undefined, NOW)
    const picks = await getCachedPicks(NOW + 3600000)
    expect(picks?.[0]).toMatchObject({ sourceCount: 1, hotLevel: 0, isExclusive: false })
  })
  it("replaces corrected source titles by source URL", async () => {
    const row = input()
    await savePicks(scoreAndRank([row], NOW), undefined, NOW)
    const corrected = { ...row, title: "华为宣布暂停发布全新手机产品" }
    const merged = await savePicks(scoreAndRank([corrected], NOW), undefined, NOW)
    expect(merged.map(p => p.title)).toEqual([corrected.title])
  })
  it("resolves two revisions of the same source URL identically in fresh and cached results", async () => {
    const original = input()
    const corrected = { ...original, title: "华为宣布暂停发布全新手机产品" }
    const fresh = scoreAndRank([original, corrected], NOW)
    expect(fresh.map(p => p.title)).toEqual([corrected.title])
    expect(await savePicks(fresh, undefined, NOW)).toEqual(fresh)
    expect(await getCachedPicks(NOW)).toEqual(fresh)
  })
  it("isolates legacy keys and refreshes corrupt payloads", async () => {
    db.set("viral:picks", JSON.stringify([{ title: "old", finalScore: 100 }]))
    expect(await getCachedPicks()).toBeNull()
    db.set(CACHE_KEY, "{bad json")
    expect(await shouldRefresh()).toBe(true)
    db.set(CACHE_KEY, JSON.stringify({ version: 2, observations: [{ title: "bad" }] }))
    expect(await getCachedPicks()).toBeNull()
    expect(requests.every(cmd => cmd[1] === CACHE_KEY)).toBe(true)
  })
  it("rejects Redis error responses instead of pretending to save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "READONLY" }))))
    await expect(savePicks(scoreAndRank([input()], NOW))).rejects.toThrow("Redis command failed")
  })
  it("returns fresh picks without any Redis access when unconfigured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
    const picks = scoreAndRank([input()], NOW)
    expect(await savePicks(picks)).toEqual(picks)
    expect(requests).toEqual([])
  })
})
