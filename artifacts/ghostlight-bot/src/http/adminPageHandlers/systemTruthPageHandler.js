"use strict";
const { getSystemTruthSnapshot } = require("../../systemTruth/snapshot");
function esc(v){return String(typeof v === "string" ? v : JSON.stringify(v, null, 2)).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
async function handleSystemTruthPageRequest({ innerRes, innerContext, helpers, theme, themeLinks }){
  const snapshot = getSystemTruthSnapshot({ appContext: innerContext });
  innerContext.logger?.info?.("[system-truth] dashboard rendered");
  const sections = Object.entries(snapshot).filter(([k])=>k!=="generatedAt").map(([name, data])=>`<section class="admin-card"><h2>${esc(name)}</h2><dl>${Object.entries(data).map(([k,v])=>`<dt>${esc(k)}</dt><dd><code>${esc(v)}</code></dd>`).join("")}</dl></section>`).join("");
  innerRes.end(helpers.renderAdminShell({ currentSection:"admin", theme, themeLinks, pageBody:`<h1>System Truth</h1><p>Generated: ${esc(snapshot.generatedAt)}</p>${sections}` }));
}
module.exports={ handleSystemTruthPageRequest };
