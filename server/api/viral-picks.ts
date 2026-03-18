export default defineEventHandler(async (event) => {
  let data: any = { picks: [], totalScanned: 0, sourcesScanned: 0 }
  try {
    data = await $fetch("/api/viral-scan")
  } catch {}

  const picks = (data.picks || []).slice(0, 15)

  const gc: Record<string, string> = { S: "#DC2626", A: "#D97706", B: "#2563EB", C: "#6B7280", D: "#9CA3AF" }
  const gb: Record<string, string> = { S: "#FEF2F2", A: "#FFFBEB", B: "#EFF6FF", C: "#F9FAFB", D: "#F9FAFB" }

  function tagHtml(items: string[], bg: string, color: string, prefix = "") {
    return items.map(t => `<span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${bg};color:${color}">${prefix}${t}</span>`).join("")
  }

  const cardsHtml = picks.map((p: any, i: number) => {
    const isTop5 = i < 5
    const borderColor = isTop5 ? (gc[p.grade] || "#ccc") : "#e5e7eb"

    const domainTags = tagHtml(p.domainHits || [], "#DBEAFE", "#1E40AF")
    const scaleTags = tagHtml(p.scaleHits || [], "#D1FAE5", "#065F46")
    const socialTags = tagHtml(p.socialHits || [], "#FEF3C7", "#92400E")
    const allTags = [domainTags, scaleTags, socialTags].filter(Boolean).join("")

    const riskHtml = p.riskHits && p.riskHits.length > 0
      ? `<div style="margin-top:6px;padding:5px 10px;border-radius:6px;font-size:11px;background:${p.svPenalty >= 25 ? "#FEF2F2" : "#FFFBEB"};color:${p.svPenalty >= 25 ? "#991B1B" : "#92400E"}">
          ⛔ 自见扣分 -${p.svPenalty}% · ${(p.riskHits || []).map((r: any) => r.label + " " + r.svRate + "%").join(", ")}
        </div>`
      : ""

    const layerCount = ((p.domainHits||[]).length > 0 ? 1 : 0) + ((p.scaleHits||[]).length > 0 ? 1 : 0) + ((p.socialHits||[]).length > 0 ? 1 : 0)
    const comboHtml = layerCount >= 2
      ? `<span style="padding:2px 8px;border-radius:12px;font-size:11px;background:#EDE9FE;color:#5B21B6">${layerCount}层叠加${layerCount === 3 ? " +30%" : " +10%"}</span>`
      : ""

    const srcBadge = p.sourceWeight > 1
      ? `<span style="padding:1px 6px;border-radius:4px;font-size:10px;background:#DBEAFE;color:#1E40AF">优先源 1.5x</span>`
      : ""

    return `
    <div style="background:#fff;border:1px solid ${borderColor};${isTop5 ? "border-left:4px solid " + borderColor : ""};border-radius:12px;padding:14px 18px;margin-bottom:10px;${!isTop5 ? "opacity:0.65" : ""}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;background:${gc[p.grade] || "#ccc"};flex-shrink:0">${p.grade}</div>
        <div style="flex:1;min-width:0">
          <a href="${p.url}" target="_blank" rel="noopener" style="color:#111;text-decoration:none;font-size:14px;font-weight:500;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${p.title}</a>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">${p.source} ${srcBadge}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:20px;font-weight:700;color:${gc[p.grade]}">${p.finalScore}</div>
          <div style="font-size:10px;color:#9ca3af">加权分</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${allTags}${comboHtml}</div>
      ${riskHtml}
    </div>`
  }).join("")

  const now = data.timestamp ? new Date(data.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : ""

  const legendHtml = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;margin-bottom:12px">
      <span style="padding:2px 8px;border-radius:12px;background:#DBEAFE;color:#1E40AF">话题领域</span>
      <span style="padding:2px 8px;border-radius:12px;background:#D1FAE5;color:#065F46">主体规模</span>
      <span style="padding:2px 8px;border-radius:12px;background:#FEF3C7;color:#92400E">社交共振</span>
      <span style="padding:2px 8px;border-radius:12px;background:#EDE9FE;color:#5B21B6">叠加加成</span>
    </div>`

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>选题扫描 v2</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111;padding:16px;max-width:680px;margin:0 auto}
    .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    h1{font-size:18px;font-weight:600}
    .meta{font-size:12px;color:#6b7280;margin-top:2px}
    .btn{padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;color:#374151;text-decoration:none;background:#fff}
    .btn:hover{background:#f3f4f6}
    .divider{height:1px;background:#e5e7eb;margin:12px 0}
    .ft{font-size:10px;color:#9ca3af;text-align:center;padding:12px}
  </style>
</head>
<body>
  <div class="hd">
    <div>
      <h1>选题扫描 v2</h1>
      <div class="meta">${data.totalScanned} 条新闻 · ${data.sourcesScanned} 源 · ${now}</div>
    </div>
    <a class="btn" href="/api/viral-picks">刷新</a>
  </div>
  <div style="font-size:11px;color:#6b7280;margin-bottom:8px">
    三层模型: 话题领域×主体规模×社交共振 · 自见风险融入评分 · 五大源(财新/路透/彭博/WSJ/FT) 1.5x加权
  </div>
  ${legendHtml}
  <div class="divider"></div>
  ${cardsHtml || '<p style="color:#9ca3af;text-align:center;padding:40px">暂无数据</p>'}
  <div class="ft">选题评分模型 v2 · 三层因子 + 自见风险 · 基于1000条视频数据</div>
</body>
</html>`

  event.node.res.setHeader("Content-Type", "text/html; charset=utf-8")
  return html
})
