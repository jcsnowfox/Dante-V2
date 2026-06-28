function metricCard(title, value, note, helpers) {
  const { escapeHtml } = helpers;
  return `<article class="card gl-ai-card"><div class="card-header"><h2 class="card-title">${escapeHtml(title)}</h2></div><div class="card-body"><strong class="gl-ai-metric">${escapeHtml(String(value ?? "—"))}</strong><p>${escapeHtml(note || "")}</p></div></article>`;
}

function renderAiDiagnosticsPage({ report, theme, helpers }) {
  const { escapeHtml, buildAdminLocation } = helpers;
  const tabs = [
    "Overview",
    "Memory Health",
    "Prompt Health",
    "Companion Health",
    "Hallucination/Error Risks",
    "Context Flow",
    "Latency and Cost",
    "Recent Traces",
  ];
  const cards = [
    ["Overall AI Health", `${report.overall.score}/100`, report.enabled ? "Diagnostics capture is enabled" : "Capture disabled; showing stored/static metrics"],
    ["Memory Health", `${report.memoryHealth.score}/100`, `${report.memoryHealth.totalMemoryCount} memories scanned`],
    ["Prompt Health", `${report.promptHealth.score}/100`, `${report.promptHealth.finalPromptTokenCount} latest prompt tokens`],
    ["Companion Health", `${report.companionHealth.score}/100`, "Lightweight heuristics; no LLM judge by default"],
    ["Average Latency", report.overall.averageResponseLatencyMs ? `${report.overall.averageResponseLatencyMs}ms` : "No traces", "Response trace average"],
    ["Fallback Rate", `${Math.round((report.overall.fallbackRate || 0) * 100)}%`, "Observed companion events"],
    ["Error Rate", `${Math.round((report.overall.errorRate || 0) * 100)}%`, "Failed trace ratio"],
    ["Highest Risk Companion", report.overall.highestRiskCompanion || "None", "Risk labels are review signals, not proof"],
  ].map(([title, value, note]) => metricCard(title, value, note, helpers)).join("");

  const memoryCards = [
    ["Duplicate Memories", report.memoryHealth.duplicateMemories.length, "Exact duplicate signatures"],
    ["Orphaned Memories", report.memoryHealth.orphanedMemories.length, "Missing owner/source signals"],
    ["Missing Embeddings", report.memoryHealth.missingEmbeddings.length, "Needs indexing review"],
    ["Retrieval Latency", report.memoryHealth.retrievalLatencyMs ? `${report.memoryHealth.retrievalLatencyMs}ms` : "No samples", "Observed retrieval traces"],
    ["Retrieval Accuracy", report.memoryHealth.retrievalHitRate == null ? "No samples" : `${Math.round(report.memoryHealth.retrievalHitRate * 100)}%`, "Hit rate from diagnostics samples"],
    ["Fragmentation Risk", report.memoryHealth.fragmentationRisk, "Duplicate/orphan/quality heuristic"],
    ["Embedding Health", `${report.memoryHealth.embeddingCount}/${report.memoryHealth.totalMemoryCount}`, "Memories with vector identifiers"],
  ].map(([title, value, note]) => metricCard(title, value, note, helpers)).join("");

  const promptCards = [
    ["Token Usage", report.promptHealth.finalPromptTokenCount, "Latest final prompt estimate"],
    ["Duplicate Instructions", report.promptHealth.repeatedInstructions.length, "Repeated section summaries"],
    ["Conflicts", report.promptHealth.conflictingInstructions.length, "Heuristic conflict markers"],
    ["Context Bloat", report.promptHealth.overlyLargePromptSections.length, "Sections over threshold"],
    ["Prompt Growth", report.promptHealth.promptDiff.tokenDelta, "Token delta from previous build"],
    ["Compression Savings", report.promptHealth.contextCompressionEffectiveness, "Reported saved tokens"],
    ["Missing Context", report.promptHealth.missingRequiredContext.length, "Required context gaps"],
  ].map(([title, value, note]) => metricCard(title, value, note, helpers)).join("");

  const companionCards = [
    ["Persona Consistency", report.companionHealth.inCharacterConsistency ?? "No samples", "Heuristic marker score"],
    ["LLM Latency", report.companionHealth.llmLatencyMs ? `${report.companionHealth.llmLatencyMs}ms` : "No samples", "LLM stage average"],
    ["Tool Reliability", `${Math.round((1 - (report.companionHealth.toolCallFailureRate || 0)) * 100)}%`, "Tool-call success ratio"],
    ["Refusals", report.companionHealth.refusalRate, "Observed refusal ratio"],
    ["Repetition", report.companionHealth.repeatedPhrases, "Repeated phrase markers"],
    ["Hallucination Risk", report.companionHealth.hallucinationRiskMarkers, "Needs-review risk flags"],
    ["Tone Drift", report.companionHealth.toneDrift, "Tone drift markers"],
    ["Repair Quality", report.companionHealth.repairBehaviorQuality, "Future evaluator hook"],
  ].map(([title, value, note]) => metricCard(title, value, note, helpers)).join("");

  const flow = report.contextFlow.requiredStages.map((stage, index) => `<li><span>${index + 1}</span>${escapeHtml(stage.replace(/_/g, " "))}</li>`).join("");
  const tracesJson = escapeHtml(JSON.stringify(report.contextFlow.recentTraces));

  return `
<style>
.gl-ai-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.gl-ai-metric{display:block;font-size:1.85rem;color:#7dd3fc}.gl-ai-tabs{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}.gl-ai-tabs a{border:1px solid rgba(125,211,252,.3);border-radius:999px;padding:.45rem .7rem;color:#dff6ff;text-decoration:none}.gl-ai-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.6rem;counter-reset:flow}.gl-ai-flow li{list-style:none;border:1px solid rgba(125,211,252,.28);background:rgba(15,23,42,.55);border-radius:1rem;padding:.75rem}.gl-ai-flow span{display:inline-grid;place-items:center;width:1.5rem;height:1.5rem;margin-right:.4rem;border-radius:999px;background:#2563eb}.gl-ai-trace-list button{width:100%;text-align:left;margin:.3rem 0}.gl-ai-json{max-height:360px;overflow:auto;white-space:pre-wrap}.gl-ai-warning{border:1px solid rgba(251,191,36,.35);background:rgba(120,53,15,.22);border-radius:1rem;padding:1rem}@media(max-width:720px){.gl-ai-tabs{overflow-x:auto;flex-wrap:nowrap}.gl-ai-grid{grid-template-columns:1fr}}
</style>
<section class="page-header">
  <p class="eyebrow">Developer / Engineering / AI Diagnostics</p>
  <h1 class="page-title">Ghostlight AI Diagnostics</h1>
  <p class="page-description">Owner-only, read-only diagnostics for memory retrieval, prompt assembly, companion consistency, tool usage, context flow, latency, cost, fallbacks, and hallucination/error risk.</p>
  <p><a class="button secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/engineering/ai/report.json", theme }))}">Download AI diagnostics JSON</a></p>
  <form method="post" action="${escapeHtml(buildAdminLocation({ path: "/admin/engineering/ai/clear", theme }))}" onsubmit="return confirm('Clear stored AI diagnostics traces and risk records? Companion memory is untouched.')"><button class="button secondary" type="submit">Clear diagnostics</button></form>
</section>
<div class="gl-ai-warning"><strong>Privacy:</strong> diagnostics are stored separately from companion memory, secrets are masked, raw prompts are disabled by default, and all risk labels mean needs review unless verified.</div>
<nav class="gl-ai-tabs" aria-label="AI diagnostics sections">${tabs.map((tab) => `<a href="#${escapeHtml(tab.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${escapeHtml(tab)}</a>`).join("")}</nav>
<section id="overview"><h2>Overview</h2><div class="gl-ai-grid">${cards}</div></section>
<section id="memory-health"><h2>Memory Health</h2><div class="gl-ai-grid">${memoryCards}</div><pre class="gl-ai-json">${escapeHtml(JSON.stringify({ byType: report.memoryHealth.memoryCountByLayerType, warnings: report.memoryHealth.warnings }, null, 2))}</pre></section>
<section id="prompt-health"><h2>Prompt Health</h2><div class="gl-ai-grid">${promptCards}</div><h3>Prompt diff</h3><pre class="gl-ai-json">${escapeHtml(JSON.stringify(report.promptHealth.promptDiff, null, 2))}</pre></section>
<section id="companion-health"><h2>Companion Health</h2><div class="gl-ai-grid">${companionCards}</div></section>
<section id="hallucination-error-risks"><h2>Hallucination/Error Risks</h2><p>${report.hallucinationErrorRisks.length} risk item(s). These are review signals, not proof.</p><pre class="gl-ai-json">${escapeHtml(JSON.stringify(report.hallucinationErrorRisks.slice(0, 25), null, 2))}</pre></section>
<section id="context-flow"><h2>Context Flow</h2><ol class="gl-ai-flow">${flow}</ol></section>
<section id="latency-and-cost"><h2>Latency and Cost</h2><pre class="gl-ai-json">${escapeHtml(JSON.stringify({ slowest: report.contextFlow.slowestTraces.slice(0, 5), mostExpensive: report.contextFlow.mostExpensiveTraces.slice(0, 5) }, null, 2))}</pre></section>
<section id="recent-traces"><h2>Recent Traces</h2><div class="gl-ai-controls"><input id="traceSearch" placeholder="Search by trace/message/user/companion/channel" aria-label="Search traces"></div><div id="traceList" class="gl-ai-trace-list" data-traces="${tracesJson}"></div><pre id="traceDetail" class="gl-ai-json"></pre></section>
<script>
(function(){const list=document.getElementById('traceList'); if(!list) return; const traces=JSON.parse(list.dataset.traces||'[]'); const input=document.getElementById('traceSearch'); const detail=document.getElementById('traceDetail'); function draw(){const q=(input.value||'').toLowerCase(); list.innerHTML=''; traces.filter(t=>!q||JSON.stringify(t).toLowerCase().includes(q)).slice(0,50).forEach(t=>{const b=document.createElement('button'); b.type='button'; b.className='button secondary'; b.textContent=(t.traceId||'trace')+' · '+(t.channel||'unknown')+' · '+(t.status||'open'); b.onclick=()=>{detail.textContent=JSON.stringify(t,null,2)}; list.appendChild(b);}); if(!traces.length) list.textContent='No traces stored yet.';} input.addEventListener('input',draw); draw();})();
</script>`;
}

module.exports = { renderAiDiagnosticsPage };
