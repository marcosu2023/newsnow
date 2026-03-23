export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const forceRefresh = query.refresh === "1"

  let data: any = { picks: [], totalScanned: 0, sourcesScanned: 0 }
  try {
    data = await $fetch("/api/viral-scan", forceRefresh ? { query: { refresh: "1" } } : {})
  } catch {}

  // Hard cap: only show news from the last 8 hours
  const picks = (data.picks || []).filter((p: any) => {
    if (!p.hoursAgo && !p.pubDate) return (p.finalScore || 0) >= 8
    return (p.hoursAgo || 0) <= 8
  })

  // Mechanism config
  const mechConfig: Record<string, { emoji: string; color: string; bg: string; label: string }> = {
    "裂变": { emoji: "🔥", color: "#DC2626", bg: "#FEF2F2", label: "裂变" },
    "争议": { emoji: "💬", color: "#2563EB", bg: "#EFF6FF", label: "争议" },
    "涨粉": { emoji: "👤", color: "#059669", bg: "#ECFDF5", label: "涨粉" },
    "流量": { emoji: "👁", color: "#6B7280", bg: "#F9FAFB", label: "流量" },
  }

  const gc: Record<string, string> = { S: "#DC2626", A: "#D97706", B: "#2563EB", C: "#6B7280", D: "#9CA3AF" }

  // Sort helpers: mechanism-first sorting
  function mechFirst(items: any[], primaryMech: string) {
    const primary = items.filter((p: any) => p.mechanism === primaryMech)
    const rest = items.filter((p: any) => p.mechanism !== primaryMech)
    return [...primary, ...rest]
  }

  // Sections — each item appears only once across all sections
  const used = new Set<string>()
  function takeUnique(items: any[], limit: number) {
    const result: any[] = []
    for (const p of items) {
      const key = (p.title || "").slice(0, 30)
      if (used.has(key)) continue
      used.add(key)
      result.push(p)
      if (result.length >= limit) break
    }
    return result
  }

  const morningPicks = takeUnique(mechFirst(picks, "争议"), 15)
  const afternoonPicks = takeUnique(mechFirst(picks, "裂变"), 15)
  const remainingPicks = takeUnique(picks, 20)

  const fetchedAt = data.fetchedAt || Date.now()

  function timeLabel(p: any): string {
    const h = p.hoursAgo
    if (!h && !p.pubDate) return ""
    // If pubDate is within 30 min of fetch time, it's likely a fake time from RSS feed
    if (p.pubDate && fetchedAt) {
      const diffMin = Math.abs(fetchedAt - p.pubDate) / 60000
      if (diffMin < 30) return "" // fake time — suppress display
    }
    if (!h) return ""
    if (h < 1) return Math.round(h * 60) + "分钟前"
    if (h < 24) return Math.round(h) + "小时前"
    return Math.round(h / 24) + "天前"
  }

  function cardHtml(p: any): string {
    const m = mechConfig[p.mechanism] || mechConfig["流量"]

    const tags: string[] = []
    for (const d of (p.domainHits || [])) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#DBEAFE;color:#1E40AF">${d}</span>`)
    for (const s of (p.scaleHits || [])) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#D1FAE5;color:#065F46">${s}</span>`)
    for (const s of (p.socialHits || [])) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#FEF3C7;color:#92400E">${s}</span>`)
    for (const n of (p.narrativeHits || [])) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#F3E8FF;color:#7C3AED">${n}</span>`)

    const chinaBadge = p.chinaBoost ? `<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#FEE2E2;color:#991B1B">中国+25%</span>` : ""
    const srcBadge = p.sourceWeight > 1 ? `<span style="padding:1px 5px;border-radius:4px;font-size:9px;background:#DBEAFE;color:#1E40AF">优先源</span>` : ""
    const time = timeLabel(p)

    const hotBadge = p.hotLevel >= 2
      ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:10px;font-size:11px;margin-left:6px">🔥🔥 多源热点</span>'
      : p.hotLevel === 1
      ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:10px;font-size:11px;margin-left:6px">🔥 多源热点</span>'
      : ''
    const exclusiveBadge = p.isExclusive
      ? '<span style="background:#EDE9FE;color:#5B21B6;padding:2px 6px;border-radius:10px;font-size:11px;margin-left:6px">💎 独家</span>'
      : ''
    const sourceCountHint = p.sourceCount > 1
      ? ` <span style="color:#6b7280;font-size:11px">(${p.sourceCount}源报道)</span>`
      : ''

    const riskHtml = p.riskHits && p.riskHits.length > 0
      ? `<div style="margin-top:4px;padding:3px 6px;border-radius:4px;font-size:9px;background:${p.svPenalty >= 25 ? "#FEF2F2" : "#FFFBEB"};color:${p.svPenalty >= 25 ? "#991B1B" : "#92400E"}">⛔ -${p.svPenalty}% ${(p.riskHits || []).map((r: any) => r.label).join(", ")}</div>`
      : ""

    return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:start">
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px">
        <span style="font-size:18px">${m.emoji}</span>
        <span style="padding:1px 6px;border-radius:10px;font-size:9px;font-weight:600;background:${m.bg};color:${m.color}">${m.label}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:6px;margin-bottom:4px">
          <a href="${p.url}" target="_blank" rel="noopener" style="color:#111;text-decoration:none;font-size:13px;font-weight:500;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1">${p.title}</a>
          <div style="font-size:16px;font-weight:700;color:${gc[p.grade] || "#9CA3AF"};flex-shrink:0">${p.finalScore}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#9ca3af;margin-bottom:4px">
          <span>${p.source}</span>${sourceCountHint}${srcBadge}${hotBadge}${exclusiveBadge}${time ? `<span>· ${time}</span>` : ""}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px">${tags.join("")}${chinaBadge}</div>
        ${riskHtml}
      </div>
    </div>`
  }

  function sectionHtml(title: string, subtitle: string, items: any[], borderColor: string, collapsed = false): string {
    const style = collapsed ? "opacity:0.75;font-size:0.95em" : ""
    return `<div style="margin-bottom:24px;${style}">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
        <h2 style="font-size:15px;font-weight:600;color:#111;border-left:3px solid ${borderColor};padding-left:8px">${title}</h2>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:10px;padding-left:11px">${subtitle}</div>
      ${items.length > 0 ? items.map(cardHtml).join("") : '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:20px">暂无匹配选题</div>'}
    </div>`
  }

  const now = data.timestamp ? new Date(data.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : ""
  const cacheLabel = data.fromCache ? '<span style="color:#2563EB">缓存</span>' : '<span style="color:#16A34A">实时</span>'

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>选题扫描</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111;padding:16px;max-width:1200px;margin:0 auto}
    .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    h1{font-size:18px;font-weight:600}
    .meta{font-size:12px;color:#6b7280;margin-top:2px}
    .btn{padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;color:#374151;text-decoration:none;background:#fff;cursor:pointer}
    .btn:hover{background:#f3f4f6}
    .legend{display:flex;gap:6px;flex-wrap:wrap;font-size:10px;margin-bottom:16px}
    .legend span{padding:2px 8px;border-radius:10px}
    .divider{height:1px;background:#e5e7eb;margin:16px 0}
    .ft{font-size:10px;color:#9ca3af;text-align:center;padding:16px}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    @media(max-width:768px){.two-col{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="hd">
    <div>
      <h1>选题扫描 <span style="font-size:12px;font-weight:400;color:#9ca3af">v4.0</span></h1>
      <div class="meta">${data.totalScanned} 条新闻 · ${data.sourcesScanned} 源 · 8小时内 · ${now} · ${cacheLabel}</div>
    </div>
    <a class="btn" href="/api/viral-picks?refresh=1">强制刷新</a>
  </div>
  <div class="legend">
    <span style="background:#FEF2F2;color:#DC2626">🔥 裂变型</span>
    <span style="background:#EFF6FF;color:#2563EB">💬 争议型</span>
    <span style="background:#ECFDF5;color:#059669">👤 涨粉型</span>
    <span style="background:#F9FAFB;color:#6B7280;border:1px solid #e5e7eb">👁 流量型</span>
    <span style="background:#DBEAFE;color:#1E40AF">话题领域</span>
    <span style="background:#D1FAE5;color:#065F46">主体规模</span>
    <span style="background:#FEF3C7;color:#92400E">社交共振</span>
    <span style="background:#FEE2E2;color:#991B1B">中国贴近</span>
    <span style="background:#F3E8FF;color:#7C3AED">叙事框架</span>
    <span style="background:#F3F4F6;color:#6B7280">五大源 1.5x</span>
  </div>
  <div class="divider"></div>
  <div class="two-col">
    <div>${sectionHtml("上午档 · 建议 8:00–11:00 发布", "争议型选题在此时段爆款率最高", morningPicks, "#2563EB")}</div>
    <div>${sectionHtml("下午档 · 建议 15:00–17:00 发布", "裂变型选题在此时段爆款率最高（15.8%）", afternoonPicks, "#DC2626")}</div>
  </div>
  <div class="divider"></div>
  ${sectionHtml("更多选题", "以上未收录的近8小时选题", remainingPicks, "#6B7280", true)}
  <div class="ft">
    选题评分模型 · 话题领域×主体规模×社交共振×叙事框架×中国贴近性 · 自见风险融入评分 · 爆法分类
    <div style="margin-top:12px;text-align:left;max-width:600px;margin-left:auto;margin-right:auto;line-height:1.8">
      <div style="font-weight:600;margin-bottom:4px;color:#6b7280">更新日志</div>
      <div>v4.0 · 2026-03-23 · 新增叙事框架层（巨头新动作/政策转向/数据发布/预期反差/跨界竞争/供应链冲击/高层人事/监管出手/资本信号/行业里程碑）；左右双栏布局；展示容量扩至15+15+20</div>
      <div>v3.5 · 2026-03-23 · 多源聚合去重+独家标记；修复RSS假时间；缓存hoursAgo实时重算；8小时留存上限</div>
      <div>v3.0 · 2026-03-22 · v3权重（1213条短视频因子分析）；时间衰减评分；分级留存策略</div>
    </div>
  </div>
</body>
</html>`

  event.node.res.setHeader("Content-Type", "text/html; charset=utf-8")
  return html
})
