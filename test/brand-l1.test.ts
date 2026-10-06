import { describe, expect, it } from "vitest"
import { entityText } from "../server/lib/viral-input"
import { scoreTitle } from "../server/lib/viral-scorer"

const now = Date.parse("2026-10-05T04:00:00Z")
const score = (title: string) => scoreTitle(title, "cls-telegraph", "财联社", now - 600000, now)

describe("claude L1 brand-recall regressions", () => {
  it.each([
    ["苹果主力机型iPhone 17降价", "苹果"],
    ["苹果价格上调，iPhone全线涨价", "苹果"],
    ["理想中期业绩营收增长", "理想"],
    ["理想中报净利下滑", "理想"],
  ])("keeps the reported company headline: %s", (title, brand) => {
    expect(entityText(title)).toBe(title)
    expect(score(title).title).toBe(title)
    if (brand === "苹果") expect(score(title).scaleHits).toContain("头部企业")
    else expect(score(title).domainHits).toContain("汽车新能源")
  })
  it.each([
    "苹果期货主力合约涨停",
    "苹果主力合约创新高",
    "苹果价格上涨，产区收购价走高",
    "苹果价格每斤上涨1元",
    "苹果价格上涨，果农增收",
  ])("still masks explicit commodity and produce-price headlines: %s", (title) => {
    expect(entityText(title)).not.toContain("苹果")
    expect(score(title).scaleHits).not.toContain("头部企业")
  })
  it.each(["iPhone", "Mac", "iPad"])("preserves Apple pricing when %s disambiguates a non-farm acquisition", (device) => {
    const title = `苹果价格上调，${device}供应链收购计划公布`
    expect(entityText(title)).toBe(title)
    expect(score(title).scaleHits).toContain("头部企业")
  })
  it("does not presume unspecified 苹果价格 is farm produce", () => {
    const title = "苹果价格调整引发市场关注"
    expect(entityText(title)).toBe(title)
    expect(score(title).scaleHits).toContain("头部企业")
  })
  it.each([
    "理想生活规划，另一公司公布中报净利下滑",
    "理想中期生活规划，公司宣布调整",
    "理想中报考的大学，教育部门宣布招生安排",
    "理想中的退休生活：人社部发布新规",
  ])("does not turn ordinary 理想 into a company using remote report context: %s", (title) => {
    expect(entityText(title)).not.toContain("理想")
    expect(score(title).narrativeHits).not.toContain("巨头新动作")
  })
  it.each([
    ["苹果", "苹果主力合约涨停，苹果主力机型iPhone 17降价"],
    ["理想", "理想中期业绩营收增长，市场效果未达理想"],
    ["理想", "理想中报净利下滑，退休生活理想目标引发讨论"],
  ])("keeps only the genuine company occurrence of %s: %s", (brand, title) => {
    expect(entityText(title).split(brand)).toHaveLength(2)
    expect(entityText(title)).toHaveLength(title.length)
  })
})
