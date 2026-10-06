import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getGroupKey, scoreAndRank, scoreTitle } from "../server/lib/viral-scorer"

const NOW = Date.parse("2026-10-05T04:00:00Z")
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())
const score = (title: string) => scoreTitle(title, "cls-telegraph", "财联社", NOW)
const item = (title: string, sourceId = "cls-telegraph", pubDate = NOW) => ({ title, sourceId, sourceName: sourceId, url: `https://example.com/${sourceId}`, pubDate })

describe("NEWS-3 reproduced false positives", () => {
  it.each(["电影哪吒2票房突破150亿", "红富士苹果价格上涨", "阿里扎罗锂盐湖开发取得进展", "大众喜爱的早餐小米粥", "理想生活从每天运动开始"])("does not invent a brand: %s", (title) => {
    expect(score(title).scaleHits).not.toContain("头部企业")
    expect(score(title).domainHits).not.toContain("汽车新能源")
    expect(score(title).narrativeHits).not.toContain("巨头新动作")
  })
  it("does not interpret a brand character as anger", () => expect(score("霸王茶姬发布季度业绩").socialHits).not.toContain("愤怒触发"))
  it("requires China-US context for the China-US domain", () => expect(score("欧盟自由贸易协定调整关税配额").domainHits).not.toContain("中美博弈"))
  it("does not mark first quarter as a milestone", () => expect(score("某公司第一季度营收增长20%").narrativeHits).not.toContain("行业里程碑"))
  it("does not treat a conflict of interest as military conflict", () => expect(score("董事会称不存在利益冲突").riskHits.map(r => r.label)).not.toContain("涉军冲突"))
  it("uses words rather than a character class for policy details", () => expect(score("特朗普政府发布声明").riskHits.map(r => r.label)).not.toContain("外国领导人"))
  it("does not match AI inside AIG", () => expect(score("AIG发布年度财报").domainHits).not.toContain("科技AI"))
  it("does not treat every listed company as an IPO", () => expect(score("上市公司宣布回购股份").domainHits).not.toContain("市场IPO上市"))
  it.each(["苹果公司发布新款手机", "小米集团发布新车", "哪吒汽车宣布停产", "阿里巴巴发布季度财报"])("keeps positive entity coverage: %s", (title) => expect(score(title).scaleHits).toContain("头部企业"))
  it("keeps positive trade, anger and military coverage", () => {
    expect(score("美国宣布对华加征关税").domainHits).toContain("中美博弈")
    expect(score("某公司涉嫌欺诈消费者").socialHits).toContain("愤怒触发")
    expect(score("边境爆发武装冲突").riskHits.map(r => r.label)).toContain("涉军冲突")
  })
})

describe("NEWS-3 candidate and grouping invariants", () => {
  it("rejects navigation and stock quote rows before scoring", () => {
    const ranked = scoreAndRank([item("印刷版 |华尔街日报 - WSJ", "wsj"), item("贵州茅台股票行情", "xueqiu-hotstock"), item("央行宣布下调存款准备金率0.5个百分点")])
    expect(ranked.map(p => p.title)).toEqual(["央行宣布下调存款准备金率0.5个百分点"])
  })
  it("preserves sources before deduplication, without claiming exclusivity", () => {
    const ranked = scoreAndRank([item("华为宣布推出全新手机产品", "reuters"), item("华为宣布推出全新手机产品", "cls-telegraph")])
    expect(ranked).toHaveLength(1)
    expect(ranked[0]).toMatchObject({ sourceCount: 2, hotLevel: 1, isExclusive: false })
  })
  it("does not certify single-source priority coverage as exclusive", () => expect(scoreAndRank([item("华为宣布推出全新手机产品", "reuters")])[0]).toMatchObject({ isExclusive: false }))
  it("does not merge unrelated endings after the first 25 characters", () => {
    const common = "某企业发布最新业务进展公告并披露旗下子公司未来经营计划"
    expect(getGroupKey(`${common}收购甲公司`)).not.toBe(getGroupKey(`${common}出售乙公司`))
  })
  it("grades by finalScore", () => {
    const p = scoreTitle("央行宣布下调存款准备金率0.5个百分点", "reuters", "路透社", Date.now() - 7 * 3600000)
    const expected = p.finalScore >= 30 ? "S" : p.finalScore >= 20 ? "A" : p.finalScore >= 13 ? "B" : p.finalScore >= 8 ? "C" : "D"
    expect(p.grade).toBe(expected)
  })
})
