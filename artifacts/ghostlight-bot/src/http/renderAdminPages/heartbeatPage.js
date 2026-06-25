const {
  getRuntimeState,
  renderFieldLabelWithHelp,
  renderHelpIcon,
  renderPageIntro,
  renderSubnav,
} = require("./shared");

function renderHeartbeatPage({
  currentTab = "overview",
  selectedActionId = "",
  theme = "light",
  config,
  actions = [],
  runtime = {},
  query = {},
  helpers,
}) {
  const { escapeHtml, withThemeField, renderOptions, formatDateValue, buildAdminLocation, renderIconImage, targetOptions = [], targetLabelsByValue = new Map() } = helpers;
  const state = getRuntimeState({ config, helpers });
  const HISTORY_LIMIT = 10;
  const typeLabels = {
    message: "Message",
    journal: "Journal",
    thread: "New Thread",
    send_check_in: "Check-In",
    send_journal_prompt: "Journal Entry",
    send_gif: "Reaction GIF",
    start_thread: "New Thread",
  };
  const activityModeDescriptors = {
    off: "Off",
    gentle: "Gentle",
    normal: "Normal",
    feral: "Feral",
  };
  const actionLabelsById = Object.fromEntries(actions.map((action) => [action.actionId, action.name || action.label]));
  const actionById = new Map(actions.map((action) => [action.actionId, action]));
  const formatDateTimeValue = (value) => {
    if (!value) {
      return "-";
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
  const formatShortDateTimeValue = (value) => {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: state.timezoneValue || "UTC",
    }).format(date);
  };
  const tabs = [
    { key: "overview", label: "Overview", path: "/admin/heartbeat/overview" },
    { key: "timing", label: "Settings", path: "/admin/heartbeat/timing" },
    { key: "modules", label: "Actions", path: "/admin/heartbeat/modules" },
  ];

  const activityModeOptions = renderOptions(["off", "gentle", "normal", "feral"], state.heartbeatActivityMode);
  const selectedAction = actions.find((action) => action.actionId === selectedActionId) || null;
  const showInactive = query.showInactive === true;
  const sortValue = String(query.sort || "name").trim();
  const directionValue = String(query.direction || "asc").trim().toLowerCase() === "desc" ? "desc" : "asc";
  const enabledActionCount = actions.filter((action) => action.enabled !== false).length;
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
  const selectedTarget = String(selectedAction?.target || selectedAction?.targetChannelId || "").trim();
  const renderTargetOption = (option) => {
    const channelType = option?.channelType === undefined ? "" : String(option.channelType);

    return `<option value="${escapeHtml(option.value)}"${channelType ? ` data-channel-type="${escapeHtml(channelType)}"` : ""}${option.value === selectedTarget ? " selected" : ""}>${escapeHtml(option.label)}</option>`;
  };
  const targetOptionMarkup = [
    '<option value="">Choose target</option>',
    ...targetOptions.map(renderTargetOption),
  ].join("");
  const buildModulesLocation = (extra = {}) => buildAdminLocation({
    path: "/admin/heartbeat/modules",
    theme,
    extra: {
      ...(selectedActionId ? { action: selectedActionId } : {}),
      ...(showInactive ? { showInactive: "true" } : {}),
      sort: sortValue,
      direction: directionValue,
      ...extra,
    },
  });
  const buildSortLink = (nextSortKey) => {
    const nextDirection = sortValue === nextSortKey && directionValue === "asc" ? "desc" : "asc";

    return buildModulesLocation({
      sort: nextSortKey,
      direction: nextDirection,
    });
  };
  const renderSortableHeader = (label, key) => {
    const isActive = sortValue === key;
    const marker = isActive ? (directionValue === "asc" ? " ↑" : " ↓") : "";

    return `<a class="sort-link" href="${escapeHtml(buildSortLink(key))}">${escapeHtml(label + marker)}</a>`;
  };
  const getDecisionIconKind = (item) => {
    if (item.status === "skipped") {
      return "pause";
    }

    const action = actionById.get(item.actionId);
    const firstTool = Array.isArray(action?.enabledTools) ? action.enabledTools.find(Boolean) : "";

    if (item.executorType === "send_journal_prompt" || item.actionType === "journal") {
      return "heartbeat_action_journal";
    }

    if (firstTool) {
      const toolIcon = getToolIconKind(firstTool);

      if (toolIcon) {
        return toolIcon;
      }
    }

    if (item.executorType === "send_gif") {
      return "gif";
    }

    if (item.executorType === "start_thread" || item.actionType === "thread") {
      return "heartbeat_action_thread";
    }

    return "heartbeat_action_message";
  };
  const getToolIconKind = (toolName) => {
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

    if (toolName === "mention_user") {
      return "mention_user";
    }

    return "automation";
  };
  const renderFeatureTogglePill = ({ name, value, checked, label, iconKind }) => [
    `<label class="feature-toggle-pill" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">`,
    `<input type="checkbox" name="${escapeHtml(name)}"${value ? ` value="${escapeHtml(value)}"` : ""}${checked ? " checked" : ""}>`,
    `<span class="feature-toggle-pill-icon" aria-hidden="true">${renderIconImage(iconKind, theme, "", "home-feature-icon-image")}</span>`,
    "</label>",
  ].join("");
  const renderFeatureIcons = ({ enabledTools = [], mentionUser = false }) => {
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
            : featureName === "generate_audio"
              ? "Audio Gen"
              : featureName === "spotify"
                ? "Spotify"
                : featureName === "spotify_curation"
                  ? "Spotify Curation"
                  : featureName === "spotify_playback"
                    ? "Spotify Playback"
                    : featureName === "mention_user"
                      ? "Mention User"
                      : featureName;

        return `<span class="tool-icon-badge" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${renderIconImage(getToolIconKind(featureName), theme, "", "home-feature-icon-image")}</span>`;
      }),
      "</div>",
    ].join("");
  };
  const getActionDiagnostics = (action) => {
    const diagnostics = [];
    const rawTarget = String(action?.target || action?.targetChannelId || "").trim();

    if (action?.enabled === false) {
      diagnostics.push("Off");
    }

    if (!rawTarget) {
      diagnostics.push("No target");
    } else if (rawTarget.toLowerCase() === "daily") {
      const dailyLabel = targetLabelsByValue.get("daily") || "";
      if (/deactivated|unavailable|not configured/i.test(dailyLabel)) {
        diagnostics.push("Daily target unavailable");
      }
    } else {
      const targetLabel = targetLabelsByValue.get(rawTarget) || "";
      if (!targetLabel) {
        diagnostics.push("Target not found");
      } else if (/archived|locked|unavailable/i.test(targetLabel)) {
        diagnostics.push(targetLabel.replace(/^.+?\s+\((.+)\)$/u, "$1"));
      }
    }

    if (Array.isArray(action?.enabledTools) && action.enabledTools.includes("generate_image")) {
      if (!config?.imageGeneration?.enabled) {
        diagnostics.push("Images off");
      } else if (!config?.getimg?.apiKey) {
        diagnostics.push("Missing getimg key");
      }
    }

    const lastError = String(action?.lastError || "").trim();
    if (lastError) {
      diagnostics.push(/missing access/i.test(lastError) ? "Missing access" : "Recent error");
    }

    return diagnostics;
  };
  const renderActionHealth = (action) => {
    const diagnostics = getActionDiagnostics(action);

    if (!diagnostics.length) {
      return "<span class=\"badge\">Ready</span>";
    }

    return diagnostics
      .map((item) => `<span class="badge action-health-warning">${escapeHtml(item)}</span>`)
      .join(" ");
  };
  const executorRows = actions.map((action) => [
    "<tr>",
    `<td data-label="Select" class="action-select-cell"><input type="checkbox" name="actionIds" value="${escapeHtml(action.actionId)}" form="heartbeatPackExportForm" aria-label="Select ${escapeHtml(action.name || action.label || "action")} for export"></td>`,
    `<td data-label="Action"><a href="${escapeHtml(buildModulesLocation({ action: action.actionId }))}">${escapeHtml(action.name || action.label || "")}</a></td>`,
    `<td data-label="Type">${escapeHtml(typeLabels[action.actionType] || typeLabels[action.executorType] || action.actionType || action.executorType || "")}</td>`,
    `<td data-label="Tools">${renderFeatureIcons({ enabledTools: action.enabledTools || [], mentionUser: Boolean(action.mentionUser) })}</td>`,
    `<td data-label="Frequency">${escapeHtml(action.frequency)}</td>`,
    `<td data-label="Quiet hours">${action.quietHoursAllowed ? "On" : "Off"}</td>`,
    `<td data-label="Status">${action.enabled ? "On" : "Off"}</td>`,
    `<td data-label="Health">${renderActionHealth(action)}</td>`,
    "</tr>",
  ].join(""));
  const selectedActionEditor = [
    "<section class=\"settings-block proactive-form\">",
    `<h3>${escapeHtml(selectedAction ? "Edit Action" : "Add Action")}</h3>`,
    "<form method=\"post\" action=\"/admin/actions/heartbeat-action-save\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildModulesLocation(selectedAction ? { action: selectedAction.actionId } : {}))}">`,
    selectedAction ? `<input type="hidden" name="actionId" value="${escapeHtml(selectedAction.actionId)}">` : "",
    "<div class=\"schedule-inline-fields schedule-inline-fields-quad\">",
    `<div><label>Name</label><input name="name" type="text" required value="${escapeHtml(selectedAction?.name || selectedAction?.label || "")}" placeholder="Gentle nudge"></div>`,
    `<div><label>Action Type</label><select id="heartbeatActionType" name="actionType">${renderOptions(["message", "thread", "journal"], selectedAction?.actionType || (selectedAction?.executorType === "start_thread" ? "thread" : selectedAction?.executorType === "send_journal_prompt" ? "journal" : "message") || "message")}</select></div>`,
    `<div><label for="heartbeatTarget">Pick Target</label><select id="heartbeatTarget" name="target" required>${targetOptionMarkup}</select></div>`,
    `<div><label>Frequency</label><select name="frequency">${renderOptions(["low", "normal", "high"], selectedAction?.frequency || "normal")}</select></div>`,
    "</div>",
    "<div class=\"schedule-status-row\" style=\"margin-top:1rem\">",
    "<div class=\"schedule-status-actions\">",
    "<div class=\"switch-field\" style=\"justify-content:flex-start;gap:.85rem;min-height:46px\">",
    "<span class=\"switch-label\">Allowed During Quiet Hours</span>",
    "<label class=\"switch-control\">",
    `<input type="checkbox" name="quietHoursAllowed"${selectedAction?.quietHoursAllowed ? " checked" : ""}><span></span>`,
    "</label>",
    "</div>",
    "<span class=\"switch-label\">Status:</span>",
    "<div class=\"segmented-control\" aria-label=\"Heartbeat action status\">",
    `<input type="radio" id="heartbeatActionOn" name="enabledState" value="enabled"${selectedAction?.enabled === false ? "" : " checked"}><label for="heartbeatActionOn">On</label>`,
    `<input type="radio" id="heartbeatActionOff" name="enabledState" value="paused"${selectedAction?.enabled === false ? " checked" : ""}><label for="heartbeatActionOff">Off</label>`,
    "</div>",
    "</div>",
    "</div>",
    "<div><label>Tools</label><div class=\"home-feature-row\" style=\"justify-content:flex-start;gap:.75rem;flex-wrap:wrap;margin-top:.45rem\">",
    renderFeatureTogglePill({ name: "enabledTools", value: "gif_search", checked: selectedAction?.enabledTools?.includes("gif_search"), label: "GIF Search", iconKind: "gif" }),
    renderFeatureTogglePill({ name: "enabledTools", value: "web_search", checked: selectedAction?.enabledTools?.includes("web_search"), label: "Web Search", iconKind: "web_search" }),
    renderFeatureTogglePill({ name: "enabledTools", value: "generate_image", checked: selectedAction?.enabledTools?.includes("generate_image"), label: "Image Gen", iconKind: "images" }),
    renderFeatureTogglePill({ name: "enabledTools", value: "generate_audio", checked: selectedAction?.enabledTools?.includes("generate_audio"), label: "Audio Gen", iconKind: "audio" }),
    renderFeatureTogglePill({
      name: "enabledTools",
      value: "spotify_curation",
      checked: selectedAction?.enabledTools?.includes("spotify_curation") || selectedAction?.enabledTools?.includes("spotify"),
      label: "Spotify Curation",
      iconKind: "playlist",
    }),
    renderFeatureTogglePill({
      name: "enabledTools",
      value: "spotify_playback",
      checked: selectedAction?.enabledTools?.includes("spotify_playback"),
      label: "Spotify Playback",
      iconKind: "music",
    }),
    renderFeatureTogglePill({ name: "mentionUser", value: "", checked: Boolean(selectedAction?.mentionUser), label: "Mention User", iconKind: "mention_user" }),
    "</div></div>",
    "<label>Prompt</label>",
    `<textarea name="prompt">${escapeHtml(selectedAction?.prompt || "")}</textarea>`,
    "<div class=\"schedule-status-row\" style=\"margin-top:1rem\">",
    "<div></div>",
    "<div class=\"schedule-status-actions\">",
    `<button type="submit">${selectedAction ? "Save Action" : "Add Action"}</button>`,
    selectedAction
      ? `<a class="toolbar-button secondary" href="${escapeHtml(buildModulesLocation())}">Cancel</a>`
      : "",
    "</div>",
    "</div>",
    "</form>",
    "<script>",
    "(function(){",
    "const typeField=document.getElementById('heartbeatActionType');",
    "const targetField=document.getElementById('heartbeatTarget');",
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
    selectedAction
      ? [
        "<div class=\"toolbar\" style=\"margin-top:1rem\">",
        `<form method="post" action="/admin/actions/heartbeat-action-delete">`,
        withThemeField(theme),
        `<input type="hidden" name="returnTo" value="${escapeHtml(buildModulesLocation())}">`,
        `<input type="hidden" name="actionId" value="${escapeHtml(selectedAction.actionId)}">`,
        "<button type=\"submit\" class=\"secondary\">Delete</button>",
        "</form>",
        selectedAction.lastError
          ? [
            `<form method="post" action="/admin/actions/heartbeat-action-error-clear">`,
            withThemeField(theme),
            `<input type="hidden" name="returnTo" value="${escapeHtml(buildModulesLocation({ action: selectedAction.actionId }))}">`,
            `<input type="hidden" name="actionId" value="${escapeHtml(selectedAction.actionId)}">`,
            "<button type=\"submit\" class=\"secondary\">Clear Error</button>",
            "</form>",
          ].join("")
          : "",
        "</div>",
      ].join("")
      : "",
  ].join("");
  const historyItems = (Array.isArray(runtime.recentDecisions) ? runtime.recentDecisions : []).slice(0, HISTORY_LIMIT);
  const decisionItems = historyItems
    .filter((item) => item.status === "fired" || (item.status === "skipped" && ["low_confidence", "hold_back"].includes(item.reason)))
    .slice(0, HISTORY_LIMIT);
  const SKIP_REASON_LABELS = {
    no_available_actions: "No actions available (all targets failed to resolve)",
    user_idle: "Skipped — user idle too long (maxIdleHours exceeded)",
    global_cooldown: "Skipped — global cooldown not elapsed",
    daily_cap: "Skipped — daily cap reached",
    no_decision: "Skipped — conductor returned no decision",
    invalid_action: "Skipped — conductor chose an action that wasn't in the available set",
    quiet_hours_blocked: "Skipped — quiet hours active and action not allowed during quiet hours",
    recent_user_activity_defer: "Skipped — user just spoke; deferred for a few minutes",
    no_spotify_actions: "Skipped — Spotify actions available but playback not active",
  };
  const debugItems = (Array.isArray(runtime.recentDebugEvents) ? runtime.recentDebugEvents : [])
    .filter((item) => item.status === "failed" || item.status === "skipped")
    .slice(0, HISTORY_LIMIT);
  const historyMarkup = decisionItems.length
    ? [
      "<div class=\"model-table-wrap\" style=\"margin-top:1rem\"><table class=\"model-table heartbeat-history-table\">",
      "<colgroup><col style=\"width:8%\"><col style=\"width:18%\"><col style=\"width:14%\"><col style=\"width:60%\"></colgroup>",
      "<thead><tr><th></th><th>Action</th><th>Time</th><th>Why</th></tr></thead>",
      "<tbody>",
      decisionItems.map((item) => [
        "<tr>",
        `<td data-label=""><span class="tool-icon-badge" title="${escapeHtml(item.status === "skipped" ? "Held back" : "Action")}" aria-label="${escapeHtml(item.status === "skipped" ? "Held back" : "Action")}">${renderIconImage(getDecisionIconKind(item), theme, "", "home-feature-icon-image")}</span></td>`,
        `<td data-label="Action">${escapeHtml(item.status === "fired"
          ? (actionLabelsById[item.actionId] || typeLabels[item.actionType] || typeLabels[item.executorType] || item.actionId || "Heartbeat")
          : "Held back")}</td>`,
        `<td data-label="Time">${escapeHtml(formatShortDateTimeValue(item.at || null))}</td>`,
        `<td data-label="Why" class="table-detail-cell">${escapeHtml(item.why || (item.status === "fired" ? "No detail recorded." : "It didn't fit the moment."))}</td>`,
        "</tr>",
      ].join("")).join(""),
      "</tbody>",
      "</table></div>",
    ].join("")
    : "<p class=\"meta\" style=\"margin-top:1rem\">Recent Heartbeat decisions will show up here once it has started doing things.</p>";
  const debugMarkup = debugItems.length
    ? [
      "<div class=\"form-divider\"></div>",
      "<div class=\"section-title section-title-inline\">",
      "<h3>Recent Skips &amp; Errors</h3>",
      "<form method=\"post\" action=\"/admin/actions/heartbeat-errors-clear\">",
      withThemeField(theme),
      `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/heartbeat/overview", theme }))}">`,
      "<button type=\"submit\" class=\"secondary\">Clear</button>",
      "</form>",
      "</div>",
      "<ul class=\"meta\" style=\"margin:0;padding-left:1.2rem\">",
      debugItems.map((item) => {
        const label = item.status === "failed"
          ? (item.reason || "error")
          : (SKIP_REASON_LABELS[item.reason] || item.reason || "skipped");
        const parts = [
          formatDateTimeValue(item.at || null),
          label,
          item.actionId ? `(${item.actionId})` : "",
        ].filter(Boolean);
        return `<li>${escapeHtml(parts.join(" · "))}</li>`;
      }).join(""),
      "</ul>",
    ].join("")
    : "";

  const tabBody = {
    overview: [
      [
        "<section class=\"home-dashboard-panel home-dashboard-panel-setup\" style=\"margin-bottom:1.25rem\">",
        "<div class=\"home-setup-list\" style=\"grid-template-columns:repeat(auto-fit,minmax(220px,1fr))\">",
        "<article class=\"home-setup-item\">",
        `<span class="home-status-icon" title="Current heartbeat mode" aria-label="Current heartbeat mode">${renderIconImage("heartbeat", theme, "", "home-status-icon-image")}</span>`,
        `<p class="home-setup-value">Mode: ${escapeHtml(activityModeDescriptors[state.heartbeatActivityMode] || state.heartbeatActivityMode || "Normal")}</p>`,
        "</article>",
        "<article class=\"home-setup-item\">",
        `<span class="home-status-icon" title="Actions currently available" aria-label="Actions currently available">${renderIconImage("automation", theme, "", "home-status-icon-image")}</span>`,
        `<p class="home-setup-value">Actions Available: ${escapeHtml(String(enabledActionCount))}</p>`,
        "</article>",
        "<article class=\"home-setup-item\">",
        `<span class="home-status-icon" title="Last successful action" aria-label="Last successful action">${renderIconImage("restore", theme, "", "home-status-icon-image")}</span>`,
        `<p class="home-setup-value">Last action: ${escapeHtml(formatShortDateTimeValue(runtime.lastSuccessAt || null))}</p>`,
        "</article>",
        "<article class=\"home-setup-item\">",
        `<span class="home-status-icon" title="Successful actions today" aria-label="Successful actions today">${renderIconImage("play", theme, "", "home-status-icon-image")}</span>`,
        `<p class="home-setup-value">Actions today: ${escapeHtml(String(runtime.todayCount || 0))}</p>`,
        "</article>",
        "</div>",
        "</section>",
      ].join(""),
      "<div class=\"form-divider\"></div>",
      "<h3>Recent Decisions</h3>",
      historyMarkup,
      debugMarkup,
    ].join(""),
    timing: (function () {
      const cooldownVal = escapeHtml(String(state.heartbeatGlobalCooldownMinutes ?? 60));
      const dailyCapVal = escapeHtml(String(state.heartbeatDailyCap ?? 5));
      const quietEnabled = !!state.heartbeatQuietHoursEnabled;
      const quietStart = escapeHtml(state.heartbeatQuietHoursStart || "22:00");
      const quietEnd = escapeHtml(state.heartbeatQuietHoursEnd || "08:00");
      const quietLabel = quietEnabled ? "on" : "off";
      const quietChecked = quietEnabled ? " checked" : "";
      const quietPreview = quietEnabled
        ? `Quiet Hours are enabled from <strong>${quietStart}</strong> to <strong>${quietEnd}</strong>.`
        : "Quiet Hours are disabled, so they can act any time.";
      const assetBase = "/assets/ghostlight/heartbeat";
      return `<div class="ghb-settings-tab">
<section class="ghb-hero">
  <div class="ghb-hero-art"></div>
  <div class="ghb-hero-text">
    <h2 class="ghb-title">Heartbeat &#9825;</h2>
    <p class="ghb-subtitle">Heartbeat is how your companion acts on their own initiative, deciding in the moment to reach out, send a reaction, or start a thread based on context, timing, and the limits you set here.</p>
  </div>
  <aside class="ghb-card ghb-side-card">
    <h3 class="ghb-side-title"><img src="${assetBase}/heartbeat.svg" alt=""> What is Heartbeat?</h3>
    <p class="ghb-copy">Heartbeat is your companion\u2019s autonomous initiative system. It allows them to:</p>
    <ul class="ghb-bullet-list">
      <li>Reach out on their own</li>
      <li>React to important events</li>
      <li>Start meaningful conversations</li>
      <li>Follow through based on context</li>
      <li>Respect your time and boundaries</li>
    </ul>
  </aside>
</section>
<form id="ghb-settings-form" method="post" action="/admin/actions/heartbeat-settings-save">
  ${withThemeField(theme)}
  <input type="hidden" name="returnTo" value="/admin/heartbeat/timing">
  <section class="ghb-main-grid">
    <div class="ghb-left">
      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble"><img src="${assetBase}/activity-mode.svg" alt=""></span>
          <div>
            <h3 class="ghb-section-title">Activity Mode</h3>
            <p class="ghb-copy">Choose how active your companion is allowed to be on their own.</p>
          </div>
          <select class="ghb-select" id="heartbeatActivityMode" name="heartbeatActivityMode" aria-label="Activity mode">${activityModeOptions}</select>
        </div>
        <div class="ghb-info-strip">Higher activity modes allow more frequent proactive actions.</div>
      </section>
      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble"><img src="${assetBase}/anti-spam.svg" alt=""></span>
          <div>
            <h3 class="ghb-section-title">Anti-Spam Settings</h3>
            <p class="ghb-copy">Set limits to prevent overwhelm and keep interactions meaningful.</p>
          </div>
        </div>
        <div class="ghb-field-grid">
          <div class="ghb-field-card">
            <label class="ghb-label" for="heartbeatGlobalCooldownMinutes">Global cooldown (minutes)</label>
            <p class="ghb-help">Minimum time between any two proactive actions.</p>
            <div class="ghb-input-wrap">
              <input id="heartbeatGlobalCooldownMinutes" name="heartbeatGlobalCooldownMinutes" type="number" min="0" max="1440" value="${cooldownVal}">
              <span class="ghb-input-suffix">min</span>
            </div>
          </div>
          <div class="ghb-field-card">
            <label class="ghb-label" for="heartbeatDailyCap">Daily cap</label>
            <p class="ghb-help">Maximum number of proactive actions per day.</p>
            <div class="ghb-input-wrap">
              <input id="heartbeatDailyCap" name="heartbeatDailyCap" type="number" min="0" max="100" value="${dailyCapVal}">
              <span class="ghb-input-suffix">per day</span>
            </div>
          </div>
        </div>
        <div class="ghb-info-strip">These limits help keep your companion\u2019s outreach respectful and intentional.</div>
      </section>
      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble"><img src="${assetBase}/quiet-hours.svg" alt=""></span>
          <div>
            <h3 class="ghb-section-title">Quiet Hours</h3>
            <p class="ghb-copy">Silence proactive actions during the hours you choose.</p>
          </div>
          <label class="ghb-toggle-row">
            <input type="hidden" name="heartbeatQuietHoursEnabled" value="false">
            <input class="ghb-toggle" type="checkbox" name="heartbeatQuietHoursEnabled" value="true"${quietChecked} id="heartbeatQuietHoursEnabled">
            Quiet Hours are ${quietLabel}
          </label>
        </div>
        <div class="ghb-field-grid">
          <div class="ghb-field-card">
            <label class="ghb-label" for="heartbeatQuietHoursStart">Start</label>
            <input class="ghb-time-input" id="heartbeatQuietHoursStart" name="heartbeatQuietHoursStart" type="time" value="${quietStart}">
          </div>
          <div class="ghb-field-card">
            <label class="ghb-label" for="heartbeatQuietHoursEnd">End</label>
            <input class="ghb-time-input" id="heartbeatQuietHoursEnd" name="heartbeatQuietHoursEnd" type="time" value="${quietEnd}">
          </div>
        </div>
        <div class="ghb-info-strip">During Quiet Hours, your companion will not proactively reach out or start threads.</div>
      </section>
      <div class="ghb-save-bar" id="ghb-save-bar">
        <img class="ghb-save-icon" src="${assetBase}/save-heartbeat-settings.svg" alt="">
        <div>
          <strong id="ghb-bar-label">Review your settings</strong><br>
          <span class="ghb-copy" id="ghb-bar-sub">Settings will be applied when you save.</span>
        </div>
        <button type="button" class="ghb-button" id="ghb-reset-btn" onclick="ghbReset()" style="display:none">Reset Changes</button>
        <button type="submit" class="ghb-button ghb-button-primary">Save Heartbeat Settings</button>
      </div>
    </div>
    <aside class="ghb-right">
      <section class="ghb-card ghb-side-card">
        <h3 class="ghb-side-title"><img src="${assetBase}/current-preview.svg" alt=""> Current Preview</h3>
        <div class="ghb-preview-box">
          <p class="ghb-copy"><strong>With your current settings:</strong></p>
          <div class="ghb-preview-row">
            <img src="${assetBase}/daily-cap.svg" alt="">
            <p class="ghb-copy">Your companion can take up to <strong>${dailyCapVal} proactive actions per day.</strong></p>
          </div>
          <div class="ghb-preview-row">
            <img src="${assetBase}/global-cooldown.svg" alt="">
            <p class="ghb-copy">They must wait at least <strong>${cooldownVal} minutes</strong> between actions.</p>
          </div>
          <div class="ghb-preview-row">
            <img src="${assetBase}/quiet-hours.svg" alt="">
            <p class="ghb-copy">${quietPreview}</p>
          </div>
        </div>
      </section>
      <section class="ghb-card ghb-side-card">
        <h3 class="ghb-side-title"><img src="${assetBase}/recommended-defaults.svg" alt=""> Need help deciding?</h3>
        <p class="ghb-copy">Start with <strong>Normal</strong> activity, <strong>60 minute</strong> cooldown, and a <strong>daily cap of 5</strong>.</p>
        <button type="button" class="ghb-button ghb-button-full" style="margin-top:16px" onclick="ghbUseDefaults()">Use Recommended Defaults</button>
      </section>
    </aside>
  </section>
</form>
<script>
(function(){
  var form=document.getElementById('ghb-settings-form');
  var resetBtn=document.getElementById('ghb-reset-btn');
  var barLabel=document.getElementById('ghb-bar-label');
  var barSub=document.getElementById('ghb-bar-sub');
  var dirty=false;
  function markDirty(){
    if(dirty)return;
    dirty=true;
    barLabel.textContent='You have unsaved changes';
    barSub.textContent='Review your changes before saving.';
    resetBtn.style.display='';
  }
  form.addEventListener('change',markDirty);
  form.addEventListener('input',markDirty);
  window.ghbReset=function(){window.location.reload();};
  window.ghbUseDefaults=function(){
    var s=form.elements['heartbeatActivityMode'];
    var c=form.elements['heartbeatGlobalCooldownMinutes'];
    var d=form.elements['heartbeatDailyCap'];
    var q=form.querySelector('input[name="heartbeatQuietHoursEnabled"][type="checkbox"]');
    var ql=q&&q.closest('.ghb-toggle-row');
    if(s)s.value='normal';
    if(c)c.value='60';
    if(d)d.value='5';
    if(q){q.checked=false;if(ql)ql.lastChild.textContent=' Quiet Hours are off';}
    markDirty();
  };
})();
</script>
</div>`;
    })(),
    modules: (function () {
      var A = "/assets/ghostlight/heartbeat-actions";
      var isEdit = Boolean(selectedAction);
      var actionTypeSelected = selectedAction?.actionType || (selectedAction?.executorType === "start_thread" ? "thread" : selectedAction?.executorType === "send_journal_prompt" ? "journal" : "message") || "message";
      var quietChecked = selectedAction?.quietHoursAllowed ? " checked" : "";
      var tableRows = executorRows.length
        ? executorRows.join("")
        : "<tr><td colspan=\"8\" style=\"text-align:center;padding:20px 12px;\">No actions configured.</td></tr>";
      var emptyState = executorRows.length ? "" : [
        "<div class=\"gha-empty\">",
        "<img src=\"" + A + "/heartbeat-actions.svg\" alt=\"\" width=\"74\" height=\"74\">",
        "<h3 style=\"margin:8px 0 6px;\">No actions configured yet.</h3>",
        "<p class=\"gha-copy\">Add your first action above to get started.</p>",
        "</div>",
      ].join("");
      var editActionsHtml = isEdit ? [
        "<div style=\"display:flex;gap:12px;margin-top:14px;\">",
        "<form method=\"post\" action=\"/admin/actions/heartbeat-action-delete\">",
        withThemeField(theme),
        "<input type=\"hidden\" name=\"returnTo\" value=\"" + escapeHtml(buildModulesLocation()) + "\">",
        "<input type=\"hidden\" name=\"actionId\" value=\"" + escapeHtml(selectedAction.actionId) + "\">",
        "<button type=\"submit\" class=\"gha-button\">Delete Action</button>",
        "</form>",
        selectedAction.lastError ? [
          "<form method=\"post\" action=\"/admin/actions/heartbeat-action-error-clear\">",
          withThemeField(theme),
          "<input type=\"hidden\" name=\"returnTo\" value=\"" + escapeHtml(buildModulesLocation({ action: selectedAction.actionId })) + "\">",
          "<input type=\"hidden\" name=\"actionId\" value=\"" + escapeHtml(selectedAction.actionId) + "\">",
          "<button type=\"submit\" class=\"gha-button\">Clear Error</button>",
          "</form>",
        ].join("") : "",
        "</div>",
      ].join("") : "";
      return `<div class="gha-page"><div class="gha-shell">
<section class="gha-hero">
  <div class="gha-hero-art" role="presentation"></div>
  <div class="gha-hero-text">
    <h2 class="gha-title">Heartbeat Actions ♡</h2>
    <p class="gha-subtitle">Create the specific autonomous actions your companion is allowed to take on their own, like sending a message, reacting to a moment, or gently starting a conversation within the boundaries you set.</p>
  </div>
  <aside class="gha-card gha-side-card">
    <h3 class="gha-side-title"><img src="${A}/about-actions.svg" alt="" width="30" height="30"> About Actions</h3>
    <ul class="gha-bullet-list">
      <li>Choose what kind of action your companion can take.</li>
      <li>Pick who or what the action targets.</li>
      <li>Set how often the action can happen.</li>
      <li>Control whether it is allowed during Quiet Hours.</li>
      <li>Use tools and prompts to guide what the action does.</li>
    </ul>
  </aside>
</section>
<div class="gha-main-grid">
  <div class="gha-left">
    <section class="gha-card gha-panel" id="ghaAddSection">
      <h3 class="gha-section-title"><img src="${A}/add-action.svg" alt="" width="30" height="30"> ${isEdit ? "Edit Action" : "Add Action"}</h3>
      <p class="gha-copy">${isEdit ? "Update this action." : "Create a new autonomous action for your companion."}</p>
      <form id="ghaAddActionForm" method="post" action="/admin/actions/heartbeat-action-save">
        ${withThemeField(theme)}
        <input type="hidden" name="returnTo" value="${escapeHtml(buildModulesLocation(isEdit ? { action: selectedAction.actionId } : {}))}">
        ${isEdit ? `<input type="hidden" name="actionId" value="${escapeHtml(selectedAction.actionId)}">` : ""}
        <div class="gha-field-grid" style="margin-top:18px;">
          <div class="gha-field-card">
            <label class="gha-label" for="ghaActionName">Name</label>
            <input class="gha-input" id="ghaActionName" name="name" type="text" required value="${escapeHtml(selectedAction?.name || selectedAction?.label || "")}" placeholder="Gentle nudge">
          </div>
          <div class="gha-field-card">
            <label class="gha-label" for="heartbeatActionType">Action Type</label>
            <select class="gha-select" id="heartbeatActionType" name="actionType">${renderOptions(["message", "thread", "journal"], actionTypeSelected)}</select>
          </div>
          <div class="gha-field-card">
            <label class="gha-label" for="heartbeatTarget">Pick Target</label>
            <select class="gha-select" id="heartbeatTarget" name="target" required>${targetOptionMarkup}</select>
          </div>
          <div class="gha-field-card">
            <label class="gha-label" for="ghaFrequency">Frequency</label>
            <select class="gha-select" id="ghaFrequency" name="frequency">${renderOptions(["low", "normal", "high"], selectedAction?.frequency || "normal")}</select>
          </div>
        </div>
        <div class="gha-inline-grid">
          <div class="gha-field-card">
            <label class="gha-label">Allowed During Quiet Hours</label>
            <p class="gha-help">Allow this action even when Quiet Hours are active.</p>
            <label class="gha-toggle-row" style="margin-top:8px;">
              <input class="gha-toggle" type="checkbox" name="quietHoursAllowed"${quietChecked}>
              <span id="ghaQHLabel">${selectedAction?.quietHoursAllowed ? "Allowed" : "Not allowed"}</span>
            </label>
          </div>
          <div class="gha-field-card">
            <label class="gha-label">Status</label>
            <p class="gha-help">Choose whether this action is currently active.</p>
            <div class="gha-segment" aria-label="Heartbeat action status" style="margin-top:8px;">
              <input type="radio" id="heartbeatActionOn" name="enabledState" value="enabled"${selectedAction?.enabled === false ? "" : " checked"} hidden>
              <label for="heartbeatActionOn" class="gha-segment-label${selectedAction?.enabled === false ? "" : " active"}">On</label>
              <input type="radio" id="heartbeatActionOff" name="enabledState" value="paused"${selectedAction?.enabled === false ? " checked" : ""} hidden>
              <label for="heartbeatActionOff" class="gha-segment-label${selectedAction?.enabled === false ? " active" : ""}">Off</label>
            </div>
          </div>
        </div>
        <div style="margin-top:18px;">
          <label class="gha-label">Tools <span style="font-weight:400;color:var(--gha-muted)">(optional)</span></label>
          <p class="gha-help">Select tools this action can use.</p>
          <div class="home-feature-row" style="justify-content:flex-start;gap:.75rem;flex-wrap:wrap;margin-top:.45rem">
            ${renderFeatureTogglePill({ name: "enabledTools", value: "gif_search", checked: selectedAction?.enabledTools?.includes("gif_search"), label: "GIF Search", iconKind: "gif" })}
            ${renderFeatureTogglePill({ name: "enabledTools", value: "web_search", checked: selectedAction?.enabledTools?.includes("web_search"), label: "Web Search", iconKind: "web_search" })}
            ${renderFeatureTogglePill({ name: "enabledTools", value: "generate_image", checked: selectedAction?.enabledTools?.includes("generate_image"), label: "Image Gen", iconKind: "images" })}
            ${renderFeatureTogglePill({ name: "enabledTools", value: "generate_audio", checked: selectedAction?.enabledTools?.includes("generate_audio"), label: "Audio Gen", iconKind: "audio" })}
            ${renderFeatureTogglePill({ name: "enabledTools", value: "spotify_curation", checked: selectedAction?.enabledTools?.includes("spotify_curation") || selectedAction?.enabledTools?.includes("spotify"), label: "Spotify Curation", iconKind: "playlist" })}
            ${renderFeatureTogglePill({ name: "enabledTools", value: "spotify_playback", checked: selectedAction?.enabledTools?.includes("spotify_playback"), label: "Spotify Playback", iconKind: "music" })}
            ${renderFeatureTogglePill({ name: "mentionUser", value: "", checked: Boolean(selectedAction?.mentionUser), label: "Mention User", iconKind: "mention_user" })}
          </div>
        </div>
        <div style="margin-top:18px;">
          <label class="gha-label" for="ghaPrompt">Prompt / Instructions</label>
          <p class="gha-help">Describe what this action should do and how.</p>
          <textarea class="gha-textarea" id="ghaPrompt" name="prompt" style="margin-top:8px;" placeholder="e.g. Send a gentle check-in message based on recent mood and context...">${escapeHtml(selectedAction?.prompt || "")}</textarea>
        </div>
        <div class="gha-card-actions">
          ${isEdit ? `<a class="gha-button" href="${escapeHtml(buildModulesLocation())}">Cancel</a>` : ""}
          <button type="submit" class="gha-button gha-button-primary">${isEdit ? "Save Action" : "Add Action"}</button>
        </div>
      </form>
      ${editActionsHtml}
      <script>
      (function(){
        var tf=document.getElementById('heartbeatActionType');
        var tgt=document.getElementById('heartbeatTarget');
        var forumTypes={'15':true,'16':true};
        function syncForum(){if(!tf||!tgt){return;}var ok=tf.value==='thread';for(var i=0;i<tgt.options.length;i++){var o=tgt.options[i];var f=forumTypes[o.getAttribute('data-channel-type')||''];o.hidden=f&&!ok;o.disabled=f&&!ok;}}
        if(tf&&tgt){tf.addEventListener('change',syncForum);syncForum();}
        var qToggle=document.querySelector('#ghaAddSection input[name="quietHoursAllowed"]');
        var qLabel=document.getElementById('ghaQHLabel');
        if(qToggle&&qLabel){qToggle.addEventListener('change',function(){qLabel.textContent=qToggle.checked?'Allowed':'Not allowed';});}
        var segInputs=document.querySelectorAll('#heartbeatActionOn,#heartbeatActionOff');
        segInputs.forEach(function(inp){inp.addEventListener('change',function(){document.querySelectorAll('.gha-segment-label').forEach(function(l){l.classList.remove('active');});var lbl=document.querySelector('label[for="'+inp.id+'"]');if(lbl)lbl.classList.add('active');});});
        var form=document.getElementById('ghaAddActionForm');
        var bar=document.getElementById('ghaSaveBar');
        if(form&&bar){
          form.addEventListener('change',function(){bar.style.display='grid';});
          var rb=document.getElementById('ghaResetBtn');if(rb){rb.addEventListener('click',function(){form.reset();bar.style.display='none';});}
          var sb=document.getElementById('ghaSaveBtn');if(sb){sb.addEventListener('click',function(e){e.preventDefault();form.submit();});}
        }
      })();
      </script>
    </section>

    <section class="gha-card gha-panel">
      <div class="gha-table-top">
        <div>
          <h3 class="gha-section-title"><img src="${A}/active-actions.svg" alt="" width="30" height="30"> Active Actions</h3>
          <p class="gha-copy">Review, adjust, or pause existing actions.</p>
        </div>
        <form method="get" action="/admin/heartbeat/modules" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <input type="hidden" name="theme" value="${escapeHtml(theme)}">
          <input type="hidden" name="sort" value="${escapeHtml(sortValue)}">
          <input type="hidden" name="direction" value="${escapeHtml(directionValue)}">
          ${selectedActionId ? `<input type="hidden" name="action" value="${escapeHtml(selectedActionId)}">` : ""}
          <label class="gha-toggle-row">
            <input class="gha-toggle" id="heartbeatInactiveToggle" type="checkbox" name="showInactive" value="true"${showInactive ? " checked" : ""}>
            <span style="margin-left:6px;font-size:.9rem;">Show inactive</span>
          </label>
          <button type="submit" class="gha-button">Apply</button>
          <a class="gha-button" href="${escapeHtml(buildAdminLocation({ path: "/admin/heartbeat/modules", theme }))}">Clear</a>
        </form>
      </div>
      <div style="overflow-x:auto;margin-top:12px;">
        <table class="gha-table">
          <colgroup><col style="width:5%"><col style="width:18%"><col style="width:12%"><col style="width:16%"><col style="width:11%"><col style="width:12%"><col style="width:10%"><col style="width:16%"></colgroup>
          <thead><tr><th>Select</th><th>${renderSortableHeader("Action", "name")}</th><th>${renderSortableHeader("Type", "type")}</th><th>Tools</th><th>${renderSortableHeader("Frequency", "frequency")}</th><th>${renderSortableHeader("Quiet Hours", "quietHours")}</th><th>${renderSortableHeader("Status", "status")}</th><th>Health</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${emptyState}
    </section>

    <section class="gha-card gha-panel">
      <h3 class="gha-section-title"><img src="${A}/action-packs.svg" alt="" width="30" height="30"> Action Packs</h3>
      <p class="gha-copy">Import or export packs of actions to save time and share with others.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:18px;">
        <form id="heartbeatPackExportForm" method="post" action="/admin/exports/proactive-pack">
          ${withThemeField(theme)}
          <input type="hidden" name="returnTo" value="${escapeHtml(buildModulesLocation(isEdit ? { action: selectedAction.actionId } : {}))}">
          <input type="hidden" name="triggerType" value="heartbeat">
          <button type="submit" class="gha-button">Export Selected</button>
        </form>
        <form method="post" action="/admin/actions/heartbeat-pack-import" enctype="multipart/form-data" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          ${withThemeField(theme)}
          <input type="hidden" name="returnTo" value="${escapeHtml(buildModulesLocation(isEdit ? { action: selectedAction.actionId } : {}))}">
          <label class="gha-button" for="heartbeatPackFile" style="cursor:pointer;">Choose file</label>
          <span class="gha-copy" data-heartbeat-pack-file-label>No file selected</span>
          <input id="heartbeatPackFile" name="file" type="file" accept="application/json,.json" required aria-label="Import heartbeat pack" style="display:none;">
          <button type="submit" class="gha-button">Import Pack</button>
        </form>
      </div>
      <p class="gha-note">Imported actions are added as new actions and default to Off.</p>
      <script>
      (function(){
        var fi=document.getElementById('heartbeatPackFile');
        var fl=document.querySelector('[data-heartbeat-pack-file-label]');
        if(fi&&fl){fi.addEventListener('change',function(){var c=fi.files&&fi.files.length||0;fl.textContent=c?(c===1?fi.files[0].name:c+' files selected'):'No file selected';});}
      })();
      </script>
    </section>

    <div class="gha-save-bar" id="ghaSaveBar" style="display:none;">
      <img class="gha-save-icon" src="${A}/save-heartbeat-actions.svg" alt="" width="54" height="54">
      <div>
        <strong>You have unsaved changes</strong><br>
        <span class="gha-copy">Review your actions before saving.</span>
      </div>
      <button type="button" class="gha-button" id="ghaResetBtn">Reset Changes</button>
      <button type="button" class="gha-button gha-button-primary" id="ghaSaveBtn">Save Heartbeat Actions</button>
    </div>
  </div>

  <aside class="gha-right">
    <section class="gha-card gha-side-card">
      <h3 class="gha-side-title"><img src="${A}/safe-controlled.svg" alt="" width="30" height="30"> Safe &amp; Controlled</h3>
      <div class="gha-highlight-list">
        <div class="gha-highlight-item"><img src="${A}/frequency.svg" alt="" width="40" height="40"><div><strong>Respect your limits</strong><br><span class="gha-copy">Quiet Hours and cooldowns always override actions.</span></div></div>
        <div class="gha-highlight-item"><img src="${A}/status.svg" alt="" width="40" height="40"><div><strong>You&#39;re always in control</strong><br><span class="gha-copy">Review, pause, or remove any action anytime.</span></div></div>
        <div class="gha-highlight-item"><img src="${A}/heartbeat-actions.svg" alt="" width="40" height="40"><div><strong>Keep it healthy</strong><br><span class="gha-copy">Set thoughtful limits to protect your relationship.</span></div></div>
      </div>
    </section>
    <section class="gha-card gha-side-card">
      <h3 class="gha-side-title"><img src="${A}/ideas.svg" alt="" width="30" height="30"> Need ideas?</h3>
      <p class="gha-copy">Download the starter pack — six ready-to-import actions that make your companion feel alive and coherent from day one.</p>
      <a class="gha-button gha-button-primary" href="/assets/ghostlight-starter-actions.json" download="ghostlight-starter-actions.json" style="margin-top:18px;width:100%;box-sizing:border-box;text-align:center;">Download Starter Pack</a>
      <p class="gha-note" style="margin-top:10px;">Import the file using Choose file → Import Pack above. All actions default to Off — set a target channel and enable them when ready.</p>
    </section>
  </aside>
</div>
</div></div>`;
    })(),
  };

  return [
    renderPageIntro({
      title: "Heartbeat",
      copy: "Heartbeat is how your companion acts on their own initiative — deciding in the moment to reach out, send a reaction, or start a thread based on context, timing, and the limits you set here. This is the autonomous side of your companion.",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: currentTab, theme, helpers }),
    "</section>",
    "<section class=\"lite-panel page-frame admin-tab-panel\">",
    tabBody[currentTab] || tabBody.overview,
    "</section>",
  ].join("");
}

module.exports = {
  renderHeartbeatPage,
};
