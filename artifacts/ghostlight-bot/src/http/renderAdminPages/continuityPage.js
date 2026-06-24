"use strict";

const {
  renderPageIntro,
  renderSubnav,
} = require("./shared");

const TYPE_LABELS = {
  open_loop: "Open Loop",
  future_event: "Future Event",
  follow_up: "Follow-up",
  promise: "Promise",
  decision: "Decision",
  project_state: "Project State",
  repair_thread: "Repair Thread",
  boundary: "Boundary",
  ritual: "Ritual",
  attention_residue: "Attention",
  emotional_residue: "Emotion",
  media_job: "Media Job",
  health_context: "Health",
  relationship_context: "Relationship",
  waiting_on_owner: "Waiting: Owner",
  waiting_on_companion: "Waiting: Companion",
  absence_reentry: "Absence",
  trust_event: "Trust",
};

const STATUS_LABELS = {
  open: "Open",
  waiting: "Waiting",
  follow_up_due: "Due",
  asked: "Asked",
  outcome_pending: "Pending",
  resolved: "Resolved",
  expired: "Expired",
  archived: "Archived",
  cancelled: "Cancelled",
};

const ALL_TYPES = Object.keys(TYPE_LABELS);
const ALL_STATUSES = Object.keys(STATUS_LABELS);

function renderOverviewTab({ items, settings, storeAvailable, helpers, theme }) {
  const { escapeHtml, withThemeField, buildAdminLocation, renderIconImage } = helpers;
  const enabled = settings?.continuity_enabled ?? false;

  const byType = {};
  for (const t of ALL_TYPES) byType[t] = 0;
  for (const item of (items || [])) {
    if (byType[item.type] !== undefined) byType[item.type]++;
  }

  const openCount = (items || []).filter((i) => ["open", "waiting", "follow_up_due", "outcome_pending"].includes(i.status)).length;
  const dueCount = (items || []).filter((i) => i.status === "follow_up_due").length;
  const promiseCount = (items || []).filter((i) => i.type === "promise" && i.status === "open").length;

  const statsMarkup = [
    "<section class=\"home-dashboard-panel home-dashboard-panel-setup\" style=\"margin-bottom:1.25rem\">",
    "<div class=\"home-setup-list\" style=\"grid-template-columns:repeat(auto-fit,minmax(200px,1fr))\">",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon">${renderIconImage("automation", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Engine: ${enabled ? "Active" : "Paused"}</p>`,
    "</article>",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon">${renderIconImage("play", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Active loops: ${openCount}</p>`,
    "</article>",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon">${renderIconImage("heartbeat", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Follow-ups due: ${dueCount}</p>`,
    "</article>",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon">${renderIconImage("emotionalArc", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Open promises: ${promiseCount}</p>`,
    "</article>",
    "</div>",
    "</section>",
  ].join("");

  const typeGrid = [
    "<div class=\"form-divider\"></div>",
    "<h3 style=\"margin:0 0 14px\">Items by Type</h3>",
    "<div class=\"home-setup-list\" style=\"grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px\">",
    ALL_TYPES.map((t) => {
      const count = byType[t] || 0;
      return [
        "<article class=\"home-setup-item\">",
        `<p class="home-setup-value" style="font-size:.9rem">${escapeHtml(TYPE_LABELS[t])}<br><span class="badge" style="font-size:.75rem;margin-top:4px">${count}</span></p>`,
        "</article>",
      ].join("");
    }).join(""),
    "</div>",
  ].join("");

  const toggleSection = storeAvailable
    ? [
      "<div class=\"form-divider\"></div>",
      "<div class=\"toolbar\" style=\"margin-top:0\">",
      "<form method=\"POST\" action=\"/admin/actions/continuity-toggle\">",
      withThemeField(theme),
      `<input type="hidden" name="enable" value="${enabled ? "false" : "true"}">`,
      `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/continuity/overview", theme }))}">`,
      `<button type="submit" class="${enabled ? "secondary" : ""}">${enabled ? "Pause Continuity" : "Enable Continuity"}</button>`,
      "</form>",
      "</div>",
    ].join("")
    : "<div class=\"form-divider\"></div><p class=\"meta\">No database configured — engine is inert.</p>";

  return [statsMarkup, typeGrid, toggleSection].join("");
}

function renderItemsTab({ items, typeFilter, statusFilter, helpers, theme }) {
  const { escapeHtml, withThemeField } = helpers;

  const typeOptions = ["", ...ALL_TYPES].map((t) =>
    `<option value="${escapeHtml(t)}"${t === typeFilter ? " selected" : ""}>${escapeHtml(t ? (TYPE_LABELS[t] || t) : "All types")}</option>`,
  ).join("");

  const statusOptions = ["", ...ALL_STATUSES].map((s) =>
    `<option value="${escapeHtml(s)}"${s === statusFilter ? " selected" : ""}>${escapeHtml(s ? (STATUS_LABELS[s] || s) : "Active")}</option>`,
  ).join("");

  const filterBar = [
    "<form method=\"GET\" action=\"/admin/continuity/items\" class=\"schedule-status-row\" style=\"margin-bottom:1rem\">",
    "<div class=\"schedule-status-actions\">",
    `<select name="type" class="ghb-select" style="min-width:160px">${typeOptions}</select>`,
    `<select name="status" class="ghb-select" style="min-width:140px">${statusOptions}</select>`,
    "<button type=\"submit\">Filter</button>",
    "</div>",
    "</form>",
  ].join("");

  const tableMarkup = items && items.length
    ? [
      "<div class=\"model-table-wrap\"><table class=\"model-table\">",
      "<thead><tr><th>Type</th><th>Title</th><th>Summary</th><th>Status</th><th>Priority</th><th>Created</th><th></th></tr></thead>",
      '<tbody>',
      items.map((item) => {
        const created = item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-GB") : "—";
        const summary = (item.summary || "").slice(0, 100);
        const isDangerous = ["follow_up_due", "outcome_pending"].includes(item.status);
        return [
          "<tr>",
          `<td data-label="Type"><span class="badge">${escapeHtml(TYPE_LABELS[item.type] || item.type)}</span></td>`,
          `<td data-label="Title">${escapeHtml(item.title || "—")}</td>`,
          `<td data-label="Summary" class="table-detail-cell">${escapeHtml(summary)}${(item.summary || "").length > 100 ? "…" : ""}</td>`,
          `<td data-label="Status"><span class="badge${isDangerous ? " action-health-warning" : ""}">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</span></td>`,
          `<td data-label="Priority"><span class="meta">${escapeHtml(item.priority || "—")}</span></td>`,
          `<td data-label="Created" class="meta">${escapeHtml(created)}</td>`,
          "<td data-label=\"\"><div style=\"display:flex;gap:6px;justify-content:flex-end\">",
          "<form method=\"POST\" action=\"/admin/actions/continuity-resolve\" style=\"display:contents\">",
          withThemeField(theme),
          `<input type="hidden" name="itemId" value="${escapeHtml(String(item.id))}">`,
          `<input type="hidden" name="returnTo" value="/admin/continuity/items">`,
          "<button type=\"submit\" class=\"secondary\">Resolve</button>",
          "</form>",
          "<form method=\"POST\" action=\"/admin/actions/continuity-archive\" style=\"display:contents\">",
          withThemeField(theme),
          `<input type="hidden" name="itemId" value="${escapeHtml(String(item.id))}">`,
          `<input type="hidden" name="returnTo" value="/admin/continuity/items">`,
          "<button type=\"submit\" class=\"secondary\">Archive</button>",
          "</form>",
          "<form method=\"POST\" action=\"/admin/actions/continuity-delete\" style=\"display:contents\" onsubmit=\"return confirm('Delete?')\">",
          withThemeField(theme),
          `<input type="hidden" name="itemId" value="${escapeHtml(String(item.id))}">`,
          `<input type="hidden" name="returnTo" value="/admin/continuity/items">`,
          "<button type=\"submit\" class=\"secondary\">Delete</button>",
          "</form>",
          "</div></td>",
          "</tr>",
        ].join("");
      }).join(""),
      '</tbody></table></div>',
    ].join("")
    : `<p class="meta" style="margin-top:1rem">No ${escapeHtml(statusFilter || "active")} items${typeFilter ? ` of type "${escapeHtml(TYPE_LABELS[typeFilter] || typeFilter)}"` : ""}.</p>`;

  return [filterBar, tableMarkup].join("");
}

function renderEmotionalBeatsTab({ emotionalBeats, helpers }) {
  const { escapeHtml } = helpers;
  const beats = Array.isArray(emotionalBeats) ? emotionalBeats : [];
  if (!beats.length) {
    return '<p class="meta">No major emotional beats stored yet. Proposal, promise, repair, boundary, and commitment events will appear here after curation.</p>';
  }
  return [
    '<div class="model-table-wrap"><table class="model-table">',
    '<thead><tr><th>Event</th><th>Title</th><th>Summary</th><th>Importance</th><th>Weight</th><th>Privacy</th><th>Source</th><th>Tags</th><th>Flags</th><th>Last recalled</th></tr></thead>',
    "<tbody>",
    beats.map((beat) => {
      const tags = Array.isArray(beat.tags_json) ? beat.tags_json.join(", ") : "";
      const flags = [beat.pinned ? "pinned" : "", beat.resolved ? "resolved" : "open", beat.must_recall_across_channels ? "cross-channel" : "local"].filter(Boolean).join(", " );
      const source = [beat.source_channel_id, beat.source_message_id].filter(Boolean).join(" / ") || "—";
      return [
        "<tr>",
        `<td><span class="badge">${escapeHtml(beat.event_type || "—")}</span></td>`,
        `<td>${escapeHtml(beat.title || "—")}</td>`,
        `<td class="table-detail-cell">${escapeHtml(beat.summary || "—")}</td>`,
        `<td>${escapeHtml(beat.importance || "—")}</td>`,
        `<td>${escapeHtml(String(beat.emotional_weight ?? "—"))}</td>`,
        `<td>${escapeHtml(beat.privacy_scope || "normal")}${beat.adult_context ? " (adult gated)" : ""}</td>`,
        `<td class="meta">${escapeHtml(source)}</td>`,
        `<td class="meta">${escapeHtml(tags)}</td>`,
        `<td class="meta">${escapeHtml(flags)}</td>`,
        `<td class="meta">${escapeHtml(beat.last_recalled_at ? new Date(beat.last_recalled_at).toLocaleString("en-GB") : "—")}</td>`,
        "</tr>",
      ].join("");
    }).join(""),
    "</tbody></table></div>",
  ].join("");
}


function renderPromiseLedgerTab({ promises, helpers, theme }) {
  const { escapeHtml, withThemeField } = helpers;
  const rows = Array.isArray(promises) ? promises : [];
  if (!rows.length) return '<p class="meta">No promises stored yet.</p>';
  return ['<div class="model-table-wrap"><table class="model-table">','<thead><tr><th>Maker</th><th>Summary</th><th>Type</th><th>Status</th><th>Importance</th><th>Source</th><th>Privacy</th><th>Due</th><th>Timestamps</th><th>Tags</th><th></th></tr></thead><tbody>', rows.map((p)=>['<tr>',`<td>${escapeHtml(p.promise_maker||'—')}</td>`,`<td class="table-detail-cell">${escapeHtml(p.promise_text_summary||'—')}</td>`,`<td>${escapeHtml(p.promise_type||'other')}</td>`,`<td>${escapeHtml(p.status||'open')}</td>`,`<td>${escapeHtml(p.importance||'medium')}</td>`,`<td class="meta">${escapeHtml([p.source_channel_id,p.source_message_id].filter(Boolean).join(' / ')||'—')}</td>`,`<td>${escapeHtml(p.privacy_scope||'normal')}${p.adult_context?' (adult gated)':''}</td>`,`<td>${escapeHtml(p.due_at?new Date(p.due_at).toLocaleString('en-GB'):'—')}</td>`,`<td class="meta">fulfilled ${escapeHtml(p.fulfilled_at||'—')}<br>broken ${escapeHtml(p.broken_at||'—')}<br>repaired ${escapeHtml(p.repaired_at||'—')}</td>`,`<td class="meta">${escapeHtml(Array.isArray(p.tags_json)?p.tags_json.join(', '):'')}</td>`,`<td><div style="display:flex;gap:6px;flex-wrap:wrap">${['fulfilled','broken','repaired','archived'].map(st=>`<form method="POST" action="/admin/actions/promise-status" style="display:contents">${withThemeField(theme)}<input type="hidden" name="promiseId" value="${escapeHtml(String(p.id))}"><input type="hidden" name="status" value="${st}"><input type="hidden" name="returnTo" value="/admin/continuity/promises"><button type="submit" class="secondary">${st}</button></form>`).join('')}<form method="POST" action="/admin/actions/promise-delete" style="display:contents" onsubmit="return confirm('Delete promise?')">${withThemeField(theme)}<input type="hidden" name="promiseId" value="${escapeHtml(String(p.id))}"><input type="hidden" name="returnTo" value="/admin/continuity/promises"><button type="submit" class="secondary">Delete</button></form></div></td>`,'</tr>'].join('')).join(''),'</tbody></table></div>'].join('');
}
function renderVoiceFingerprintTab({ helpers }) {
  const { escapeHtml } = helpers;
  const { getVoiceDashboardState } = require("../../continuity/voiceFingerprintGuard");
  const v = getVoiceDashboardState();
  return `<h3>Voice Fingerprint Guard</h3><p class="meta">enabled ${v.enabled} · strictness ${escapeHtml(v.strictness)} · preset ${escapeHtml(v.currentVoicePresetName)}</p><div class="model-table-wrap"><table class="model-table"><tbody><tr><th>Last check</th><td>${escapeHtml(JSON.stringify(v.lastCheck||{}))}</td></tr><tr><th>Violation counts</th><td>${escapeHtml(JSON.stringify(v.recentViolationCounts))}</td></tr><tr><th>Forbidden phrase hits</th><td>${escapeHtml(v.forbiddenPhrases.join(', '))}</td></tr><tr><th>Retry count</th><td>${v.retryCount}</td></tr><tr><th>Fallback count</th><td>${v.fallbackCount}</td></tr><tr><th>Max reply length</th><td>${v.maxReplyLength}</td></tr></tbody></table></div>`;
}
function renderToneModeTab({ helpers }) {
  const { escapeHtml } = helpers;
  return `<h3>Tone Mode Resolver</h3><p class="meta">enabled true · default mode neutral · adult_private only in configured adult/private channel</p><div class="model-table-wrap"><table class="model-table"><tbody><tr><th>Supported modes</th><td>${escapeHtml('neutral, tender, flirty, dry_sarcastic, protective, possessive, melancholic, agitated, focused, playful, quiet, repair, teacher, norwegian_tutor, adult_private')}</td></tr><tr><th>Settings</th><td>allow flirty in normal channels: false<br>allow possessive mode: guarded<br>quiet hours tone preference: continuity settings</td></tr></tbody></table></div>`;
}

function renderSettingsTab({ settings, helpers, theme, msg, err }) {
  const { escapeHtml, withThemeField } = helpers;

  if (!settings) {
    return "<p class=\"meta\">Engine not initialised — no database configured.</p>";
  }

  const msgBanner = msg
    ? `<div class="ghb-info-strip" style="margin-bottom:16px;background:rgba(209,250,229,.7);border-color:rgba(16,185,129,.3);color:#065f46">${escapeHtml(msg)}</div>`
    : "";
  const errBanner = err
    ? `<div class="ghb-info-strip" style="margin-bottom:16px;background:rgba(254,226,226,.7);border-color:rgba(239,68,68,.3);color:#991b1b">${escapeHtml(err)}</div>`
    : "";

  const toggle = (key, label, help = "") => {
    const checked = settings[key] ? " checked" : "";
    return [
      "<div class=\"ghb-field-card\">",
      `<label class="ghb-label">${escapeHtml(label)}</label>`,
      help ? `<p class="ghb-help">${escapeHtml(help)}</p>` : "",
      "<label class=\"ghb-toggle-row\" style=\"margin-top:6px\">",
      `<input type="hidden" name="${escapeHtml(key)}" value="false">`,
      `<input class="ghb-toggle" type="checkbox" name="${escapeHtml(key)}" value="true"${checked}>`,
      `<span>${escapeHtml(label)} is ${settings[key] ? "on" : "off"}</span>`,
      "</label>",
      "</div>",
    ].join("");
  };

  const quietEnabled = !!settings.quiet_hours_enabled;
  const quietStart = escapeHtml(settings.quiet_hours_start || "22:00");
  const quietEnd = escapeHtml(settings.quiet_hours_end || "08:00");
  const maxPrelude = escapeHtml(String(settings.max_active_prelude_items ?? 4));
  const maxPerDay = escapeHtml(String(settings.max_followups_per_day ?? 2));
  const maxPerThread = escapeHtml(String(settings.max_followups_per_thread ?? 2));

  return `<div class="ghb-settings-tab">
${msgBanner}${errBanner}
<section class="ghb-hero">
  <div class="ghb-hero-art" style="background-image:none;background:linear-gradient(135deg,#0f1b55 0%,#1d3a8a 40%,#3b6fd4 70%,#7ab3f5 100%)"></div>
  <div class="ghb-hero-text">
    <h2 class="ghb-title">Continuity ∞</h2>
    <p class="ghb-subtitle">Your companion carries life forward across time — open threads, future events, promises, decisions, and everything that matters between sessions.</p>
  </div>
  <aside class="ghb-card ghb-side-card">
    <h3 class="ghb-side-title">What is Continuity?</h3>
    <p class="ghb-copy">Continuity gives your companion a persistent thread across conversations. It allows them to:</p>
    <ul class="ghb-bullet-list">
      <li>Remember open loops and unfinished threads</li>
      <li>Follow up on future events naturally</li>
      <li>Track companion and owner promises</li>
      <li>Hold decisions so they're never relitigated</li>
      <li>Re-enter after absences gracefully</li>
    </ul>
  </aside>
</section>

<form id="continuity-settings-form" method="POST" action="/admin/actions/continuity-save">
  ${withThemeField(theme)}
  <input type="hidden" name="returnTo" value="/admin/continuity/settings">
  <section class="ghb-main-grid">
    <div class="ghb-left">

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">∞</span>
          <div><h3 class="ghb-section-title">Core Modules</h3>
          <p class="ghb-copy">Enable or disable each continuity sub-system.</p></div>
        </div>
        <div class="ghb-field-grid">
          ${toggle("continuity_enabled", "Continuity enabled", "Master switch.")}
          ${toggle("open_loops_enabled", "Open loops", "Track unfinished conversational threads.")}
          ${toggle("future_followups_enabled", "Future event follow-ups", "Extract upcoming events and follow up after.")}
          ${toggle("promise_ledger_enabled", "Promise ledger", "Track companion and owner promises.")}
          ${toggle("decision_ledger_enabled", "Decision ledger", "Prevent relitigating settled decisions.")}
          ${toggle("project_state_enabled", "Project state", "Track long-running build context.")}
          ${toggle("repair_continuity_enabled", "Repair threads", "Register and track friction moments.")}
          ${toggle("boundary_continuity_enabled", "Boundaries", "Remember what the owner has asked not to do.")}
          ${toggle("ritual_continuity_enabled", "Rituals", "Track recurring patterns and habits.")}
          ${toggle("absence_reentry_enabled", "Absence re-entry", "Generate safe context after gaps.")}
          ${toggle("media_job_continuity_enabled", "Media job continuity", "Track image/audio generation jobs.")}
          ${toggle("trust_ledger_enabled", "Trust ledger", "Track reliability signals.")}
        </div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">◉</span>
          <div><h3 class="ghb-section-title">Delivery</h3>
          <p class="ghb-copy">Control proactive follow-up delivery. All off by default.</p></div>
        </div>
        <div class="ghb-field-grid">
          ${toggle("proactive_followups_enabled", "Proactive follow-ups", "your companion may proactively follow up on due items. Off by default.")}
          ${toggle("sensitive_followups_allowed", "Allow sensitive follow-ups", "Allow delivery for health, repair, and relationship items.")}
          ${toggle("public_channel_followups_allowed", "Allow public channel follow-ups", "Allow follow-ups in public/shared channels.")}
        </div>
        <div class="ghb-info-strip">Proactive delivery is off by default. Passive prelude always works when the engine is enabled.</div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">≋</span>
          <div><h3 class="ghb-section-title">Limits</h3>
          <p class="ghb-copy">Cap how much continuity appears in context and how often follow-ups fire.</p></div>
        </div>
        <div class="ghb-field-grid">
          <div class="ghb-field-card">
            <label class="ghb-label" for="cont-prelude-count">Max prelude items</label>
            <p class="ghb-help">0–12. Recommended: 4.</p>
            <div class="ghb-input-wrap">
              <input id="cont-prelude-count" name="max_active_prelude_items" type="number" min="0" max="12" value="${maxPrelude}">
              <span class="ghb-input-suffix">items</span>
            </div>
          </div>
          <div class="ghb-field-card">
            <label class="ghb-label" for="cont-day-cap">Max follow-ups per day</label>
            <p class="ghb-help">0–20. Recommended: 2.</p>
            <div class="ghb-input-wrap">
              <input id="cont-day-cap" name="max_followups_per_day" type="number" min="0" max="20" value="${maxPerDay}">
              <span class="ghb-input-suffix">/ day</span>
            </div>
          </div>
          <div class="ghb-field-card">
            <label class="ghb-label" for="cont-thread-cap">Max follow-ups per thread</label>
            <p class="ghb-help">0–10. Recommended: 2. Prevents nagging.</p>
            <div class="ghb-input-wrap">
              <input id="cont-thread-cap" name="max_followups_per_thread" type="number" min="0" max="10" value="${maxPerThread}">
              <span class="ghb-input-suffix">per thread</span>
            </div>
          </div>
        </div>
        <div class="ghb-info-strip">A thread that hits the per-thread cap is retired gracefully — never nagged.</div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">◑</span>
          <div><h3 class="ghb-section-title">Quiet Hours</h3>
          <p class="ghb-copy">Silence proactive continuity during the hours you choose.</p></div>
          <label class="ghb-toggle-row">
            <input type="hidden" name="quiet_hours_enabled" value="false">
            <input class="ghb-toggle" type="checkbox" name="quiet_hours_enabled" value="true"${quietEnabled ? " checked" : ""} id="cont-quiet-toggle">
            Quiet Hours are ${quietEnabled ? "on" : "off"}
          </label>
        </div>
        <div class="ghb-field-grid">
          <div class="ghb-field-card">
            <label class="ghb-label">Start</label>
            <input class="ghb-time-input" name="quiet_hours_start" type="time" value="${quietStart}">
          </div>
          <div class="ghb-field-card">
            <label class="ghb-label">End</label>
            <input class="ghb-time-input" name="quiet_hours_end" type="time" value="${quietEnd}">
          </div>
        </div>
      </section>

      <div class="ghb-save-bar" id="cont-save-bar">
        <span class="ghb-save-icon" style="width:48px;height:48px;border-radius:14px;padding:9px;background:#dbeafe;box-sizing:border-box;display:inline-grid;place-items:center;font-size:1.4rem;flex-shrink:0">∞</span>
        <div>
          <strong id="cont-bar-label">Review your settings</strong><br>
          <span class="ghb-copy" id="cont-bar-sub">Settings will be applied when you save.</span>
        </div>
        <button type="button" class="ghb-button" id="cont-reset-btn" onclick="window.location.reload()" style="display:none">Reset</button>
        <button type="submit" class="ghb-button ghb-button-primary">Save Continuity Settings</button>
      </div>
    </div>

    <aside class="ghb-right">
      <section class="ghb-card ghb-side-card">
        <h3 class="ghb-side-title">Current Preview</h3>
        <div class="ghb-preview-box">
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.3rem">∞</span>
            <p class="ghb-copy">Engine is <strong>${settings.continuity_enabled ? "active" : "paused"}</strong>.</p>
          </div>
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.3rem">◉</span>
            <p class="ghb-copy">Proactive delivery is <strong>${settings.proactive_followups_enabled ? "on" : "off"}</strong>.</p>
          </div>
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.3rem">≋</span>
            <p class="ghb-copy">Up to <strong>${maxPrelude} prelude items</strong> per reply.</p>
          </div>
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.3rem">◑</span>
            <p class="ghb-copy">${quietEnabled ? `Quiet Hours: <strong>${quietStart}–${quietEnd}</strong>` : "Quiet Hours disabled."}</p>
          </div>
        </div>
      </section>
      <section class="ghb-card ghb-side-card">
        <h3 class="ghb-side-title">Recommended defaults</h3>
        <p class="ghb-copy">All capture modules <strong>on</strong>. Proactive delivery <strong>off</strong>. Prelude items: <strong>4</strong>. Cap: <strong>2/day</strong>, <strong>2/thread</strong>.</p>
      </section>
    </aside>
  </section>
</form>
<script>
(function(){
  var form=document.getElementById('continuity-settings-form');
  var resetBtn=document.getElementById('cont-reset-btn');
  var barLabel=document.getElementById('cont-bar-label');
  var barSub=document.getElementById('cont-bar-sub');
  var dirty=false;
  function markDirty(){if(dirty)return;dirty=true;barLabel.textContent='You have unsaved changes';barSub.textContent='Review before saving.';resetBtn.style.display='';}
  if(form){form.addEventListener('change',markDirty);form.addEventListener('input',markDirty);}
  var qt=document.getElementById('cont-quiet-toggle');
  if(qt){qt.addEventListener('change',function(){qt.parentElement.lastChild.textContent=' Quiet Hours are '+(qt.checked?'on':'off');});}
})();
</script>
</div>`;
}

function renderContinuityPage({
  tab, items, emotionalBeats, promises, settings, typeFilter, statusFilter,
  storeAvailable, theme, helpers, msg, err,
}) {
  const tabs = [
    { key: "overview", label: "Overview", path: "/admin/continuity/overview" },
    { key: "items", label: "Items", path: "/admin/continuity/items" },
    { key: "emotional-beats", label: "Emotional Beats", path: "/admin/continuity/emotional-beats" },
    { key: "promises", label: "Promise Ledger", path: "/admin/continuity/promises" },
    { key: "voice", label: "Voice Fingerprint", path: "/admin/continuity/voice" },
    { key: "tone", label: "Tone Mode", path: "/admin/continuity/tone" },
    { key: "settings", label: "Settings", path: "/admin/continuity/settings" },
  ];

  let body = "";
  if (tab === "settings") {
    body = renderSettingsTab({ settings, helpers, theme, msg, err });
  } else if (tab === "emotional-beats") {
    body = renderEmotionalBeatsTab({ emotionalBeats, helpers });
  } else if (tab === "promises") {
    body = renderPromiseLedgerTab({ promises, helpers, theme });
  } else if (tab === "voice") {
    body = renderVoiceFingerprintTab({ helpers });
  } else if (tab === "tone") {
    body = renderToneModeTab({ helpers });
  } else if (tab === "items") {
    body = renderItemsTab({ items, typeFilter, statusFilter, helpers, theme });
  } else {
    body = renderOverviewTab({ items, settings, storeAvailable, helpers, theme });
  }

  return [
    renderPageIntro({
      title: "Continuity",
      copy: "Your companion carries life forward across time \u2014 tracking open threads, future events, promises, decisions, and everything that matters between sessions. Continuity chooses what matters now; it never dumps everything into the prompt.",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: tab || "overview", theme, helpers }),
    "</section>",
    "<section class=\"lite-panel page-frame admin-tab-panel\">",
    body,
    "</section>",
  ].join("");
}

module.exports = { renderContinuityPage };
