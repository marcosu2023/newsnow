import { afterEach, describe, expect, it, vi } from "vitest"
import { scanExports } from "unimport"

const { fixtureFetch } = vi.hoisted(() => ({ fixtureFetch: vi.fn() }))
vi.mock("../server/utils/fetch", () => ({ myFetch: fixtureFetch }))

import nowcoder from "../server/sources/nowcoder"

afterEach(() => vi.clearAllMocks())

describe("NEWS-3 typecheck counterexamples", () => {
  it("keeps supported Nowcoder links and excludes unknown entry types", async () => {
    fixtureFetch.mockImplementation(async (url: string) => {
      if (!url.startsWith("https://gw-c.nowcoder.com/api/sparta/hot-search/top-hot-pc?")) {
        throw new Error(`Unexpected source request: ${url}`)
      }
      return { data: { result: [
        { type: 74, uuid: "feed-1", id: "unused", title: "动态" },
        { type: 0, id: "topic-2", uuid: "unused", title: "讨论" },
        { type: 99, id: "unknown", uuid: "unknown", title: "不支持的条目" },
      ] } }
    })
    expect(await nowcoder()).toEqual([
      { id: "feed-1", title: "动态", url: "https://www.nowcoder.com/feed/main/detail/feed-1" },
      { id: "topic-2", title: "讨论", url: "https://www.nowcoder.com/discuss/topic-2" },
    ])
  })

  it("does not manufacture a link for a missing or blank Nowcoder identifier", async () => {
    fixtureFetch.mockResolvedValue({ data: { result: [
      { type: 74, uuid: "", title: "空标识" },
      { type: 0, title: "缺标识" },
      { type: 74, uuid: "  ", title: "空白标识" },
    ] } })
    expect(await nowcoder()).toEqual([])
  })

  it("auto-imports projectDir without treating import.meta as an exported identifier", async () => {
    const exports = await scanExports("shared/dir.ts", true)
    expect(exports.map(item => item.name)).toContain("projectDir")
    expect(exports.map(item => item.name)).not.toContain("import")
  })

  it("retains finite numeric discussion identifiers used by existing consumers", async () => {
    fixtureFetch.mockResolvedValue({ data: { result: [
      { type: 0, id: 123, title: "数值标识" },
      { type: 0, id: Number.NaN, title: "无效数值" },
    ] } })
    expect(await nowcoder()).toEqual([
      { id: 123, title: "数值标识", url: "https://www.nowcoder.com/discuss/123" },
    ])
  })

  it("does not mistake a generic source type for a runtime export", async () => {
    const exports = await scanExports("shared/sources.ts", true)
    expect(exports.map(item => item.name)).toContain("sources")
    expect(exports.map(item => item.name)).not.toContain("Source")
  })
})
