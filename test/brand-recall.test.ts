import { describe, expect, it } from "vitest"
import { entityText } from "../server/lib/viral-input"
import { scoreTitle } from "../server/lib/viral-scorer"

const now = Date.parse("2026-10-05T04:00:00Z")
const score = (title: string) => scoreTitle(title, "cls-telegraph", "财联社", now - 600000, now)

describe("claude NEWS-3 B1 headline regressions", () => {
  it.each([
    ["小米宣布进军机器人", "小米", "A"],
    ["字节发布豆包新模型", "字节", "A"],
    ["阿里宣布分拆", "阿里", "A"],
    ["苹果宣布推出折叠屏iPhone", "苹果", "B"],
  ])("retains default company identity: %s", (title, brand, grade) => {
    expect(entityText(title)).toContain(brand)
    expect(score(title).scaleHits).toContain("头部企业")
    expect(score(title).narrativeHits).toContain("巨头新动作")
    expect(score(title).grade).toBe(grade)
  })
  it("retains 理想宣布全系降价 without assuming 理想 is always a brand", () => {
    const title = "理想宣布全系降价"
    expect(entityText(title)).toBe(title)
    expect(score(title).domainHits).toContain("汽车新能源")
    expect(score(title).narrativeHits).toContain("巨头新动作")
    expect(score(title).grade).toBe("B")
  })
  it.each(["宣布", "发布", "降价", "市值", "股价"])("extends both guarded brands with %s", (signal) => {
    for (const brand of ["理想", "大众"]) {
      const title = `${brand}${signal}相关最新消息`
      expect(entityText(title)).toBe(title)
    }
  })
  it.each(["理想", "大众", "哪吒"])("uses the complete title for %s context", (brand) => {
    const title = `${brand}针对未来发展作出重要战略调整，汽车业务成为重点`
    expect(entityText(title)).toBe(title)
  })
  it.each(["苹果", "小米", "阿里", "字节"])("does not require a whitelist keyword for %s", (brand) => {
    const title = `${brand}启动新的研究计划`
    expect(entityText(title)).toBe(title)
    expect(score(title).scaleHits).toContain("头部企业")
  })
  it("does not interpret 苹果园区 as a fruit orchard", () => {
    const title = "苹果园区内的公司办公楼启动扩建"
    expect(entityText(title)).toBe(title)
    expect(score(title).scaleHits).toContain("头部企业")
    expect(score(title).narrativeHits).toContain("巨头新动作")
  })
  it.each(["哪吒2026年销量增长", "哪吒1月交付量公布"])("does not mistake a company date for a film sequel number: %s", (title) => {
    expect(entityText(title)).toBe(title)
    expect(score(title).scaleHits).toContain("头部企业")
  })
})

describe("explicit homonyms and M1 exclusions", () => {
  it.each([
    ["红富士苹果价格上涨，手机销量增长", "苹果"],
    ["果园里的苹果丰收，公司宣布扩张", "苹果"],
    ["苹果汁公司宣布新产品上市", "苹果"],
    ["早餐小米粥热卖，手机销量上升", "小米"],
    ["小米饭新吃法，汽车行业关注", "小米"],
    ["阿里扎罗锂盐湖开发取得进展，公司宣布计划", "阿里"],
    ["阿里地区旅游线路发布", "阿里"],
    ["电影哪吒2票房突破150亿，汽车广告受关注", "哪吒"],
    ["大众消费复苏，汽车销量回升", "大众"],
    ["大众点评发布汽车餐厅榜单", "大众"],
    ["社会大众关注汽车降价", "大众"],
    ["汽车消费大众化进程加快", "大众"],
    ["新能源车三季度销量不理想", "理想"],
    ["理想的汽车生活，公司宣布新计划", "理想"],
    ["汽车销量预测过于理想化", "理想"],
  ])("excludes explicit non-company occurrence: %s", (title, brand) => {
    expect(entityText(title)).not.toContain(brand)
    expect(score(title).scaleHits).not.toContain("头部企业")
    expect(score(title).narrativeHits).not.toContain("巨头新动作")
  })
  it.each([
    ["红富士苹果热卖，苹果宣布推出折叠屏iPhone", "苹果"],
    ["小米粥销量增长，小米宣布进军机器人", "小米"],
    ["阿里地区获关注，阿里宣布分拆", "阿里"],
    ["大众消费回升，大众宣布降价", "大众"],
    ["销量不理想，理想宣布全系降价", "理想"],
  ])("preserves a separate actual brand occurrence: %s", (title, brand) => {
    expect(entityText(title).split(brand)).toHaveLength(2)
    expect(entityText(title)).toHaveLength(title.length)
  })
  it.each(["理想生活从每天运动开始", "大众喜爱的早餐小米粥"])("keeps unqualified common nouns masked: %s", (title) => {
    expect(entityText(title)).not.toMatch(/理想|大众/)
  })
  it.each([
    "电影哪吒票房创新高，文化消费热度继续上升；哪吒汽车宣布降价",
    "哪吒汽车宣布降价，电影《哪吒》票房创新高",
    "哪吒票房增长，哪吒汽车宣布降价",
  ])("masks only the film occurrence when a car company is also present: %s", (title) => {
    expect(entityText(title).split("哪吒")).toHaveLength(2)
    expect(entityText(title)).toContain("哪吒汽车")
    expect(entityText(title)).toHaveLength(title.length)
    expect(score(title).scaleHits).toContain("头部企业")
    expect(score(title).narrativeHits).toContain("巨头新动作")
  })
  it("does not erase the car company because an unrelated film is mentioned", () => {
    const title = "电影市场需求增长，哪吒汽车宣布降价"
    expect(entityText(title)).toBe(title)
  })
})
