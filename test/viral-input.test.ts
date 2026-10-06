import { afterEach, describe, expect, it, vi } from "vitest"
import { candidateRejection, MAX_AGE_MS, parseSourceDate } from "../server/lib/viral-input"
import { scoreAndRank, scoreTitle } from "../server/lib/viral-scorer"

const now = Date.parse("2026-10-05T04:00:00Z")
const base = { title: "华为宣布推出全新手机产品", url: "https://example.com/news/1", sourceId: "jin10", sourceName: "金十" }
afterEach(() => vi.unstubAllEnvs())

describe("source timestamp normalization", () => {
  it.each(["UTC", "Asia/Shanghai", "America/New_York"])("uses the verified Jin10 timezone under %s", (tz) => {
    vi.stubEnv("TZ", tz)
    expect(parseSourceDate("2026-10-05 11:00:00", "jin10")).toEqual({ pubDate: now - 3600000, dateStatus: "valid" })
  })
  it("accepts explicit timezone and millisecond epoch", () => {
    expect(parseSourceDate("2026-10-05T12:00:00+08:00", "reuters").pubDate).toBe(now)
    expect(parseSourceDate(now, "reuters").pubDate).toBe(now)
  })
  it.each([NaN, Infinity, 0, now / 1000, "2026-10-05 12:00:00", "nonsense"])("does not infer an unknown time: %s", value => expect(parseSourceDate(value, "mktnews-flash").dateStatus).toBe("invalid"))
  it("rejects invalid calendar days", () => expect(parseSourceDate("2026-02-30 12:00:00", "jin10").dateStatus).toBe("invalid"))
  it.each(["2026-02-30T12:00:00+08:00", "2026-10-05T24:00:00Z", "2026-13-01T12:00:00Z"])("rejects ISO calendar rollover: %s", value => expect(parseSourceDate(value, "reuters").dateStatus).toBe("invalid"))
  it.each(["2026-02-30T12:00Z", "Mon, 30 Feb 2026 12:00:00 GMT"])("rejects rollover in every accepted date format: %s", value => expect(parseSourceDate(value, "reuters").dateStatus).toBe("invalid"))
  it.each(["2026-10-05T04:00Z", "Mon, 05 Oct 2026 04:00:00 GMT", "05 Oct 2026 12:00:00 +0800"])("keeps valid explicit-zone date coverage: %s", value => expect(parseSourceDate(value, "reuters")).toEqual({ dateStatus: "valid", pubDate: now }))
  it("keeps missing time explicit", () => expect(parseSourceDate(undefined, "jin10")).toEqual({ dateStatus: "missing" }))
})

describe("candidate age rules at one evaluation time", () => {
  it("rejects future timestamps, rather than calling them fresh", () => {
    expect(candidateRejection({ ...base, pubDate: now + 3600000 }, now)).toBe("future-date")
    expect(scoreAndRank([{ ...base, pubDate: now + 3600000 }], now)).toEqual([])
    expect(scoreTitle(base.title, base.sourceId, base.sourceName, now + 3600000, now)).toMatchObject({ hoursAgo: -1, finalScore: 0, grade: "D", dateStatus: "future" })
  })
  it("uses an exact 8 hour boundary, not rounded display hours", () => {
    expect(scoreAndRank([{ ...base, pubDate: now - MAX_AGE_MS + 1 }], now)).toHaveLength(1)
    expect(scoreAndRank([{ ...base, pubDate: now - MAX_AGE_MS }], now)).toHaveLength(0)
  })
  it("expires undated items from first observation and decays them", () => {
    const fresh = scoreAndRank([{ ...base, _scanTime: now }], now)[0]
    const old = scoreAndRank([{ ...base, _scanTime: now }], now + 3600000)[0]
    expect(old.dateStatus).toBe("missing")
    expect(old.finalScore).toBeLessThan(fresh.finalScore)
    expect(old.pubDate).toBeUndefined()
    expect(scoreAndRank([{ ...base, _scanTime: now }], now + MAX_AGE_MS)).toHaveLength(0)
  })
  it("rejects empty/non-http URLs and invalid dates", () => {
    for (const url of ["", "javascript:alert(1)", "file:///test"]) expect(candidateRejection({ ...base, url }, now)).toBe("invalid-url")
    expect(scoreAndRank([{ ...base, ...parseSourceDate("invalid", "jin10") }], now)).toEqual([])
  })
})
