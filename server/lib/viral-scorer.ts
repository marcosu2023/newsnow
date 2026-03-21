// 选题评分模型 — 三层选题因子 + 中国贴近性 + 自见风险 + 时间衰减
// 基于1213条短视频（991公开+220自见）的因子分析 — v3 weights

export interface ScoredItem {
  title: string
  url: string
  source: string
  sourceId: string
  pubDate?: number
  score: number
  grade: string
  mechanism: "裂变" | "争议" | "涨粉" | "流量"
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
  { id: "crisis", label: "企业暴雷危机", lift: 1.86, re: /破产|欠薪|拖欠|停产|清盘|违约|展期|资不抵债|倒闭|闪崩|暴雷/ },
  { id: "health", label: "民生医疗", lift: 1.65, re: /医保|医院|医疗|医生|药|诊疗|卫生/ },
  { id: "ma", label: "企业并购重组", lift: 1.62, re: /收购|并购|出售|接盘|私有化|易主|重组|合并|拆分|剥离/ },
  { id: "rareearth", label: "稀土资源战", lift: 1.45, re: /稀土|锂|矿|资源.*战|资源.*争/ },
  { id: "edu", label: "民生教育", lift: 1.17, re: /高考|考公|考编|幼儿园|学校|教育|招生|毕业/ },
  { id: "chip", label: "科技芯片", lift: 1.16, re: /芯片|半导体|晶圆|光刻|制程|纳米|EDA|AI芯片/ },
  { id: "market", label: "市场剧烈波动", lift: 1.04, re: /暴涨|暴跌|飙涨|大跌|崩盘|熔断|跌停|涨停|创新高|创新低/ },
  { id: "pop", label: "人口社会", lift: 0.99, re: /人口|出生|少子|老龄|结婚|离婚|生育/ },
  { id: "job", label: "民生就业", lift: 0.95, re: /失业|裁员|降薪|就业|工资|劳动|求职|招聘|农民工|骑手|司机/ },
  { id: "pension", label: "民生社保养老", lift: 0.94, re: /社保|养老|退休|缴费|年金|公积金/ },
  { id: "auto", label: "汽车新能源", lift: 0.94, re: /新能源|电动车|电池|充电|比亚迪|特斯拉|蔚来|小鹏|理想|哪吒|极越|智驾/ },
  { id: "price", label: "民生消费价格", lift: 0.85, re: /涨价|电价|水价|油价|票价|房价|房租|物价/ },
  { id: "ustrade", label: "中美博弈", lift: 0.83, re: /对华|对美|中美|关税|制裁|贸易战|出口管制/ },
  { id: "earnings", label: "企业财报业绩", lift: 0.69, re: /营收|净利|亏损|盈利|业绩|财报|季度|年报|毛利/ },
  { id: "ai", label: "科技AI", lift: 0.64, re: /人工智能|AI|大模型|DeepSeek|ChatGPT|算力|数据中心/ },
  { id: "policy", label: "政策监管", lift: 0.54, re: /央行|降息|降准|财政|国务院|发改委|证监会|监管|新规|政策/ },
  { id: "realestate", label: "地产楼市", lift: 0.46, re: /房地产|楼市|房企|万科|恒大|碧桂园|融创|地王|土拍|限购|公摊/ },
  { id: "ipo", label: "市场IPO上市", lift: 0.34, re: /IPO|上市|挂牌|招股|港股|A股|美股/ },
  { id: "geopolitics", label: "国际地缘", lift: 0.00, re: /俄乌|以色列|伊朗|朝鲜|北约|中东|台海/ },
]

// ===== LAYER 2: 主体规模 (Subject Scale) =====
const SCALE_RULES: { id: string; label: string; lift: number; re: RegExp }[] = [
  { id: "tier1city", label: "一线城市", lift: 1.75, re: /北京|上海|广州|深圳|香港|澳门/ },
  { id: "celeb", label: "知名人物", lift: 1.58, re: /马斯克|巴菲特|李嘉诚|雷军|宗馥莉|王兴|任正非|马云/ },
  { id: "headco", label: "头部企业", lift: 1.23, re: /特斯拉|苹果|华为|小米|腾讯|阿里|百度|京东|美团|拼多多|字节|安踏|波音|丰田|三星|英伟达|台积电|大众|比亚迪|万科|恒大|碧桂园|哪吒|蔚来/ },
  { id: "nation", label: "国家级主体", lift: 1.07, re: /中国|美国|日本|欧盟|英国|德国|法国|印度|韩国|俄罗斯|澳大利亚/ },
]

// ===== LAYER 3: 社交共振 (Social Resonance) =====
const SOCIAL_RULES: { id: string; label: string; lift: number; re: RegExp }[] = [
  { id: "conflict", label: "企业冲突反差", lift: 2.33, re: /巨亏|暴雷|倒闭|破产|拖欠|围堵|被查|立案|欠薪|停产|清盘/ },
  { id: "safety", label: "安全感威胁", lift: 1.98, re: /食品.*安全|午餐.*[问题毒]|污染|造假|欺诈|安全事故/ },
  { id: "anger", label: "愤怒触发", lift: 1.59, re: /挪用|骗|欺|腐|贪|滥用|违规|侵权|霸|强制/ },
  { id: "anxiety", label: "焦虑触发", lift: 1.32, re: /失业|裁员|降薪|下滑|收缩|萎缩|危机|困境|困难/ },
  { id: "wallet", label: "钱袋子相关", lift: 1.24, re: /失业|裁员|降薪|涨价|缴费|房价|房租|电价|水价|油价|票价|工资|医保|社保|养老|退休/ },
]

// ===== 中国贴近性 (China Proximity) =====
const CHINA_RE = /中国|中资|中企|国内|境内|内地|A股|沪指|深指|港股|人民币|央行|国务院|发改委|商务部|工信部|财政部|证监会|银保监|北京|上海|广州|深圳|香港|澳门|粤港澳|长三角|珠三角|对华|在华|赴华|华为|腾讯|阿里|百度|京东|美团|比亚迪|小米|字节|蔚来|小鹏|哪吒|极越|安踏|万科|恒大|碧桂园|融创|宁德时代|中芯|大疆/

// ===== 自见风险 =====
const RISK_RULES: { id: string; label: string; svRate: number; re: RegExp }[] = [
  { id: "r_gov", label: "政府财政赤字", svRate: 100, re: /医保.*赤字|养老金.*赤字|收不抵支/ },
  { id: "r_disaster", label: "自然灾害伤亡", svRate: 64, re: /台风|地震|火灾|洪灾|爆炸|灾害|火山|死亡|遇难|伤亡/ },
  { id: "r_tech", label: "技术管制细节", svRate: 60, re: /AI芯片.*国产化|芯片.*[禁限管].*使用|技术出口.*限制|稀土.*出口.*许可/ },
  { id: "r_mil", label: "涉军冲突", svRate: 57, re: /空袭|轰炸|军事|导弹|冲突|俄乌|以色列.*[袭攻]/ },
  { id: "r_redebt", label: "房企暴雷债务", svRate: 50, re: /违约|展期|破产.*重整|资不抵债|被.*带走|留置/ },
  { id: "r_med", label: "疫苗医药安全", svRate: 50, re: /疫苗|仿制药|中药注射|血铅|输液.*死/ },
  { id: "r_social", label: "敏感社会事件", svRate: 44, re: /少林|释永信|争议|围堵|讨薪|二选一/ },
  { id: "r_crypto", label: "加密货币", svRate: 40, re: /比特币|加密货币|稳定币|发币/ },
  { id: "r_tt", label: "TikTok字节", svRate: 35, re: /TikTok|字节跳动/ },
  { id: "r_trade", label: "中美谈判敏感", svRate: 29, re: /对等关税|关税反制|中美.*争/ },
  { id: "r_leader", label: "外国领导人", svRate: 22, re: /拜登|石破茂|马斯克.*党|特朗普.*[政策细节]|种族/ },
]

// ===== 爆法类型 (Mechanism) =====
const MECH_FISSION_RE = /失业|裁员|降薪|医保|社保|养老|缴费|涨价|房价|电价|工资|房租|退休|午餐|食品.*安全|破产|欠薪|拖欠|暴雷|违约|倒闭|停产|清盘|挪用/
const MECH_DEBATE_RE = /对华|对美|中美|关税|制裁|贸易战|出口管制|芯片|半导体|AI|稀土|国产替代|撼动|挑战/
const MECH_FOLLOW_RE = /收购|并购|出售|私有化|易主|罕见|首次|披露|独家|内幕|揭秘/

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

  // --- Mechanism ---
  const isFission = MECH_FISSION_RE.test(title)
  const isDebate = MECH_DEBATE_RE.test(title)
  const isFollow = MECH_FOLLOW_RE.test(title)
  let mechanism: "裂变" | "争议" | "涨粉" | "流量" = "流量"
  if (isFission) mechanism = "裂变"
  else if (isDebate) mechanism = "争议"
  else if (isFollow) mechanism = "涨粉"

  const sourceWeight = PRIORITY_SOURCES.has(sourceId) ? 1.5 : 1.0
  const now = Date.now()
  const hoursAgo = pubDate ? Math.max(0, Math.round((now - pubDate) / 3600000 * 10) / 10) : 0

  // Time decay: fresh news gets a boost, old news decays
  // 0h → 1.0x, 3h → 0.85x, 6h → 0.72x, 12h → 0.52x, 24h → 0.27x
  const decayFactor = pubDate ? Math.exp(-0.055 * hoursAgo) : 0.7 // no pubDate → treat as ~6h old
  const finalScore = Math.round(score * sourceWeight * decayFactor * 10) / 10

  return {
    title, source: sourceName, sourceId, pubDate, score, grade, mechanism,
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
