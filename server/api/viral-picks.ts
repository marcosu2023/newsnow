import { defineEventHandler } from "h3"

export default defineEventHandler(async (event) => {
  let data: any = { picks: [], totalScanned: 0, sourcesScanned: 0 }
  try {
    data = await $fetch("/api/viral-scan")
  } catch {}

  const picks = (data.picks || []).filter((p: any) => p.hoursAgo <= 24 || !p.pubDate)

  const gc: Record<string, string> = { S: "#DC2626", A: "#D97706", B: "#2563EB", C: "#6B7280", D: "#9CA3AF" }

  const grades = ["S", "A", "B", "C"]
  const gradeNames: Record<string, string> = { S: "S 极高潜力", A: "A 高潜力", B: "B 中等偏上", C: "C 基线水平" }
  const buckets: Record<string, any[]> = { S: [], A: [], B: [], C: [] }
  for (const p of picks) {
    if (buckets[p.grade]) buckets[p.grade].push(p)
  }

  function timeLabel(h: number): string {
    if (!h) return ""
    if (h < 1) return Math.round(h * 60) + "分钟前"
    if (h < 24) return Math.round(h) + "小时前"
    return Math.round(h / 24) + "天前"
  }

  function cardHtml(p: any): string {
    const tags: string[] = []
    for (const d of (p.domainHits || [])) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#DBEAFE;color:#1E40AF">${d}</span>`)
    for (const s of (p.scaleHits || [])) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#D1FAE5;color:#065F46">${s}</span>`)
    for (const s of (p.socialHits || [])) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#FEF3C7;color:#92400E">${s}</span>`)

    const layerCount = ((p.domainHits||[]).length > 0 ? 1 : 0) + ((p.scaleHits||[]).length > 0 ? 1 : 0) + ((p.socialHits||[]).length > 0 ? 1 : 0)
    if (layerCount >= 2) tags.push(`<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#EDE9FE;color:#5B21B6">${layerCount}层${layerCount===3?"+30%":"+10%"}</span>`)

    const chinaBadge = p.chinaBoost ? `<span style="padding:1px 6px;border-radius:10px;font-size:10px;background:#FEE2E2;color:#991B1B">中国+25%</span>` : ""
    const srcBadge = p.sourceWeight > 1 ? `<span style="padding:1px 5px;border-radius:4px;font-size:9px;background:#DBEAFE;color:#1E40AF">优先源</span>` : ""
    const time = timeLabel(p.hoursAgo)

    const riskHtml = p.riskHits && p.riskHits.length > 0
      ? `<div style="margin-top:4px;padding:3px 6px;border-radius:4px;font-size:9px;background:${p.svPenalty>=25?"#FEF2F2":"#FFFBEB"};color:${p.svPenalty>=25?"#991B1B":"#92400E"}">⛔ -${p.svPenalty}% ${(p.riskHits||[]).map((r:any)=>r.label).join(", ")}</div>`
      : ""

    return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:6px;margin-bottom:4px">
        <a href="${p.url}" target="_blank" rel="noopener" style="color:#111;text-decoration:none;font-size:13px;font-weight:500;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1">${p.title}</a>
        <div style="font-size:16px;font-weight:700;color:${gc[p.grade]};flex-shrink:0">${p.finalScore}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#9ca3af;margin-bottom:4px">
        <span>${p.source}</span>${srcBadge}${time ? `<span>· ${time}</span>` : ""}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${tags.join("")}${chinaBadge}</div>
      ${riskHtml}
    </div>`
  }

  const columnsHtml = grades.map(g => {
    const items = buckets[g].slice(0, 10)
    const count = buckets[g].length
    return `<div style="flex:1;min-width:220px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid ${gc[g]}">
        <span style="width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;background:${gc[g]}">${g}</span>
        <span style="font-size:12px;font-weight:500;color:#374151">${gradeNames[g]}</span>
        <span style="font-size:11px;color:#9ca3af">(${count})</span>
      </div>
      ${items.length > 0 ? items.map(cardHtml).join("") : '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:20px">暂无</div>'}
    </div>`
  }).join("")

  const now = data.timestamp ? new Date(data.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : ""

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>选题扫描</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111;padding:16px}
    .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;max-width:1200px;margin-left:auto;margin-right:auto}
    h1{font-size:18px;font-weight:600}
    .meta{font-size:12px;color:#6b7280;margin-top:2px}
    .btn{padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;color:#374151;text-decoration:none;background:#fff;cursor:pointer}
    .btn:hover{background:#f3f4f6}
    .legend{display:flex;gap:8px;flex-wrap:wrap;font-size:10px;margin-bottom:12px;max-width:1200px;margin-left:auto;margin-right:auto}
    .legend span{padding:2px 8px;border-radius:10px}
    .cols{display:flex;gap:12px;max-width:1200px;margin:0 auto}
    @media(max-width:900px){.cols{flex-direction:column}}
    .ft{font-size:10px;color:#9ca3af;text-align:center;padding:16px;max-width:1200px;margin:0 auto}
  </style>
</head>
<body>
  <div class="hd">
    <div>
      <h1>选题扫描</h1>
      <div class="meta">${data.totalScanned} 条新闻 · ${data.sourcesScanned} 源 · 24小时内 · ${now}</div>
    </div>
    <a class="btn" href="/api/viral-picks">刷新</a>
  </div>
  <div class="legend">
    <span style="background:#DBEAFE;color:#1E40AF">话题领域</span>
    <span style="background:#D1FAE5;color:#065F46">主体规模</span>
    <span style="background:#FEF3C7;color:#92400E">社交共振</span>
    <span style="background:#EDE9FE;color:#5B21B6">叠加加成</span>
    <span style="background:#FEE2E2;color:#991B1B">中国贴近</span>
    <span style="background:#F3F4F6;color:#6B7280">五大源: 财新/路透/彭博/WSJ/FT 1.5x加权</span>
  </div>
  <div class="cols">${columnsHtml}</div>
  <div class="ft">选题评分模型 · 话题领域×主体规模×社交共振×中国贴近性 · 自见风险融入评分 · 基于1000条视频数据</div>
</body>
</html>`

  event.node.res.setHeader("Content-Type", "text/html; charset=utf-8")
  return html
})
