// Frozen NEWS-4 v1; source/time remain eligibility metadata, not score multipliers.
import { type CandidateInput, type DateStatus, candidateRejection } from "./viral-input"

import { scoreNews } from "./news4-v1/scorer.mjs"

export type { CandidateInput } from "./viral-input"

export interface ScoredItem {
  title: string
  summary?: string
  displayScore: number
  scorerVersion: string
  inputSha256: string
  rulesSha256: string
  weightsSha256: string
  matchedRules: string[]
  appliedRules: string[]
  recommendationId?: string
  url: string
  source: string
  sourceId: string
  pubDate?: number
  score: number
  grade: string
  mechanism: "裂变" | "争议" | "涨粉" | "流量" | "规则排序"
  domainHits: string[]
  scaleHits: string[]
  socialHits: string[]
  narrativeHits: string[]
  riskHits: { label: string, svRate: number }[]
  svPenalty: number
  chinaBoost: boolean
  sourceWeight: number
  hoursAgo: number
  finalScore: number
  dateStatus: DateStatus
  _scanTime: number
  sources?: CandidateInput[]
  sourceCount?: number
  hotLevel?: number
  isExclusive?: boolean
  singlePrioritySource?: boolean
}

export const PRIORITY_SOURCES = new Set(["caixin", "reuters", "bloomberg", "wsj", "ft"])

// Conservative lexical grouping: normalized full title, not semantic event clustering.
// 唯一实现 —— viral-scan / viral-picks 都必须用这个，三处各写一份会静默漂移。
// 弯引号与直引号一并剥离，避免同一标题因引号风格不同产生两个键。
export function getGroupKey(title: string): string {
  return title
    .replace(/^(LSEG数据显示|据[^，。]{1,10}[称报]道?|消息[称人]?[：:]?|外媒[：:]?|快讯[：:]?)/, "")
    .replace(/[，。、！？：；“”‘’"'（）()[\]【】「」\s·|｜—\-]/g, "")
}

export function gradeForScore(score: number): string {
  return score >= 30 ? "S" : score >= 20 ? "A" : score >= 13 ? "B" : score >= 8 ? "C" : "D"
}

export function sourceFamily(sourceId: string): string {
  return /^(cls|wallstreetcn|fastbull|36kr|mktnews)-/.exec(sourceId)?.[1] ?? sourceId
}

export function scoreTitle(title: string, sourceId: string, sourceName: string, pubDate?: number, now = Date.now(), observedAt = now, summary?: string): Omit<ScoredItem, "url"> {
  const scored = scoreNews({ title, summary })
  const dateStatus: DateStatus = pubDate === undefined ? "missing" : !Number.isFinite(pubDate) || pubDate < Date.UTC(2000, 0, 1) ? "invalid" : pubDate > now ? "future" : "valid"
  const hoursAgo = dateStatus === "invalid" ? 0 : Math.round((now - (dateStatus === "missing" ? observedAt : pubDate!)) / 3600000 * 10) / 10
  const names: Record<string, string> = { "H1": "海外且与中国无关", "A1:海外": "海外主体", "C:间接（国家竞争、产业前景）": "中国经济产业关联", "C:无": "无明确观众利益关联", "E:与中国无关": "与中国无关", "F:焦虑": "损失或风险线索", "F:中性": "中性基调" }
  return {
    title,
    summary,
    source: sourceName,
    sourceId,
    pubDate,
    score: scored.score,
    finalScore: scored.score,
    displayScore: scored.displayScore,
    grade: "未分档",
    mechanism: "规则排序",
    domainHits: scored.appliedRules.map((key: string) => names[key] || key),
    scaleHits: [],
    socialHits: [],
    narrativeHits: [],
    riskHits: [],
    svPenalty: 0,
    chinaBoost: false,
    sourceWeight: 1,
    hoursAgo,
    dateStatus,
    _scanTime: observedAt,
    scorerVersion: scored.scorerVersion,
    inputSha256: scored.inputSha256,
    rulesSha256: scored.rulesSha256,
    weightsSha256: scored.weightsSha256,
    matchedRules: scored.matchedRules,
    appliedRules: scored.appliedRules,
  }
}

export function scoreAndRank(items: CandidateInput[], now = Date.now()): ScoredItem[] {
  // One source URL is one observation even when its publisher corrects the title.
  // Resolve revisions before grouping so fresh scans and cache writes agree.
  const observations = new Map<string, CandidateInput>()
  for (const item of items) {
    const key = `${item.sourceId}\n${item.url}`
    const old = observations.get(key)
    observations.set(key, { ...item, _scanTime: Math.min(old?._scanTime ?? now, item._scanTime ?? now) })
  }
  const groups = new Map<string, Map<string, CandidateInput>>()
  for (const item of observations.values()) {
    if (candidateRejection(item, now)) continue
    const key = getGroupKey(item.title)
    const group = groups.get(key) ?? new Map<string, CandidateInput>()
    const observationKey = `${item.sourceId}\n${item.url}`
    const old = group.get(observationKey)
    group.set(observationKey, {
      title: item.title,
      summary: item.summary,
      url: item.url,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      pubDate: item.pubDate,
      dateStatus: item.dateStatus,
      _scanTime: Math.min(old?._scanTime ?? now, item._scanTime ?? now),
    })
    groups.set(key, group)
  }
  const ranked: ScoredItem[] = []
  for (const group of groups.values()) {
    const sources = [...group.values()]
    const scored = sources.map(item => ({ ...scoreTitle(item.title, item.sourceId, item.sourceName, item.pubDate, now, item._scanTime, item.summary), url: item.url }))
    scored.sort(comparePicks)
    const families = new Set(sources.map(item => sourceFamily(item.sourceId)))
    ranked.push({
      ...scored[0],
      sources,
      sourceCount: families.size,
      hotLevel: families.size >= 3 ? 2 : families.size >= 2 ? 1 : 0,
      // Single-source coverage is evidence about this scan only, never a verified exclusive.
      isExclusive: false,
      singlePrioritySource: families.size === 1 && PRIORITY_SOURCES.has([...families][0]),
    })
  }
  return ranked.sort(comparePicks)
}

function comparePicks(a: ScoredItem, b: ScoredItem): number {
  return b.finalScore - a.finalScore || (b.pubDate ?? 0) - (a.pubDate ?? 0)
    || a.sourceId.localeCompare(b.sourceId) || a.url.localeCompare(b.url) || a.title.localeCompare(b.title)
}
