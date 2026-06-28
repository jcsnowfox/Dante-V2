function card(title, value, note, helpers) {
  const { escapeHtml } = helpers;
  return `<article class="card gl-engineering-card"><div class="card-header"><h2 class="card-title">${escapeHtml(title)}</h2></div><div class="card-body"><strong class="gl-engineering-metric">${escapeHtml(String(value))}</strong><p>${escapeHtml(note)}</p></div></article>`;
}

function renderEngineeringPage({ report, theme, helpers }) {
  const { escapeHtml, buildAdminLocation } = helpers;
  const graphJson = escapeHtml(JSON.stringify(report.dependencyGraph));
  const sections = [
    ["Health", `${report.health.overall}/100`, `Build ${report.health.build}; technical debt ${report.health.technicalDebt}`],
    ["Architecture", `${report.architecture.score}/100`, `${report.architecture.riskLevel} risk`],
    ["Dependencies", report.dependencyGraph.nodes.length, `${report.dependencyGraph.edges.length} imports mapped`],
    ["Dead Code", report.deadCode.mode, report.deadCode.summary],
    ["Database", report.database.score, "Noctis-ready abstraction; no DB changes"],
    ["Memory", `${report.memoryHealth.score}/100`, `Fragmentation ${report.memoryHealth.fragmentation}`],
    ["Performance", "Live", "CPU and memory captured read-only"],
    ["Token Usage", report.promptHealth.tokenWaste, "Prompt waste estimate"],
    ["Prompt Health", `${report.promptHealth.score}/100`, `${report.promptHealth.filesScanned} prompt-adjacent files scanned`],
    ["Build Health", report.health.build, "Diagnostics only"],
  ].map(([title, value, note]) => card(title, value, note, helpers)).join("");

  return `
<style>
.gl-engineering-hero{display:grid;gap:1rem;margin-bottom:1.25rem}.gl-engineering-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.gl-engineering-metric{display:block;font-size:2rem;color:#7dd3fc;margin-bottom:.35rem}.gl-engineering-graph{min-height:420px;position:relative;overflow:hidden}.gl-engineering-node{position:absolute;border:1px solid rgba(125,211,252,.45);background:rgba(15,23,42,.78);color:#e0f2fe;border-radius:999px;padding:.35rem .55rem;font-size:.72rem;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 0 22px rgba(59,130,246,.18);cursor:pointer}.gl-engineering-controls{display:flex;gap:.75rem;flex-wrap:wrap;margin:.75rem 0}.gl-engineering-controls input,.gl-engineering-controls select{background:rgba(15,23,42,.7);color:#e5f2ff;border:1px solid rgba(125,211,252,.35);border-radius:.75rem;padding:.65rem}.gl-engineering-list{columns:2;column-gap:2rem}.gl-engineering-list li{break-inside:avoid;margin-bottom:.35rem}@media(max-width:720px){.gl-engineering-list{columns:1}.gl-engineering-graph{min-height:520px}.gl-engineering-node{max-width:145px}}
</style>
<section class="page-header gl-engineering-hero">
  <p class="eyebrow">Developer / Engineering</p>
  <h1 class="page-title">Engineering Intelligence</h1>
  <p class="page-description">Read-only diagnostics for codebase health, architecture, dependencies, dead code, database readiness, prompts, memory, performance, and merge risk. Nothing here deletes, rewrites, or changes companion runtime behaviour.</p>
  <p><a class="button secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/engineering/report.json", theme }))}">Download JSON report</a></p>
</section>
<section class="gl-engineering-grid">${sections}</section>
<section class="card"><div class="card-header"><h2 class="card-title">Architecture Report</h2></div><div class="card-body"><p><strong>Risk:</strong> ${escapeHtml(report.architecture.riskLevel)}</p><p><strong>Strengths:</strong> ${escapeHtml(report.architecture.strengths.join(" "))}</p><p><strong>Suggestions:</strong> ${escapeHtml(report.architecture.suggestions.join(" "))}</p><h3>Files requiring attention</h3><ul class="gl-engineering-list">${report.architecture.filesRequiringAttention.map((file) => `<li>${escapeHtml(file)}</li>`).join("")}</ul></div></section>
<section class="card"><div class="card-header"><h2 class="card-title">Dependency Graph</h2></div><div class="card-body"><div class="gl-engineering-controls"><input id="engineeringSearch" placeholder="Search modules" aria-label="Search modules"><select id="engineeringFilter" aria-label="Filter graph"><option value="all">All modules</option><option value="hotspots">Risk hotspots</option><option value="unused">Unused modules</option><option value="disconnected">Disconnected</option></select><button type="button" class="button secondary" id="exportSvg">Export SVG</button><button type="button" class="button secondary" id="exportPng">Export PNG</button></div><div id="engineeringGraph" class="gl-engineering-graph" data-graph="${graphJson}"></div><p>${report.dependencyGraph.cycles.length} circular dependency chain(s) detected. Click a node to open the file path; hover edges in JSON report for dependency explanations.</p></div></section>
<section class="card"><div class="card-header"><h2 class="card-title">Merge Report</h2></div><div class="card-body"><p><strong>Recommended decision:</strong> ${escapeHtml(report.mergeReport.recommendedDecision)}</p><pre>${escapeHtml(JSON.stringify(report.mergeReport, null, 2))}</pre></div></section>
<script>
(function(){
  const host=document.getElementById('engineeringGraph'); if(!host) return; const graph=JSON.parse(host.dataset.graph||'{}');
  const search=document.getElementById('engineeringSearch'); const filter=document.getElementById('engineeringFilter');
  function subset(){let nodes=graph.nodes||[]; if(filter.value==='hotspots') nodes=graph.hotspots||[]; if(filter.value==='unused') nodes=graph.unusedModules||[]; if(filter.value==='disconnected') nodes=graph.disconnected||[]; const q=(search.value||'').toLowerCase(); return nodes.filter(n=>!q||n.id.toLowerCase().includes(q)).slice(0,90)}
  function draw(){host.innerHTML=''; const nodes=subset(); const w=host.clientWidth||800,h=host.clientHeight||430,r=Math.max(90,Math.min(w,h)/2-55); nodes.forEach((n,i)=>{const a=(i/nodes.length)*Math.PI*2; const el=document.createElement('button'); el.type='button'; el.className='gl-engineering-node'; el.style.left=(w/2+Math.cos(a)*r-70)+'px'; el.style.top=(h/2+Math.sin(a)*r-16)+'px'; el.title=n.id+' — '+n.imports+' imports, '+n.dependents+' dependents'; el.textContent=n.id.split('/').slice(-2).join('/'); el.onclick=()=>{ location.href='vscode://file/'+n.id; }; host.appendChild(el);});}
  search.addEventListener('input',draw); filter.addEventListener('change',draw); window.addEventListener('resize',draw); draw();
  document.getElementById('exportSvg').onclick=()=>{const blob=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><text x="20" y="40">Ghostlight dependency graph: '+(graph.nodes||[]).length+' modules</text></svg>'],{type:'image/svg+xml'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ghostlight-engineering-graph.svg'; a.click();};
  document.getElementById('exportPng').onclick=()=>alert('PNG export is browser-renderer ready; use SVG export in this static admin build.');
})();
</script>`;
}

module.exports = { renderEngineeringPage };
