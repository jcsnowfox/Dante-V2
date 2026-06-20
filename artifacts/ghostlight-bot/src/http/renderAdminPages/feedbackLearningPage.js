/**
 * renderFeedbackLearningPage
 *
 * Cinematic Ghostlight-styled admin page for the Feedback & Learning engine.
 * Uses the GFL design system (gfl-* CSS classes + /assets/ghostlight/feedback-learning/ SVGs).
 *
 * ALL existing setting keys, form field names, form actions, save handlers, routes,
 * DB warning logic, and admin navigation are preserved. Only the visual presentation changes.
 */

const {
  FEEDBACK_TYPES,
} = require("../../companionSystems/feedbackLearning/feedbackTypes");
const {
  DEFAULT_CONFIG,
} = require("../../companionSystems/feedbackLearning/feedbackConfigSchema");

const ASSET = "/assets/ghostlight/feedback-learning";

// Control groups — name matches DB/config field names exactly.
// topLevel: "fieldName" means read from top-level settings object, not config.
const GROUPS = [
  {
    key: "core",
    icon: "core-controls.svg",
    label: "Core Controls",
    desc: "Essential system and ownership controls",
    items: [
      { name: "row_enabled",    topLevel: "enabled",       label: "Row enabled (system switch)", desc: "If disabled, all feedback and learning features are globally off." },
      { name: "owner_editable", topLevel: "ownerEditable", label: "Owner editable",               desc: "Allow the owner to edit core companion settings." },
      { name: "enabled",                                   label: "Engine enabled",               desc: "Master switch — off means fully inert." },
      { name: "audit_log_enabled",                         label: "Audit log",                    desc: "Record every engine decision for review." },
      { name: "private_notes_enabled",                     label: "Private notes",                desc: "Allow private owner notes attached to feedback." },
    ],
  },
  {
    key: "feedback",
    icon: "feedback-handling.svg",
    label: "Feedback Handling",
    desc: "How feedback is collected and written",
    items: [
      { name: "feedback_buttons_enabled",  label: "Feedback buttons",  desc: "Allow quick feedback buttons in the UI." },
      { name: "freeform_feedback_enabled", label: "Freeform feedback", desc: "Allow owner-written feedback notes." },
    ],
  },
  {
    key: "proposals",
    icon: "learning-proposals.svg",
    label: "Learning & Proposals",
    desc: "Proposals, review, and memory candidates",
    items: [
      { name: "learning_proposals_enabled",                    label: "Learning proposals",        desc: "Draft proposals from feedback." },
      { name: "auto_apply_allowed",                            label: "Auto-apply (advanced)",     desc: "Apply approved-equivalent proposals without manual review. Off by default." },
      { name: "review_required",                               label: "Review required",           desc: "Force manual review before applying." },
      { name: "memory_candidate_creation_enabled",             label: "Memory candidates",         desc: "Stage memory candidates for review — never applied live." },
      { name: "requires_owner_approval_for_memory_candidates", label: "Approve memory candidates", desc: "Require approval before memory candidates are applied." },
    ],
  },
  {
    key: "tuning",
    icon: "tuning-behaviour.svg",
    label: "Tuning & Behaviour",
    desc: "How the companion adapts and behaves",
    items: [
      { name: "communication_tuning_enabled",                label: "Communication tuning",    desc: "Allow communication-style rules." },
      { name: "voice_rule_tuning_enabled",                   label: "Voice/style tuning",      desc: "Allow voice and style rules." },
      { name: "emotion_tuning_enabled",                      label: "Emotion tuning",          desc: "Allow relational and emotional tuning." },
      { name: "tool_behavior_tuning_enabled",                label: "Tool behaviour tuning",   desc: "Allow tool-behaviour rules." },
      { name: "autonomy_tuning_enabled",                     label: "Autonomy tuning",         desc: "Allow autonomy and ritual rules." },
      { name: "blocked_phrase_learning_enabled",             label: "Blocked-phrase learning", desc: "Allow do-not-repeat and blocked phrases." },
      { name: "repair_learning_enabled",                     label: "Repair learning",         desc: "Allow repair-style tuning." },
      { name: "requires_owner_approval_for_profile_changes", label: "Approve profile changes", desc: "Require approval for companion profile changes." },
    ],
  },
];

// Safe-defaults map for Quick Actions client-side preset
const SAFE_DEFAULTS = {
  row_enabled: true, owner_editable: true, enabled: true,
  feedback_buttons_enabled: true, freeform_feedback_enabled: true,
  learning_proposals_enabled: true, review_required: true,
  memory_candidate_creation_enabled: true,
  requires_owner_approval_for_profile_changes: true,
  requires_owner_approval_for_memory_candidates: true,
  audit_log_enabled: true, private_notes_enabled: true,
  communication_tuning_enabled: true, voice_rule_tuning_enabled: true,
  emotion_tuning_enabled: true, tool_behavior_tuning_enabled: false,
  autonomy_tuning_enabled: false, blocked_phrase_learning_enabled: true,
  repair_learning_enabled: true, auto_apply_allowed: false,
};

function renderFeedbackLearningPage({
  settings,
  proposals = [],
  events = [],
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
  const topLevelValues = {
    enabled: Boolean(settings && settings.enabled),
    ownerEditable: settings ? settings.ownerEditable !== false : true,
  };
  const active = Boolean(settings && settings.active);

  function isChecked(item) {
    if (item.topLevel) return Boolean(topLevelValues[item.topLevel]);
    return config[item.name] === true;
  }

  function renderGroup(group) {
    const rows = group.items.map((item) => `
      <div class="gfl-row">
        <span class="gfl-row-icon" aria-hidden="true">◈</span>
        <div>
          <p class="gfl-row-title">${esc(item.label)}</p>
          <p class="gfl-row-desc">${esc(item.desc)}</p>
        </div>
        <label class="gfl-toggle-wrap" aria-label="${esc(item.label)}">
          <input class="gfl-toggle" type="checkbox"
            name="${esc(item.name)}" value="true"
            id="gfl-${esc(item.name)}"
            ${isChecked(item) ? "checked" : ""} />
        </label>
      </div>`).join("");

    return `
      <div class="gfl-group" data-group="${esc(group.key)}">
        <div class="gfl-group-header">
          <span class="gfl-group-icon">
            <img src="${ASSET}/${esc(group.icon)}" alt="" aria-hidden="true" />
          </span>
          <div>
            <strong>${esc(group.label)}</strong>
            <p class="gfl-row-desc">${esc(group.desc)}</p>
          </div>
          <span class="gfl-count">${group.items.length}</span>
        </div>
        ${rows}
      </div>`;
  }

  const engineBadge = active
    ? `<span class="gfl-badge"><span class="gfl-dot"></span>Live</span>`
    : `<span class="gfl-badge gfl-badge-warning">Inert</span>`;

  const storeWarning = storeAvailable ? "" : `
    <p class="gfl-copy" style="margin-top:10px;color:var(--gfl-warning);">
      No database connection — settings cannot be saved and the engine stays inert.
    </p>`;

  const feedbackOptions = FEEDBACK_TYPES
    .map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`)
    .join("");

  const proposalRows = proposals.length
    ? proposals.map((p) => `
        <tr>
          <td>${esc(p.summary || p.proposalType)}</td>
          <td>${esc(p.proposalType)}</td>
          <td>${esc(p.targetSystem)}</td>
          <td>${esc(p.riskLevel)}</td>
          <td>${esc(p.status)}</td>
          <td>
            <form method="POST" action="/admin/actions/feedback-learning-proposal" class="gfl-inline-actions">
              ${withThemeField(theme)}
              <input type="hidden" name="proposal_id" value="${esc(p.proposalId)}" />
              <button type="submit" name="decision" value="approve" class="gfl-button" style="min-height:30px;padding:0 10px;font-size:.82rem;">Approve</button>
              <button type="submit" name="decision" value="reject"  class="gfl-button" style="min-height:30px;padding:0 10px;font-size:.82rem;">Reject</button>
              <button type="submit" name="decision" value="apply"   class="gfl-button gfl-button-primary" style="min-height:30px;padding:0 10px;font-size:.82rem;">Apply</button>
            </form>
          </td>
        </tr>`).join("")
    : `<tr><td colspan="6" class="gfl-table-empty">No proposals yet.</td></tr>`;

  const eventRows = events.length
    ? events.map((e) => `
        <tr>
          <td>${esc(e.feedbackLabel || e.feedbackTypeId)}</td>
          <td>${esc(e.feedbackText || "")}</td>
          <td>${esc(e.createdAt ? new Date(e.createdAt).toLocaleString() : "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="3" class="gfl-table-empty">No feedback recorded yet.</td></tr>`;

  const auditRows = auditEntries.length
    ? auditEntries.map((e) => `
        <tr>
          <td>${esc(e.eventType)}</td>
          <td>${esc(e.decision)}</td>
          <td>${esc(e.reason || "")}</td>
          <td>${esc(e.createdAt ? new Date(e.createdAt).toLocaleString() : "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" class="gfl-table-empty">No audit entries yet.</td></tr>`;

  const groupsHtml = GROUPS.map(renderGroup).join("\n");
  const safeJson = JSON.stringify(SAFE_DEFAULTS);

  return `
<div class="gfl-page" data-theme="${esc(theme)}">
  <div class="gfl-shell">

    <!-- ── Page Header ─────────────────────────────────────────────── -->
    <section class="gfl-top">
      <div>
        <h1 class="gfl-title">Feedback &amp; Learning ✣</h1>
        <p class="gfl-subtitle">Control what your companion is allowed to learn from and how feedback is processed.</p>
      </div>
      <aside class="gfl-status-card">
        <img src="${ASSET}/companion-status.svg" alt="" aria-hidden="true" />
        <div>
          <h2 class="gfl-section-title">Companion Status</h2>
          <p class="gfl-copy"><strong>Everything is owner-controlled.</strong><br>If a control is off, that behaviour cannot fire.</p>
        </div>
      </aside>
    </section>

    <!-- ── Engine Settings card ─────────────────────────────────────── -->
    <div class="gfl-card gfl-engine-card">
      <span class="gfl-icon">
        <img src="${ASSET}/engine-settings.svg" alt="" aria-hidden="true" />
      </span>
      <div>
        <h2 class="gfl-section-title">Engine Settings ${engineBadge}</h2>
        <p class="gfl-copy">Companion: <code style="font-size:.85em;background:rgba(139,92,246,.1);padding:2px 6px;border-radius:6px;">${esc(companionId || "—")}</code></p>
        ${storeWarning}
      </div>
      <button type="button" class="gfl-button" disabled aria-disabled="true" title="No engine status page available">
        View Engine Status
      </button>
    </div>

    <!-- ── Main settings form ───────────────────────────────────────── -->
    <form id="gfl-settings-form" method="POST" action="/admin/actions/feedback-learning-save">
      ${withThemeField(theme)}

      <div class="gfl-grid">

        <!-- Left column: setting controls -->
        <div class="gfl-left">
          <div class="gfl-card gfl-panel">
            <div class="gfl-section-head">
              <div>
                <h2 class="gfl-section-title">Learning &amp; Feedback Controls</h2>
                <p class="gfl-copy">Fine-tune what the companion can learn from and how it responds.</p>
              </div>
            </div>

            ${groupsHtml}

            <!-- Max proposals per day (number field) -->
            <div style="padding:18px 0 4px;border-top:1px solid var(--gfl-line);margin-top:8px;">
              <label for="gfl-max-proposals" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
                <div>
                  <p class="gfl-row-title">Max learning proposals per day</p>
                  <p class="gfl-row-desc">Cap how many new proposals can be drafted in a 24-hour window.</p>
                </div>
                <input
                  id="gfl-max-proposals"
                  type="number"
                  name="max_learning_proposals_per_day"
                  min="0" max="1000"
                  value="${Number(config.max_learning_proposals_per_day || 0)}"
                  style="width:84px;padding:10px 12px;border:1px solid var(--gfl-line-strong);border-radius:10px;font-size:1rem;background:rgba(255,255,255,.7);color:var(--gfl-text);"
                />
              </label>
            </div>
          </div>
        </div>

        <!-- Right column: info cards + quick actions -->
        <div class="gfl-right">

          <div class="gfl-card gfl-side-card">
            <h3 class="gfl-side-title">
              <img src="${ASSET}/feedback-learning.svg" alt="" aria-hidden="true" />
              What This Controls
            </h3>
            <p class="gfl-copy">These settings determine what your companion can learn from, how feedback is processed, and which behaviours are allowed.</p>
            <ul class="gfl-bullet-list">
              <li>Turn something off to prevent it from ever firing.</li>
              <li>Turn something on to allow it under your control.</li>
              <li>Some features are advanced and powerful — review carefully.</li>
            </ul>
          </div>

          <div class="gfl-card gfl-side-card">
            <h3 class="gfl-side-title">
              <img src="${ASSET}/profile-protection.svg" alt="" aria-hidden="true" />
              Profile Change Protection
            </h3>
            <p class="gfl-copy">Profile changes can impact how your companion behaves. Approval keeps you in control.</p>
            <img src="${ASSET}/profile-protection.svg" alt="" aria-hidden="true" class="gfl-shield-art" />
          </div>

          <div class="gfl-card gfl-side-card">
            <h3 class="gfl-side-title">
              <img src="${ASSET}/quick-actions.svg" alt="" aria-hidden="true" />
              Quick Actions
            </h3>
            <p class="gfl-copy" style="margin-bottom:14px;">Staged changes — still requires Save to persist.</p>
            <div class="gfl-action-list">
              <button type="button" class="gfl-action" onclick="gflSafeDefaults()">
                <img src="${ASSET}/engine-settings.svg" alt="" aria-hidden="true" />
                <div>
                  <strong>Enable All Safe Defaults</strong>
                  <span class="gfl-copy" style="display:block;font-size:.86rem;">Turns on the recommended set of controls.</span>
                </div>
              </button>
              <button type="button" class="gfl-action" onclick="gflLockdown()">
                <img src="${ASSET}/lockdown.svg" alt="" aria-hidden="true" />
                <div>
                  <strong>Disable All (Lockdown)</strong>
                  <span class="gfl-copy" style="display:block;font-size:.86rem;">Turns everything off. Save to confirm.</span>
                </div>
              </button>
              <button type="button" class="gfl-action" onclick="gflResetChanges()">
                <img src="${ASSET}/reset-changes.svg" alt="" aria-hidden="true" />
                <div>
                  <strong>Reset Changes</strong>
                  <span class="gfl-copy" style="display:block;font-size:.86rem;">Undo unsaved changes since last load.</span>
                </div>
              </button>
            </div>
          </div>

        </div><!-- /.gfl-right -->
      </div><!-- /.gfl-grid -->

      <!-- ── Sticky save bar ──────────────────────────────────────────── -->
      <div class="gfl-save-bar" id="gfl-save-bar">
        <img class="gfl-save-icon" src="${ASSET}/save-feedback-settings.svg" alt="" aria-hidden="true" />
        <div>
          <strong id="gfl-bar-title">Feedback &amp; Learning Settings</strong>
          <p class="gfl-copy" id="gfl-bar-sub" style="font-size:.88rem;margin-top:2px;">Save when you are ready.</p>
        </div>
        <button type="button" class="gfl-button" onclick="gflResetChanges()" aria-label="Reset unsaved changes">Reset</button>
        <button type="submit" class="gfl-button gfl-button-primary"${storeAvailable ? "" : " disabled aria-disabled='true'"}>
          Save Feedback &amp; Learning Settings
        </button>
      </div>

    </form>

    <!-- ── Submit Feedback ──────────────────────────────────────────── -->
    <div class="gfl-card gfl-panel" style="margin-top:24px;">
      <h2 class="gfl-section-title" style="margin-bottom:18px;">Submit Feedback</h2>
      <form method="POST" action="/admin/actions/feedback-learning-submit" style="display:grid;gap:14px;max-width:540px;">
        ${withThemeField(theme)}
        <label style="display:grid;gap:6px;">
          <span style="font-weight:700;font-size:.93rem;">Feedback type</span>
          <select name="feedback_type_id" style="padding:10px 12px;border:1px solid var(--gfl-line-strong);border-radius:10px;background:rgba(255,255,255,.72);color:var(--gfl-text);font-size:.95rem;">
            ${feedbackOptions}
          </select>
        </label>
        <label style="display:grid;gap:6px;">
          <span style="font-weight:700;font-size:.93rem;">Optional note</span>
          <input type="text" name="feedback_text" placeholder="e.g. don't open with an apology"
            style="padding:10px 12px;border:1px solid var(--gfl-line-strong);border-radius:10px;background:rgba(255,255,255,.72);color:var(--gfl-text);" />
        </label>
        <label style="display:grid;gap:6px;">
          <span style="font-weight:700;font-size:.93rem;">Source message id <span class="gfl-copy">(optional)</span></span>
          <input type="text" name="source_message_id"
            style="padding:10px 12px;border:1px solid var(--gfl-line-strong);border-radius:10px;background:rgba(255,255,255,.72);color:var(--gfl-text);" />
        </label>
        <button type="submit"${active ? "" : " disabled"} class="gfl-button gfl-button-primary" style="justify-self:start;padding:0 24px;">
          Submit feedback
        </button>
      </form>
    </div>

    <!-- ── Learning Proposals ────────────────────────────────────────── -->
    <div class="gfl-card gfl-panel" style="margin-top:24px;overflow-x:auto;">
      <h2 class="gfl-section-title" style="margin-bottom:16px;">Learning Proposals</h2>
      <table class="gfl-data-table">
        <thead><tr>
          <th>Summary</th><th>Type</th><th>Target</th><th>Risk</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${proposalRows}</tbody>
      </table>
    </div>

    <!-- ── Recent Feedback ───────────────────────────────────────────── -->
    <div class="gfl-card gfl-panel" style="margin-top:24px;overflow-x:auto;">
      <h2 class="gfl-section-title" style="margin-bottom:16px;">Recent Feedback</h2>
      <table class="gfl-data-table">
        <thead><tr><th>Type</th><th>Note</th><th>When</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
    </div>

    <!-- ── Audit Log ─────────────────────────────────────────────────── -->
    <div class="gfl-card gfl-panel" style="margin-top:24px;overflow-x:auto;margin-bottom:24px;">
      <h2 class="gfl-section-title" style="margin-bottom:16px;">Audit Log</h2>
      <table class="gfl-data-table">
        <thead><tr><th>Event</th><th>Decision</th><th>Reason</th><th>When</th></tr></thead>
        <tbody>${auditRows}</tbody>
      </table>
    </div>

  </div><!-- /.gfl-shell -->
</div><!-- /.gfl-page -->

<script>
(function(){
  var form = document.getElementById('gfl-settings-form');
  var barTitle = document.getElementById('gfl-bar-title');
  var barSub = document.getElementById('gfl-bar-sub');
  var saveBar = document.getElementById('gfl-save-bar');
  var initial = {};

  if (form) {
    form.querySelectorAll('input[type=checkbox],input[type=number]').forEach(function(el){
      initial[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    form.addEventListener('change', function(){
      if (barTitle) barTitle.textContent = 'You have unsaved changes';
      if (barSub) barSub.textContent = 'Review your changes before saving.';
      if (saveBar) saveBar.style.background = 'rgba(237,231,255,.98)';
    });
  }

  var SAFE = ${safeJson};

  window.gflSafeDefaults = function(){
    if (!form) return;
    Object.keys(SAFE).forEach(function(n){
      var el = form.querySelector('[name="'+n+'"]');
      if (el && el.type === 'checkbox') el.checked = !!SAFE[n];
    });
    form.dispatchEvent(new Event('change'));
  };

  window.gflLockdown = function(){
    if (!form) return;
    form.querySelectorAll('input[type=checkbox]').forEach(function(el){ el.checked = false; });
    form.dispatchEvent(new Event('change'));
  };

  window.gflResetChanges = function(){
    if (!form) return;
    form.querySelectorAll('input[type=checkbox],input[type=number]').forEach(function(el){
      if (el.name in initial) {
        if (el.type === 'checkbox') el.checked = initial[el.name];
        else el.value = initial[el.name];
      }
    });
    if (barTitle) barTitle.textContent = 'Feedback \u0026 Learning Settings';
    if (barSub) barSub.textContent = 'Save when you are ready.';
    if (saveBar) saveBar.style.background = '';
  };
})();
</script>`;
}

module.exports = { renderFeedbackLearningPage };
