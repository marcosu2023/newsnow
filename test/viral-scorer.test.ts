import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getGroupKey, scoreAndRank, scoreTitle } from "../server/lib/viral-scorer"

const NOW = Date.parse("2026-10-05T04:00:00Z")
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())
const score = (title: string) => scoreTitle(title, "cls-telegraph", "财联社", NOW)
const item = (title: string, sourceId = "cls-telegraph", pubDate = NOW) => ({ title, sourceId, sourceName: sourceId, url: `https://example.com/${sourceId}`, pubDate })

describe("nEWS-3 reproduced false positives", () => {
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
  it("retires unsupported old factors and preserves the versioned score", () => {
    for (const title of ["苹果公司发布新款手机", "美国宣布对华加征关税", "某公司涉嫌欺诈消费者", "边境爆发武装冲突"]) {
      expect(score(title)).toMatchObject({ scaleHits: [], socialHits: [], narrativeHits: [], riskHits: [], sourceWeight: 1, svPenalty: 0 })
      expect(score(title).scorerVersion).toBe("news4-scorer-v1.0.0-20261019")
    }
  })
})

describe("nEWS-3 candidate and grouping invariants", () => {
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
  it("does not apply old score bands or time/source weights", () => {
    const p = scoreTitle("央行宣布下调存款准备金率0.5个百分点", "reuters", "路透社", Date.now() - 7 * 3600000)
    expect(p.grade).toBe("未分档")
    expect(p.finalScore).toBe(scoreTitle(p.title, "cls-depth", "财联社", NOW).finalScore)
  })
})
