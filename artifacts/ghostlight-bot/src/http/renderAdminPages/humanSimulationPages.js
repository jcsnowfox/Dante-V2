"use strict";

const { renderPageIntro } = require("./shared");

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function escHtml(v) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const TABS = [
  { id: "preferences", label: "Micro-Preferences" },
  { id: "timeline", label: "Timeline" },
  { id: "followups", label: "Follow-Ups" },
  { id: "channels", label: "Channel Awareness" },
];

function renderTabNav(activeTab, helpers) {
  const { buildAdminLocation } = helpers;
  return TABS.map((t) =>
    `<a href="${buildAdminLocation("/admin/human-simulation")}?tab=${t.id}" class="subnav-link${activeTab === t.id ? " subnav-link-active" : ""}">${escHtml(t.label)}</a>`
  ).join(" ");
}

function renderPreferencesTab({ prefs, helpers }) {
  const { escapeHtml } = helpers;
  const esc = escapeHtml || escHtml;
  if (!prefs?.length) return "<p>No micro-preferences saved yet.</p>";
  const rows = prefs.map((p) => `<tr>
    <td>${esc(p.preference_type)}</td>
    <td>${esc(p.preference_value_summary)}</td>
    <td>${esc(p.source)}</td>
    <td>${(p.confidence * 100).toFixed(0)}%</td>
    <td>${p.evidence_count}</td>
    <td>${p.adult_context ? "private" : "normal"}</td>
    <td>${p.active ? "active" : "inactive"}</td>
    <td>${fmtDate(p.last_observed_at)}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Type</th><th>Summary</th><th>Source</th><th>Confidence</th><th>Evidence</th><th>Scope</th><th>Status</th><th>Last Seen</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTimelineTab({ events, helpers }) {
  const { escapeHtml } = helpers;
  const esc = escapeHtml || escHtml;
  if (!events?.length) return "<p>No timeline events yet.</p>";
  const rows = events.map((e) => `<tr>
    <td>${fmtDate(e.event_time)}</td>
    <td>${esc(e.event_type)}</td>
    <td>${esc(e.title)}</td>
    <td>${esc(e.summary?.slice(0, 100))}</td>
    <td>${esc(e.importance)}</td>
    <td>${e.emotional_weight}</td>
    <td>${e.pinned ? "📌" : ""}</td>
    <td>${e.adult_context ? "private" : "normal"}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Summary</th><th>Importance</th><th>Weight</th><th>Pin</th><th>Scope</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderFollowUpsTab({ followUps, helpers }) {
  const { escapeHtml } = helpers;
  const esc = escapeHtml || escHtml;
  if (!followUps?.length) return "<p>No follow-up items yet.</p>";
  const rows = followUps.map((f) => `<tr>
    <td>${esc(f.follow_up_type)}</td>
    <td>${esc(f.reason_summary)}</td>
    <td>${esc(f.status)}</td>
    <td>${esc(f.priority)}</td>
    <td>${fmtDate(f.due_at)}</td>
    <td>${f.adult_context ? "private" : "normal"}</td>
    <td>${fmtDate(f.created_at)}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Type</th><th>Reason</th><th>Status</th><th>Priority</th><th>Due</th><th>Scope</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderChannelsTab({ channels, helpers }) {
  const { escapeHtml } = helpers;
  const esc = escapeHtml || escHtml;
  if (!channels?.length) return "<p>No channel awareness records yet.</p>";
  const rows = channels.map((c) => `<tr>
    <td>${esc(c.channel_name || c.channel_id)}</td>
    <td>${esc(c.channel_kind)}</td>
    <td>${esc(c.purpose_summary?.slice(0, 80))}</td>
    <td>${esc(c.tone_default)}</td>
    <td>${c.adult_allowed ? "✓" : ""}</td>
    <td>${c.project_allowed ? "✓" : ""}</td>
    <td>${c.norwegian_allowed ? "✓" : ""}</td>
    <td>${c.proactive_allowed ? "✓" : ""}</td>
    <td>${fmtDate(c.last_seen_at)}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Channel</th><th>Kind</th><th>Purpose</th><th>Tone</th><th>Adult</th><th>Project</th><th>Norwegian</th><th>Proactive</th><th>Last Seen</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderHumanSimulationPage({ tab, prefs, events, followUps, channels, helpers, theme, themeLinks }) {
  const { renderAdminShell } = helpers;
  const activeTab = tab || "preferences";
  const tabNav = renderTabNav(activeTab, helpers);

  let tabContent = "";
  if (activeTab === "preferences") tabContent = renderPreferencesTab({ prefs, helpers });
  else if (activeTab === "timeline") tabContent = renderTimelineTab({ events, helpers });
  else if (activeTab === "followups") tabContent = renderFollowUpsTab({ followUps, helpers });
  else if (activeTab === "channels") tabContent = renderChannelsTab({ channels, helpers });

  const pageBody = [
    renderPageIntro({ title: "Human Simulation", subtitle: "Micro-preferences, personal timeline, follow-up scheduler, and channel awareness.", helpers }),
    `<nav class="subnav">${tabNav}</nav>`,
    `<section style="margin-top:1.5rem">${tabContent}</section>`,
  ].join("\n");

  return renderAdminShell({
    currentSection: "human-simulation",
    theme,
    themeLinks,
    pageBody,
  });
}

module.exports = { renderHumanSimulationPage };
