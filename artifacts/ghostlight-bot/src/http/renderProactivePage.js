function getToolIconKind(toolName) {
  if (toolName === "gif_search") {
    return "gif";
  }

  if (toolName === "web_search") {
    return "web_search";
  }

  if (toolName === "generate_image") {
    return "images";
  }

  if (toolName === "generate_audio") {
    return "audio";
  }

  if (toolName === "spotify" || toolName === "spotify_curation") {
    return "playlist";
  }

  if (toolName === "spotify_playback") {
    return "music";
  }

  return "automation";
}

function getFeatureIconKind(featureName) {
  if (featureName === "mention_user") {
    return "mention_user";
  }

  return getToolIconKind(featureName);
}

function renderToolToggle({ toolName, label, checked, theme, renderIconImage, escapeHtml }) {
  const inputId = `tool-${toolName}`;

  return [
    `<label class="feature-toggle-pill" for="${escapeHtml(inputId)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">`,
    `<input id="${escapeHtml(inputId)}" type="checkbox" name="enabledTools" value="${escapeHtml(toolName)}"${checked ? " checked" : ""}>`,
    `<span class="feature-toggle-pill-icon" aria-hidden="true">${renderIconImage(getToolIconKind(toolName), theme, "", "home-feature-icon-image")}</span>`,
    `<span class="feature-toggle-pill-label">${escapeHtml(label)}</span>`,
    "</label>",
  ].join("");
}

function renderToolIcons({ enabledTools = [], mentionUser = false, theme, renderIconImage, escapeHtml }) {
  const features = [
    ...enabledTools,
    ...(mentionUser ? ["mention_user"] : []),
  ];

  if (!features.length) {
    return "—";
  }

  return [
    "<div class=\"tool-icon-row\">",
    ...features.map((featureName) => {
      const label = featureName === "gif_search"
        ? "GIF Search"
        : featureName === "web_search"
          ? "Web Search"
          : featureName === "generate_image"
            ? "Image Gen"
            : featureName === "mention_user"
              ? "Mention User"
              : featureName === "generate_audio"
                ? "Audio Gen"
                : featureName === "spotify"
                  ? "Spotify"
                  : featureName === "spotify_curation"
                    ? "Spotify Curation"
                    : featureName === "spotify_playback"
                      ? "Spotify Playback"
              : featureName;

      return `<span class="tool-icon-badge" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${renderIconImage(getFeatureIconKind(featureName), theme, "", "home-feature-icon-image")}</span>`;
    }),
    "</div>",
  ].join("");
}

function renderProactivePage({
  automations = [],
  editingAutomation = null,
  theme = "light",
  currentPath = "/admin/schedules",
  dailyThreadEnabled = true,
  query = {},
  helpers,
}) {
  const {
    escapeHtml,
    buildAdminLocation,
    renderIconImage,
    renderConfirmOnSubmit,
    withThemeField,
    targetOptions = [],
    targetLabelsByValue = new Map(),
  } = helpers;
  const renderOptions = (options, selectedValue) => options
    .map((option) => `<option value="${escapeHtml(option)}"${option === selectedValue ? " selected" : ""}>${escapeHtml(option)}</option>`)
    .join("");

  const toolLabelMap = {
    gif_search: "GIF Search",
    web_search: "Web Search",
    generate_image: "Image Gen",
    generate_audio: "Audio Gen",
    spotify: "Spotify",
    spotify_curation: "Spotify Curation",
    spotify_playback: "Spotify Playback",
  };
  const renderTargetValue = (target) => {
    const rawTarget = String(target || "").trim();

    if (!rawTarget) {
      return "—";
    }

    const resolvedLabel = targetLabelsByValue.get(rawTarget);

    if (!resolvedLabel || resolvedLabel === rawTarget) {
      return escapeHtml(rawTarget);
    }

    return `${escapeHtml(resolvedLabel)} <span class="meta target-meta">${escapeHtml(rawTarget)}</span>`;
  };
  const selectedScheduleMode = editingAutomation?.scheduleMode || "daily";
  const showScheduleDay = selectedScheduleMode === "weekly";
  const showInactive = query.showInactive === true;
  const sortValue = String(query.sort || "name").trim();
  const directionValue = String(query.direction || "asc").trim().toLowerCase() === "desc" ? "desc" : "asc";
  const selectedTarget = String(editingAutomation?.target || "").trim();
  const normalizedTargetOptions = Array.isArray(targetOptions) ? targetOptions : [];
  const adjustedTargetOptions = normalizedTargetOptions.map((option) => {
    if (String(option?.value || "").trim() !== "daily") {
      return option;
    }

    return {
      ...option,
      label: dailyThreadEnabled ? option.label : "Current daily thread (Daily threads deactivated)",
    };
  });
  const renderTargetOption = (option) => {
    const channelType = option?.channelType === undefined ? "" : String(option.channelType);

    return `<option value="${escapeHtml(option.value)}"${channelType ? ` data-channel-type="${escapeHtml(channelType)}"` : ""}${option.value === selectedTarget ? " selected" : ""}>${escapeHtml(option.label)}</option>`;
  };
  const targetOptionMarkup = [
    '<option value="">Choose target</option>',
    ...adjustedTargetOptions.map(renderTargetOption),
  ].join("");
  function buildSortLink(nextSortKey) {
    const nextDirection = sortValue === nextSortKey && directionValue === "asc" ? "desc" : "asc";

    return buildAdminLocation({
      path: currentPath,
      theme,
      extra: {
        automation: editingAutomation?.actionId || "",
        showInactive: showInactive ? "true" : "",
        sort: nextSortKey,
        direction: nextDirection,
      },
    });
  }

  function renderSortableHeader(label, key) {
    const isActive = sortValue === key;
    const marker = isActive ? (directionValue === "asc" ? " ↑" : " ↓") : "";

    return `<a class="sort-link" href="${escapeHtml(buildSortLink(key))}">${escapeHtml(label + marker)}</a>`;
  }

  const actionRows = automations.map((action) => [
    "<tr>",
    `<td data-label="Select" class="action-select-cell"><input type="checkbox" name="actionIds" value="${escapeHtml(action.actionId)}" form="schedulePackExportForm" aria-label="Select ${escapeHtml(action.name)} for export"></td>`,
    `<td data-label="Name"><a href="${escapeHtml(buildAdminLocation({ path: currentPath, theme, extra: { automation: action.actionId } }))}">${escapeHtml(action.name)}</a></td>`,
    `<td data-label="Action Type">${escapeHtml(action.actionType)}</td>`,
    `<td data-label="Target">${renderTargetValue(action.target)}</td>`,
    `<td data-label="Tools">${renderToolIcons({ enabledTools: action.enabledTools || [], mentionUser: Boolean(action.mentionUser), theme, renderIconImage, escapeHtml })}</td>`,
    `<td data-label="Runs">${escapeHtml(action.scheduleMode === "weekly" ? `Weekly · ${action.scheduleDay}` : "Daily")}</td>`,
    `<td data-label="Time">${escapeHtml(action.scheduleTime || "—")}</td>`,
    `<td data-label="Status">${action.enabled ? "On" : "Off"}</td>`,
    "<td data-label=\"Actions\" class=\"actions-col\"><div class=\"row-actions\">",
    `<a class="icon-button" href="${escapeHtml(buildAdminLocation({ path: currentPath, theme, extra: { automation: action.actionId } }))}" aria-label="Edit schedule" title="Edit schedule">${renderIconImage("edit", theme, "Edit", "table-action-icon")}</a>`,
    `<form method="post" action="/admin/actions/automation-toggle">`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    `<input type="hidden" name="actionId" value="${escapeHtml(action.actionId)}">`,
    `<button type="submit" class="icon-button" aria-label="${escapeHtml(action.enabled ? "Turn off schedule" : "Turn on schedule")}" title="${escapeHtml(action.enabled ? "Turn off schedule" : "Turn on schedule")}">${renderIconImage(action.enabled ? "pause" : "play", theme, "", "table-action-icon")}</button>`,
    "</form>",
    `<form method="post" action="/admin/actions/automation-delete"${renderConfirmOnSubmit("Delete this schedule?\n\nThis removes the proactive action from Ghostlight. You can recreate it later if needed.")}>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    `<input type="hidden" name="actionId" value="${escapeHtml(action.actionId)}">`,
    `<button type="submit" class="icon-button" aria-label="Delete schedule" title="Delete schedule">${renderIconImage("delete", theme, "", "table-action-icon")}</button>`,
    "</form>",
    "</div></td>",
    "</tr>",
  ].join("")).join("");

  const selectedTools = new Set((editingAutomation?.enabledTools || []).map((item) => String(item || "").trim().toLowerCase()));

  return [
    "<section class=\"lite-panel proactive-shell flat\">",
    "<section class=\"settings-block proactive-form\">",
    `<h3>${editingAutomation ? "Edit Schedule" : "Add Schedule"}</h3>`,
    "<form method=\"post\" action=\"/admin/actions/automation-save\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    editingAutomation ? `<input type="hidden" name="actionId" value="${escapeHtml(editingAutomation.actionId)}">` : "",
    "<div class=\"schedule-inline-fields schedule-inline-fields-triple\">",
    `<div><label for="scheduleName">Name</label><input id="scheduleName" name="name" type="text" required value="${escapeHtml(editingAutomation?.name || "")}" placeholder="Morning check-in"></div>`,
    `<div><label for="scheduleActionType">Action Type</label><select id="scheduleActionType" name="actionType">${renderOptions(["message", "thread", "journal"], editingAutomation?.actionType || "message")}</select></div>`,
    `<div><label for="scheduleTarget">Pick Target</label><select id="scheduleTarget" name="target" required>${targetOptionMarkup}</select></div>`,
    "</div>",
    "<div class=\"schedule-inline-fields schedule-inline-fields-triple\">",
    `<div><label for="scheduleMode">Runs</label><select id="scheduleMode" name="scheduleMode">${renderOptions(["daily", "weekly"], editingAutomation?.scheduleMode || "daily")}</select></div>`,
    `<div><label for="scheduleTime">Time</label><input id="scheduleTime" name="scheduleTime" type="time" required value="${escapeHtml(editingAutomation?.scheduleTime || "21:00")}"></div>`,
    `<div id="scheduleDayField"${showScheduleDay ? "" : " hidden"}><label for="scheduleDay">Day</label><select id="scheduleDay" name="scheduleDay">${renderOptions(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], editingAutomation?.scheduleDay || "monday")}</select></div>`,
    "</div>",
    "<div><label>Tools</label><div class=\"home-feature-row\" style=\"justify-content:flex-start;gap:.75rem;flex-wrap:wrap;margin-top:.45rem\">",
    renderToolToggle({ toolName: "gif_search", label: "GIF Search", checked: selectedTools.has("gif_search"), theme, renderIconImage, escapeHtml }),
    renderToolToggle({ toolName: "web_search", label: "Web Search", checked: selectedTools.has("web_search"), theme, renderIconImage, escapeHtml }),
    renderToolToggle({ toolName: "generate_image", label: "Image Gen", checked: selectedTools.has("generate_image"), theme, renderIconImage, escapeHtml }),
    renderToolToggle({ toolName: "generate_audio", label: "Audio Gen", checked: selectedTools.has("generate_audio"), theme, renderIconImage, escapeHtml }),
    renderToolToggle({ toolName: "spotify_curation", label: "Spotify Curation", checked: selectedTools.has("spotify_curation") || selectedTools.has("spotify"), theme, renderIconImage, escapeHtml }),
    renderToolToggle({ toolName: "spotify_playback", label: "Spotify Playback", checked: selectedTools.has("spotify_playback"), theme, renderIconImage, escapeHtml }),
    "<label class=\"feature-toggle-pill\" title=\"Mention User\" aria-label=\"Mention User\">",
    `<input type="checkbox" name="mentionUser"${editingAutomation?.mentionUser ? " checked" : ""}>`,
    `<span class="feature-toggle-pill-icon" aria-hidden="true">${renderIconImage("mention_user", theme, "", "home-feature-icon-image")}</span>`,
    "<span class=\"feature-toggle-pill-label\">Mention User</span>",
    "</label>",
    "</div>",
    "<label for=\"schedulePrompt\">Prompt</label>",
    `<textarea id="schedulePrompt" name="prompt" placeholder="Tell Ghostlight what you want this action to do.">${escapeHtml(editingAutomation?.prompt || "")}</textarea>`,
    "<div class=\"schedule-status-row\">",
    "<div class=\"schedule-status-actions\">",
    "<div class=\"segmented-control\" aria-label=\"Schedule status\">",
    `<input type="radio" id="scheduleStateEnabled" name="enabledState" value="enabled"${editingAutomation?.enabled === false ? "" : " checked"}>`,
    "<label for=\"scheduleStateEnabled\">On</label>",
    `<input type="radio" id="scheduleStatePaused" name="enabledState" value="paused"${editingAutomation?.enabled === false ? " checked" : ""}>`,
    "<label for=\"scheduleStatePaused\">Off</label>",
    "</div>",
    "</div>",
    "<div class=\"schedule-status-actions\">",
    `<button type="submit">${editingAutomation ? "Save Schedule" : "Add Schedule"}</button>`,
    editingAutomation ? `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({ path: currentPath, theme }))}">Cancel</a>` : "",
    "</div>",
    "</div>",
    "</form>",
    "<script>",
    "(function(){",
    "const modeField=document.getElementById('scheduleMode');",
    "const dayField=document.getElementById('scheduleDayField');",
    "if(modeField&&dayField){",
    "const syncDayVisibility=()=>{dayField.hidden=modeField.value!=='weekly';};",
    "modeField.addEventListener('change',syncDayVisibility);",
    "syncDayVisibility();",
    "}",
    "const typeField=document.getElementById('scheduleActionType');",
    "const targetField=document.getElementById('scheduleTarget');",
    "const forumTypes=new Set(['15','16']);",
    "const syncForumTargets=()=>{",
    "if(!typeField||!targetField){return;}",
    "const allowForum=typeField.value==='thread';",
    "for(const option of targetField.options){",
    "const isForum=forumTypes.has(option.dataset.channelType||'');",
    "option.hidden=isForum&&!allowForum;",
    "option.disabled=isForum&&!allowForum;",
    "}",
    "};",
    "if(typeField&&targetField){typeField.addEventListener('change',syncForumTargets);syncForumTargets();}",
    "})();",
    "</script>",
    "</section>",
    "<div class=\"form-divider\"></div>",
    "<section class=\"settings-block\">",
    `<form method="get" action="${escapeHtml(currentPath)}" class="toolbar-row filters proactive-filter-row">`,
    `<input type="hidden" name="theme" value="${escapeHtml(theme)}">`,
    `<input type="hidden" name="sort" value="${escapeHtml(sortValue)}">`,
    `<input type="hidden" name="direction" value="${escapeHtml(directionValue)}">`,
    editingAutomation ? `<input type="hidden" name="automation" value="${escapeHtml(editingAutomation.actionId)}">` : "",
    "<div class=\"toolbar-group\">",
    "<div class=\"memory-archive-toggle\">",
    "<label for=\"scheduleInactiveToggle\">Show Inactive Actions</label>",
    "<div class=\"switch-field\"><label class=\"switch-control\">",
    `<input id="scheduleInactiveToggle" type="checkbox" name="showInactive" value="true"${showInactive ? " checked" : ""}><span></span>`,
    "</label></div>",
    "</div>",
    "<button type=\"submit\" class=\"secondary\">Apply</button>",
    `<a class="toolbar-button secondary" href="${escapeHtml(buildAdminLocation({ path: currentPath, theme }))}">Clear</a>`,
    "</div>",
    "</form>",
    "<div class=\"memory-table-wrap\">",
    "<table class=\"memory-table\">",
    `<thead><tr><th>Select</th><th>${renderSortableHeader("Name", "name")}</th><th>${renderSortableHeader("Action Type", "type")}</th><th>Target</th><th>Tools</th><th>${renderSortableHeader("Runs", "runs")}</th><th>${renderSortableHeader("Time", "time")}</th><th>${renderSortableHeader("Status", "status")}</th><th class="actions-col">Actions</th></tr></thead>`,
    `<tbody>${actionRows || "<tr><td colspan=\"9\" class=\"empty-state\">No schedules yet. Add one to get the proactive system moving.</td></tr>"}</tbody>`,
    "</table>",
    "</div>",
    "</section>",
    "<div class=\"form-divider\"></div>",
    "<section class=\"settings-block proactive-pack-block\">",
    "<div><h3>Action Packs</h3><p>Export selected schedules as a shareable JSON pack, or import a pack here. Imported actions are added as new schedules and default to off.</p></div>",
    "<div class=\"proactive-pack-inline-row proactive-pack-toolbar-row\">",
    "<form id=\"schedulePackExportForm\" method=\"post\" action=\"/admin/exports/proactive-pack\" class=\"proactive-pack-inline-form\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    "<input type=\"hidden\" name=\"triggerType\" value=\"scheduled\">",
    "<button type=\"submit\" class=\"secondary\">Export Selected</button>",
    "</form>",
    "<form method=\"post\" action=\"/admin/actions/automation-pack-import\" enctype=\"multipart/form-data\" class=\"proactive-pack-inline-form proactive-pack-import-form\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">`,
    "<div class=\"file-picker-row\">",
    "<label class=\"toolbar-button secondary file-picker-button\" for=\"schedulePackFile\">Choose file</label>",
    "<span class=\"file-picker-label\" data-schedule-pack-file-label>No file selected</span>",
    "<input id=\"schedulePackFile\" name=\"file\" type=\"file\" accept=\"application/json,.json\" required aria-label=\"Import schedule pack\" class=\"file-picker-input\">",
    "</div>",
    "<button type=\"submit\" class=\"secondary\">Import Pack</button>",
    "</form>",
    "</div>",
    "<script>",
    "(()=>{",
    "const fileInput=document.getElementById('schedulePackFile');",
    "const fileLabel=document.querySelector('[data-schedule-pack-file-label]');",
    "fileInput?.addEventListener('change',()=>{",
    "if(!fileLabel){return;}",
    "const count=fileInput.files?.length||0;",
    "fileLabel.textContent=count?(count===1?fileInput.files[0].name:`${count} files selected`):'No file selected';",
    "});",
    "})();",
    "</script>",
    "</section>",
    "</section>",
  ].join("");
}

module.exports = {
  renderProactivePage,
};
