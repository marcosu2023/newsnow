// 选题评分模型 — 三层选题因子 + 中国贴近性 + 自见风险 + 时间衰减
// 基于1000条短视频（796公开+201自见）的因子分析

export interface ScoredItem {
  title: string
  url: string
  source: string
  sourceId: string
  pubDate?: number
  score: number
  grade: string
  domainHits: string[]
  scaleHits: string[]
  socialHits: string[]
  riskHits: { label: string; svRate: number }[]
  svPenalty: number
  chinaBoost: boolean
  sourceWeight: number
  hoursAgo: number
  finalScore: number
}

// ===== LAYER 1: 话题领域 (Story Domain) =====
const DOMAIN_RULES: { id: string; label: string; lift: number; re: RegExp }[] = [
  { id: "crisis", label: "企业暴雷危机", lift: 2.30, re: /破产|欠薪|拖欠|停产|清盘|违约|展期|资不抵债|倒闭|闪崩|暴雷/ },
  { id: "ma", label: "企业并购重组", lift: 2.13, re: /收购|并购|出售|接盘|私有化|易主|重组|合并|拆分|剥离/ },
  { id: "rareearth", label: "稀土资源战", lift: 1.83, re: /稀土|锂|矿|资源.*战|资源.*争/ },
  { id: "health", label: "民生医疗", lift: 1.36, re: /医保|医院|医疗|医生|药|诊疗|卫生/ },
  { id: "pension", label: "民生社保养老", lift: 1.33, re: /社保|养老|退休|缴费|年金|公积金/ },
  { id: "market", label: "市场剧烈波动", lift: 1.22, re: /暴涨|暴跌|飙涨|大跌|崩盘|熔断|跌停|涨停|创新高|创新低/ },
  { id: "auto", label: "汽车新能源", lift: 1.09, re: /新能源|电动车|电池|充电|比亚迪|特斯拉|蔚来|小鹏|理想|哪吒|极越|智驾/ },
  { id: "job", label: "民生就业", lift: 1.07, re: /失业|裁员|降薪|就业|工资|劳动|求职|招聘|农民工|骑手|司机/ },
  { id: "price", label: "民生消费价格", lift: 1.07, re: /涨价|电价|水价|油价|票价|房价|房租|物价/ },
  { id: "chip", label: "科技芯片", lift: 1.00, re: /芯片|半导体|晶圆|光刻|制程|纳米|EDA|AI芯片/ },
  { id: "ustrade", label: "中美博弈", lift: 0.97, re: /对华|对美|中美|关税|制裁|贸易战|出口管制/ },
  { id: "earnings", label: "企业财报业绩", lift: 0.83, re: /营收|净利|亏损|盈利|业绩|财报|季度|年报|毛利/ },
  { id: "ai", label: "科技AI", lift: 0.75, re: /人工智能|AI|大模型|DeepSeek|ChatGPT|算力|数据中心/ },
  { id: "pop", label: "人口社会", lift: 0.66, re: /人口|出生|少子|老龄|结婚|离婚|生育/ },
  { id: "edu", label: "民生教育", lift: 0.66, re: /高考|考公|考编|幼儿园|学校|教育|招生|毕业/ },
  { id: "realestate", label: "地产楼市", lift: 0.60, re: /房地产|楼市|房企|万科|恒大|碧桂园|融创|地王|土拍|限购|公摊/ },
  { id: "policy", label: "政策监管", lift: 0.58, re: /央行|降息|降准|财政|国务院|发改委|证监会|监管|新规|政策/ },
  { id: "ipo", label: "市场IPO上市", lift: 0.38, re: /IPO|上市|挂牌|招股|港股|A股|美股/ },
  { id: "geopolitics", label: "国际地缘", lift: 0.01, re: /俄乌|以色列|伊朗|朝鲜|北约|中东|台海/ },
]

// ===== LAYER 2: 主体规模 (Subject Scale) =====
const SCALE_RULES: { id: string; label: string; lift: number; re: RegExp }[] = [
  { id: "tier1city", label: "一线城市", lift: 1.87, re: /北京|上海|广州|深圳|香港|澳门/ },
  { id: "headco", label: "头部企业", lift: 1.29, re: /特斯拉|苹果|华为|小米|腾讯|阿里|百度|京东|美团|拼多多|字节|安踏|波音|丰田|三星|英伟达|台积电|大众|比亚迪|万科|恒大|碧桂园|哪吒|蔚来/ },
  { id: "celeb", label: "知名人物", lift: 1.14, re: /马斯克|巴菲特|李嘉诚|雷军|宗馥莉|王兴|任正非|马云/ },
  { id: "nation", label: "国家级主体", lift: 1.06, re: /中国|美国|日本|欧盟|英国|德国|法国|印度|韩国|俄罗斯|澳大利亚/ },
]

// ===== LAYER 3: 社交共振 (Social Resonance) =====
const SOCIAL_RULES: { id: string; label: string; lift: number; re: RegExp }[] = [
  { id: "conflict", label: "企业冲突反差", lift: 2.49, re: /巨亏|暴雷|倒闭|破产|拖欠|围堵|被查|立案|欠薪|停产|清盘/ },
  { id: "safety", label: "安全感威胁", lift: 2.21, re: /食品.*安全|午餐.*[问题毒]|污染|造假|欺诈|安全事故/ },
  { id: "anger", label: "愤怒触发", lift: 1.81, re: /挪用|骗|欺|腐|贪|滥用|违规|侵权|霸|强制/ },
  { id: "wallet", label: "钱袋子相关", lift: 1.42, re: /失业|裁员|降薪|涨价|缴费|房价|房租|电价|水价|油价|票价|工资|医保|社保|养老|退休/ },
  { id: "anxiety", label: "焦虑触发", lift: 1.39, re: /失业|裁员|降薪|下滑|收缩|萎缩|危机|困境|困难/ },
]

// ===== 中国贴近性 (China Proximity) =====
const CHINA_RE = /中国|中资|中企|国内|境内|内地|A股|沪指|深指|港股|人民币|央行|国务院|发改委|商务部|工信部|财政部|证监会|银保监|北京|上海|广州|深圳|香港|澳门|粤港澳|长三角|珠三角|对华|在华|赴华|华为|腾讯|阿里|百度|京东|美团|比亚迪|小米|字节|蔚来|小鹏|哪吒|极越|安踏|万科|恒大|碧桂园|融创|宁德时代|中芯|大疆/

// ===== 自见风险 =====
const RISK_RULES: { id: string; label: string; svRate: number; re: RegExp }[] = [
  { id: "r_disaster", label: "自然灾害伤亡", svRate: 64, re: /台风|地震|火灾|洪灾|爆炸|灾害|火山|死亡|遇难|伤亡/ },
  { id: "r_tech", label: "技术管制细节", svRate: 60, re: /AI芯片.*国产化|芯片.*[禁限管].*使用|技术出口.*限制|稀土.*出口.*许可/ },
  { id: "r_chipwar", label: "芯片战争敏感", svRate: 50, re: /英伟达|NVIDIA|[Nn]vidia|芯片.*中国|中国.*芯片|对华.*芯片|芯片.*制裁|芯片.*禁|禁.*芯片|H100|H800|A100|B200|光刻机|ASML/ },
  { id: "r_redebt", label: "房企暴雷债务", svRate: 55, re: /违约|展期|破产.*重整|资不抵债|被.*带走|留置/ },
  { id: "r_med", label: "疫苗医药安全", svRate: 50, re: /疫苗|仿制药|中药注射|血铅|输液.*死/ },
  { id: "r_social", label: "敏感社会事件", svRate: 47, re: /少林|释永信|争议|围堵|讨薪|二选一/ },
  { id: "r_crypto", label: "加密货币", svRate: 44, re: /比特币|加密货币|稳定币|发币/ },
  { id: "r_mil", label: "涉军冲突", svRate: 39, re: /空袭|轰炸|军事|导弹|冲突|俄乌|以色列.*[袭攻]/ },
  { id: "r_trade", label: "中美谈判敏感", svRate: 38, re: /对等关税|关税反制|中美.*[转折谈判]/ },
  { id: "r_tt", label: "TikTok字节", svRate: 35, re: /TikTok|字节跳动/ },
]

const PRIORITY_SOURCES = new Set(["caixin", "reuters", "bloomberg", "wsj", "ft"])

export function scoreTitle(title: string, sourceId: string, sourceName: string, pubDate?: number): Omit<ScoredItem, "url"> {
  const domainHits: string[] = []
  let domainLift = 1.0
  for (const r of DOMAIN_RULES) {
    if (r.re.test(title)) {
      domainHits.push(r.label)
      if (r.lift > domainLift) domainLift = r.lift
    }
  }

  const scaleHits: string[] = []
  let scaleLift = 1.0
  for (const r of SCALE_RULES) {
    if (r.re.test(title)) {
      scaleHits.push(r.label)
      if (scaleLift === 1.0) scaleLift = r.lift
      else scaleLift *= (1 + (r.lift - 1) * 0.5)
    }
  }

  const socialHits: string[] = []
  let socialLift = 1.0
  for (const r of SOCIAL_RULES) {
    if (r.re.test(title)) {
      socialHits.push(r.label)
      if (socialLift === 1.0) socialLift = r.lift
      else socialLift *= (1 + (r.lift - 1) * 0.5)
    }
  }

  const layersHit = (domainHits.length > 0 ? 1 : 0) + (scaleHits.length > 0 ? 1 : 0) + (socialHits.length > 0 ? 1 : 0)
  let comboMultiplier = 1.0
  if (layersHit === 3) comboMultiplier = 1.3
  else if (layersHit === 2) comboMultiplier = 1.1

  const chinaBoost = CHINA_RE.test(title)
  const chinaMultiplier = chinaBoost ? 1.25 : 1.0

  let score = 10.0 * domainLift * scaleLift * socialLift * comboMultiplier * chinaMultiplier

  const riskHits: { label: string; svRate: number }[] = []
  let maxSvRate = 0
  for (const r of RISK_RULES) {
    if (r.re.test(title)) {
      riskHits.push({ label: r.label, svRate: r.svRate })
      if (r.svRate > maxSvRate) maxSvRate = r.svRate
    }
  }
  const svPenalty = maxSvRate > 0 ? maxSvRate / 200 : 0
  score = score * (1 - svPenalty)

  score = Math.min(Math.max(Math.round(score * 10) / 10, 1), 95)

  let grade = "D"
  if (score >= 30) grade = "S"
  else if (score >= 20) grade = "A"
  else if (score >= 13) grade = "B"
  else if (score >= 8) grade = "C"

  const sourceWeight = PRIORITY_SOURCES.has(sourceId) ? 1.5 : 1.0
  const now = Date.now()
  const hoursAgo = pubDate ? Math.max(0, Math.round((now - pubDate) / 3600000 * 10) / 10) : 0
  const finalScore = Math.round(score * sourceWeight * 10) / 10

  return {
    title, source: sourceName, sourceId, pubDate, score, grade,
    domainHits, scaleHits, socialHits, riskHits,
    svPenalty: Math.round(svPenalty * 100),
    chinaBoost, sourceWeight, hoursAgo, finalScore,
  }
}

export function scoreAndRank(items: { title: string; url: string; sourceId: string; sourceName: string; pubDate?: number }[]): ScoredItem[] {
  const scored = items.map(item => ({
    ...scoreTitle(item.title, item.sourceId, item.sourceName, item.pubDate),
    url: item.url,
  }))

  const seen = new Map<string, ScoredItem>()
  for (const s of scored) {
    const key = s.title.slice(0, 30)
    const existing = seen.get(key)
    if (!existing || s.finalScore > existing.finalScore) seen.set(key, s)
  }

  const unique = Array.from(seen.values())
  unique.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    return (b.pubDate || 0) - (a.pubDate || 0)
  })

  return unique
}
