"use strict";

function fmtDate(val) {
  if (!val) return "—";
  try { return new Date(val).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }); } catch { return String(val); }
}

function esc(v) {
  return String(typeof v === "string" ? v : JSON.stringify(v)).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function statusBadge(on) {
  return on
    ? `<span style="color:#2ecc71;font-weight:bold">● enabled</span>`
    : `<span style="color:#e74c3c;font-weight:bold">● disabled</span>`;
}

function renderCard(items) {
  return [
    `<div class="home-setup-list" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">`,
    ...items.map((item) => [
      `<div class="home-setup-item">`,
      `<span class="home-setup-label">${esc(item.label)}</span>`,
      `<span class="home-setup-value">${item.rawValue || esc(String(item.value ?? "—"))}</span>`,
      `</div>`,
    ].join("")),
    `</div>`,
  ].join("");
}

function renderSituationalAwarenessPage({ data, config, helpers, theme }) {
  const parts = [];

  parts.push(`<h1>Situational Awareness</h1>`);
  parts.push(`<p style="color:var(--text-muted,#aaa)">Engine status, enabled sections, and snapshot history.</p>`);

  // Status card
  parts.push(`<section class="admin-card"><h2>Engine Status</h2>`);
  parts.push(renderCard([
    { label: "Engine", rawValue: statusBadge(data.enabled) },
    { label: "Snapshot Storage", rawValue: statusBadge(data.storeSnapshots && data.persistenceEnabled) },
    { label: "Max Bullets", value: data.maxBullets },
    { label: "User Scope", value: data.userScope },
    { label: "Companion ID", value: data.companionId || "—" },
  ]));
  parts.push(`</section>`);

  // Enabled sections
  parts.push(`<section class="admin-card"><h2>Enabled Sections</h2>`);
  const sectionItems = Object.entries(data.sections).map(([name, enabled]) => ({
    label: name,
    rawValue: enabled
      ? `<span style="color:#2ecc71">✓ on</span>`
      : `<span style="color:#888">✗ off</span>`,
  }));
  parts.push(renderCard(sectionItems));
  parts.push(`</section>`);

  // Warnings
  if (data.warnings && data.warnings.length) {
    parts.push(`<section class="admin-card" style="border-left:3px solid #e67e22"><h2>⚠ Warnings</h2><ul>`);
    for (const w of data.warnings) {
      parts.push(`<li>${esc(w)}</li>`);
    }
    parts.push(`</ul></section>`);
  }

  // Latest snapshot
  if (data.latestSnapshot) {
    const s = data.latestSnapshot;
    parts.push(`<section class="admin-card"><h2>Last Snapshot</h2>`);
    parts.push(renderCard([
      { label: "Generated At", value: fmtDate(s.created_at) },
      { label: "Trigger", value: s.trigger_type || "—" },
      { label: "Sections Used", value: Array.isArray(s.sections_used) ? s.sections_used.join(", ") || "—" : "—" },
      { label: "Prelude Length", value: `${s.prelude_length || 0} chars` },
      { label: "Warnings", value: s.warnings_count || 0 },
      { label: "Channel", value: s.channel_id || "—" },
    ]));
    parts.push(`</section>`);
  } else {
    parts.push(`<section class="admin-card"><h2>Last Snapshot</h2><p style="color:var(--text-muted,#aaa)">No snapshots stored yet.${!data.storeSnapshots ? " Snapshot storage is disabled (SITUATIONAL_AWARENESS_STORE_SNAPSHOTS=false)." : ""}</p></section>`);
  }

  // Recent snapshots table
  if (data.recentSnapshots && data.recentSnapshots.length > 0) {
    parts.push(`<section class="admin-card"><h2>Recent Snapshots (last ${data.recentSnapshots.length})</h2>`);
    parts.push(`<table style="width:100%;border-collapse:collapse;font-size:.85em">`);
    parts.push(`<thead><tr>`);
    for (const h of ["#", "Time", "Trigger", "Sections", "Prelude Len", "Warnings"]) {
      parts.push(`<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #333">${esc(h)}</th>`);
    }
    parts.push(`</tr></thead><tbody>`);
    for (const s of data.recentSnapshots) {
      parts.push(`<tr>`);
      parts.push(`<td style="padding:4px 8px">${esc(String(s.id))}</td>`);
      parts.push(`<td style="padding:4px 8px">${esc(fmtDate(s.created_at))}</td>`);
      parts.push(`<td style="padding:4px 8px">${esc(s.trigger_type || "—")}</td>`);
      const sections = Array.isArray(s.sections_used) ? s.sections_used.join(", ") || "—" : "—";
      parts.push(`<td style="padding:4px 8px;max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(sections)}</td>`);
      parts.push(`<td style="padding:4px 8px">${esc(String(s.prelude_length || 0))}</td>`);
      parts.push(`<td style="padding:4px 8px">${esc(String(s.warnings_count || 0))}</td>`);
      parts.push(`</tr>`);
    }
    parts.push(`</tbody></table></section>`);
  }

  // Config reference
  parts.push(`<section class="admin-card"><h2>Configuration</h2>`);
  parts.push(`<p style="color:var(--text-muted,#aaa);font-size:.85em">Set via environment variables.</p>`);
  parts.push(`<table style="width:100%;border-collapse:collapse;font-size:.85em">`);
  parts.push(`<thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #333">Variable</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #333">Effect</th></tr></thead><tbody>`);
  const envVars = [
    ["SITUATIONAL_AWARENESS_ENABLED", "Enable/disable the engine (default: true)"],
    ["SITUATIONAL_AWARENESS_STORE_SNAPSHOTS", "Store snapshots to DB (default: false)"],
    ["SITUATIONAL_AWARENESS_MAX_BULLETS", "Max bullets in compact prelude (default: 8)"],
    ["SITUATIONAL_AWARENESS_INCLUDE_TIME", "Include time section"],
    ["SITUATIONAL_AWARENESS_INCLUDE_MEMORY", "Include memory section"],
    ["SITUATIONAL_AWARENESS_INCLUDE_PROJECTS", "Include projects/promises section"],
    ["SITUATIONAL_AWARENESS_INCLUDE_TOOLS", "Include tool availability section"],
    ["SITUATIONAL_AWARENESS_INCLUDE_WORLD", "Include world context section (default: false)"],
  ];
  for (const [name, desc] of envVars) {
    parts.push(`<tr><td style="padding:4px 8px"><code>${esc(name)}</code></td><td style="padding:4px 8px;color:var(--text-muted,#aaa)">${esc(desc)}</td></tr>`);
  }
  parts.push(`</tbody></table></section>`);

  return parts.join("\n");
}

module.exports = { renderSituationalAwarenessPage };
