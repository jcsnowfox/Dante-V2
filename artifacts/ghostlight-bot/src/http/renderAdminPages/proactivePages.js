const { getRuntimeState, renderPageIntro, renderSubnav } = require("./shared");
const {
  renderJournalMarkdown,
  renderJournalMarkdownPreview,
} = require("./journalMarkdown");

function renderSchedulesPage({
  currentTab = "actions",
  config,
  automations = [],
  failedAutomations = [],
  editingAutomation = null,
  dailyThreadAutomation = null,
  targetOptions = [],
  targetLabelsByValue = new Map(),
  query = {},
  theme = "light",
  helpers,
}) {
  const { escapeHtml, withThemeField, buildAdminLocation, renderProactivePage, renderIconImage } = helpers;
  const activeTab = currentTab === "dailyThread" ? "dailyThread" : "actions";
  const tabs = [
    { key: "actions", label: "Scheduled Actions", path: "/admin/schedules/actions" },
    { key: "dailyThread", label: "Daily Thread", path: "/admin/schedules/daily-thread" },
  ];
  const state = getRuntimeState({ config, dailyThreadAutomation, helpers });
  const selectedDailyThreadTools = new Set((state.dailyThreadEnabledTools || []).map((item) => String(item || "").trim().toLowerCase()));
  const dailyThreadTargetOptions = (Array.isArray(targetOptions) ? targetOptions : [])
    .filter((option) => String(option?.value || "").trim() !== "daily");
  const selectedDailyThreadChannel = String(state.dailyThreadChannelId || "").trim();
  const dailyThreadPickerOptions = [
    '<option value="">Choose a channel or thread</option>',
    ...dailyThreadTargetOptions.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === selectedDailyThreadChannel ? " selected" : ""}>${escapeHtml(option.label)}</option>`),
  ].join("");
  const formatTimestamp = (value) => {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: state.timezoneValue || "UTC",
    }).format(date);
  };
  const failedAutomationCards = failedAutomations.map((automation) => [
    "<article class=\"card\">",
    `<div class="section-title"><div><h3>${escapeHtml(automation.name || "Scheduled action")}</h3><p class="meta">${escapeHtml("Scheduled action")}${automation.lastRunAt ? ` · Last run ${escapeHtml(formatTimestamp(automation.lastRunAt))}` : ""}</p></div></div>`,
    `<p class="meta proactive-error-detail">${escapeHtml(automation.lastError || "No error recorded.")}</p>`,
    "<div class=\"toolbar\" style=\"margin-top:1rem\">",
    "<form method=\"post\" action=\"/admin/actions/automation-error-clear\">",
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/schedules/actions\">",
    `<input type="hidden" name="actionId" value="${escapeHtml(automation.actionId)}">`,
    "<button type=\"submit\" class=\"secondary\">Marked Done</button>",
    "</form>",
    `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/schedules/actions", theme, extra: { automation: automation.actionId } }))}">Open Schedule</a>`,
    "</div>",
    "</article>",
  ].join("")).join("");
  const renderDailyThreadToolToggle = ({ toolName, label, iconKind }) => {
    const inputId = `daily-thread-tool-${toolName}`;

    return [
      `<label class="feature-toggle-pill" for="${escapeHtml(inputId)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">`,
      `<input id="${escapeHtml(inputId)}" type="checkbox" name="enabledTools" value="${escapeHtml(toolName)}"${selectedDailyThreadTools.has(toolName) ? " checked" : ""}>`,
      `<span class="feature-toggle-pill-icon" aria-hidden="true">${renderIconImage(iconKind, theme, "", "home-feature-icon-image")}</span>`,
      `<span class="feature-toggle-pill-label">${escapeHtml(label)}</span>`,
      "</label>",
    ].join("");
  };

  const dailyThreadBody = [
    "<section class=\"lite-panel page-frame settings-form\">",
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/schedules/daily-thread\">",
    "<label class=\"switch-field\">",
    `<span class="switch-control"><input type="checkbox" name="dailyThreadEnabled"${state.dailyThreadEnabled ? " checked" : ""}><span></span></span>`,
    `<span class="switch-label">Daily Thread Creation is ${escapeHtml(state.dailyThreadEnabled ? "on" : "off")}</span>`,
    "</label>",
    "<div class=\"schedule-inline-fields schedule-inline-fields-triple\" style=\"margin-top:1rem\">",
    `<div><label for="dailyThreadTitleTemplate">Title Template</label><input id="dailyThreadTitleTemplate" name="dailyThreadTitleTemplate" type="text" value="${escapeHtml(state.dailyThreadTitleTemplate)}"></div>`,
    `<div><label for="dailyThreadChannelId">Target</label><select id="dailyThreadChannelId" name="dailyThreadChannelId">${dailyThreadPickerOptions}</select></div>`,
    `<div><label for="dailyThreadScheduleTime">Time</label><input id="dailyThreadScheduleTime" name="dailyThreadScheduleTime" type="time" value="${escapeHtml(state.dailyThreadScheduleTime)}"></div>`,
    "</div>",
    "<div><label>Tools</label><div class=\"home-feature-row\" style=\"justify-content:flex-start;gap:.75rem;flex-wrap:wrap;margin-top:.45rem\">",
    renderDailyThreadToolToggle({ toolName: "gif_search", label: "GIF Search", iconKind: "gif" }),
    renderDailyThreadToolToggle({ toolName: "web_search", label: "Web Search", iconKind: "web_search" }),
    renderDailyThreadToolToggle({ toolName: "generate_image", label: "Image Gen", iconKind: "images" }),
    renderDailyThreadToolToggle({ toolName: "generate_audio", label: "Audio Gen", iconKind: "audio" }),
    "</div></div>",
    "<label for=\"dailyThreadStarterPrompt\">Daily Thread Prompt</label>",
    `<textarea id="dailyThreadStarterPrompt" name="dailyThreadStarterPrompt">${escapeHtml(state.dailyThreadStarterPrompt)}</textarea>`,
    "<div class=\"toolbar\"><button type=\"submit\">Save Settings</button></div>",
    "</form>",
    "</section>",
  ].join("");
  const actionsBody = [
    failedAutomations.length
      ? [
        "<section class=\"lite-panel page-frame\">",
        "<div class=\"panel-header\"><div><h2>Schedule Errors</h2><p>Recent schedule failures show up here so you can see what went wrong and clear them once you've checked the cause.</p></div></div>",
        `<div class="stack">${failedAutomationCards}</div>`,
        "</section>",
      ].join("")
      : "",
    renderProactivePage({
      automations,
      editingAutomation,
      targetOptions,
      targetLabelsByValue,
      theme,
      currentPath: "/admin/schedules/actions",
      dailyThreadEnabled: Boolean(state.dailyThreadEnabled),
      query,
    }),
  ].join("");

  return [
    renderPageIntro({
      title: "Schedules",
      copy: "Schedules are proactive reach outs that you control — you define exactly when your companion sends a message or action, on a fixed schedule, independently of their own judgment. Think of these as the things you've planned in advance, as opposed to the spontaneous things Heartbeat decides to do on its own.",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: activeTab, theme, helpers }),
    "</section>",
    activeTab === "dailyThread" ? dailyThreadBody : actionsBody,
  ].join("");
}

function renderJournalsPage({
  config,
  journalEntries = [],
  currentEntry = null,
  journalPage = 1,
  journalTotalPages = 1,
  theme = "light",
  helpers,
}) {
  const { escapeHtml, buildAdminLocation, renderConfirmOnSubmit, withThemeField } = helpers;
  const state = getRuntimeState({ config, helpers });
  const formatDateTimeValue = (value) => {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: state.timezoneValue || "UTC",
    }).format(date);
  };
  if (currentEntry) {
    return [
      renderPageIntro({
        title: "Journal",
        copy: "",
      }),
      "<section class=\"lite-panel page-frame\">",
      `<p><a href="${escapeHtml(buildAdminLocation({ path: "/admin/journals", theme, extra: { journalPage } }))}">Back to journals</a></p>`,
      "<article class=\"card journal-entry-full\">",
      `<p class="journal-date">${escapeHtml(formatDateTimeValue(currentEntry.createdAt))}</p>`,
      `<h2>${escapeHtml(currentEntry.title || "Journal entry")}</h2>`,
      `<div class="journal-prose">${renderJournalMarkdown(currentEntry.content, { escapeHtml })}</div>`,
      "<div class=\"toolbar\" style=\"margin-top:1rem\">",
      `<form method="post" action="/admin/actions/journal-delete"${renderConfirmOnSubmit("Delete this journal entry?\n\nThis removes it from the journal history Ghostlight can reflect on later.")}>`,
      withThemeField(theme),
      `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/journals", theme, extra: { journalPage } }))}">`,
      `<input type="hidden" name="journalPage" value="${escapeHtml(String(journalPage))}">`,
      `<input type="hidden" name="entryId" value="${escapeHtml(currentEntry.entryId)}">`,
      "<button type=\"submit\" class=\"secondary\">Delete Entry</button>",
      "</form>",
      "</div>",
      "</article>",
      "</section>",
    ].join("");
  }

  const journalCards = journalEntries.map((entry) => [
    "<article class=\"card journal-card\">",
    `<p class="journal-date">${escapeHtml(formatDateTimeValue(entry.createdAt))}</p>`,
    `<div class="journal-excerpt journal-preview-prose">${renderJournalMarkdownPreview(entry.content, { escapeHtml, maxLines: 3, maxLength: 220 })}</div>`,
    "<div class=\"toolbar\" style=\"margin-top:1rem\">",
    `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: `/admin/journals/${encodeURIComponent(entry.entryId)}`, theme, extra: { journalPage } }))}">Read Entry</a>`,
    `<form method="post" action="/admin/actions/journal-delete"${renderConfirmOnSubmit("Delete this journal entry?\n\nThis removes it from the journal history Ghostlight can reflect on later.")}>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/journals", theme, extra: { journalPage } }))}">`,
    `<input type="hidden" name="journalPage" value="${escapeHtml(String(journalPage))}">`,
    `<input type="hidden" name="entryId" value="${escapeHtml(entry.entryId)}">`,
    "<button type=\"submit\" class=\"secondary\">Delete Entry</button>",
    "</form>",
    "</div>",
    "</article>",
  ].join("")).join("");
  const previousJournalPage = journalPage > 1 ? journalPage - 1 : null;
  const nextJournalPage = journalPage < journalTotalPages ? journalPage + 1 : null;

  return [
    renderPageIntro({
      title: "Journal",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame\">",
    "<div class=\"panel-header\"><div><p>These are the journal entries your AI has written over time. If newer entries start sounding repetitive or drift strangely in tone, pruning older entries here can help keep the voice grounded.</p></div></div>",
    `<div class="journal-feed">${journalCards || "<p class=\"meta\">No journal entries yet.</p>"}</div>`,
    journalTotalPages > 1
      ? [
        "<div class=\"toolbar\" style=\"justify-content:center;margin-top:1rem\">",
        previousJournalPage
          ? `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/journals", theme, extra: { journalPage: previousJournalPage } }))}">Previous</a>`
          : "<span class=\"toolbar-button secondary is-disabled\" aria-disabled=\"true\">Previous</span>",
        `<span class="meta">Page ${escapeHtml(String(journalPage))} of ${escapeHtml(String(journalTotalPages))}</span>`,
        nextJournalPage
          ? `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/journals", theme, extra: { journalPage: nextJournalPage } }))}">Next</a>`
          : "<span class=\"toolbar-button secondary is-disabled\" aria-disabled=\"true\">Next</span>",
        "</div>",
      ].join("")
      : "",
    "</section>",
  ].join("");
}

module.exports = {
  renderSchedulesPage,
  renderJournalsPage,
};
