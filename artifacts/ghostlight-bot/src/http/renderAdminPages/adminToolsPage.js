const {
  getRuntimeState,
  renderHelpIcon,
  renderPageIntro,
  renderSubnav,
} = require("./shared");

function renderAdminFilePicker({ id, name = "file", label = "Choose file", emptyLabel = "No file selected", accept = "application/json,.json", required = true, ariaLabel = "" }) {
  return [
    "<div class=\"file-picker-row admin-file-picker-row\">",
    `<label class="toolbar-button secondary file-picker-button" for="${id}">${label}</label>`,
    `<span class="file-picker-label" data-file-picker-label="${id}">${emptyLabel}</span>`,
    `<input id="${id}" name="${name}" type="file" accept="${accept}"${required ? " required" : ""}${ariaLabel ? ` aria-label="${ariaLabel}"` : ""} class="file-picker-input">`,
    "</div>",
  ].join("");
}

function buildConversationCleanupReturnTo(query = {}) {
  const params = new URLSearchParams();

  if (query.startDate) {
    params.set("conversationStart", query.startDate);
  }

  if (query.endDate) {
    params.set("conversationEnd", query.endDate);
  }

  if (query.limit) {
    params.set("conversationLimit", String(query.limit));
  }

  const suffix = params.toString();
  return suffix ? `/admin/admin/storage?${suffix}` : "/admin/admin/storage";
}

function getConversationChannelLabel(conversation = {}) {
  if (conversation.threadId) {
    return conversation.parentChannelName || conversation.parentChannelId || conversation.channelName || conversation.channelId || "-";
  }

  return conversation.channelName || conversation.channelId || "-";
}

function renderConversationCleanupRows({ conversations = [], theme = "light", query = {}, helpers }) {
  const { escapeHtml, formatDateValue, renderConfirmOnSubmit, withThemeField } = helpers;
  const returnTo = buildConversationCleanupReturnTo(query);

  if (!conversations.length) {
    return ["<tr><td colspan=\"5\">No stored conversations found for this filter.</td></tr>"];
  }

  return conversations.map((conversation) => {
    const label = conversation.threadName || conversation.threadId || conversation.channelName || conversation.channelId || conversation.conversationId;
    const confirmMessage = [
      "Delete stored chat for this conversation?",
      "",
      "This removes Ghostlight's saved history for this thread or channel. It will not delete Discord messages or approved memories.",
    ].join("\n");

    return [
      "<tr>",
      `<td data-label="Conversation"><strong>${escapeHtml(label)}</strong></td>`,
      `<td data-label="Channel">${escapeHtml(getConversationChannelLabel(conversation))}</td>`,
      `<td data-label="Messages">${escapeHtml(String(conversation.messageEventCount || 0))}</td>`,
      `<td data-label="Dates">${escapeHtml(formatDateValue(conversation.firstEventAt))}<br><span class="meta">${escapeHtml(formatDateValue(conversation.lastEventAt))}</span></td>`,
      "<td data-label=\"Action\">",
      `<form method="post" action="/admin/actions/conversation-delete" class="inline-form"${renderConfirmOnSubmit(confirmMessage)}>`,
      withThemeField(theme),
      `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
      `<input type="hidden" name="conversationId" value="${escapeHtml(conversation.conversationId)}">`,
      "<button type=\"submit\" class=\"toolbar-button secondary\">Delete Stored Chat</button>",
      "</form>",
      "</td>",
      "</tr>",
    ].join("");
  });
}

function renderConversationCleanupFilters({ query = {}, theme = "light", helpers }) {
  const { escapeHtml, withThemeField, renderOptions } = helpers;

  return [
    "<form method=\"get\" action=\"/admin/admin/storage\" class=\"toolbar cleanup-filter-row\">",
    withThemeField(theme),
    "<div class=\"toolbar-field\"><label for=\"conversationStart\">From</label>",
    `<input id="conversationStart" name="conversationStart" type="date" value="${escapeHtml(query.startDate || "")}"></div>`,
    "<div class=\"toolbar-field\"><label for=\"conversationEnd\">To</label>",
    `<input id="conversationEnd" name="conversationEnd" type="date" value="${escapeHtml(query.endDate || "")}"></div>`,
    "<div class=\"toolbar-field select\"><label for=\"conversationLimit\">Results</label>",
    `<select id="conversationLimit" name="conversationLimit">${renderOptions(["5", "25", "50", "100", "250"], String(query.limit || 5))}</select></div>`,
    "<button type=\"submit\" class=\"toolbar-button secondary\">Apply</button>",
    `<a class="toolbar-button secondary" href="${escapeHtml(`/admin/admin/storage?theme=${encodeURIComponent(theme)}`)}">Clear</a>`,
    "</form>",
  ].join("");
}

function renderAdminToolsPage({ config, conversationStorage = null, currentTab = "storage", theme = "light", query = {}, helpers }) {
  const { escapeHtml, buildAdminLocation, formatDateValue, formatBytes, renderConfirmOnSubmit, withThemeField, renderOptions } = helpers;
  const state = getRuntimeState({ config, conversationStorage, helpers });
  const exportLocation = buildAdminLocation({ path: "/admin/exports/memories", theme });
  const appStateExportLocation = buildAdminLocation({ path: "/admin/exports/app-state", theme });
  const chatEventsExportLocation = buildAdminLocation({ path: "/admin/exports/conversation-events.csv", theme });
  const conversationLogsExportLocation = buildAdminLocation({ path: "/admin/exports/conversation-logs", theme });
  const pruneOptions = renderOptions(["30", "60", "90", "180"], "90");
  const conversationCount = Number.isFinite(Number(state.storage.conversationCount))
    ? Number(state.storage.conversationCount)
    : (state.storage.recentConversations || []).length;
  const conversationCleanupRows = renderConversationCleanupRows({
    conversations: state.storage.recentConversations || [],
    theme,
    query,
    helpers,
  });
  const tabs = [
    { key: "storage", label: "Backup & Storage", path: "/admin/admin/storage" },
    { key: "channelModes", label: "Channel Modes", path: "/admin/admin/channel-modes" },
    { key: "commands", label: "Commands", path: "/admin/admin/commands" },
  ];
  const tab = currentTab === "commands" ? "commands" : "storage";
  const tabBody = tab === "commands"
    ? [
      "<section class=\"lite-panel page-frame settings-form\">",
      "<div class=\"copy-block\"><h2>Discord Commands</h2>",
      "<p class=\"meta\">Refresh the slash commands Ghostlight shows in Discord. Use this after an update, a fresh install, or any command changes.</p></div>",
      "<form method=\"post\" action=\"/admin/actions/register-commands\" class=\"inline-form\">",
      withThemeField(theme),
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/commands\">",
      "<button type=\"submit\" class=\"toolbar-button secondary\">Refresh Discord Commands</button>",
      "</form>",
      "<div class=\"form-divider\"></div>",
      "<div class=\"copy-block\"><h2>External Shared Servers</h2>",
      "<p class=\"meta\">Allow your AI to reply in Discord servers outside your home server. External replies always use the safer Shared Server mode.</p></div>",
      "<form method=\"post\" action=\"/admin/actions/settings-save\" class=\"inline-form\">",
      withThemeField(theme),
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/commands\">",
      "<input type=\"hidden\" name=\"externalSharedModeKey\" value=\"shared_server\">",
      "<label class=\"switch-field image-settings-toggle\">",
      "<input type=\"hidden\" name=\"externalSharedModeEnabled\" value=\"false\">",
      "<span class=\"switch-control\">",
      `<input type="checkbox" name="externalSharedModeEnabled" value="true"${state.externalSharedModeEnabled ? " checked" : ""}>`,
      "<span></span>",
      "</span>",
      "<span class=\"switch-label\">Allow replies in external shared servers</span>",
      "</label>",
      "<div class=\"toolbar command-save-row\"><button type=\"submit\" class=\"toolbar-button secondary\">Save Shared Server Setting</button></div>",
      "</form>",
      "<div class=\"form-divider\"></div>",
      "<div class=\"copy-block\"><h2>Rebuild Memory Index</h2>",
      "<p class=\"meta\">Recreate the searchable memory index from your active saved memories. Useful if memory search seems out of sync after imports, edits, changing embedding models, or maintenance.</p></div>",
      `<form method="post" action="/admin/actions/memory-rebuild" class="inline-form"${renderConfirmOnSubmit("Rebuild the Qdrant memory index?\n\nThis deletes the current Qdrant collection and recreates it from active durable memories in Postgres using the current embeddings model.")}>`,
      withThemeField(theme),
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/commands\">",
      "<button type=\"submit\" class=\"toolbar-button secondary\">Rebuild Memory Index</button>",
      "</form>",
      "</section>",
    ].join("")
    : [
      "<section class=\"lite-panel page-frame settings-form\">",
      "<div class=\"copy-block\"><h2>Backups &amp; Exports</h2>",
      "<p class=\"meta\">Save copies of your Ghostlight data, or import a previous backup.</p></div>",
      `<div class="copy-block"><h3>Memories ${renderHelpIcon({ help: "Includes saved memories and memory metadata. Does not include Discord messages or stored chat history." }, helpers)}</h3><p class="meta">Import or export your saved memory library.</p></div>`,
      "<form method=\"post\" action=\"/admin/actions/memory-import\" enctype=\"multipart/form-data\" class=\"toolbar backup-action-row\">",
      withThemeField(theme),
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/storage\">",
      renderAdminFilePicker({
        id: "memoryImportFile",
        ariaLabel: "Import memories JSON",
      }),
      "<button type=\"submit\" class=\"toolbar-button secondary\">Import Memories</button>",
      `<a class="toolbar-button secondary" href="${escapeHtml(exportLocation)}">Export Memories</a>`,
      "</form>",
      `<div class="copy-block"><h3>App Settings ${renderHelpIcon({ help: "Includes settings such as schedules, channel modes, prompts, and admin configuration. Does not include memories or chat logs." }, helpers)}</h3><p class="meta">Import or export your Ghostlight settings and configuration.</p></div>`,
      "<form method=\"post\" action=\"/admin/actions/app-state-import\" enctype=\"multipart/form-data\" class=\"toolbar backup-action-row\">",
      withThemeField(theme),
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/storage\">",
      renderAdminFilePicker({
        id: "appStateImportFile",
        ariaLabel: "Import app settings JSON",
      }),
      "<button type=\"submit\" class=\"toolbar-button secondary\">Import App Settings</button>",
      `<a class="toolbar-button secondary" href="${escapeHtml(appStateExportLocation)}">Export App Settings</a>`,
      "</form>",
      "<script>",
      "(()=>{",
      "document.querySelectorAll('.admin-file-picker-row .file-picker-input').forEach((fileInput)=>{",
      "const fileLabel=document.querySelector(`[data-file-picker-label=\"${fileInput.id}\"]`);",
      "fileInput.addEventListener('change',()=>{",
      "if(!fileLabel){return;}",
      "const count=fileInput.files?.length||0;",
      "fileLabel.textContent=count?(count===1?fileInput.files[0].name:`${count} files selected`):'No file selected';",
      "});",
      "});",
      "})();",
      "</script>",
      "<div class=\"form-divider\"></div>",
      `<div class="copy-block"><h2>Stored Chat ${renderHelpIcon({ help: "This is Ghostlight's internal conversation history. Exporting doesn't affect your live Discord messages." }, helpers)}</h2>`,
      "<p class=\"meta\">Ghostlight saves chat history for recent context, summaries, and memory generation.</p></div>",
      "<div class=\"toolbar\" style=\"justify-content:space-between;margin-bottom:1rem\">",
      "<div class=\"toolbar-group\">",
      `<a class="toolbar-button secondary" href="${escapeHtml(chatEventsExportLocation)}">Export Chat CSV</a>`,
      `<a class="toolbar-button secondary" href="${escapeHtml(conversationLogsExportLocation)}">Export Readable Logs</a>`,
      "</div>",
      "</div>",
      "<div class=\"model-table-wrap\"><table class=\"model-table\">",
      "<thead><tr><th>Stored Events</th><th>Messages</th><th>Oldest Chat</th><th>Newest Chat</th><th>Conversations</th><th>Database Size</th></tr></thead>",
      "<tbody><tr>",
      `<td data-label="Stored Events">${escapeHtml(String(state.storage.eventCount || 0))}</td>`,
      `<td data-label="Messages">${escapeHtml(String(state.storage.messageEventCount || 0))}</td>`,
      `<td data-label="Oldest Chat">${escapeHtml(formatDateValue(state.storage.oldestEventAt))}</td>`,
      `<td data-label="Newest Chat">${escapeHtml(formatDateValue(state.storage.newestEventAt))}</td>`,
      `<td data-label="Conversations">${escapeHtml(String(conversationCount))}</td>`,
      `<td data-label="Database Size">${escapeHtml(formatBytes(state.storage.databaseBytes))}</td>`,
      "</tr></tbody></table></div>",
      `<div class="copy-block section-offset"><h2>Cleanup ${renderHelpIcon({ help: "Remove stored chat history from Ghostlight. This does not delete messages from Discord or memories." }, helpers)}</h2></div>`,
      `<div class="copy-block"><h3>Clean Up Specific Conversations ${renderHelpIcon({ help: "Delete stored chat history for one thread or channel." }, helpers)}</h3></div>`,
      renderConversationCleanupFilters({ query, theme, helpers }),
      "<div class=\"model-table-wrap\"><table class=\"model-table\">",
      "<thead><tr><th>Conversation</th><th>Channel</th><th>Messages</th><th>Dates</th><th>Action</th></tr></thead>",
      "<tbody>",
      ...conversationCleanupRows,
      "</tbody></table></div>",
      `<div class="copy-block section-offset"><h3>Prune Old Stored Chat ${renderHelpIcon({ help: "Bulk-delete stored chat history older than a chosen age. Useful for keeping storage under control. This does not delete Discord messages." }, helpers)}</h3></div>`,
      `<form method="post" action="/admin/actions/conversation-prune" class="toolbar prune-action-row"${renderConfirmOnSubmit("Delete old stored chat?\n\nThis removes Ghostlight's saved chat history older than the selected age. It will not delete Discord messages or approved memories.")}>`,
      withThemeField(theme),
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/storage\">",
      "<label for=\"conversationPruneDays\">Delete stored chat older than:</label>",
      `<select id="conversationPruneDays" name="olderThanDays">${pruneOptions}</select>`,
      "<button type=\"submit\" class=\"toolbar-button secondary\">Delete Old Chat</button>",
      "</form>",
      "</section>",
    ].join("");

  return [
    renderPageIntro({
      title: "Admin",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: tab, theme, helpers }),
    "</section>",
    tabBody,
  ].join("");
}

module.exports = {
  renderAdminToolsPage,
};
