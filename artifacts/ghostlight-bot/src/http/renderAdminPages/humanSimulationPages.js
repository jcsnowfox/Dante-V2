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
  { id: "weather", label: "Inner Weather" },
  { id: "residue", label: "Attention Residue" },
  { id: "presence", label: "Presence" },
  { id: "boundaries", label: "Boundaries / Consent" },
  { id: "donotask", label: "Don't Ask Again" },
  { id: "energy", label: "User Energy" },
];

function renderTabNav(activeTab, helpers) {
  const { buildAdminLocation } = helpers;
  return TABS.map((t) =>
    `<a href="${buildAdminLocation("/admin/human-simulation")}?tab=${t.id}" class="subnav-link${activeTab === t.id ? " subnav-link-active" : ""}">${escHtml(t.label)}</a>`
  ).join(" ");
}

function renderPreferencesTab({ prefs, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
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
  const esc = helpers?.escapeHtml || escHtml;
  if (!events?.length) return "<p>No timeline events yet.</p>";
  const rows = events.map((e) => `<tr>
    <td>${fmtDate(e.event_time)}</td>
    <td>${esc(e.event_type)}</td>
    <td>${esc(e.title)}</td>
    <td>${esc(e.summary?.slice(0, 100))}</td>
    <td>${esc(e.importance)}</td>
    <td>${e.emotional_weight}</td>
    <td>${e.pinned ? "&#128204;" : ""}</td>
    <td>${e.adult_context ? "private" : "normal"}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Summary</th><th>Importance</th><th>Weight</th><th>Pin</th><th>Scope</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderFollowUpsTab({ followUps, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
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
  const esc = helpers?.escapeHtml || escHtml;
  if (!channels?.length) return "<p>No channel awareness records yet.</p>";
  const rows = channels.map((c) => `<tr>
    <td>${esc(c.channel_name || c.channel_id)}</td>
    <td>${esc(c.channel_kind)}</td>
    <td>${esc(c.purpose_summary?.slice(0, 80))}</td>
    <td>${esc(c.tone_default)}</td>
    <td>${c.adult_allowed ? "&#10003;" : ""}</td>
    <td>${c.project_allowed ? "&#10003;" : ""}</td>
    <td>${c.norwegian_allowed ? "&#10003;" : ""}</td>
    <td>${c.proactive_allowed ? "&#10003;" : ""}</td>
    <td>${fmtDate(c.last_seen_at)}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Channel</th><th>Kind</th><th>Purpose</th><th>Tone</th><th>Adult</th><th>Project</th><th>Norwegian</th><th>Proactive</th><th>Last Seen</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderWeatherTab({ weatherHistory, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
  if (!weatherHistory?.length) return "<p>No inner weather history yet.</p>";
  const current = weatherHistory[0];
  const currentBlock = current ? `<div style="background:var(--bg-card,#1a1a2e);padding:1rem;border-radius:6px;margin-bottom:1.5rem">
    <strong>Current state:</strong> ${esc(current.dominant_emotion)}${current.secondary_emotion ? ` / ${esc(current.secondary_emotion)}` : ""}
    &nbsp;|&nbsp; Intensity: ${esc(current.intensity)}
    &nbsp;|&nbsp; Tension: ${current.tension} &nbsp;|&nbsp; Softness: ${current.softness}
    &nbsp;|&nbsp; Protectiveness: ${current.protectiveness}
    <br><small>${esc(current.reason_summary)} &mdash; expires ${fmtDate(current.expires_at)}</small>
  </div>` : "";
  const rows = weatherHistory.map((w) => `<tr>
    <td>${fmtDate(w.created_at)}</td>
    <td>${esc(w.dominant_emotion)}</td>
    <td>${esc(w.secondary_emotion || "—")}</td>
    <td>${esc(w.intensity)}</td>
    <td>${w.tension}</td>
    <td>${w.softness}</td>
    <td>${w.protectiveness}</td>
    <td>${esc(w.reason_summary?.slice(0, 60))}</td>
    <td>${w.adult_context ? "private" : "normal"}</td>
    <td>${w.active ? "active" : "expired"}</td>
  </tr>`).join("");
  return currentBlock + `<table class="admin-table"><thead><tr><th>Created</th><th>Dominant</th><th>Secondary</th><th>Intensity</th><th>Tension</th><th>Softness</th><th>Protect</th><th>Reason</th><th>Scope</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderResidueTab({ residues, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
  if (!residues?.length) return "<p>No attention residue records yet.</p>";
  const rows = residues.map((r) => `<tr>
    <td>${fmtDate(r.created_at)}</td>
    <td>${esc(r.residue_type)}</td>
    <td>${esc(r.summary)}</td>
    <td>${esc(r.intensity)}</td>
    <td>${r.decay_rate}h</td>
    <td>${fmtDate(r.expires_at)}</td>
    <td>${r.adult_context ? "private" : "normal"}</td>
    <td>${r.active ? "active" : "expired"}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Created</th><th>Type</th><th>Summary</th><th>Intensity</th><th>Decay</th><th>Expires</th><th>Scope</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPresenceTab({ presenceList, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
  if (!presenceList?.length) return "<p>No presence records yet.</p>";
  const rows = presenceList.map((p) => `<tr>
    <td>${esc(p.channel_id)}</td>
    <td>${esc(p.silence_bucket)}</td>
    <td>${esc(p.reentry_mode)}</td>
    <td>${fmtDate(p.last_user_message_at)}</td>
    <td>${fmtDate(p.last_companion_reply_at)}</td>
    <td>${esc(p.last_interaction_summary?.slice(0, 80))}</td>
    <td>${fmtDate(p.updated_at)}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Channel</th><th>Silence Bucket</th><th>Re-entry Mode</th><th>Last User Msg</th><th>Last Reply</th><th>Last Summary</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderBoundariesTab({ boundaries, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
  if (!boundaries?.length) return "<p>No boundary or consent records saved yet.</p>";
  const rows = boundaries.map((b) => `<tr>
    <td>${esc(b.boundary_type)}</td>
    <td>${esc(b.boundary_summary)}</td>
    <td>${b.allowed ? "<span style='color:green'>allowed</span>" : "<span style='color:red'>not allowed</span>"}</td>
    <td>${esc(b.consent_scope)}</td>
    <td>${esc(b.intensity_level)}</td>
    <td>${(b.confidence * 100).toFixed(0)}%</td>
    <td>${b.adult_context ? "private" : "normal"}</td>
    <td>${b.active ? "active" : "inactive"}</td>
    <td>${fmtDate(b.last_confirmed_at)}</td>
    <td>${fmtDate(b.updated_at)}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Type</th><th>Summary</th><th>Status</th><th>Scope</th><th>Intensity</th><th>Confidence</th><th>Privacy</th><th>Active</th><th>Confirmed</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderDoNotAskTab({ doNotAskRules, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
  if (!doNotAskRules?.length) return "<p>No don't-ask-again rules saved yet.</p>";
  const rows = doNotAskRules.map((r) => `<tr>
    <td>${esc(r.rule_type)}</td>
    <td>${esc(r.rule_summary)}</td>
    <td>${r.exact_phrase ? esc(r.exact_phrase) : "—"}</td>
    <td>${esc(r.scope)}</td>
    <td>${r.adult_context ? "private" : "normal"}</td>
    <td>${r.active ? "active" : "inactive"}</td>
    <td>${r.expiry_at ? fmtDate(r.expiry_at) : "never"}</td>
    <td>${fmtDate(r.updated_at)}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Type</th><th>Summary</th><th>Exact Phrase</th><th>Scope</th><th>Privacy</th><th>Active</th><th>Expires</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderEnergyTab({ energyObservations, helpers }) {
  const esc = helpers?.escapeHtml || escHtml;
  if (!energyObservations?.length) return "<p>No user energy observations yet.</p>";
  const latest = energyObservations[0];
  const latestBlock = latest ? `<div style="background:var(--bg-card,#1a1a2e);padding:1rem;border-radius:6px;margin-bottom:1.5rem">
    <strong>Latest state:</strong> ${esc(latest.energy_state)} &nbsp;|&nbsp; Confidence: ${(latest.confidence * 100).toFixed(0)}%
    <br><small>${esc(latest.evidence_summary)} &mdash; ${fmtDate(latest.created_at)}</small>
  </div>` : "";
  const rows = energyObservations.map((o) => `<tr>
    <td>${fmtDate(o.created_at)}</td>
    <td>${esc(o.energy_state)}</td>
    <td>${(o.confidence * 100).toFixed(0)}%</td>
    <td>${esc(o.evidence_summary?.slice(0, 80))}</td>
    <td>${o.adult_context ? "private" : "normal"}</td>
  </tr>`).join("");
  return latestBlock + `<table class="admin-table"><thead><tr><th>Created</th><th>Energy State</th><th>Confidence</th><th>Evidence</th><th>Scope</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderHumanSimulationPage({ tab, prefs, events, followUps, channels, weatherHistory, residues, presenceList, boundaries, doNotAskRules, energyObservations, helpers, theme, themeLinks }) {
  const { renderAdminShell } = helpers;
  const activeTab = tab || "preferences";
  const tabNav = renderTabNav(activeTab, helpers);

  let tabContent = "";
  if (activeTab === "preferences") tabContent = renderPreferencesTab({ prefs, helpers });
  else if (activeTab === "timeline") tabContent = renderTimelineTab({ events, helpers });
  else if (activeTab === "followups") tabContent = renderFollowUpsTab({ followUps, helpers });
  else if (activeTab === "channels") tabContent = renderChannelsTab({ channels, helpers });
  else if (activeTab === "weather") tabContent = renderWeatherTab({ weatherHistory: weatherHistory || [], helpers });
  else if (activeTab === "residue") tabContent = renderResidueTab({ residues: residues || [], helpers });
  else if (activeTab === "presence") tabContent = renderPresenceTab({ presenceList: presenceList || [], helpers });
  else if (activeTab === "boundaries") tabContent = renderBoundariesTab({ boundaries: boundaries || [], helpers });
  else if (activeTab === "donotask") tabContent = renderDoNotAskTab({ doNotAskRules: doNotAskRules || [], helpers });
  else if (activeTab === "energy") tabContent = renderEnergyTab({ energyObservations: energyObservations || [], helpers });

  const pageBody = [
    renderPageIntro({ title: "Human Simulation", subtitle: "Micro-preferences, personal timeline, follow-up scheduler, channel awareness, inner weather, attention residue, presence, boundaries/consent, don't-ask-again rules, and user energy.", helpers }),
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
