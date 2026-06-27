"use strict";

function fmtDate(val) {
  if (!val) return "—";
  try { return new Date(val).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }); } catch { return String(val); }
}

function fmtMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  const n = Number(ms);
  if (n < 60000) return `${Math.round(n / 1000)}s`;
  if (n < 3600000) return `${Math.round(n / 60000)}m`;
  return `${(n / 3600000).toFixed(1)}h`;
}

function esc(v) {
  return String(typeof v === "string" ? v : JSON.stringify(v ?? "")).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function statusBadge(on, onLabel = "enabled", offLabel = "disabled") {
  return on
    ? `<span style="color:#2ecc71;font-weight:bold">● ${onLabel}</span>`
    : `<span style="color:#e74c3c;font-weight:bold">● ${offLabel}</span>`;
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

const EVENT_TYPE_COLORS = {
  intention_created: "#2ecc71",
  intention_completed: "#27ae60",
  reachout_sent: "#3498db",
  reachout_suppressed: "#888",
  repair_started: "#e67e22",
  repair_completed: "#f39c12",
  presence_update: "#9b59b6",
  pushback_triggered: "#e74c3c",
  error: "#c0392b",
};

function eventTypeBadge(type) {
  const color = EVENT_TYPE_COLORS[type] || "#aaa";
  return `<span style="color:${color};font-family:monospace;font-size:.85em">${esc(type || "—")}</span>`;
}

function statusColor(status) {
  return { pending: "#f39c12", completed: "#2ecc71", expired: "#888", cancelled: "#e74c3c" }[status] || "#aaa";
}

function renderAliveEventTable(events) {
  if (!events || !events.length) {
    return `<p style="color:var(--text-muted,#aaa);margin:0">No events recorded yet.</p>`;
  }
  return [
    `<div style="overflow-x:auto">`,
    `<table style="width:100%;border-collapse:collapse;font-size:.82em">`,
    `<thead><tr>`,
    ["#", "Time", "Event Type", "Reason", "Decision"].map((h) =>
      `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #333;white-space:nowrap">${esc(h)}</th>`
    ).join(""),
    `</tr></thead><tbody>`,
    events.map((ev) => [
      `<tr style="border-bottom:1px solid #222">`,
      `<td style="padding:4px 8px;color:#888">${esc(String(ev.id))}</td>`,
      `<td style="padding:4px 8px;white-space:nowrap">${esc(fmtDate(ev.createdAt))}</td>`,
      `<td style="padding:4px 8px">${eventTypeBadge(ev.eventType)}</td>`,
      `<td style="padding:4px 8px;color:#aaa;max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(ev.reason || "")}</td>`,
      `<td style="padding:4px 8px;max-width:320px;overflow:hidden;text-overflow:ellipsis">${esc(ev.decision || "")}</td>`,
      `</tr>`,
    ].join("")).join(""),
    `</tbody></table></div>`,
  ].join("");
}

function renderIntentionTable(intentions) {
  if (!intentions || !intentions.length) {
    return `<p style="color:var(--text-muted,#aaa);margin:0">No recent intentions.</p>`;
  }
  return [
    `<div style="overflow-x:auto">`,
    `<table style="width:100%;border-collapse:collapse;font-size:.82em">`,
    `<thead><tr>`,
    ["#", "Created", "Type", "Reason", "Status", "Expires", "Priority"].map((h) =>
      `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #333;white-space:nowrap">${esc(h)}</th>`
    ).join(""),
    `</tr></thead><tbody>`,
    intentions.map((int) => [
      `<tr style="border-bottom:1px solid #222">`,
      `<td style="padding:4px 8px;color:#888">${esc(String(int.id))}</td>`,
      `<td style="padding:4px 8px;white-space:nowrap">${esc(fmtDate(int.createdAt))}</td>`,
      `<td style="padding:4px 8px;font-family:monospace;font-size:.9em">${esc(int.intentionType || "—")}</td>`,
      `<td style="padding:4px 8px;color:#aaa;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(int.reason || "")}</td>`,
      `<td style="padding:4px 8px"><span style="color:${statusColor(int.status)};font-weight:bold">${esc(int.status || "—")}</span></td>`,
      `<td style="padding:4px 8px;white-space:nowrap">${esc(fmtDate(int.expiresAt))}</td>`,
      `<td style="padding:4px 8px">${esc(String(int.priority ?? 5))}</td>`,
      `</tr>`,
    ].join("")).join(""),
    `</tbody></table></div>`,
  ].join("");
}

function renderAlivePage({ data, helpers }) {
  const parts = [];

  parts.push(`<h1>Alive Layer</h1>`);
  parts.push(`<p style="color:var(--text-muted,#aaa)">Clockwork view: intention queue, reach-out decisions, and alive event audit log.</p>`);

  // Engine status
  const status = data.engineStatus || {};
  parts.push(`<section class="admin-card"><h2>Engine Status</h2>`);
  parts.push(renderCard([
    { label: "Engine", rawValue: statusBadge(status.enabled) },
    { label: "Running", rawValue: statusBadge(status.running, "running", "stopped") },
    { label: "Tick Interval", value: fmtMs(status.tickIntervalMs) },
    { label: "Absence Threshold", value: fmtMs(status.absenceThresholdMs) },
    { label: "Daily Cap", value: status.dailyCap ?? "—" },
    { label: "Cooldown", value: fmtMs(status.cooldownMs) },
    { label: "Last Assess", value: fmtDate(status.lastAssessAt) },
    { label: "Pending Intentions", value: data.pendingCount ?? 0 },
    { label: "Companion", value: data.companionId || "—" },
    { label: "Scope", value: data.customerId || "—" },
  ]));
  if (status.lastResult) {
    const r = status.lastResult;
    const resultColor = r.enqueued ? "#2ecc71" : "#888";
    parts.push(`<p style="margin:8px 0 0;font-size:.9em">Last decision: <span style="color:${resultColor}">${esc(r.enqueued ? "enqueued" : `skipped — ${r.reason || ""}`)}</span></p>`);
  }
  parts.push(`</section>`);

  // Pending intentions
  parts.push(`<section class="admin-card"><h2>Pending Intentions (${data.pendingIntentions?.length ?? 0})</h2>`);
  parts.push(renderIntentionTable(data.pendingIntentions));
  parts.push(`</section>`);

  // Recent intentions (all statuses)
  parts.push(`<section class="admin-card"><h2>Recent Intentions</h2>`);
  parts.push(renderIntentionTable(data.recentIntentions));
  parts.push(`</section>`);

  // Alive event audit log
  parts.push(`<section class="admin-card"><h2>Alive Event Log (last ${data.recentEvents?.length ?? 0})</h2>`);
  parts.push(renderAliveEventTable(data.recentEvents));
  parts.push(`</section>`);

  return parts.join("\n");
}

module.exports = { renderAlivePage };
