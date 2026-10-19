export type DateStatus = "valid" | "missing" | "invalid" | "future"

export interface CandidateInput {
  title: string
  /** Optional summary supplied by the original source API; never generated from a publication. */
  summary?: string
  url: string
  sourceId: string
  sourceName: string
  pubDate?: number
  dateStatus?: DateStatus
  /** First observed time, never a claimed publication time. */
  _scanTime?: number
}

export const MAX_AGE_MS = 8 * 60 * 60 * 1000

/** Only Jin10's timezone-less absolute format has verified source timezone. */
export function parseSourceDate(value: unknown, sourceId: string): { pubDate?: number, dateStatus: DateStatus } {
  if (value === undefined || value === null || value === "") return { dateStatus: "missing" }
  let timestamp: number
  if (typeof value === "number") {
    timestamp = value // Epoch milliseconds only; never silently interpret seconds.
  } else if (typeof value === "string") {
    const text = value.trim()
    const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text)
    if (local && sourceId === "jin10") {
      const [, y, m, d, hh, mm, ss] = local
      const utc = Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss)
      // Reject calendar rollover (e.g. February 30) rather than normalizing it.
      if (new Date(utc).toISOString().slice(0, 19) !== `${y}-${m}-${d}T${hh}:${mm}:${ss}`) return { dateStatus: "invalid" }
      timestamp = utc - 8 * 3600000
    } else if (/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(text)) {
      const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.exec(text)
      if (iso) {
        const [, y, m, d, hh, mm, rawSeconds] = iso
        const ss = rawSeconds ?? "00"
        const calendar = Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss)
        if (new Date(calendar).toISOString().slice(0, 19) !== `${y}-${m}-${d}T${hh}:${mm}:${ss}`) return { dateStatus: "invalid" }
      } else {
        const rfc = /^(?:[A-Z]{3},?\s+)?(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(?:GMT|UTC|[+-]\d{4})$/i.exec(text)
        if (!rfc) return { dateStatus: "invalid" }
        const [, d, month, y, hh, mm, seconds] = rfc
        const m = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month.toLowerCase())
        if (m < 0) return { dateStatus: "invalid" }
        const calendar = new Date(Date.UTC(+y, m, +d, +hh, +mm, +(seconds ?? 0)))
        if (calendar.getUTCFullYear() !== +y || calendar.getUTCMonth() !== m || calendar.getUTCDate() !== +d || calendar.getUTCHours() !== +hh || calendar.getUTCMinutes() !== +mm || calendar.getUTCSeconds() !== +(seconds ?? 0)) return { dateStatus: "invalid" }
      }
      timestamp = Date.parse(text)
    } else {
      return { dateStatus: "invalid" } // Unverified timezone must not depend on host TZ.
    }
  } else {
    return { dateStatus: "invalid" }
  }
  return Number.isFinite(timestamp) && timestamp >= Date.UTC(2000, 0, 1) && timestamp <= 8640000000000000
    ? { pubDate: timestamp, dateStatus: "valid" }
    : { dateStatus: "invalid" }
}

/** Deterministic title/page guard, not semantic fact checking or body verification. */
export function candidateRejection(item: CandidateInput, now: number): string | undefined {
  if (!item.title || [...item.title.trim()].length < 6) return "short-title"
  if (item.sourceId === "xueqiu-hotstock" || item.sourceId === "xueqiu") return "stock-quote"
  if (/^(?:印刷版|纸质版|电子报|首页|登录|订阅|关于我们|联系我们|隐私政策|服务条款|数字报|print edition|sign in|subscribe)(?:[\s|｜:：—\-]|$)/i.test(item.title.trim())) return "navigation"
  try {
    const url = new URL(item.url)
    if (url.protocol !== "http:" && url.protocol !== "https:") return "invalid-url"
  } catch {
    return "invalid-url"
  }
  if (item.dateStatus === "invalid" || item.dateStatus === "future") return "invalid-date"
  if (item.pubDate !== undefined) {
    if (!Number.isFinite(item.pubDate) || item.pubDate < Date.UTC(2000, 0, 1)) return "invalid-date"
    if (item.pubDate > now) return "future-date"
    if (now - item.pubDate >= MAX_AGE_MS) return "expired"
  } else if (item._scanTime !== undefined) {
    if (!Number.isFinite(item._scanTime) || item._scanTime > now) return "invalid-observation"
    if (now - item._scanTime >= MAX_AGE_MS) return "expired-observation"
  }
  return undefined
}

/** Business-source company defaults; mask explicit homonyms at their own occurrence. */
export function entityText(title: string): string {
  const defaultCompanies = new Set(["苹果", "小米", "阿里", "字节"])
  const contexts: Record<string, RegExp> = {
    哪吒: /汽车|新能源|合众|交付|销量|造车|停产|欠薪/,
    理想: /汽车|新能源|交付|销量|造车|李想|L[6-9]|MEGA/i,
    大众: /汽车|车型|新能源|销量|交付|工厂|ID\.|高尔夫|帕萨特/i,
  }
  // Keep length and other words intact, so one homonym cannot erase another company
  // in the same headline (e.g. 小米粥销量增长，小米宣布进军机器人).
  const homonyms = [
    /(?:红富士|水果|果园)(?:里的|中的|的)?苹果|苹果(?:汁|树)|小米(?:粥|饭)|阿里(?:扎罗|地区|山)|大众(?:消费|点评|化)|社会大众|不理想|理想[的化]|(?:电影|动画)《?哪吒|哪吒(?:[12２]?(?:票房|电影|动画)|之魔童|魔童|》)/,
    /苹果(?:期货|主力合约|合约|产区|收购价|丰收|种植|果农)|(?:新季|烟台|陕西|洛川|富士|郑商所)苹果/,
    /(?:不及|未达|未如|并不|不够|较为)理想|理想(?:中(?!期|报)|状态|水平|目标)/,
    /(?:普通|广大|社会)大众|大众(?:健身|创业|传媒|情绪|需求)/,
  ]
  if (/产区|收购|果农|斤/.test(title) && !/iPhone|Mac|iPad/i.test(title)) homonyms.push(/苹果价格/)
  const masked = title.replace(
    new RegExp(homonyms.map(pattern => pattern.source).join("|"), "g"),
    phrase => phrase.replace(/苹果|小米|阿里|大众|理想|哪吒/g, word => "□".repeat(word.length)),
  )
  return masked.replace(/苹果|小米|哪吒|理想|大众|阿里|字节/g, (word: string, offset: number) => {
    const following = masked.slice(offset + word.length)
    const adjacentSignal = (word === "理想" || word === "大众") && /^(?:宣布|发布|降价|市值|股价)/.test(following)
    const namedCompany = word === "大众" && /^(?:集团|公司)/.test(following)
    const interimReport = word === "理想" && /^(?:中期|中报)(?=业绩|财报|营收|净利)/.test(following)
    return defaultCompanies.has(word) || contexts[word]?.test(title) || adjacentSignal || namedCompany || interimReport ? word : "□".repeat(word.length)
  })
}

export function isChinaUsTrade(title: string): boolean {
  return /中美/.test(title)
    || (/美国|美方|美政府|白宫|华盛顿/.test(title) && /中国|中方|对华|中企|华为/.test(title) && /关税|制裁|贸易|出口管制|对华|对美/.test(title))
    || (/中国|中方/.test(title) && /对美/.test(title))
}
