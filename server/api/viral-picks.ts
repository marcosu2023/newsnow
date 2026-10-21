import { defineEventHandler, getQuery } from "h3"
import { getGroupKey } from "../lib/viral-scorer"
import { candidateRejection } from "../lib/viral-input"
import { scorerVersion } from "../lib/news4-v1/scorer.mjs"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const forceRefresh = query.refresh === "1"

  let data: any = { picks: [], totalScanned: 0, sourcesScanned: 0 }
  let unavailable = false
  try {
    data = await $fetch("/api/viral-scan", forceRefresh ? { query: { refresh: "1" } } : {})
  } catch {
    unavailable = true
  }

  // Hard cap: only show news from the last 8 hours
  const nowMs = Date.now()
  const picks = (data.picks || []).filter((p: any) => !candidateRejection({ ...p, sourceName: p.source }, nowMs))

  // Single list: score descending, each story group appears once
  const used = new Set<string>()
  const ranked: any[] = []
  for (const p of [...picks].sort((a: any, b: any) => b.finalScore - a.finalScore)) {
    const key = getGroupKey(p.title || "")
    if (used.has(key)) continue
    used.add(key)
    ranked.push(p)
    if (ranked.length >= 50) break
  }
  const topPicks = ranked.slice(0, 3)
  const listPicks = ranked.slice(3, 10)
  const morePicks = ranked.slice(10)

  const fetchedAt = data.fetchedAt || Date.now()

  function timeLabel(p: any): string {
    if (p.dateStatus === "missing" || !p.pubDate) return "发布时间未知"
    const h = p.hoursAgo
    if (!h) return "刚刚"
    if (h < 1) return `${Math.round(h * 60)}分钟前`
    if (h < 24) return `${Math.round(h)}小时前`
    return `${Math.round(h / 24)}天前`
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
  }

  function tagsOf(p: any): string[] {
    return [...(p.domainHits || []), ...(p.scaleHits || []), ...(p.socialHits || []), ...(p.narrativeHits || [])].slice(0, 2)
  }

  function metaLine(p: any): string {
    const parts = [escapeHtml(p.source), scorerVersion]
    if (p.sourceCount > 1) parts.push(`${p.sourceCount}源报道`)
    if (p.isExclusive) parts.push("独家")
    const time = timeLabel(p)
    if (time) parts.push(time)
    return parts.join(" · ")
  }

  function riskLine(p: any): string {
    if (!p.riskHits || p.riskHits.length === 0) return ""
    return `<div class="risk">风险 -${p.svPenalty}% ${p.riskHits.map((r: any) => r.label).join("、")}</div>`
  }

  function adoptionHtml(p: any): string {
    const id = String(p.recommendationId ?? "")
    const match = /^([a-f0-9]{64}):([1-9]\d{0,8})$/.exec(id)
    if (!match) return "<div class=\"meta-line\">推荐记录不可用</div>"
    const shortId = `${match[1].slice(0, 8)}:${match[2]}`
    return `<div class="adoption"><span>推荐 ID ${shortId}</span> <button type="button" class="btn adopt" data-recommendation-id="${id}">采用</button><span class="adoption-status" role="status" aria-live="polite"></span></div>`
  }

  function topCardHtml(p: any, i: number): string {
    const tags = tagsOf(p)
    return `<div class="card${i === 0 ? " first" : ""}">
      <div class="card-hd">
        <span class="mech">${i === 0 ? "今日首推 · " : ""}${p.mechanism || "规则排序"}</span>
        <span class="card-score">${Number(p.finalScore).toFixed(2)}</span>
      </div>
      <a class="card-title" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a>
      <div class="meta-line">${metaLine(p)}</div>
      ${tags.length ? `<div class="reason">推荐理由：${tags.map(escapeHtml).join("、")}</div>` : ""}
      ${riskLine(p)}
      ${adoptionHtml(p)}
    </div>`
  }

  function rowHtml(p: any, rank: number): string {
    const tags = tagsOf(p)
    return `<div class="row">
      <span class="rank">${rank}</span>
      <div class="row-main">
        <a class="row-title" href="${escapeHtml(p.url)}" target="_blank" rel="noopener"><span class="mech-sm">【${p.mechanism || "规则排序"}】</span>${escapeHtml(p.title)}</a>
        <div class="meta-line">${metaLine(p)}${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        ${riskLine(p)}
      ${adoptionHtml(p)}
      </div>
      <span class="row-score">${Number(p.finalScore).toFixed(2)}</span>
    </div>`
  }

  const updatedAt = data.timestamp ? new Date(data.timestamp).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }) : ""

  // --- Embedded JSON for downstream consumers (e.g. datanews decision layer) ---
  // All filtered picks (the 8-hour window) in structured form.
  // Downstream code locates this by: <script id="__VIRAL_DATA__" type="application/json">
  const embeddedData = {
    version: "4.0",
    scorerVersion,
    recommendationBatchId: data.recommendationBatchId ?? null,
    recommendationRecordStatus: data.recommendationRecordStatus ?? "unavailable",
    generatedAt: data.timestamp || Date.now(),
    fetchedAt,
    totalScanned: data.totalScanned || 0,
    sourcesScanned: data.sourcesScanned || 0,
    windowHours: 8,
    picks: ranked.map((p: any) => ({
      title: p.title,
      url: p.url,
      source: p.source,
      finalScore: p.finalScore,
      displayScore: p.displayScore,
      scorerVersion: p.scorerVersion,
      recommendationId: p.recommendationId,
      inputSha256: p.inputSha256,
      rulesSha256: p.rulesSha256,
      weightsSha256: p.weightsSha256,
      summary: p.summary ?? null,
      appliedRules: p.appliedRules || [],
      grade: p.grade,
      mechanism: p.mechanism,
      hoursAgo: p.hoursAgo ?? null,
      pubDate: p.pubDate ?? null,
      dateStatus: p.dateStatus,
      observedAt: p._scanTime,
      sourceId: p.sourceId,
      sources: p.sources || [],
      singlePrioritySource: !!p.singlePrioritySource,
      domainHits: p.domainHits || [],
      scaleHits: p.scaleHits || [],
      socialHits: p.socialHits || [],
      narrativeHits: p.narrativeHits || [],
      chinaBoost: !!p.chinaBoost,
      sourceWeight: p.sourceWeight ?? 1,
      hotLevel: p.hotLevel ?? 0,
      isExclusive: !!p.isExclusive,
      sourceCount: p.sourceCount ?? 1,
      riskHits: p.riskHits || [],
      svPenalty: p.svPenalty ?? 0,
    })),
  }
  // Escape `</` to prevent early termination of the <script> block.
  const embeddedJson = `<script id="__VIRAL_DATA__" type="application/json">${JSON.stringify(embeddedData).replace(/<\/(script)/gi, "<\\/$1")}</script>`

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>选题扫描</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111;padding:16px;max-width:1080px;margin:0 auto}
    a{color:inherit;text-decoration:none}
    a:hover{text-decoration:underline}
    .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
    h1{font-size:15px;font-weight:600}
    h1 .meta{font-weight:400;color:#6b7280;font-size:12px;margin-left:6px}
    .btn{padding:5px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;color:#374151;background:#fff}
    .btn:hover{background:#f3f4f6;text-decoration:none}
    .top{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
    @media(max-width:768px){.top{grid-template-columns:1fr}}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px}
    .card.first{border-color:#DC2626;box-shadow:0 0 0 1px #DC2626 inset}
    .card-hd{display:flex;justify-content:space-between;align-items:baseline}
    .mech{font-size:11px;color:#6b7280}
    .card.first .mech{color:#DC2626;font-weight:600}
    .card-score{font-size:22px;font-weight:700;color:#6b7280}
    .card.first .card-score{color:#DC2626}
    .card-title{font-size:15px;font-weight:600;line-height:1.45}
    .meta-line{font-size:11px;color:#9ca3af;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
    .reason{font-size:12px;color:#374151}
    .slot{font-size:12px;color:#6b7280}
    .risk{font-size:11px;color:#92400E;margin-top:2px}
    .list{background:#fff;border:1px solid #e5e7eb;border-radius:10px}
    .row{display:flex;align-items:flex-start;gap:12px;padding:10px 14px;border-top:1px solid #f3f4f6}
    .row:first-child{border-top:none}
    .rank{width:20px;font-size:12px;color:#9ca3af;padding-top:2px;flex-shrink:0;text-align:right}
    .row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
    .row-title{font-size:14px;line-height:1.45}
    .mech-sm{color:#6b7280;font-size:12px}
    .row-score{font-size:14px;font-weight:600;color:#6b7280;flex-shrink:0}
    .tag{padding:0 6px;border-radius:8px;background:#f3f4f6;color:#6b7280}
    details{margin-top:12px}
    summary{cursor:pointer;font-size:12px;color:#6b7280;padding:8px 0;text-align:center}
    .empty{font-size:12px;color:#9ca3af;text-align:center;padding:20px}
    .adoption{font-size:11px;color:#6b7280;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .ft{font-size:10px;color:#9ca3af;text-align:center;padding:16px}
  </style>
</head>
<body>
  <div class="hd">
    <h1>选题扫描<span class="meta">${data.totalScanned} 条 · ${data.sourcesScanned} 源 · 8小时内${updatedAt ? ` · ${updatedAt} 更新` : ""}</span></h1>
    <a class="btn" href="/api/viral-picks?refresh=1">刷新</a>
  </div>
  ${ranked.length === 0
    ? unavailable ? "<div class=\"empty\">推荐服务暂不可用，请稍后重试</div>" : "<div class=\"empty\">暂无匹配选题</div>"
    : `<div class="top">${topPicks.map(topCardHtml).join("")}</div>
  ${listPicks.length ? `<div class="list">${listPicks.map((p, i) => rowHtml(p, i + 4)).join("")}</div>` : ""}
  ${morePicks.length ? `<details><summary>展开更多（${morePicks.length} 条）</summary><div class="list">${morePicks.map((p, i) => rowHtml(p, i + 11)).join("")}</div></details>` : ""}`}
  <div class="ft">
    选题评分模型 · 话题领域×主体规模×社交共振×叙事框架×中国贴近性 · 自见风险融入评分 · 爆法分类
    <div style="margin-top:12px;text-align:left;max-width:600px;margin-left:auto;margin-right:auto;line-height:1.8">
      <div style="font-weight:600;margin-bottom:4px;color:#6b7280">更新日志</div>
      <div>v4.1 · 2026-10-12 · 单列布局：前3条首推卡片 + 第4–10名列表，其余折叠；去掉上午/下午分档与图例</div>
      <div>v4.0 · 2026-03-24 · 新增叙事框架层（巨头新动作/政策转向/数据发布/预期反差/跨界竞争/供应链冲击/高层人事/监管出手/资本信号/行业里程碑）；左右双栏布局；展示容量扩至15+15+20</div>
      <div>v3.5 · 2026-03-23 · 多源聚合去重+独家标记；修复RSS假时间；缓存hoursAgo实时重算；8小时留存上限</div>
      <div>v3.0 · 2026-03-22 · v3权重（1213条短视频因子分析）；时间衰减评分；分级留存策略</div>
      <div>v2.0 · 2026-03-18 · 三层评分模型重构（话题领域×主体规模×社交共振）；Redis 24h缓存；Vercel Cron自动扫描；爆法分类布局（裂变/争议/涨粉/流量）</div>
      <div>v1.0 · 2026-03-18 · 首版选题扫描器上线；16源抓取；中国贴近性加权；4栏布局；五大源优先权重</div>
    </div>
  </div>
  ${embeddedJson}
  <script id="__NEWS4_ADOPTION__">
  document.addEventListener("click", async function(event) {
    const button = event.target.closest && event.target.closest("button.adopt");
    if (!button || button.disabled) return;
    const status = button.parentElement.querySelector(".adoption-status");
    button.disabled = true;
    status.textContent = "记录中…";
    try {
      const response = await fetch("/api/news4-adoptions", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ recommendationId: button.dataset.recommendationId })
      });
      const result = await response.json();
      if (!response.ok || result.status !== "recorded" || result.recommendationId !== button.dataset.recommendationId) throw new Error("not recorded");
      status.textContent = "已记录";
    } catch { status.textContent = "记录失败，请重试"; }
    finally { button.disabled = false; }
  });
  </script>
</body>
</html>`

  event.node.res.setHeader("Content-Type", "text/html; charset=utf-8")
  return html
})
