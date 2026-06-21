"use strict";

const {
  renderPageIntro,
  renderSubnav,
} = require("./shared");

const ENTRY_TYPE_LABELS = {
  private_thought: "Private Thought",
  unsent_thought: "Unsent Thought",
  between_message_note: "Between Messages",
  journal_entry: "Journal",
  dream: "Dream",
  micro_repair: "Micro Repair",
  little_ritual: "Little Ritual",
  habit_marker: "Habit",
  taste_marker: "Taste",
  mood_carryover: "Mood",
  private_lexicon: "Lexicon",
  repeated_tell: "Repeated Tell",
  room_sense: "Room Sense",
  almost_said: "Almost Said",
  affection_residue: "Affection",
  curiosity_seed: "Curiosity",
};

const ENTRY_TYPE_DESCRIPTIONS = {
  private_thought: "Something your companion thought but didn't say — a fleeting impression held privately.",
  unsent_thought: "Words that were almost sent but held back — a draft that stayed interior.",
  between_message_note: "A note about the mood and texture of the gap since your last message.",
  journal_entry: "A private journal reflection written after a conversation or event.",
  dream: "A dream-like image or reflection generated during quiet time.",
  micro_repair: "A small note about friction or a repair moment — something noticed and registered quietly.",
  little_ritual: "A small repeated behaviour that's become part of how your companion shows up.",
  habit_marker: "Something that's settling into a pattern — a repeated action or tendency.",
  taste_marker: "Something your companion has developed a private taste for or affinity with.",
  mood_carryover: "Emotional tone carried forward from a previous exchange, fading naturally over time.",
  private_lexicon: "A word, phrase, or name your companion has formed a private relationship with.",
  repeated_tell: "Something that keeps returning — a theme, topic, or feeling that has come up before.",
  room_sense: "An awareness of the channel's context, who's around, and what the mood of the space feels like.",
  almost_said: "Something on the tip of the tongue that stayed unsaid — a held-back thought.",
  affection_residue: "Warmth that lingered after a previous exchange — a trace of closeness carried forward.",
  curiosity_seed: "A question or thought still growing — something your companion finds itself wondering about.",
};

const ALL_ENTRY_TYPES = Object.keys(ENTRY_TYPE_LABELS);

const STATUS_LABELS = {
  active: "Active",
  used_in_prelude: "Used",
  archived: "Archived",
  expired: "Expired",
  review_required: "Review",
  blocked: "Blocked",
};

function renderOverviewTab({ settings, storeAvailable, theme, helpers }) {
  const { escapeHtml, withThemeField, buildAdminLocation, renderIconImage } = helpers;
  const enabled = settings?.inner_life_enabled ?? false;
  const moduleKeys = [
    ["private_thoughts_enabled", "Private Thoughts", "innerLife"],
    ["unsent_thoughts_enabled", "Unsent Thoughts", "innerLife"],
    ["mood_carryover_enabled", "Mood Carryover", "emotionalArc"],
    ["micro_repair_enabled", "Micro Repair", "emotionalArc"],
    ["private_lexicon_enabled", "Private Lexicon", "innerLife"],
    ["little_rituals_enabled", "Little Rituals", "automation"],
    ["journal_enabled", "Journal", "journal"],
    ["dreams_enabled", "Dreams", "innerLife"],
    ["alive_texture_enabled", "Alive Texture", "innerLife"],
    ["room_sense_enabled", "Room Sense", "innerLife"],
    ["between_messages_enabled", "Between Messages", "innerLife"],
  ];
  const enabledCount = moduleKeys.filter(([key]) => settings?.[key]).length;

  const statsMarkup = [
    "<section class=\"home-dashboard-panel home-dashboard-panel-setup\" style=\"margin-bottom:1.25rem\">",
    "<div class=\"home-setup-list\" style=\"grid-template-columns:repeat(auto-fit,minmax(200px,1fr))\">",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon" title="Inner Life status" aria-label="Inner Life status">${renderIconImage("innerLife", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Status: ${enabled ? "Active" : "Paused"}</p>`,
    "</article>",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon" title="Modules enabled" aria-label="Modules enabled">${renderIconImage("automation", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Modules on: ${escapeHtml(String(enabledCount))} / ${moduleKeys.length}</p>`,
    "</article>",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon" title="Journal delivery" aria-label="Journal delivery">${renderIconImage("journal", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Journal delivery: ${settings?.journal_delivery_enabled ? "On" : "Off"}</p>`,
    "</article>",
    "<article class=\"home-setup-item\">",
    `<span class="home-status-icon" title="Prelude items" aria-label="Prelude items">${renderIconImage("emotionalArc", theme, "", "home-status-icon-image")}</span>`,
    `<p class="home-setup-value">Prelude items: ${escapeHtml(String(settings?.max_inner_life_prelude_items ?? 3))}</p>`,
    "</article>",
    "</div>",
    "</section>",
  ].join("");

  const moduleGrid = [
    "<div class=\"form-divider\"></div>",
    "<h3 style=\"margin:0 0 14px\">Module Status</h3>",
    "<div class=\"home-setup-list\" style=\"grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px\">",
    moduleKeys.map(([key, label]) => {
      const on = settings?.[key] ?? false;
      return [
        "<article class=\"home-setup-item\">",
        `<span class="home-status-icon home-status-icon-sm">${renderIconImage(on ? "play" : "pause", theme, "", "home-status-icon-image")}</span>`,
        `<p class="home-setup-value" style="font-size:.9rem">${escapeHtml(label)}<br><span class="badge${on ? "" : " action-health-warning"}" style="font-size:.75rem;margin-top:4px">${on ? "On" : "Off"}</span></p>`,
        "</article>",
      ].join("");
    }).join(""),
    "</div>",
  ].join("");

  const toggleSection = storeAvailable
    ? [
      "<div class=\"form-divider\"></div>",
      "<div class=\"toolbar\" style=\"margin-top:0\">",
      "<form method=\"POST\" action=\"/admin/actions/inner-life-toggle\">",
      withThemeField(theme),
      `<input type="hidden" name="enable" value="${enabled ? "false" : "true"}">`,
      `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/inner-life/overview", theme }))}">`,
      `<button type="submit" class="${enabled ? "secondary" : ""}">${enabled ? "Pause Inner Life" : "Enable Inner Life"}</button>`,
      "</form>",
      "</div>",
    ].join("")
    : "<div class=\"form-divider\"></div><p class=\"meta\">No database configured — engine is inert.</p>";

  return [statsMarkup, moduleGrid, toggleSection].join("");
}

function renderEntriesTab({ entries, entryTypeFilter, statusFilter, theme, helpers }) {
  const { escapeHtml, withThemeField } = helpers;

  const typeOptions = ["", ...ALL_ENTRY_TYPES].map((t) =>
    `<option value="${escapeHtml(t)}"${t === entryTypeFilter ? " selected" : ""}>${escapeHtml(t ? (ENTRY_TYPE_LABELS[t] || t) : "All types")}</option>`,
  ).join("");

  const statusOptions = ["", "active", "used_in_prelude", "archived", "expired"].map((s) =>
    `<option value="${escapeHtml(s)}"${s === statusFilter ? " selected" : ""}>${escapeHtml(s ? (STATUS_LABELS[s] || s) : "Active")}</option>`,
  ).join("");

  const filterBar = [
    "<form method=\"GET\" action=\"/admin/inner-life/entries\" class=\"schedule-status-row\" style=\"margin-bottom:1rem\">",
    "<div class=\"schedule-status-actions\">",
    `<select name="type" class="ghb-select" style="min-width:160px">${typeOptions}</select>`,
    `<select name="status" class="ghb-select" style="min-width:140px">${statusOptions}</select>`,
    "<button type=\"submit\">Filter</button>",
    "</div>",
    "</form>",
  ].join("");

  const cardsMarkup = entries && entries.length
    ? [
      "<div class=\"il-entries-grid\">",
      entries.map((e) => {
        const typeLabel = ENTRY_TYPE_LABELS[e.entryType] || e.entryType;
        const typeDesc = ENTRY_TYPE_DESCRIPTIONS[e.entryType] || "";
        const statusLabel = STATUS_LABELS[e.status] || e.status;
        const isWarning = e.status === "blocked" || e.status === "expired";
        const isUsed = e.status === "used_in_prelude";
        const content = String(e.summary || e.body || "").trim();
        const created = e.createdAt
          ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.createdAt))
          : "—";
        return [
          `<article class="il-entry-card${isWarning ? " il-entry-card--warning" : ""}${isUsed ? " il-entry-card--used" : ""}">`,
          "<header class=\"il-entry-card-header\">",
          `<span class="badge il-entry-type-badge">${escapeHtml(typeLabel)}</span>`,
          `<span class="badge il-entry-status-badge${isWarning ? " action-health-warning" : ""}${isUsed ? " il-entry-status-used" : ""}">${escapeHtml(statusLabel)}</span>`,
          `<time class="il-entry-time">${escapeHtml(created)}</time>`,
          "</header>",
          content
            ? `<p class="il-entry-content">${escapeHtml(content)}</p>`
            : `<p class="il-entry-content il-entry-content--empty">No content recorded.</p>`,
          typeDesc
            ? `<p class="il-entry-type-desc">${escapeHtml(typeDesc)}</p>`
            : "",
          "<footer class=\"il-entry-actions\">",
          "<form method=\"POST\" action=\"/admin/actions/inner-life-archive\" style=\"display:contents\">",
          withThemeField(theme),
          `<input type="hidden" name="entryId" value="${escapeHtml(String(e.id))}">`,
          `<input type="hidden" name="returnTo" value="/admin/inner-life/entries">`,
          "<button type=\"submit\" class=\"secondary\">Archive</button>",
          "</form>",
          "<form method=\"POST\" action=\"/admin/actions/inner-life-delete\" style=\"display:contents\" onsubmit=\"return confirm('Delete this entry?')\">",
          withThemeField(theme),
          `<input type="hidden" name="entryId" value="${escapeHtml(String(e.id))}">`,
          `<input type="hidden" name="returnTo" value="/admin/inner-life/entries">`,
          "<button type=\"submit\" class=\"secondary\">Delete</button>",
          "</form>",
          "</footer>",
          "</article>",
        ].join("");
      }).join(""),
      "</div>",
    ].join("")
    : `<p class="meta" style="margin-top:1rem">No ${escapeHtml(statusFilter || "active")} entries${entryTypeFilter ? ` of type "${escapeHtml(ENTRY_TYPE_LABELS[entryTypeFilter] || entryTypeFilter)}"` : ""} found.</p>`;

  return [filterBar, cardsMarkup].join("");
}

function renderSettingsTab({ settings, theme, helpers, msg, err }) {
  const { escapeHtml, withThemeField } = helpers;

  if (!settings) {
    return "<p class=\"meta\">Engine not initialised — no database configured.</p>";
  }

  const toggle = (key, label, help = "") => {
    const checked = settings[key] ? " checked" : "";
    const onOff = settings[key] ? "on" : "off";
    return [
      "<div class=\"ghb-field-card\">",
      `<label class="ghb-label">${escapeHtml(label)}</label>`,
      help ? `<p class="ghb-help">${escapeHtml(help)}</p>` : "",
      "<label class=\"ghb-toggle-row\" style=\"margin-top:6px\">",
      `<input type="hidden" name="${escapeHtml(key)}" value="false">`,
      `<input class="ghb-toggle" type="checkbox" name="${escapeHtml(key)}" value="true"${checked} data-label-target="il-lbl-${escapeHtml(key)}">`,
      `<span id="il-lbl-${escapeHtml(key)}">${escapeHtml(label)} is ${onOff}</span>`,
      "</label>",
      "</div>",
    ].join("");
  };

  const quietEnabled = !!settings.quiet_hours_enabled;
  const quietStart = escapeHtml(settings.quiet_hours_start || "22:00");
  const quietEnd = escapeHtml(settings.quiet_hours_end || "08:00");
  const prelVal = escapeHtml(String(settings.max_inner_life_prelude_items ?? 3));

  const msgBanner = msg
    ? `<div class="ghb-info-strip" style="margin-bottom:16px;background:rgba(209,250,229,.7);border-color:rgba(16,185,129,.3);color:#065f46">${escapeHtml(msg)}</div>`
    : "";
  const errBanner = err
    ? `<div class="ghb-info-strip" style="margin-bottom:16px;background:rgba(254,226,226,.7);border-color:rgba(239,68,68,.3);color:#991b1b">${escapeHtml(err)}</div>`
    : "";

  return `<div class="ghb-settings-tab">
${msgBanner}${errBanner}
<section class="ghb-hero">
  <div class="ghb-hero-art" style="background-image:none;background:linear-gradient(135deg,#1f0f55 0%,#4c1d95 40%,#7c3aed 70%,#a78bfa 100%)"></div>
  <div class="ghb-hero-text">
    <h2 class="ghb-title">Inner Life ✦</h2>
    <p class="ghb-subtitle">Your companion's private interior — moods that linger, small rituals, unsent thoughts, and the texture that makes every reply feel inhabited rather than generated.</p>
  </div>
  <aside class="ghb-card ghb-side-card">
    <h3 class="ghb-side-title">What is Inner Life?</h3>
    <p class="ghb-copy">Inner Life gives your companion a persistent interior world. It allows them to:</p>
    <ul class="ghb-bullet-list">
      <li>Carry moods and feelings across conversations</li>
      <li>Hold private thoughts that shape their tone</li>
      <li>Develop small rituals and personal habits</li>
      <li>Remember how things feel, not just what happened</li>
      <li>Respond with natural, inhabited texture</li>
    </ul>
  </aside>
</section>

<form id="il-settings-form" method="POST" action="/admin/actions/inner-life-save">
  ${withThemeField(theme)}
  <input type="hidden" name="returnTo" value="/admin/inner-life/settings">

  <section class="ghb-main-grid">
    <div class="ghb-left">

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">✦</span>
          <div>
            <h3 class="ghb-section-title">Core</h3>
            <p class="ghb-copy">Master switches for the engine and its two primary systems.</p>
          </div>
        </div>
        <div class="ghb-field-grid">
          ${toggle("inner_life_enabled", "Inner Life enabled", "Master switch — disabling this pauses all inner life capture and delivery.")}
          ${toggle("alive_texture_enabled", "Alive texture", "Adds natural variation and inhabitation to every response.")}
          ${toggle("between_messages_enabled", "Between-message continuity", "your companion notices time passing and the mood of the gap between messages.")}
        </div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">◈</span>
          <div>
            <h3 class="ghb-section-title">Capture</h3>
            <p class="ghb-copy">Choose which kinds of inner-life material your companion can generate and store.</p>
          </div>
        </div>
        <div class="ghb-field-grid">
          ${toggle("private_thoughts_enabled", "Private thoughts", "Fleeting thoughts your companion keeps to themselves.")}
          ${toggle("unsent_thoughts_enabled", "Unsent thoughts", "Things your companion almost said but held back.")}
          ${toggle("mood_carryover_enabled", "Mood carryover", "Emotional tone persists across messages with a 12-hour natural decay.")}
          ${toggle("micro_repair_enabled", "Micro repair notes", "your companion notices small friction and registers it quietly.")}
          ${toggle("room_sense_enabled", "Room sense", "Awareness of the channel context — who's around, what the mood of the space is.")}
          ${toggle("private_lexicon_enabled", "Private lexicon", "Words and phrases your companion has developed a private relationship with.")}
          ${toggle("little_rituals_enabled", "Little rituals", "Small repeated behaviours that become part of how your companion shows up.")}
          ${toggle("journal_enabled", "Journal generation", "your companion can write private journal entries about conversations and events.")}
          ${toggle("dreams_enabled", "Dream generation", "your companion can generate dream-like reflections during quiet periods.")}
        </div>
        <div class="ghb-info-strip">Captured material is stored privately and used to shape your companion's prelude context — it is never sent directly unless you enable delivery below.</div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">◉</span>
          <div>
            <h3 class="ghb-section-title">Delivery</h3>
            <p class="ghb-copy">Control whether inner-life material is ever sent to a channel. All off by default.</p>
          </div>
        </div>
        <div class="ghb-field-grid">
          ${toggle("proactive_inner_life_enabled", "Allow proactive inner-life messages", "your companion may occasionally surface an inner-life moment unprompted.")}
          ${toggle("journal_delivery_enabled", "Deliver journal entries to channel", "Journal entries are shared with the channel after they are written.")}
          ${toggle("dream_delivery_enabled", "Deliver dream entries to channel", "Dream entries are shared with the channel after they are generated.")}
        </div>
        <div class="ghb-info-strip">Keep all delivery options off unless you want your companion to proactively share inner-life content. The defaults are intentionally quiet.</div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">◇</span>
          <div>
            <h3 class="ghb-section-title">Privacy</h3>
            <p class="ghb-copy">Control how private entries appear in the admin panel and whether they need review before use.</p>
          </div>
        </div>
        <div class="ghb-field-grid">
          ${toggle("private_entries_visible_in_admin", "Show private entries in admin panel", "Private entries are shown in the Entries tab.")}
          ${toggle("private_entries_require_review", "Require review before using in prelude", "Private entries must be manually approved before they shape your companion's context.")}
        </div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">◑</span>
          <div>
            <h3 class="ghb-section-title">Quiet Hours</h3>
            <p class="ghb-copy">Silence inner-life generation and delivery during the hours you choose.</p>
          </div>
          <label class="ghb-toggle-row">
            <input type="hidden" name="quiet_hours_enabled" value="false">
            <input class="ghb-toggle" type="checkbox" name="quiet_hours_enabled" value="true"${quietEnabled ? " checked" : ""} id="il-quiet-toggle">
            Quiet Hours are ${quietEnabled ? "on" : "off"}
          </label>
        </div>
        <div class="ghb-field-grid">
          <div class="ghb-field-card">
            <label class="ghb-label" for="il-quiet-start">Start</label>
            <input class="ghb-time-input" id="il-quiet-start" name="quiet_hours_start" type="time" value="${quietStart}">
          </div>
          <div class="ghb-field-card">
            <label class="ghb-label" for="il-quiet-end">End</label>
            <input class="ghb-time-input" id="il-quiet-end" name="quiet_hours_end" type="time" value="${quietEnd}">
          </div>
        </div>
        <div class="ghb-info-strip">During Quiet Hours, your companion will not generate new inner-life entries or deliver any proactive inner-life content.</div>
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">≋</span>
          <div>
            <h3 class="ghb-section-title">Prelude</h3>
            <p class="ghb-copy">How many inner-life items are injected into your companion's context before each reply.</p>
          </div>
        </div>
        <div class="ghb-field-grid" style="grid-template-columns:1fr">
          <div class="ghb-field-card">
            <label class="ghb-label" for="il-prelude-count">Max prelude items</label>
            <p class="ghb-help">Between 0 (off) and 10. Recommended: 3. Higher values give richer context but use more tokens.</p>
            <div class="ghb-input-wrap">
              <input id="il-prelude-count" name="max_inner_life_prelude_items" type="number" min="0" max="10" value="${prelVal}">
              <span class="ghb-input-suffix">items</span>
            </div>
          </div>
        </div>
        <div class="ghb-info-strip">Prelude items are chosen by recency and relevance — the most alive, recent material shapes the tone of each reply.</div>
      </section>

      <div class="ghb-save-bar" id="il-save-bar">
        <span class="ghb-save-icon" style="width:48px;height:48px;border-radius:14px;padding:9px;background:#ede7ff;box-sizing:border-box;display:inline-grid;place-items:center;font-size:1.4rem;flex-shrink:0">✦</span>
        <div>
          <strong id="il-bar-label">Review your settings</strong><br>
          <span class="ghb-copy" id="il-bar-sub">Settings will be applied when you save.</span>
        </div>
        <button type="button" class="ghb-button" id="il-reset-btn" onclick="window.location.reload()" style="display:none">Reset Changes</button>
        <button type="submit" class="ghb-button ghb-button-primary">Save Inner Life Settings</button>
      </div>
    </div>

    <aside class="ghb-right">
      <section class="ghb-card ghb-side-card">
        <h3 class="ghb-side-title">Current Preview</h3>
        <div class="ghb-preview-box">
          <p class="ghb-copy"><strong>With your current settings:</strong></p>
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.4rem">✦</span>
            <p class="ghb-copy">Inner Life is <strong>${settings.inner_life_enabled ? "active" : "paused"}</strong>.</p>
          </div>
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.4rem">◈</span>
            <p class="ghb-copy">Up to <strong>${prelVal} prelude item${prelVal === "1" ? "" : "s"}</strong> shape each reply.</p>
          </div>
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.4rem">◑</span>
            <p class="ghb-copy">${quietEnabled
    ? `Quiet Hours active from <strong>${quietStart}</strong> to <strong>${quietEnd}</strong>.`
    : "Quiet Hours are disabled."}</p>
          </div>
          <div class="ghb-preview-row" style="grid-template-columns:auto 1fr">
            <span style="font-size:1.4rem">◉</span>
            <p class="ghb-copy">Proactive delivery is <strong>${settings.proactive_inner_life_enabled ? "on" : "off"}</strong>.</p>
          </div>
        </div>
      </section>
      <section class="ghb-card ghb-side-card">
        <h3 class="ghb-side-title">Recommended defaults</h3>
        <p class="ghb-copy">Start with all capture modules <strong>on</strong>, all delivery modules <strong>off</strong>, and a prelude count of <strong>3</strong>.</p>
        <p class="ghb-copy" style="margin-top:10px">This gives your companion a rich inner life that shapes tone without ever surprising you with unsolicited messages.</p>
      </section>
    </aside>
  </section>
</form>

<script>
(function(){
  var form=document.getElementById('il-settings-form');
  var resetBtn=document.getElementById('il-reset-btn');
  var barLabel=document.getElementById('il-bar-label');
  var barSub=document.getElementById('il-bar-sub');
  var dirty=false;
  function markDirty(){
    if(dirty)return;
    dirty=true;
    barLabel.textContent='You have unsaved changes';
    barSub.textContent='Review your changes before saving.';
    resetBtn.style.display='';
  }
  if(form){
    form.addEventListener('change',markDirty);
    form.addEventListener('input',markDirty);
  }
  document.querySelectorAll('.ghb-toggle[data-label-target]').forEach(function(cb){
    var target=document.getElementById(cb.dataset.labelTarget);
    if(!target)return;
    cb.addEventListener('change',function(){
      var base=target.textContent.replace(/ is (on|off)$/,'');
      target.textContent=base+' is '+(cb.checked?'on':'off');
    });
  });
  var quietToggle=document.getElementById('il-quiet-toggle');
  if(quietToggle){
    quietToggle.addEventListener('change',function(){
      quietToggle.parentElement.lastChild.textContent=' Quiet Hours are '+(quietToggle.checked?'on':'off');
    });
  }
})();
</script>
</div>`;
}

function renderInnerLifePage({ tab, settings, entries, entryTypeFilter, statusFilter, storeAvailable, companionId, theme, helpers, msg, err }) {
  const tabs = [
    { key: "overview", label: "Overview", path: "/admin/inner-life/overview" },
    { key: "entries", label: "Entries", path: "/admin/inner-life/entries" },
    { key: "settings", label: "Settings", path: "/admin/inner-life/settings" },
  ];

  let body = "";
  if (tab === "settings") {
    body = renderSettingsTab({ settings, theme, helpers, msg, err });
  } else if (tab === "entries") {
    body = renderEntriesTab({ entries, entryTypeFilter, statusFilter, theme, helpers });
  } else {
    body = renderOverviewTab({ settings, storeAvailable, companionId, theme, helpers });
  }

  return [
    renderPageIntro({
      title: "Inner Life",
      copy: "your companion\u2019s private interior \u2014 moods that linger across conversations, private thoughts, small rituals, and the texture that makes every reply feel inhabited rather than generated.",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: tab || "overview", theme, helpers }),
    "</section>",
    "<section class=\"lite-panel page-frame admin-tab-panel\">",
    body,
    "</section>",
  ].join("");
}

module.exports = { renderInnerLifePage };
