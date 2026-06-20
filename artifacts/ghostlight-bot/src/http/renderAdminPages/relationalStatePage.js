/**
 * renderRelationalStatePage
 *
 * Cinematic Ghostlight-styled admin page for the Relational State engine.
 * Uses the GRS design system (grs-* CSS classes) and
 * /assets/ghostlight/relational-state/ SVGs.
 *
 * ALL existing setting keys, form field names (row_enabled, owner_editable,
 * relational_depth, BOOLEAN_FLAGS, NUMERIC_FIELDS, STRING_FIELDS), form action
 * (/admin/actions/relational-state-save), DB warning logic, and data tables
 * are preserved. Only the visual presentation changes.
 */

const {
  BOOLEAN_FLAGS,
  NUMERIC_FIELDS,
  STRING_FIELDS,
  DEFAULT_CONFIG,
} = require("../../companionSystems/relationalState/relationalConfigSchema");
const {
  VALID_RELATIONAL_DEPTHS,
} = require("../../companionSystems/relationalState/relationalTypes");

const ASSET = "/assets/ghostlight/relational-state";

// Display labels per the design spec (keys match DB/config field names exactly)
const DISPLAY = {
  enabled:                       { label: "Engine Enabled",                  desc: "Master switch — off means fully inert." },
  emotion_tracking_enabled:      { label: "Emotion Tracking",                desc: "Track emotional signals and changes, reusing Emotional Arc." },
  wants_tracking_enabled:        { label: "Wants Tracking",                  desc: "Track wants and needs signals." },
  desire_tracking_enabled:       { label: "Desire Tracking (Internal Only)", desc: "Track desire signals internally only, never executes." },
  repair_tracking_enabled:       { label: "Repair Tracking",                 desc: "Track ruptures and draft inert repair directives." },
  trust_tracking_enabled:        { label: "Trust Tracking",                  desc: "Let trust grow slowly and drop carefully." },
  closeness_tracking_enabled:    { label: "Closeness Tracking",              desc: "Track closeness and warmth." },
  distance_tracking_enabled:     { label: "Distance Tracking",               desc: "Track withdrawal and distance." },
  longing_tracking_enabled:      { label: "Longing Tracking",                desc: "Track longing and missing." },
  annoyance_tracking_enabled:    { label: "Annoyance Tracking",              desc: "Track annoyance." },
  hurt_tracking_enabled:         { label: "Hurt Tracking",                   desc: "Track hurt." },
  guilt_remorse_tracking_enabled:{ label: "Guilt & Remorse Tracking",        desc: "Track guilt and remorse, with decay." },
  boundary_tracking_enabled:     { label: "Boundary Tracking",               desc: "Track boundary signals." },
  relationship_arc_enabled:      { label: "Relationship Arc",                desc: "Allow slow relationship-arc movement." },
  memory_hooks_enabled:          { label: "Memory Hooks (Stage)",            desc: "Stage relational memory candidates, never live." },
  prelude_enabled:               { label: "Additive Prelude",                desc: "Allow the optional additive reply prelude context section." },
  decay_enabled:                 { label: "Decay",                           desc: "Fade transient signals over time." },
  audit_log_enabled:             { label: "Audit Log",                       desc: "Record every engine decision." },
};

// SVG icons per flag
const ICONS = {
  enabled:                       "tracking-controls.svg",
  emotion_tracking_enabled:      "emotion-tracking.svg",
  wants_tracking_enabled:        "wants-tracking.svg",
  desire_tracking_enabled:       "desire-tracking.svg",
  repair_tracking_enabled:       "repair-tracking.svg",
  trust_tracking_enabled:        "trust-tracking.svg",
  closeness_tracking_enabled:    "closeness-tracking.svg",
  distance_tracking_enabled:     "distance-tracking.svg",
  longing_tracking_enabled:      "longing-tracking.svg",
  annoyance_tracking_enabled:    "annoyance-tracking.svg",
  hurt_tracking_enabled:         "hurt-tracking.svg",
  guilt_remorse_tracking_enabled:"guilt-remorse-tracking.svg",
  boundary_tracking_enabled:     "boundary-tracking.svg",
  relationship_arc_enabled:      "relationship-arc.svg",
  memory_hooks_enabled:          "memory-hooks.svg",
  prelude_enabled:               "tracking-controls.svg",
  decay_enabled:                 "tracking-controls.svg",
  audit_log_enabled:             "tracking-controls.svg",
};

// Grouping of BOOLEAN_FLAGS for visual organization
const GROUPS = [
  {
    label: "System Controls",
    keys: ["enabled", "prelude_enabled", "decay_enabled", "audit_log_enabled"],
  },
  {
    label: "Signal Tracking",
    keys: [
      "emotion_tracking_enabled", "wants_tracking_enabled", "desire_tracking_enabled",
      "repair_tracking_enabled", "trust_tracking_enabled", "closeness_tracking_enabled",
      "distance_tracking_enabled", "longing_tracking_enabled", "annoyance_tracking_enabled",
      "hurt_tracking_enabled", "guilt_remorse_tracking_enabled", "boundary_tracking_enabled",
    ],
  },
  {
    label: "Slow State",
    keys: ["relationship_arc_enabled", "memory_hooks_enabled"],
  },
];

// Quick preset maps (client-side staged — still requires Save)
const PRESETS = {
  minimal: {
    enabled: true, emotion_tracking_enabled: true, audit_log_enabled: true,
    prelude_enabled: true, decay_enabled: true,
    wants_tracking_enabled: false, desire_tracking_enabled: false,
    repair_tracking_enabled: false, trust_tracking_enabled: false,
    closeness_tracking_enabled: false, distance_tracking_enabled: false,
    longing_tracking_enabled: false, annoyance_tracking_enabled: false,
    hurt_tracking_enabled: false, guilt_remorse_tracking_enabled: false,
    boundary_tracking_enabled: false, relationship_arc_enabled: false,
    memory_hooks_enabled: false,
  },
  balanced: {
    enabled: true, emotion_tracking_enabled: true, wants_tracking_enabled: true,
    desire_tracking_enabled: true, repair_tracking_enabled: true,
    trust_tracking_enabled: true, closeness_tracking_enabled: true,
    distance_tracking_enabled: true, longing_tracking_enabled: false,
    annoyance_tracking_enabled: false, hurt_tracking_enabled: true,
    guilt_remorse_tracking_enabled: false, boundary_tracking_enabled: true,
    relationship_arc_enabled: true, memory_hooks_enabled: true,
    prelude_enabled: true, decay_enabled: true, audit_log_enabled: true,
  },
  deep: {
    enabled: true, emotion_tracking_enabled: true, wants_tracking_enabled: true,
    desire_tracking_enabled: true, repair_tracking_enabled: true,
    trust_tracking_enabled: true, closeness_tracking_enabled: true,
    distance_tracking_enabled: true, longing_tracking_enabled: true,
    annoyance_tracking_enabled: true, hurt_tracking_enabled: true,
    guilt_remorse_tracking_enabled: true, boundary_tracking_enabled: true,
    relationship_arc_enabled: true, memory_hooks_enabled: true,
    prelude_enabled: true, decay_enabled: true, audit_log_enabled: true,
  },
};

function humanLabel(field) {
  return field
    .replace(/_enabled$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderRelationalStatePage({
  settings,
  state = null,
  events = [],
  desires = [],
  repairs = [],
  auditEntries = [],
  companionId = "",
  storeAvailable = false,
  theme = "light",
  helpers = {},
}) {
  const esc = helpers.escapeHtml || ((v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
  const withThemeField = helpers.withThemeField || (() => "");

  const config = (settings && settings.config) || DEFAULT_CONFIG;
  const enabled = Boolean(settings && settings.enabled);
  const ownerEditable = settings ? settings.ownerEditable !== false : true;
  const active = Boolean(settings && settings.active);
  const lastSaved = settings && settings.updatedAt
    ? new Date(settings.updatedAt).toLocaleString()
    : null;

  // ── Helpers ────────────────────────────────────────────────────────────
  function toggle(name, checked) {
    return `<label class="grs-toggle-wrap" aria-label="${esc(DISPLAY[name]?.label || humanLabel(name))}">
      <input class="grs-toggle" type="checkbox" name="${esc(name)}" value="true" id="grs-${esc(name)}"${checked ? " checked" : ""} />
    </label>`;
  }

  function flagRow(key, checked, highlight = false) {
    const info = DISPLAY[key] || { label: humanLabel(key), desc: "" };
    const icon = ICONS[key] || "tracking-controls.svg";
    return `
      <div class="grs-row${highlight ? " grs-row-highlight" : ""}">
        <span class="grs-row-icon">
          <img src="${ASSET}/${esc(icon)}" alt="" aria-hidden="true" />
        </span>
        <div>
          <p class="grs-row-title">${esc(info.label)}</p>
          <p class="grs-row-desc">${esc(info.desc)}</p>
        </div>
        ${toggle(key, checked)}
      </div>`;
  }

  // ── Status badges ───────────────────────────────────────────────────────
  const engineBadge = active
    ? `<span class="grs-badge"><span class="grs-dot"></span>Live</span>`
    : `<span class="grs-badge" style="background:rgba(180,83,9,.1);color:#92400e;border-color:rgba(180,83,9,.22);">Inert</span>`;

  const storeWarning = storeAvailable ? "" : `
    <p class="grs-copy" style="margin-top:8px;color:var(--grs-warning);">
      No database connection — settings cannot be saved and the engine stays inert.
    </p>`;

  // ── Relational depth select ─────────────────────────────────────────────
  const depthOptions = VALID_RELATIONAL_DEPTHS
    .map((d) => `<option value="${esc(d)}"${config.relational_depth === d ? " selected" : ""}>${esc(d)}</option>`)
    .join("");

  // ── Tracking control groups ─────────────────────────────────────────────
  const groupsHtml = GROUPS.map((group) => {
    const rows = group.keys.map((key) => flagRow(key, config[key] === true)).join("");
    return `
      <div class="grs-group-label">${esc(group.label)}</div>
      ${rows}`;
  }).join("");

  // ── Numeric fields ──────────────────────────────────────────────────────
  const numericHtml = Object.entries(NUMERIC_FIELDS).map(([field, spec]) => `
    <label style="display:grid;gap:6px;">
      <span style="font-weight:700;font-size:.93rem;">${esc(humanLabel(field))}</span>
      <input type="number" name="${esc(field)}" min="${spec.min}" max="${spec.max}"
        value="${Number(config[field] ?? spec.default)}"
        style="width:100px;padding:10px 12px;border:1px solid var(--grs-line-strong);border-radius:10px;font-size:1rem;background:rgba(255,255,255,.7);color:var(--grs-text);" />
    </label>`).join("");

  // ── String fields ───────────────────────────────────────────────────────
  const stringHtml = STRING_FIELDS.map((field) => `
    <label style="display:grid;gap:6px;">
      <span style="font-weight:700;font-size:.93rem;">${esc(humanLabel(field))}</span>
      <input type="text" name="${esc(field)}" value="${esc(config[field] || "")}"
        style="padding:10px 12px;border:1px solid var(--grs-line-strong);border-radius:10px;background:rgba(255,255,255,.7);color:var(--grs-text);" />
    </label>`).join("");

  // ── Current relational state panel ──────────────────────────────────────
  const s = state || {};
  const stateRows = [
    ["Trust", s.trustLevel],
    ["Closeness", s.closenessLevel],
    ["Distance", s.distanceLevel],
    ["Repair needed", s.repairNeeded ? "yes" : "no"],
  ].map(([label, val]) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid rgba(124,58,237,.09);font-weight:700;">${esc(label)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid rgba(124,58,237,.09);color:var(--grs-muted);">${esc(val ?? "—")}</td>
    </tr>`).join("");

  // ── Data table rows ─────────────────────────────────────────────────────
  const eventRows = events.length
    ? events.map((e) => `
        <tr>
          <td>${esc(e.eventType || "")}</td>
          <td>${esc(e.triggerSummary || "")}</td>
          <td>${esc(e.createdAt ? new Date(e.createdAt).toLocaleString() : "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="3" class="grs-table-empty">No relational events yet.</td></tr>`;

  const desireRows = desires.length
    ? desires.map((d) => `
        <tr>
          <td>${esc(d.desireType || "")}</td>
          <td>${esc(d.intensity ?? "")}</td>
          <td>${d.requiresPermission ? "yes" : "no"}</td>
          <td>${esc(d.status || "internal")}</td>
          <td>${esc(d.createdAt ? new Date(d.createdAt).toLocaleString() : "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="5" class="grs-table-empty">No desires recorded (internal only, never executed).</td></tr>`;

  const repairRows = repairs.length
    ? repairs.map((r) => `
        <tr>
          <td>${esc(r.repairType || "")}</td>
          <td>${r.resolved ? "resolved" : "open"}</td>
          <td>${esc(r.createdAt ? new Date(r.createdAt).toLocaleString() : "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="3" class="grs-table-empty">No repairs drafted yet.</td></tr>`;

  const auditRows = auditEntries.length
    ? auditEntries.map((e) => `
        <tr>
          <td>${esc(e.eventType)}</td>
          <td>${esc(e.decision)}</td>
          <td>${esc(e.reason || "")}</td>
          <td>${esc(e.createdAt ? new Date(e.createdAt).toLocaleString() : "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" class="grs-table-empty">No audit entries yet.</td></tr>`;

  const presetsJson = JSON.stringify(PRESETS);
  const boolFlagsJson = JSON.stringify(BOOLEAN_FLAGS);

  return `
<div class="grs-page" data-theme="${esc(theme)}">
  <div class="grs-shell">

    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <div class="grs-hero">
      <div class="grs-hero-art" role="presentation" aria-hidden="true"></div>

      <div class="grs-hero-text">
        <h1 class="grs-title">Relational State ♡</h1>
        <p class="grs-subtitle">Define the relational signals and behaviours your companion is allowed to perceive, track, and act on. These settings shape how the emotional arc and relationship memory work together.</p>
      </div>

      <div class="grs-card grs-about-card">
        <h2 class="grs-about-title">
          <img src="${ASSET}/relational-state.svg" alt="" aria-hidden="true" />
          About Relational State
        </h2>
        <p class="grs-copy">These controls determine what emotional and relational signals your companion is allowed to track, remember, and respond to.</p>
        <ul class="grs-bullet-list">
          <li>Off = the signal cannot be tracked</li>
          <li>On = the signal can be tracked</li>
          <li>Internal-only signals never execute actions</li>
          <li>Stage signals are for review, not live use</li>
        </ul>
      </div>
    </div>

    <!-- ── Status cards ──────────────────────────────────────────────────── -->
    <div class="grs-status-grid">
      <div class="grs-card grs-status-card">
        <div class="grs-icon-bubble">
          <img src="${ASSET}/companion-status.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <p class="grs-status-title">Companion Status</p>
          <p class="grs-copy">Everything is owner-controlled. If a control is off, that behaviour cannot fire. Desires are internal only and never execute.</p>
        </div>
      </div>

      <div class="grs-card grs-status-card">
        <div class="grs-icon-bubble">
          <img src="${ASSET}/engine-status.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <p class="grs-status-title">Engine Status ${engineBadge}</p>
          <p class="grs-copy">Companion: <code style="font-size:.84em;background:rgba(139,92,246,.1);padding:2px 6px;border-radius:6px;">${esc(companionId || "—")}</code></p>
          ${storeWarning}
        </div>
      </div>

      <div class="grs-card grs-status-card">
        <div class="grs-icon-bubble">
          <img src="${ASSET}/last-saved.svg" alt="" aria-hidden="true" />
        </div>
        <div>
          <p class="grs-status-title">Last Saved</p>
          <p class="grs-copy">${lastSaved ? esc(lastSaved) : "Not saved yet"}</p>
        </div>
      </div>
    </div>

    <!-- ── Main settings form ─────────────────────────────────────────────── -->
    <form id="grs-settings-form" method="POST" action="/admin/actions/relational-state-save">
      ${withThemeField(theme)}

      <div class="grs-main-grid">

        <!-- Left column: tracking controls ──────────── -->
        <div class="grs-left">

          <!-- Relational Tracking Controls card -->
          <div class="grs-card grs-panel">
            <div class="grs-section-head">
              <div>
                <h2 class="grs-section-title">Relational Tracking Controls</h2>
                <p class="grs-copy">Choose what relational signals your companion can track and use.</p>
              </div>
            </div>

            <!-- Highlighted top rows: owner-editable + depth -->
            <div class="grs-control-list" style="margin-bottom:16px;">
              <div class="grs-row grs-row-highlight">
                <span class="grs-row-icon">
                  <img src="${ASSET}/owner-editable.svg" alt="" aria-hidden="true" />
                </span>
                <div>
                  <p class="grs-row-title">Owner Editable</p>
                  <p class="grs-row-desc">Allow the owner to edit relational settings.</p>
                </div>
                <label class="grs-toggle-wrap" aria-label="Owner editable">
                  <input class="grs-toggle" type="checkbox" name="owner_editable" value="true" id="grs-owner-editable"${ownerEditable ? " checked" : ""} />
                </label>
              </div>

              <div class="grs-row grs-row-highlight">
                <span class="grs-row-icon">
                  <img src="${ASSET}/relational-depth.svg" alt="" aria-hidden="true" />
                </span>
                <div>
                  <p class="grs-row-title">Relational Depth</p>
                  <p class="grs-row-desc">How deeply the companion can model the relationship.</p>
                </div>
                <select name="relational_depth" class="grs-select" aria-label="Relational depth">
                  ${depthOptions}
                </select>
              </div>
            </div>

            <!-- Row enabled + all BOOLEAN_FLAGS grouped -->
            <div class="grs-control-list">
              <!-- row_enabled sits before the groups -->
              <div class="grs-group-label">System Switch</div>
              <div class="grs-row">
                <span class="grs-row-icon">
                  <img src="${ASSET}/tracking-controls.svg" alt="" aria-hidden="true" />
                </span>
                <div>
                  <p class="grs-row-title">Row Enabled (System Switch)</p>
                  <p class="grs-row-desc">Master switch for all relational tracking features.</p>
                </div>
                <label class="grs-toggle-wrap" aria-label="Row enabled">
                  <input class="grs-toggle" type="checkbox" name="row_enabled" value="true" id="grs-row-enabled"${enabled ? " checked" : ""} />
                </label>
              </div>

              ${groupsHtml}
            </div>
          </div>

          <!-- Advanced Configuration card (numeric + string fields) -->
          <div class="grs-card grs-panel" style="overflow:hidden;">
            <details>
              <summary style="cursor:pointer;font-weight:900;font-size:1.05rem;list-style:none;display:flex;justify-content:space-between;align-items:center;">
                <span>Advanced Configuration</span>
                <span style="font-size:.85rem;font-weight:400;color:var(--grs-muted);">Thresholds, sensitivities &amp; styles</span>
              </summary>
              <div style="margin-top:18px;border-top:1px solid var(--grs-line);padding-top:18px;">
                <p class="grs-copy" style="margin-bottom:16px;">Fine-tune how strongly each signal registers and how the companion's styles are expressed.</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:20px;">
                  ${numericHtml}
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
                  ${stringHtml}
                </div>
              </div>
            </details>
          </div>

        </div><!-- /.grs-left -->

        <!-- Right sidebar ──────────────────────────── -->
        <div class="grs-right">

          <!-- Quick Presets -->
          <div class="grs-card grs-side-card">
            <h3 class="grs-side-title">
              <img src="${ASSET}/quick-presets.svg" alt="" aria-hidden="true" />
              Quick Presets
            </h3>
            <p class="grs-copy">Apply a preset to adjust many settings at once. Still requires Save to persist.</p>
            <div class="grs-preset-list">
              <button type="button" class="grs-preset-button" onclick="grsApplyPreset('minimal')">
                <img src="${ASSET}/tracking-controls.svg" alt="" aria-hidden="true" style="width:36px;height:36px;" />
                <div>
                  <strong style="display:block;margin-bottom:4px;">Minimal</strong>
                  <span class="grs-copy" style="font-size:.86rem;">Core safety and essentials only</span>
                </div>
              </button>
              <button type="button" class="grs-preset-button" onclick="grsApplyPreset('balanced')">
                <img src="${ASSET}/relational-state.svg" alt="" aria-hidden="true" style="width:36px;height:36px;" />
                <div>
                  <strong style="display:block;margin-bottom:4px;">Balanced</strong>
                  <span class="grs-copy" style="font-size:.86rem;">Recommended for most companions</span>
                </div>
              </button>
              <button type="button" class="grs-preset-button" onclick="grsApplyPreset('deep')">
                <img src="${ASSET}/relational-depth.svg" alt="" aria-hidden="true" style="width:36px;height:36px;" />
                <div>
                  <strong style="display:block;margin-bottom:4px;">Deep Tracking</strong>
                  <span class="grs-copy" style="font-size:.86rem;">Maximum relational awareness</span>
                </div>
              </button>
            </div>
          </div>

          <!-- Safety First -->
          <div class="grs-card grs-side-card">
            <h3 class="grs-side-title">
              <img src="${ASSET}/safety-first.svg" alt="" aria-hidden="true" />
              Safety First
            </h3>
            <p class="grs-copy">You're always in control. Nothing here can execute on its own. Desires are internal. Repairs are inert directives. Memory candidates are staged for review, never live.</p>
            <img src="${ASSET}/safety-first.svg" alt="" aria-hidden="true" class="grs-safety-art" />
          </div>

        </div><!-- /.grs-right -->
      </div><!-- /.grs-main-grid -->

      <!-- ── Sticky Save Bar ──────────────────────────────────────────────── -->
      <div class="grs-save-bar" id="grs-save-bar">
        <img class="grs-save-icon" src="${ASSET}/save-relational-settings.svg" alt="" aria-hidden="true" />
        <div>
          <strong id="grs-bar-title">Relational State Settings</strong>
          <p class="grs-copy" id="grs-bar-sub" style="font-size:.88rem;margin-top:2px;">Review your changes before saving.</p>
        </div>
        <button type="button" class="grs-button" onclick="grsReset()" aria-label="Reset unsaved changes">
          <img src="${ASSET}/reset-changes.svg" alt="" aria-hidden="true" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;" />Reset
        </button>
        <button type="submit" class="grs-button grs-button-primary"${storeAvailable ? "" : " disabled aria-disabled='true'"}>
          Save Relational State Settings
        </button>
      </div>

    </form><!-- /#grs-settings-form -->

    <!-- ── Current relational state ──────────────────────────────────────── -->
    <div class="grs-card grs-panel" style="margin-top:24px;">
      <h2 class="grs-section-title" style="margin-bottom:16px;">Current Relational State</h2>
      <table class="grs-data-table">
        <tbody>${stateRows}</tbody>
      </table>
    </div>

    <!-- ── Recent relational events ──────────────────────────────────────── -->
    <div class="grs-card grs-panel" style="margin-top:24px;overflow-x:auto;">
      <h2 class="grs-section-title" style="margin-bottom:16px;">Recent Relational Events</h2>
      <table class="grs-data-table">
        <thead><tr><th>Type</th><th>Trigger</th><th>When</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
    </div>

    <!-- ── Internal desires ───────────────────────────────────────────────── -->
    <div class="grs-card grs-panel" style="margin-top:24px;overflow-x:auto;">
      <h2 class="grs-section-title" style="margin-bottom:16px;">Internal Desires</h2>
      <p class="grs-copy" style="margin-bottom:14px;">Desires are internal only and never executed.</p>
      <table class="grs-data-table">
        <thead><tr><th>Type</th><th>Intensity</th><th>Needs permission</th><th>Status</th><th>When</th></tr></thead>
        <tbody>${desireRows}</tbody>
      </table>
    </div>

    <!-- ── Repairs ────────────────────────────────────────────────────────── -->
    <div class="grs-card grs-panel" style="margin-top:24px;overflow-x:auto;">
      <h2 class="grs-section-title" style="margin-bottom:16px;">Repairs</h2>
      <table class="grs-data-table">
        <thead><tr><th>Type</th><th>State</th><th>When</th></tr></thead>
        <tbody>${repairRows}</tbody>
      </table>
    </div>

    <!-- ── Audit Log ──────────────────────────────────────────────────────── -->
    <div class="grs-card grs-panel" style="margin-top:24px;overflow-x:auto;margin-bottom:24px;">
      <h2 class="grs-section-title" style="margin-bottom:16px;">Audit Log</h2>
      <table class="grs-data-table">
        <thead><tr><th>Event</th><th>Decision</th><th>Reason</th><th>When</th></tr></thead>
        <tbody>${auditRows}</tbody>
      </table>
    </div>

  </div><!-- /.grs-shell -->
</div><!-- /.grs-page -->

<script>
(function(){
  var form = document.getElementById('grs-settings-form');
  var barTitle = document.getElementById('grs-bar-title');
  var barSub = document.getElementById('grs-bar-sub');
  var saveBar = document.getElementById('grs-save-bar');
  var initial = {};

  if (form) {
    form.querySelectorAll('input[type=checkbox],input[type=number],input[type=text],select').forEach(function(el){
      if (el.type === 'checkbox') initial[el.name] = el.checked;
      else initial[el.name] = el.value;
    });
    form.addEventListener('change', function(){
      var on = 0, off = 0;
      form.querySelectorAll('input[type=checkbox]').forEach(function(el){ el.checked ? on++ : off++; });
      if (barTitle) barTitle.textContent = 'You have unsaved changes';
      if (barSub) barSub.textContent = on + ' setting' + (on === 1 ? '' : 's') + ' enabled \u00b7 ' + off + ' disabled';
      if (saveBar) saveBar.style.background = 'rgba(237,231,255,.98)';
    });
  }

  var PRESETS = ${presetsJson};
  var BOOL_FLAGS = ${boolFlagsJson};

  window.grsApplyPreset = function(name){
    if (!form || !PRESETS[name]) return;
    var preset = PRESETS[name];
    BOOL_FLAGS.forEach(function(key){
      var el = form.querySelector('[name="'+key+'"]');
      if (el && el.type === 'checkbox' && key in preset) el.checked = !!preset[key];
    });
    form.dispatchEvent(new Event('change'));
  };

  window.grsReset = function(){
    if (!form) return;
    form.querySelectorAll('input[type=checkbox],input[type=number],input[type=text],select').forEach(function(el){
      if (el.name in initial) {
        if (el.type === 'checkbox') el.checked = initial[el.name];
        else el.value = initial[el.name];
      }
    });
    if (barTitle) barTitle.textContent = 'Relational State Settings';
    if (barSub) barSub.textContent = 'Review your changes before saving.';
    if (saveBar) saveBar.style.background = '';
  };
})();
</script>`;
}

module.exports = { renderRelationalStatePage };
