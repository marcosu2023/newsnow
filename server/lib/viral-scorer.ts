export interface ScoredItem {
  title: string
  url: string
  source: string
  sourceId: string
  pubDate?: string | number
  score: number
  grade: string
  hookLen: number
  boosts: string[]
  penalties: string[]
  risks: { label: string; svRate: number }[]
  maxRisk: number
  sourceWeight: number
  finalScore: number
}

// ── Boost factors ──────────────────────────────────────────────
const BOOSTS: { name: string; re: RegExp; weight: number }[] = [
  { name: "\"为何\"提问", re: /为何|为什么|缘何|因何/, weight: 2.13 },
  { name: "转折反差词", re: /却|竟|居然|突然|意外/, weight: 2.18 },
  { name: "民生直击", re: /失业|裁员|降薪|医保|社保|养老|缴费|涨价|房价|票价|工资/, weight: 1.39 },
  { name: "企业并购", re: /收购|并购|出售|接盘|私有化|易主/, weight: 1.64 },
  { name: "市场冲击", re: /暴涨|暴跌|飙涨|大跌|崩|创新高|熔断/, weight: 1.50 },
  { name: "具名实体", re: /特斯拉|苹果|华为|小米|腾讯|阿里|百度|京东|美团|拼多多|字节|安踏|波音|丰田|三星|英伟达|台积电|大众|比亚迪|万科|恒大|碧桂园|哪吒|蔚来|深圳|上海|北京|广州|香港|巴菲特|马斯克|李嘉诚/, weight: 1.15 },
  { name: "问号结尾", re: /[？?]/, weight: 1.20 },
  { name: "地缘框架", re: /对华|对美|中美|制裁|关税|贸易战|出口管制/, weight: 1.08 },
]

// 亿级金额 — special: match but exclude 万亿 / 百亿+ patterns
const YI_RE = /\d+(\.\d+)?亿/
const YI_EXCLUDE_RE = /万亿|[千百]\d*亿|\d{3,}亿/

// ── Penalty factors ────────────────────────────────────────────
const PENALTIES: { name: string; re: RegExp; penalty: number }[] = [
  { name: "\"能否\"提问", re: /能否|能不能|会不会|是否/, penalty: -0.57 },
  { name: "感叹号", re: /[！!]/, penalty: -0.10 },
  { name: "百亿+金额", re: /[千百]\d*亿|\d{3,}亿|万亿/, penalty: -0.30 },
]

// 抽象名词钩子 & 钩子长度 are computed dynamically

// ── Self-awareness risks (no score impact) ─────────────────────
const RISKS: { label: string; svRate: number; re: RegExp }[] = [
  { label: "技术管制细节", svRate: 0.67, re: /AI芯片.*国产化|芯片.*[禁限管].*使用|技术出口.*限制|稀土.*出口.*许可/ },
  { label: "自然灾害/伤亡", svRate: 0.56, re: /台风|地震|火灾|洪灾|爆炸|灾害|火山|死亡|遇难|伤亡/ },
  { label: "疫苗/医药安全", svRate: 0.54, re: /疫苗|仿制药|中药注射|血铅|输液.*死/ },
  { label: "敏感社会事件", svRate: 0.50, re: /少林|释永信|争议|围堵|讨薪|二选一/ },
  { label: "加密货币", svRate: 0.44, re: /比特币|加密货币|稳定币|发币/ },
  { label: "房企暴雷", svRate: 0.41, re: /违约|展期|破产.*重整|资不抵债|被.*带走|留置/ },
  { label: "政府财政赤字", svRate: 0.40, re: /医保.*赤字|养老金.*赤字|收不抵支/ },
  { label: "外国领导人", svRate: 0.40, re: /拜登.*癌|石破茂.*辞|马斯克.*党|种族/ },
  { label: "涉军/冲突", svRate: 0.38, re: /空袭|轰炸|军事|导弹|冲突|俄乌|以色列.*[袭攻]/ },
  { label: "TikTok/字节", svRate: 0.37, re: /TikTok|字节跳动/ },
  { label: "中美谈判敏感", svRate: 0.32, re: /对等关税|关税反制|中美.*[转折谈判]/ },
]

const PREMIUM_SOURCES = new Set(["caixin", "reuters", "bloomberg", "wsj", "ft"])
const ABSTRACT_NOUN_RE = /战略|重塑|制度|泡沫|趋势|格局/
const HOOK_SPLIT_RE = /[？?。！!\n]/

function getHook(title: string): string {
  const parts = title.split(HOOK_SPLIT_RE)
  return parts[0] || title
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function gradeOf(score: number): string {
  if (score >= 30) return "S"
  if (score >= 20) return "A"
  if (score >= 13) return "B"
  if (score >= 8) return "C"
  return "D"
}

export function scoreTitle(
  title: string,
  sourceId: string,
  sourceName: string,
): ScoredItem {
  const boosts: string[] = []
  const penalties: string[] = []
  const risks: { label: string; svRate: number }[] = []

  let score = 10

  // ── Boosts ───────────────────────────────────────────────────
  for (const b of BOOSTS) {
    if (b.re.test(title)) {
      score *= b.weight
      boosts.push(b.name)
    }
  }

  // 亿级金额 (special handling)
  if (YI_RE.test(title) && !YI_EXCLUDE_RE.test(title)) {
    score *= 1.55
    boosts.push("亿级金额")
  }

  // ── Penalties ────────────────────────────────────────────────
  for (const p of PENALTIES) {
    if (p.re.test(title)) {
      score *= (1 + p.penalty)
      penalties.push(p.name)
    }
  }

  // 抽象名词钩子
  const hook = getHook(title)
  if (ABSTRACT_NOUN_RE.test(hook)) {
    score *= (1 + (-0.50))
    penalties.push("抽象名词钩子")
  }

  // 钩子长度
  const hookLen = [...hook].length
  if (hookLen > 25) {
    score *= (1 + (-0.20))
    penalties.push("钩子>25字")
  } else if (hookLen <= 20) {
    score *= 1.10
    boosts.push("钩子<=20字")
  }

  // ── Clamp ────────────────────────────────────────────────────
  score = clamp(Math.round(score * 100) / 100, 1, 95)

  // ── Risks ────────────────────────────────────────────────────
  for (const r of RISKS) {
    if (r.re.test(title)) {
      risks.push({ label: r.label, svRate: r.svRate })
    }
  }
  const maxRisk = risks.length > 0 ? Math.max(...risks.map(r => r.svRate)) : 0

  // ── Source weight & final score ──────────────────────────────
  const sourceWeight = PREMIUM_SOURCES.has(sourceId) ? 1.5 : 1.0
  const finalScore = Math.round(score * sourceWeight * 100) / 100

  return {
    title,
    url: "",
    source: sourceName,
    sourceId,
    score,
    grade: gradeOf(score),
    hookLen,
    boosts,
    penalties,
    risks,
    maxRisk,
    sourceWeight,
    finalScore,
  }
}

export function scoreAndRank(
  items: { title: string; url: string; sourceId: string; source: string; pubDate?: string | number }[],
): ScoredItem[] {
  return items
    .map((item) => {
      const scored = scoreTitle(item.title, item.sourceId, item.source)
      scored.url = item.url
      scored.pubDate = item.pubDate
      return scored
    })
    .sort((a, b) => b.finalScore - a.finalScore)
}
