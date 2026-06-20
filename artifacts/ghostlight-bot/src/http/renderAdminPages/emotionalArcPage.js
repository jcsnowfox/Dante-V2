const { renderPageIntro, renderFieldLabelWithHelp } = require("./shared");

const DEPTH_OPTIONS = [
  { value: "off", label: "Off — engine inert (no emotional state)" },
  { value: "light", label: "Light — subtle, low intensity" },
  { value: "realistic", label: "Realistic — balanced, human-like" },
  { value: "intense", label: "Intense — strong, vivid reactions" },
];

const TEMPERAMENT_FIELDS = [
  ["warmth", "Warmth"],
  ["patience", "Patience"],
  ["directness", "Directness"],
  ["playfulness", "Playfulness"],
  ["protectiveness", "Protectiveness"],
  ["anger", "Anger baseline"],
  ["jealousy", "Jealousy baseline"],
];

const THRESHOLD_FIELDS = [
  ["annoyance", "Annoyance"],
  ["hurt", "Hurt"],
  ["anger", "Anger"],
  ["guilt", "Guilt"],
  ["remorse", "Remorse"],
  ["distance", "Distance"],
];

const EXPRESSION_STYLE_FIELDS = [
  ["annoyance", "Annoyance"],
  ["hurt", "Hurt"],
  ["anger", "Anger"],
  ["guilt", "Guilt"],
  ["remorse", "Remorse"],
  ["longing", "Longing"],
];

const REPAIR_STYLE_FIELDS = [
  ["admitFault", "Admit fault"],
  ["apologizeDirectly", "Apologize directly"],
  ["explainWithoutExcuses", "Explain without excuses"],
  ["offerRepairAction", "Offer a repair action"],
  ["doNotOverGrovel", "Do not over-grovel"],
  ["doNotCenterCompanionPain", "Do not center the companion's pain"],
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function renderNumberRow(prefix, fields, source, helpers, { min = 0, max = 10 } = {}) {
  const { escapeHtml } = helpers;
  return [
    "<div class=\"identity-grid\">",
    ...fields.map(([key, label]) => {
      const id = `${prefix}_${key}`;
      const raw = source && source[key];
      const value = Number.isFinite(Number(raw)) ? Number(raw) : "";
      return [
        "<div>",
        `<label for="${escapeHtml(id)}">${escapeHtml(label)}</label>`,
        `<input id="${escapeHtml(id)}" name="${escapeHtml(`${prefix}.${key}`)}" type="number" min="${min}" max="${max}" step="1" value="${escapeHtml(String(value))}">`,
        "</div>",
      ].join("");
    }),
    "</div>",
  ].join("");
}

function renderTextRow(prefix, fields, source, helpers) {
  const { escapeHtml } = helpers;
  return fields.map(([key, label]) => {
    const id = `${prefix}_${key}`;
    const value = source && source[key] ? String(source[key]) : "";
    return [
      "<div class=\"emotional-arc-text-field\">",
      `<label for="${escapeHtml(id)}">${escapeHtml(label)}</label>`,
      `<input id="${escapeHtml(id)}" name="${escapeHtml(`${prefix}.${key}`)}" type="text" maxlength="200" value="${escapeHtml(value)}">`,
      "</div>",
    ].join("");
  }).join("");
}

function renderCheckboxRow(prefix, fields, source, helpers) {
  const { escapeHtml } = helpers;
  return [
    "<div style=\"display:flex;flex-direction:column;gap:0.5rem;\">",
    ...fields.map(([key, label]) => {
      const id = `${prefix}_${key}`;
      const checked = source && source[key] === true ? " checked" : "";
      return [
        "<label style=\"display:inline-flex;align-items:center;gap:0.5rem;\">",
        `<input id="${escapeHtml(id)}" type="checkbox" name="${escapeHtml(`${prefix}.${key}`)}" value="true" style="width:auto;"${checked}>`,
        `<span>${escapeHtml(label)}</span>`,
        "</label>",
      ].join("");
    }),
    "</div>",
  ].join("");
}

function renderCurrentState(state, helpers) {
  const { escapeHtml } = helpers;
  if (!state || !state.primaryEmotion) {
    return "<p class=\"muted\">No active emotional state. The companion is at baseline.</p>";
  }
  return [
    "<dl class=\"emotional-arc-state\">",
    `<dt>Primary emotion</dt><dd>${escapeHtml(state.primaryEmotion)}</dd>`,
    state.secondaryEmotion ? `<dt>Secondary</dt><dd>${escapeHtml(state.secondaryEmotion)}</dd>` : "",
    `<dt>Intensity</dt><dd>${escapeHtml(String(state.intensity ?? "—"))}</dd>`,
    state.triggerSummary ? `<dt>Trigger</dt><dd>${escapeHtml(state.triggerSummary)}</dd>` : "",
    `<dt>Repair needed</dt><dd>${state.repairNeeded ? "Yes" : "No"}</dd>`,
    `<dt>Updated</dt><dd>${escapeHtml(formatDate(state.updatedAt || state.createdAt))}</dd>`,
    "</dl>",
  ].join("");
}

function renderAuditLog(entries, helpers) {
  const { escapeHtml } = helpers;
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p class=\"muted\">No audit activity yet.</p>";
  }
  return [
    "<table class=\"emotional-arc-audit\">",
    "<thead><tr><th>When</th><th>Event</th><th>Decision</th><th>Detail</th></tr></thead>",
    "<tbody>",
    ...entries.map((entry) => [
      "<tr>",
      `<td>${escapeHtml(formatDate(entry.createdAt))}</td>`,
      `<td>${escapeHtml(entry.eventType || "—")}</td>`,
      `<td>${escapeHtml(entry.decision || "—")}</td>`,
      `<td>${escapeHtml(entry.reason || entry.outputSummary || "")}</td>`,
      "</tr>",
    ].join("")),
    "</tbody>",
    "</table>",
  ].join("");
}

function renderEmotionalArcPage({
  profile = {},
  currentState = null,
  auditEntries = [],
  companionId = "",
  storeAvailable = true,
  theme = "light",
  helpers,
}) {
  const { escapeHtml, withThemeField } = helpers;
  const blocked = Array.isArray(profile.blockedExpressions) ? profile.blockedExpressions.join("\n") : "";

  const depthOptions = DEPTH_OPTIONS.map((option) => (
    `<option value="${escapeHtml(option.value)}"${profile.emotionalDepth === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`
  )).join("");

  return [
    renderPageIntro({
      title: "Emotional Arc",
      copy: "Configure this companion's emotional engine: how it appraises messages, how strongly it reacts, what it will never do, and how it repairs after conflict. The engine is fully additive and fails safe — turning it off returns the companion to its base behaviour.",
    }),
    storeAvailable ? "" : "<section class=\"lite-panel page-frame\"><p class=\"muted\">Database is not configured, so changes cannot be persisted. Set <code>DATABASE_URL</code> to enable the Emotional Arc Engine.</p></section>",
    "<section class=\"lite-panel page-frame settings-form\">",
    "<form method=\"post\" action=\"/admin/actions/emotional-arc-save\">",
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/emotional-arc\">",
    `<p class="muted">Companion ID: <code>${escapeHtml(companionId || "—")}</code></p>`,

    "<div style=\"margin:1rem 0;\"><label style=\"display:inline-flex;align-items:center;gap:0.5rem;\"><input type=\"checkbox\" name=\"enabled\" value=\"true\" style=\"width:auto;\"" + (profile.enabled ? " checked" : "") + "><span>Engine enabled</span></label></div>",

    "<div style=\"margin-top:1rem;\">",
    renderFieldLabelWithHelp({
      forId: "emotionalDepth",
      label: "Emotional depth",
      help: "Overall intensity of emotional reactions. 'Off' keeps the engine inert.",
    }, helpers),
    `<select id="emotionalDepth" name="emotionalDepth">${depthOptions}</select>`,
    "</div>",

    "<h3>Baseline temperament</h3>",
    "<p class=\"muted\">The companion's resting disposition (0–10).</p>",
    renderNumberRow("baselineTemperament", TEMPERAMENT_FIELDS, profile.baselineTemperament, helpers, { min: 0, max: 10 }),

    "<h3>Trigger thresholds</h3>",
    "<p class=\"muted\">How much pressure before each emotion registers (1–10, higher = harder to trigger).</p>",
    renderNumberRow("thresholds", THRESHOLD_FIELDS, profile.thresholds, helpers, { min: 1, max: 10 }),

    "<h3>Expression style</h3>",
    "<p class=\"muted\">How each emotion is allowed to surface in replies.</p>",
    renderTextRow("expressionStyle", EXPRESSION_STYLE_FIELDS, profile.expressionStyle, helpers),

    renderFieldLabelWithHelp({
      forId: "blockedExpressions",
      label: "Blocked expressions",
      help: "Behaviours the companion must never use, one per line. These are hard safety blocks.",
    }, helpers),
    `<textarea id="blockedExpressions" name="blockedExpressions" rows="8">${escapeHtml(blocked)}</textarea>`,

    "<h3>Repair style</h3>",
    "<p class=\"muted\">How the companion makes amends after conflict.</p>",
    renderCheckboxRow("repairStyle", REPAIR_STYLE_FIELDS, profile.repairStyle, helpers),

    "<div class=\"toolbar\"><button type=\"submit\">Save Emotional Arc</button></div>",
    "</form>",
    "</section>",

    "<section class=\"lite-panel page-frame\">",
    "<h3>Current emotional state</h3>",
    renderCurrentState(currentState, helpers),
    "</section>",

    "<section class=\"lite-panel page-frame\">",
    "<h3>Recent audit log</h3>",
    "<p class=\"muted\">Every decision the engine makes is recorded here for transparency.</p>",
    renderAuditLog(auditEntries, helpers),
    "</section>",
  ].join("");
}

module.exports = { renderEmotionalArcPage };
