import { describe, expect, it } from "vitest"
import { entityText } from "../server/lib/viral-input"
import { scoreTitle } from "../server/lib/viral-scorer"

const now = Date.parse("2026-10-05T04:00:00Z")
const score = (title: string) => scoreTitle(title, "cls-telegraph", "财联社", now - 600000, now)

describe("claude N1–N3 reported headlines", () => {
  it.each([
    ["苹果期货主力合约涨停", "苹果"],
    ["苹果主力合约创新高", "苹果"],
    ["苹果价格上涨，产区收购价走高", "苹果"],
    ["烟台苹果丰收", "苹果"],
    ["市场表现不及理想，公司宣布裁员", "理想"],
    ["理想中的退休生活：人社部发布新规", "理想"],
    ["效果未达理想，监管宣布整改", "理想"],
    ["普通大众如何应对降息？央行宣布", "大众"],
    ["大众健身指南发布", "大众"],
  ])("does not award company or giant-move signals to a homonym: %s", (title, brand) => {
    expect(entityText(title)).not.toContain(brand)
    expect(entityText(title)).toHaveLength(title.length)
    expect(score(title).scaleHits).not.toContain("头部企业")
    expect(score(title).narrativeHits).not.toContain("巨头新动作")
    expect(score(title).title).toBe(title)
  })
  it.each(["理想宣布全系降价", "大众宣布降价"])("keeps the required real-company positive: %s", (title) => {
    expect(entityText(title)).toBe(title)
    if (title.startsWith("理想")) {
      expect(score(title).narrativeHits).toContain("巨头新动作")
      expect(score(title).grade).toBe("B")
    } else {
      expect(score(title).scaleHits).toContain("头部企业")
    }
  })
})

describe("generic signals are local to each guarded-brand occurrence", () => {
  it.each(["宣布", "发布", "降价", "市值", "股价"])("accepts adjacent %s but rejects the same signal elsewhere", (signal) => {
    for (const brand of ["理想", "大众"]) {
      const direct = `${brand}${signal}相关最新消息`
      expect(entityText(direct)).toBe(direct)
      const distant = `${brand}生活话题引发讨论，另一家公司${signal}消息受关注`
      expect(entityText(distant)).not.toContain(brand)
      expect(score(distant).scaleHits).not.toContain("头部企业")
      expect(score(distant).narrativeHits).not.toContain("巨头新动作")
    }
  })
  it.each([
    ["理想", "理想生活引发讨论，理想宣布全系降价"],
    ["大众", "大众阅读引发讨论，大众宣布降价"],
    ["理想", "效果未达理想，理想宣布全系降价"],
    ["大众", "广大大众关注消费，大众宣布降价"],
    ["苹果", "苹果期货涨停，苹果宣布推出新款iPhone"],
    ["苹果", "烟台苹果丰收，苹果园区宣布扩建"],
  ])("only masks the non-company occurrence of %s: %s", (brand, title) => {
    expect(entityText(title).split(brand)).toHaveLength(2)
    expect(entityText(title)).toHaveLength(title.length)
  })
  it.each([
    "理想公布发展方向，李想随后解释公司计划",
    "理想公布发展方向，L9交付成为战略重点",
    "理想公布发展方向，MEGA项目成为战略重点",
    "大众公布发展方向，帕萨特成为战略重点",
    "大众公布发展方向，ID.系列成为战略重点",
    "大众公布发展方向，汽车业务成为战略重点",
    "大众集团公布发展方向",
    "大众公司公布发展方向",
  ])("retains strong whole-title or explicit company-name context: %s", (title) => {
    expect(entityText(title)).toBe(title)
  })
})

describe("additional explicit commodity and common-noun expressions", () => {
  it.each([
    "新季苹果合约价格上涨",
    "陕西苹果丰收，市场宣布开放",
    "洛川苹果种植面积扩大",
    "富士苹果收购价上涨",
    "郑商所苹果合约价格上涨",
    "苹果产区进入丰收季，公司宣布采购",
    "苹果收购价走高，果农增收",
    "苹果果农迎来丰收季",
    "市场效果未如理想，公司发布回应",
    "市场效果并不理想，公司宣布调整",
    "市场效果不够理想，公司发布回应",
    "市场效果较为理想，公司宣布调整",
    "理想状态下的退休规划，人社部发布指南",
    "理想水平的收益目标，公司宣布新规划",
    "理想目标与现实差距，公司发布调查",
    "大众创业需求上升，公司发布报告",
    "大众传媒需求增长，公司宣布调查",
    "大众情绪波动，公司发布调查",
    "大众需求回暖，公司宣布降价",
  ])("avoids company-related score boosts: %s", (title) => {
    expect(entityText(title)).not.toMatch(/苹果|理想|大众/)
    expect(score(title).scaleHits).not.toContain("头部企业")
    expect(score(title).narrativeHits).not.toContain("巨头新动作")
  })
  it.each(["苹果宣布推出折叠屏iPhone", "苹果股价创新高", "苹果手机价格调整", "苹果园区启动扩建"])("keeps Apple business headlines: %s", (title) => {
    expect(entityText(title)).toBe(title)
    expect(score(title).scaleHits).toContain("头部企业")
  })
})
