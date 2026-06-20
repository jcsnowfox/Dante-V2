const { renderFieldLabelWithHelp, renderPageIntro, renderSubnav } = require("./shared");
const {
  SUPPORTED_MODE_MEMORY_TYPES,
  SUPPORTED_MODE_MEMORY_SENSITIVITY,
  SUPPORTED_MODE_RETRIEVAL_ACCESS,
  SUPPORTED_MODE_RETRIEVAL_SOURCE,
} = require("../../storage/channelModes");

const MEMORY_TYPE_LABELS = Object.freeze({
  anchor: "Anchors",
  canon: "Canon",
  resolved: "Resolved",
  roleplay: "Roleplay",
  timeline: "Timeline",
});

function renderMemoryTypeToggles(selectedTypes = [], helpers) {
  const { escapeHtml } = helpers;
  const selected = new Set(Array.isArray(selectedTypes) && selectedTypes.length
    ? selectedTypes
    : ["anchor", "canon", "resolved", "timeline"]);

  return [
    "<div class=\"memory-chip-row\">",
    ...SUPPORTED_MODE_MEMORY_TYPES.map((type) => [
      "<label class=\"feature-toggle-pill mode-memory-pill\">",
      `<input type="checkbox" name="memoryTypes" value="${escapeHtml(type)}"${selected.has(type) ? " checked" : ""}>`,
      `<span>${escapeHtml(MEMORY_TYPE_LABELS[type] || type)}</span>`,
      "</label>",
    ].join("")),
    "</div>",
  ].join("");
}

function renderSensitivityScale(selectedValue = "high", helpers, idPrefix = "memorySensitivity") {
  const { escapeHtml } = helpers;
  const selected = SUPPORTED_MODE_MEMORY_SENSITIVITY.includes(selectedValue) ? selectedValue : "high";
  const labels = {
    low: "Low",
    medium: "Medium",
    high: "High",
  };

  return [
    `<div class="sensitivity-scale sensitivity-${escapeHtml(selected)}" role="radiogroup" aria-label="Memory sensitivity">`,
    ...SUPPORTED_MODE_MEMORY_SENSITIVITY.map((level) => (
      `<input id="${escapeHtml(`${idPrefix}-${level}`)}" type="radio" name="memorySensitivity" value="${escapeHtml(level)}"${level === selected ? " checked" : ""}>`
    )),
    ...SUPPORTED_MODE_MEMORY_SENSITIVITY.map((level) => (
      `<label for="${escapeHtml(`${idPrefix}-${level}`)}">${escapeHtml(labels[level] || level)}</label>`
    )),
    "</div>",
  ].join("");
}

function renderTimeContextOptions(selectedValue = "inherit", helpers) {
  const { escapeHtml } = helpers;
  const options = [
    { value: "inherit", label: "Use global setting" },
    { value: "on", label: "on" },
    { value: "off", label: "off" },
  ];

  return options.map((option) => (
    `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`
  )).join("");
}

function renderRetrievalSourceOptions(selectedValue = "off", helpers) {
  const { escapeHtml } = helpers;
  const selected = SUPPORTED_MODE_RETRIEVAL_SOURCE.includes(selectedValue) ? selectedValue : "off";
  const labels = {
    off: "No lookup",
    shared_safe: "Shared-Safe",
    personal: "Personal Only",
  };

  return SUPPORTED_MODE_RETRIEVAL_SOURCE.map((value) => (
    `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(labels[value] || value)}</option>`
  )).join("");
}

function renderRetrievalAccessOptions(selectedValue = "off", helpers) {
  const { escapeHtml } = helpers;
  const selected = SUPPORTED_MODE_RETRIEVAL_ACCESS.includes(selectedValue) ? selectedValue : "off";
  const labels = {
    off: "No lookup",
    shared_safe_only: "Shared-safe only",
    personal_only: "Personal only",
    global: "All allowed context",
  };

  return SUPPORTED_MODE_RETRIEVAL_ACCESS.map((value) => (
    `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(labels[value] || value)}</option>`
  )).join("");
}

function humanizeModeKey(modeKey = "") {
  return String(modeKey || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getModeDisplayLabel(mode = {}) {
  if (mode.modeKey === "shared_server") {
    return "Shared Servers";
  }
  return mode.label || humanizeModeKey(mode.modeKey) || "Untitled Mode";
}

function getTableTimeAwarenessLabel(value = "inherit") {
  const labels = {
    inherit: "global",
    on: "on",
    off: "off",
  };
  return labels[value] || "global";
}

function getTableRetrievalSourceLabel(value = "off") {
  const labels = {
    off: "Off",
    shared_safe: "Shared-safe",
    personal: "Personal",
  };
  return labels[value] || "Off";
}

function getTableRetrievalAccessLabel(value = "off") {
  const labels = {
    off: "Off",
    shared_safe_only: "Shared-safe",
    personal_only: "Personal",
    global: "All",
  };
  return labels[value] || "Off";
}

function getTableRecentChatLabel(mode = {}) {
  const sourceLabel = getTableRetrievalSourceLabel(mode.retrievalSource);
  const accessLabel = getTableRetrievalAccessLabel(mode.retrievalAccess);
  return sourceLabel === accessLabel ? sourceLabel : `${sourceLabel} &middot; ${accessLabel}`;
}

function getChannelTypeLabel(channelType) {
  const normalizedType = Number(channelType);

  if (normalizedType === 5) {
    return "Announcement";
  }

  if (normalizedType === 15) {
    return "Forum";
  }

  if (normalizedType === 16) {
    return "Media";
  }

  return "Text";
}

function getModeEditorId(modeKey = "new") {
  const safeKey = String(modeKey || "new").replace(/[^a-zA-Z0-9_-]+/g, "-") || "new";
  return `mode-editor-${safeKey}`;
}

function renderChannelModesLayout({ currentTab = "modes", tabBody = "", theme = "light", helpers }) {
  const tabs = [
    { key: "storage", label: "Backup & Storage", path: "/admin/admin/storage" },
    { key: "channelModes", label: "Channel Modes", path: "/admin/admin/channel-modes" },
    { key: "commands", label: "Commands", path: "/admin/admin/commands" },
  ];

  return [
    renderPageIntro({
      title: "Admin",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: currentTab, theme, helpers }),
    "</section>",
    tabBody,
  ].join("");
}

function renderChannelModesPage({
  modes = [],
  channelOptions = [],
  channelModeAssignments = [],
  selectedModeKey = "",
  theme = "light",
  helpers,
}) {
  const { escapeHtml, withThemeField, buildAdminLocation } = helpers;
  const renderConfirmOnSubmit = helpers.renderConfirmOnSubmit || ((message) => (
    ` onsubmit="return confirm(${escapeHtml(JSON.stringify(String(message || "")))})"`
  ));
  const editableModes = modes;
  const assignableModes = modes.filter((mode) => mode.modeKey !== "default");
  const selectedMode = editableModes.find((mode) => mode.modeKey === selectedModeKey) || null;
  const isNewMode = selectedModeKey === "new";
  const blankMode = {
    modeKey: "",
    label: "",
    instructions: "",
    chatModel: "",
    memoryTypes: ["anchor", "canon", "resolved", "timeline"],
    memorySensitivity: "high",
    includeTimeContext: "inherit",
    retrievalSource: "off",
    retrievalAccess: "off",
    heartbeatRole: "",
  };
  const renderModeEditor = ({ modeForForm, selectedMode: selectedEditorMode, editorId, hidden = true }) => {
    const fieldSuffix = editorId.replace(/^mode-editor-/, "") || "new";
    const modeLabelId = `modeLabel-${fieldSuffix}`;
    const chatModelId = `chatModel-${fieldSuffix}`;
    const includeTimeContextId = `includeTimeContext-${fieldSuffix}`;
    const retrievalSourceId = `retrievalSource-${fieldSuffix}`;
    const retrievalAccessId = `retrievalAccess-${fieldSuffix}`;
    const modeInstructionsId = `modeInstructions-${fieldSuffix}`;
    const sensitivityIdPrefix = `memorySensitivity-${fieldSuffix}`;
    const deleteFormId = `channelModeDeleteForm-${fieldSuffix}`;
    const canDelete = Boolean(selectedEditorMode && !selectedEditorMode.isBuiltin);
    const deleteConfirmMessage = [
      `Delete channel mode "${getModeDisplayLabel(modeForForm)}"?`,
      "",
      "Channels using this mode will fall back to the default mode. Built-in modes cannot be deleted.",
    ].join("\n");

    return [
      `<tr class="mode-editor-row" id="${escapeHtml(editorId)}" data-mode-editor-row${hidden ? " hidden" : ""}>`,
      "<td colspan=\"5\">",
      "<div class=\"settings-form mode-inline-editor\">",
      `<div class="copy-block mode-editor-heading"><h2>${selectedEditorMode ? "Edit Channel Mode" : "New Channel Mode"}</h2></div>`,
      "<form method=\"post\" action=\"/admin/actions/channel-mode-save\">",
      withThemeField(theme),
      "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/channel-modes\">",
      selectedEditorMode
        ? `<input type="hidden" name="modeKey" value="${escapeHtml(modeForForm.modeKey)}">`
        : "",
      "<div class=\"admin-inline-fields mode-editor-fields\">",
      `<div><label for="${escapeHtml(modeLabelId)}">Mode Name</label><input id="${escapeHtml(modeLabelId)}" name="label" type="text" value="${escapeHtml(modeForForm.label)}" placeholder="House Projects" required></div>`,
      `<div><label for="${escapeHtml(chatModelId)}">Model Override</label><input id="${escapeHtml(chatModelId)}" name="chatModel" type="text" value="${escapeHtml(modeForForm.chatModel || "")}" placeholder="Use default model"></div>`,
      `<div><label for="${escapeHtml(includeTimeContextId)}">Time Awareness</label><select id="${escapeHtml(includeTimeContextId)}" name="includeTimeContext">${renderTimeContextOptions(modeForForm.includeTimeContext || "inherit", helpers)}</select></div>`,
      "</div>",
      "<div class=\"admin-inline-fields mode-editor-fields\">",
      `<div>${renderFieldLabelWithHelp({ forId: retrievalSourceId, label: "Available to Lookup", help: "Can other sessions find recent messages from this channel?" }, helpers)}<select id="${escapeHtml(retrievalSourceId)}" name="retrievalSource">${renderRetrievalSourceOptions(modeForForm.retrievalSource || "off", helpers)}</select></div>`,
      `<div>${renderFieldLabelWithHelp({ forId: retrievalAccessId, label: "Lookup Access", help: "What recent chat context can this mode search?" }, helpers)}<select id="${escapeHtml(retrievalAccessId)}" name="retrievalAccess">${renderRetrievalAccessOptions(modeForForm.retrievalAccess || "off", helpers)}</select></div>`,
      "</div>",
      "<div class=\"mode-memory-grid\">",
      "<div>",
      "<label>Memory Access</label>",
      renderMemoryTypeToggles(modeForForm.memoryTypes, helpers),
      "</div>",
      "<div>",
      "<label>Memory Sensitivity</label>",
      renderSensitivityScale(modeForForm.memorySensitivity || "high", helpers, sensitivityIdPrefix),
      "</div>",
      "</div>",
      `<label for="${escapeHtml(modeInstructionsId)}">Instructions</label>`,
      `<textarea id="${escapeHtml(modeInstructionsId)}" name="instructions" placeholder="Provide additional instructions / prompting to guide your AI when this mode is active">${escapeHtml(modeForForm.instructions || "")}</textarea>`,
      "<div class=\"toolbar\">",
      `<button type="submit">${selectedEditorMode ? "Save Mode" : "Add Mode"}</button>`,
      `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/admin/channel-modes", theme }))}" data-mode-editor-cancel>Cancel</a>`,
      canDelete
        ? `<button type="submit" form="${escapeHtml(deleteFormId)}" class="toolbar-button danger">Delete Mode</button>`
        : "",
      "</div>",
      "</form>",
      canDelete
        ? [
          `<form id="${escapeHtml(deleteFormId)}" method="post" action="/admin/actions/channel-mode-delete"${renderConfirmOnSubmit(deleteConfirmMessage)}>`,
          withThemeField(theme),
          "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/channel-modes\">",
          `<input type="hidden" name="modeKey" value="${escapeHtml(modeForForm.modeKey)}">`,
          "</form>",
        ].join("")
        : "",
      "</div>",
      "</td>",
      "</tr>",
    ].join("");
  };
  const assignmentsByChannelId = new Map(
    (Array.isArray(channelModeAssignments) ? channelModeAssignments : [])
      .map((assignment) => [String(assignment.channelId || ""), assignment]),
  );
  const modeOptions = [
    { value: "", label: "Use default" },
    ...assignableModes.map((mode) => ({ value: mode.modeKey, label: getModeDisplayLabel(mode) })),
  ];
  const channelRows = Array.isArray(channelOptions) && channelOptions.length
    ? channelOptions.map((channel) => {
      const channelId = String(channel.value || "").trim();
      const assignment = assignmentsByChannelId.get(channelId);
      const rawAssignmentMode = String(assignment?.modeKey || "").trim();
      const selectedAssignmentMode = rawAssignmentMode === "default" ? "" : rawAssignmentMode;
      const options = modeOptions.map((option) => (
        `<option value="${escapeHtml(option.value)}"${option.value === selectedAssignmentMode ? " selected" : ""}>${escapeHtml(option.label)}</option>`
      )).join("");

      return [
        `<form method="post" action="/admin/actions/channel-mode-assignment-save" class="channel-mode-assignment-row" data-channel-mode-assignment-form>`,
        withThemeField(theme),
        "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/admin/channel-modes\">",
        "<input type=\"hidden\" name=\"responseMode\" value=\"json\">",
        `<input type="hidden" name="channelId" value="${escapeHtml(channelId)}">`,
        "<div class=\"channel-mode-assignment-label\">",
        `<strong>${escapeHtml(channel.label || channelId)}</strong>`,
        `<span class="badge">${escapeHtml(getChannelTypeLabel(channel.channelType))}</span>`,
        "</div>",
        "<div class=\"channel-mode-assignment-control\">",
        `<select name="modeKey" aria-label="Mode for ${escapeHtml(channel.label || channelId)}" data-channel-mode-select>${options}</select>`,
        "<span class=\"meta channel-mode-save-status\" data-channel-mode-save-status></span>",
        "</div>",
        "</form>",
      ].join("");
    })
    : ["<p class=\"meta\">No assignable Discord channels were found.</p>"];
  const modeRows = editableModes.length
    ? editableModes.map((mode) => {
      const editorId = getModeEditorId(mode.modeKey);
      const modeLocation = `${buildAdminLocation({ path: "/admin/admin/channel-modes", theme, extra: { mode: mode.modeKey } })}#${editorId}`;

      return [
        "<tr>",
        `<td data-label="Mode"><a href="${escapeHtml(modeLocation)}" data-mode-editor-trigger="${escapeHtml(editorId)}"><strong>${escapeHtml(getModeDisplayLabel(mode))}</strong></a></td>`,
        `<td data-label="Model">${escapeHtml(mode.chatModel || "Default")}</td>`,
        `<td data-label="Memory Sensitivity">${escapeHtml(mode.memorySensitivity || "high")}</td>`,
        `<td data-label="Recent Chat">${getTableRecentChatLabel(mode)}</td>`,
        `<td data-label="Time Awareness">${escapeHtml(getTableTimeAwarenessLabel(mode.includeTimeContext))}</td>`,
        "</tr>",
        renderModeEditor({
          modeForForm: mode,
          selectedMode: mode,
          editorId,
          hidden: selectedMode?.modeKey !== mode.modeKey,
        }),
      ].join("");
    })
    : ["<tr><td colspan=\"5\">No channel modes have been saved yet.</td></tr>"];
  const newModeEditorId = getModeEditorId("new");
  const newModeLocation = `${buildAdminLocation({ path: "/admin/admin/channel-modes", theme, extra: { mode: "new" } })}#${newModeEditorId}`;

  return renderChannelModesLayout({
    currentTab: "channelModes",
    theme,
    helpers,
    tabBody: [
      "<section class=\"lite-panel page-frame settings-form\">",
      "<div class=\"copy-block\"><h2>Channel Assignments</h2><p class=\"meta\">Assign modes to parent channels and forums. Threads and forum posts inherit from their parent unless you override them with the Discord command.</p></div>",
      "<div class=\"channel-mode-assignment-grid\">",
      ...channelRows,
      "</div>",
      "<script>",
      "(function(){",
      "const forms=Array.from(document.querySelectorAll('[data-channel-mode-assignment-form]'));",
      "for(const form of forms){",
      "const select=form.querySelector('[data-channel-mode-select]');",
      "const status=form.querySelector('[data-channel-mode-save-status]');",
      "if(!select){continue;}",
      "const setStatus=(text,failed=false)=>{if(status){status.textContent=text;status.classList.toggle('action-health-warning',failed);}};",
      "select.addEventListener('change',async()=>{",
      "setStatus('Saving...');",
      "try{",
      "const response=await fetch(form.action,{method:'POST',headers:{Accept:'application/json'},body:new URLSearchParams(new FormData(form))});",
      "const payload=await response.json().catch(()=>({}));",
      "if(!response.ok||payload.ok===false){throw new Error(payload.error||'Save failed');}",
      "setStatus('');",
      "}catch(error){setStatus(error.message||'Save failed',true);}",
      "});",
      "}",
      "})();",
      "</script>",
      "</section>",
      "<section class=\"lite-panel page-frame\">",
      "<div class=\"copy-block\"><h2>Saved Modes</h2></div>",
      "<div class=\"model-table-wrap\"><table class=\"model-table\">",
      "<thead><tr><th>Mode</th><th>Model</th><th>Memory Sensitivity</th><th>Recent Chat</th><th>Time Awareness</th></tr></thead>",
      "<tbody>",
      ...modeRows,
      "</tbody></table></div>",
      "<div class=\"toolbar\" style=\"margin-top:1rem\">",
      `<a class="toolbar-button secondary" href="${escapeHtml(newModeLocation)}" data-mode-editor-trigger="${escapeHtml(newModeEditorId)}">New Mode</a>`,
      "</div>",
      "<div class=\"model-table-wrap\"><table class=\"model-table\"><tbody>",
      renderModeEditor({
        modeForForm: blankMode,
        selectedMode: null,
        editorId: newModeEditorId,
        hidden: !isNewMode,
      }),
      "</tbody></table></div>",
      "<script>",
      "(function(){",
      `const baseLocation=${JSON.stringify(buildAdminLocation({ path: "/admin/admin/channel-modes", theme }))};`,
      "const rows=Array.from(document.querySelectorAll('[data-mode-editor-row]'));",
      "const openRow=(row)=>{for(const item of rows){item.hidden=item!==row;}if(row){row.hidden=false;row.scrollIntoView({block:'nearest'});}};",
      "const closeRows=()=>{for(const row of rows){row.hidden=true;}};",
      "for(const trigger of document.querySelectorAll('[data-mode-editor-trigger]')){",
      "trigger.addEventListener('click',(event)=>{",
      "const row=document.getElementById(trigger.getAttribute('data-mode-editor-trigger'));",
      "if(!row){return;}",
      "event.preventDefault();",
      "if(row.hidden){openRow(row);window.history.replaceState(null,'',trigger.href);}else{closeRows();window.history.replaceState(null,'',baseLocation);}",
      "});",
      "}",
      "for(const cancel of document.querySelectorAll('[data-mode-editor-cancel]')){",
      "cancel.addEventListener('click',(event)=>{event.preventDefault();closeRows();window.history.replaceState(null,'',cancel.href);});",
      "}",
      "if(window.location.hash){",
      "const row=document.getElementById(window.location.hash.slice(1));",
      "if(row){openRow(row);}",
      "}",
      "})();",
      "</script>",
      "</section>",
    ].join(""),
  });
}

module.exports = {
  renderChannelModesLayout,
  renderChannelModesPage,
};
