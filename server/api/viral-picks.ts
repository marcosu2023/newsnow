import type { ScoredItem } from "../lib/viral-scorer"

function getBaseUrl(): string {
  if (process.env.NUXT_SITE_URL) return process.env.NUXT_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function gradeBadge(grade: string): string {
  const colors: Record<string, string> = {
    S: "#ef4444",
    A: "#f97316",
    B: "#3b82f6",
    C: "#9ca3af",
    D: "#d1d5db",
  }
  const bg = colors[grade] || "#d1d5db"
  const fg = grade === "D" ? "#666" : "#fff"
  return `<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:6px;font-weight:700;font-size:14px;color:${fg};background:${bg};margin-right:8px;flex-shrink:0">${grade}</span>`
}

function boostTag(label: string): string {
  return `<span style="display:inline-block;font-size:11px;padding:1px 6px;border-radius:3px;background:#eff6ff;color:#2563eb;margin:2px 2px 2px 0">${escapeHtml(label)}</span>`
}

function penaltyTag(label: string): string {
  return `<span style="display:inline-block;font-size:11px;padding:1px 6px;border-radius:3px;background:#f3f4f6;color:#6b7280;margin:2px 2px 2px 0">\u26a0 ${escapeHtml(label)}</span>`
}

function riskBar(r: { label: string; svRate: number }): string {
  const pct = Math.round(r.svRate * 100)
  const bg = r.svRate >= 0.50 ? "#fef2f2" : "#fffbeb"
  const border = r.svRate >= 0.50 ? "#fca5a5" : "#fde68a"
  const color = r.svRate >= 0.50 ? "#b91c1c" : "#92400e"
  return `<div style="font-size:11px;padding:3px 8px;margin-top:4px;border-radius:4px;background:${bg};border:1px solid ${border};color:${color}">\u26a0\ufe0f ${escapeHtml(r.label)} (${pct}% sv-rate)</div>`
}

function renderCard(item: ScoredItem, idx: number): string {
  const borderColor = idx < 5 ? ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6"][idx] : "#e5e7eb"
  const borderWidth = idx < 5 ? "4px" : "2px"
  const tags = [
    ...item.boosts.map(boostTag),
    ...item.penalties.map(penaltyTag),
  ].join("")
  const risksHtml = item.risks.map(riskBar).join("")
  const linkUrl = item.url ? escapeHtml(item.url) : "#"
  const srcWeight = item.sourceWeight > 1 ? ` <span style="color:#a855f7;font-size:11px">\u00d71.5</span>` : ""

  return `
    <div style="border-left:${borderWidth} solid ${borderColor};padding:12px 16px;margin-bottom:12px;background:#fff;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div style="display:flex;align-items:flex-start">
        ${gradeBadge(item.grade)}
        <div style="flex:1;min-width:0">
          <a href="${linkUrl}" target="_blank" rel="noopener" style="color:#111;text-decoration:none;font-size:15px;font-weight:500;line-height:1.4;word-break:break-all">${escapeHtml(item.title)}</a>
          <div style="margin-top:4px;font-size:12px;color:#888">
            ${escapeHtml(item.source)}${srcWeight}
            &nbsp;\u00b7&nbsp; score ${item.score} \u00b7 final ${item.finalScore}
            &nbsp;\u00b7&nbsp; hook ${item.hookLen}\u5b57
          </div>
          ${tags ? `<div style="margin-top:4px">${tags}</div>` : ""}
          ${risksHtml}
        </div>
      </div>
    </div>`
}

export default defineEventHandler(async (event) => {
  const baseUrl = getBaseUrl()
  const data = await $fetch<{
    timestamp: string
    totalScanned: number
    sourcesScanned: number
    picks: ScoredItem[]
  }>(`${baseUrl}/api/viral-scan`)

  const top10 = data.picks.slice(0, 10)
  const ts = new Date(data.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>选题扫描 Top Picks</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:#f9fafb;color:#111;line-height:1.5}
  .wrap{max-width:680px;margin:0 auto;padding:20px 16px}
  .hdr{margin-bottom:20px}
  .hdr h1{font-size:22px;font-weight:700;margin-bottom:4px}
  .meta{font-size:13px;color:#888}
  .btn{display:inline-block;margin-top:8px;padding:6px 16px;font-size:13px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;text-decoration:none}
  .btn:hover{background:#2563eb}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>选题扫描 Top Picks</h1>
    <div class="meta">${data.totalScanned} 条新闻 / ${data.sourcesScanned} 个来源 &nbsp;\u00b7&nbsp; ${escapeHtml(ts)}</div>
    <a class="btn" href="/api/viral-picks" onclick="this.textContent='Loading...'">刷新</a>
  </div>
  ${top10.map((item, i) => renderCard(item, i)).join("\n")}
</div>
</body>
</html>`

  event.node.res.setHeader("Content-Type", "text/html; charset=utf-8")
  return html
})
