"use strict";

const { renderPageIntro, renderSubnav } = require("./shared");

const TABS = [
  { key: "overview", label: "Overview", path: "/admin/continuity/overview" },
  { key: "inner-weather", label: "Inner Weather", path: "/admin/continuity/inner-weather" },
  { key: "continuity", label: "Continuity", path: "/admin/continuity/continuity" },
  { key: "recent-decisions", label: "Recent Decisions", path: "/admin/continuity/recent-decisions" },
  { key: "unsent-thoughts", label: "Unsent Thoughts", path: "/admin/continuity/unsent-thoughts" },
  { key: "follow-ups", label: "Follow-Ups", path: "/admin/continuity/follow-ups" },
  { key: "state-of-us", label: "State of Us", path: "/admin/continuity/state-of-us" },
  { key: "diagnostics", label: "Diagnostics", path: "/admin/continuity/diagnostics" },
];

const DECISION_TYPE_LABELS = {
  reply_tone_selected: "Tone Selected",
  memory_saved: "Memory Saved",
  memory_retrieved: "Memory Retrieved",
  follow_up_created: "Follow-Up Created",
  curiosity_created: "Curiosity Created",
  private_redirect: "Private Redirect",
  web_search_used: "Web Search",
  norwegian_session_routed: "Norwegian Routed",
  fallback_used: "Fallback Used",
  repair_mode_triggered: "Repair Triggered",
  proactive_rule_blocked: "Proactive Blocked",
  other: "Other",
};

const INNER_LIFE_TYPE_LABELS = {
  unsent_thought: "Unsent Thought",
  almost_said: "Almost Said",
  curiosity_seed: "Curiosity",
  affection_residue: "Affection",
  mood_carryover: "Mood",
  private_thought: "Private Thought",
  between_message_note: "Between Messages",
  journal_entry: "Journal",
  dream: "Dream",
  micro_repair: "Micro Repair",
  little_ritual: "Little Ritual",
  habit_marker: "Habit",
  taste_marker: "Taste",
  private_lexicon: "Lexicon",
  repeated_tell: "Repeated Tell",
  room_sense: "Room Sense",
};

const CONTINUITY_TYPE_LABELS = {
  open_loop: "Open Loop",
  future_event: "Future Event",
  follow_up: "Follow-up",
  promise: "Promise",
  decision: "Decision",
  repair_thread: "Repair Thread",
  boundary: "Boundary",
  ritual: "Ritual",
  attention_residue: "Attention",
  emotional_residue: "Emotion",
  trust_event: "Trust",
  other: "Other",
};

function fmtDate(val) {
  if (!val) return "—";
  try { return new Date(val).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }); } catch { return String(val); }
}

function renderCard(items) {
  return [
    "<div class=\"home-setup-list\" style=\"grid-template-columns:repeat(auto-fit,minmax(200px,1fr))\">",
    ...items.map((item) => [
      "<div class=\"home-setup-item\">",
      `<span class="home-setup-label">${item.label}</span>`,
      `<span class="home-setup-value">${item.value}</span>`,
      "</div>",
    ].join("")),
    "</div>",
  ].join("");
}

function renderTable({ headers, rows, emptyMsg = "No records." }) {
  if (!rows || rows.length === 0) {
    return `<p class="notice" style="margin-top:1rem">${emptyMsg}</p>`;
  }
  return [
    "<div style=\"overflow-x:auto\">",
    "<table class=\"data-table\" style=\"width:100%;font-size:0.875rem\">",
    "<thead><tr>",
    headers.map((h) => `<th>${h}</th>`).join(""),
    "</tr></thead>",
    "<tbody>",
    rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join(""),
    "</tbody>",
    "</table>",
    "</div>",
  ].join("");
}

function renderOverviewTab({ data, helpers }) {
  const { escapeHtml } = helpers;
  const {
    innerWeatherCurrent, recentDecisionsCount, followUpsOpen, continuityOpen,
    innerLifeActive, emotionalBeatsCount,
  } = data;

  const weatherMood = innerWeatherCurrent?.mood || "—";
  const weatherEnergy = innerWeatherCurrent?.energy_level != null ? String(innerWeatherCurrent.energy_level) : "—";

  return [
    renderPageIntro({ title: "Continuity & Inner Life", copy: "Live view of Dante's inner state, open loops, decision log, and follow-up queue." }),
    "<section class=\"lite-panel page-frame\">",
    renderCard([
      { label: "Inner Weather", value: escapeHtml(weatherMood) },
      { label: "Energy", value: escapeHtml(weatherEnergy) },
      { label: "Continuity Open", value: String(continuityOpen || 0) },
      { label: "Follow-Ups Open", value: String(followUpsOpen || 0) },
      { label: "Inner Life Active", value: String(innerLifeActive || 0) },
      { label: "Emotional Beats", value: String(emotionalBeatsCount || 0) },
      { label: "Decisions Logged", value: String(recentDecisionsCount || 0) },
    ]),
    "</section>",
  ].join("");
}

function renderInnerWeatherTab({ weatherHistory, helpers }) {
  const { escapeHtml } = helpers;
  const rows = (weatherHistory || []).map((w) => [
    escapeHtml(w.mood || "—"),
    String(w.energy_level != null ? w.energy_level : "—"),
    escapeHtml(w.weather_summary || "—"),
    fmtDate(w.recorded_at || w.created_at),
  ]);
  return [
    renderPageIntro({ title: "Inner Weather", copy: "Dante's mood and energy history, sampled at key conversation moments." }),
    "<section class=\"lite-panel page-frame\">",
    renderTable({ headers: ["Mood", "Energy", "Summary", "Recorded"], rows, emptyMsg: "No inner weather history recorded yet." }),
    "</section>",
  ].join("");
}

function renderContinuityTab({ items, promises, helpers }) {
  const { escapeHtml } = helpers;
  const allItems = [
    ...(items || []).map((i) => ({
      type: CONTINUITY_TYPE_LABELS[i.type] || i.type,
      summary: i.summary || i.title || "",
      status: i.status || "open",
      updated: i.updated_at || i.created_at,
    })),
    ...(promises || []).map((p) => ({
      type: "Promise",
      summary: p.promise_text_summary || p.promise_text || "",
      status: p.status || "open",
      updated: p.updated_at || p.created_at,
    })),
  ];
  const rows = allItems.map((item) => [
    escapeHtml(item.type),
    escapeHtml(String(item.summary).slice(0, 80) + (item.summary.length > 80 ? "…" : "")),
    `<span class="badge">${escapeHtml(item.status)}</span>`,
    fmtDate(item.updated),
  ]);
  return [
    renderPageIntro({ title: "Continuity", copy: "Open loops, promises, repair threads, and tracked events." }),
    "<section class=\"lite-panel page-frame\">",
    renderTable({ headers: ["Type", "Summary", "Status", "Updated"], rows, emptyMsg: "No continuity items found. Enable the Continuity Engine in Companion settings." }),
    "</section>",
  ].join("");
}

function renderRecentDecisionsTab({ decisions, helpers }) {
  const { escapeHtml } = helpers;
  const rows = (decisions || []).map((d) => [
    escapeHtml(DECISION_TYPE_LABELS[d.decision_type] || d.decision_type),
    escapeHtml(String(d.decision_summary || "").slice(0, 70)),
    escapeHtml(String(d.reason_summary || "").slice(0, 70)),
    `<span class="badge badge--${d.privacy_scope === "adult_private" ? "error" : "default"}">${escapeHtml(d.privacy_scope || "normal")}</span>`,
    fmtDate(d.created_at),
  ]);
  return [
    renderPageIntro({ title: "Recent Decisions", copy: "A log of runtime decisions made during conversations — tone, fallbacks, repairs, memory actions." }),
    "<section class=\"lite-panel page-frame\">",
    renderTable({ headers: ["Type", "Summary", "Reason", "Scope", "Time"], rows, emptyMsg: "No decisions logged yet. Decisions are recorded automatically during conversations." }),
    "</section>",
  ].join("");
}

function renderUnsentThoughtsTab({ entries, helpers }) {
  const { escapeHtml } = helpers;
  const UNSENT_TYPES = new Set(["unsent_thought", "almost_said", "curiosity_seed", "affection_residue", "mood_carryover", "private_thought"]);
  const filtered = (entries || []).filter((e) => UNSENT_TYPES.has(e.entry_type || e.type));
  const rows = filtered.map((e) => [
    escapeHtml(INNER_LIFE_TYPE_LABELS[e.entry_type || e.type] || e.entry_type || e.type),
    escapeHtml(String(e.title || e.summary || "").slice(0, 90)),
    `<span class="badge">${escapeHtml(e.status || "active")}</span>`,
    fmtDate(e.created_at),
  ]);
  return [
    renderPageIntro({ title: "Unsent Thoughts", copy: "Words Dante held back, seeds of curiosity, affection residue, and mood traces." }),
    "<section class=\"lite-panel page-frame\">",
    renderTable({ headers: ["Type", "Content", "Status", "Created"], rows, emptyMsg: "No unsent thoughts or inner life entries found." }),
    "</section>",
  ].join("");
}

function renderFollowUpsTab({ followUps, helpers }) {
  const { escapeHtml } = helpers;
  const rows = (followUps || []).map((f) => [
    escapeHtml(f.follow_up_type || "other"),
    escapeHtml(String(f.reason_summary || "").slice(0, 80)),
    `<span class="badge badge--${f.status === "open" ? "default" : "muted"}">${escapeHtml(f.status || "open")}</span>`,
    f.due_at ? fmtDate(f.due_at) : "—",
    fmtDate(f.created_at),
  ]);
  return [
    renderPageIntro({ title: "Follow-Ups", copy: "Pending follow-up items waiting to be surfaced at the right moment." }),
    "<section class=\"lite-panel page-frame\">",
    renderTable({ headers: ["Type", "Reason", "Status", "Due", "Created"], rows, emptyMsg: "No follow-up items found." }),
    "</section>",
  ].join("");
}

function renderStateOfUsTab({ emotionalBeats, helpers }) {
  const { escapeHtml } = helpers;
  const rows = (emotionalBeats || [])
    .filter((b) => !b.adult_context)
    .slice(0, 50)
    .map((b) => [
      escapeHtml(b.event_type || "—"),
      escapeHtml(String(b.title || b.summary || "").slice(0, 80)),
      escapeHtml(b.importance || "medium"),
      b.resolved ? "✓" : "open",
      fmtDate(b.updated_at || b.created_at),
    ]);
  return [
    renderPageIntro({ title: "State of Us", copy: "Emotional beats, relational events, and the ongoing story of this relationship." }),
    "<section class=\"lite-panel page-frame\">",
    renderTable({ headers: ["Event", "Summary", "Importance", "Resolved", "Updated"], rows, emptyMsg: "No emotional beats recorded yet." }),
    "</section>",
  ].join("");
}

function renderDiagnosticsTab({ config, helpers }) {
  const { escapeHtml } = helpers;
  const innerLifeEnabled = config?.inner_life?.enabled ?? false;
  const continuityEnabled = config?.continuity?.enabled ?? false;

  return [
    renderPageIntro({ title: "Diagnostics", copy: "Runtime configuration for the Continuity and Inner Life engines." }),
    "<section class=\"lite-panel page-frame\">",
    "<h3>Engine Status</h3>",
    renderCard([
      { label: "Inner Life Engine", value: innerLifeEnabled ? "Enabled" : "Disabled" },
      { label: "Continuity Engine", value: continuityEnabled ? "Enabled" : "Disabled" },
      { label: "Decision Log", value: "Active" },
    ]),
    "</section>",
  ].join("");
}

function renderContinuityInnerLifePage({ tab, data, config, helpers, theme }) {
  const { buildAdminLocation, escapeHtml } = helpers;

  const currentTab = tab || "overview";
  const subnav = renderSubnav({
    items: TABS.map((t) => ({ key: t.key, label: t.label, path: t.path })),
    currentKey: currentTab,
    theme,
    helpers: { escapeHtml, buildAdminLocation },
  });

  let tabBody = "";
  switch (currentTab) {
    case "inner-weather":
      tabBody = renderInnerWeatherTab({ weatherHistory: data.weatherHistory || [], helpers });
      break;
    case "continuity":
      tabBody = renderContinuityTab({ items: data.continuityItems || [], promises: data.promises || [], helpers });
      break;
    case "recent-decisions":
      tabBody = renderRecentDecisionsTab({ decisions: data.decisions || [], helpers });
      break;
    case "unsent-thoughts":
      tabBody = renderUnsentThoughtsTab({ entries: data.innerLifeEntries || [], helpers });
      break;
    case "follow-ups":
      tabBody = renderFollowUpsTab({ followUps: data.followUps || [], helpers });
      break;
    case "state-of-us":
      tabBody = renderStateOfUsTab({ emotionalBeats: data.emotionalBeats || [], helpers });
      break;
    case "diagnostics":
      tabBody = renderDiagnosticsTab({ config, helpers });
      break;
    default:
      tabBody = renderOverviewTab({ data, helpers });
  }

  return subnav + tabBody;
}

module.exports = { renderContinuityInnerLifePage };
