function renderAdminTopnav({ currentSection = "home", theme = "light", themeLinks = null, appVersion = "", imageTag = "", helpers }) {
  const { escapeHtml, buildAdminLocation, renderIconImage } = helpers;
  const homeLocation = buildAdminLocation({ path: "/admin", theme });
  const links = [
    { section: "home", label: "Home", path: "/admin", icon: "home" },
    { section: "companion", label: "Companion", path: "/admin/companion", icon: "companion" },
    { section: "emotionalArc", label: "Emotional Arc", path: "/admin/emotional-arc", icon: "emotionalArc" },
    { section: "feedbackLearning", label: "Feedback & Learning", path: "/admin/feedback-learning", icon: "feedbackLearning" },
    { section: "relationalState", label: "Relational State", path: "/admin/relational-state", icon: "relationalState" },
    { section: "secondLife", label: "Second Life", path: "/admin/second-life", icon: "companion" },
    { section: "innerLife", label: "Inner Life", path: "/admin/inner-life", icon: "emotionalArc" },
    { section: "continuity", label: "Continuity", path: "/admin/continuity/overview", icon: "automation" },
    { section: "memory", label: "Memory", path: "/admin/memory/library", icon: "memories" },
    { section: "heartbeat", label: "Heartbeat", path: "/admin/heartbeat/timing", icon: "heartbeat" },
    { section: "schedules", label: "Schedules", path: "/admin/schedules", icon: "automation", child: true },
    { section: "gallery", label: "Library", path: "/admin/gallery/images", icon: "gallery" },
    { section: "tools", label: "Tools", path: "/admin/tools/images", icon: "tools" },
    { section: "journals", label: "Journals", path: "/admin/journals", icon: "journals" },
    { section: "admin", label: "Admin", path: "/admin/admin", icon: "dashboard" },
  ];
  const navLinks = links.map((link) => [
    `<a href="${escapeHtml(buildAdminLocation({ path: link.path, theme }))}"${currentSection === link.section ? " aria-current=\"page\"" : ""}${link.child ? " class=\"topbar-nav-child\"" : ""}>`,
    `<span class="topbar-nav-icon" aria-hidden="true">${renderIconImage(link.icon, theme, "", "topbar-nav-icon-img")}</span>`,
    `<span class="topbar-nav-title">${escapeHtml(link.label)}</span>`,
    "</a>",
  ].join(""));
  const themeToggle = themeLinks
    ? [
      "<div class=\"theme-switcher\" aria-label=\"Theme toggle\">",
      `<a href="${escapeHtml(themeLinks.light)}"${theme === "light" ? " aria-current=\"page\"" : ""}>Light</a>`,
      `<a href="${escapeHtml(themeLinks.dark)}"${theme === "dark" ? " aria-current=\"page\"" : ""}>Dark</a>`,
      "</div>",
    ].join("")
    : "";
  const navigationMarkup = [
    "<nav class=\"topbar-nav\" aria-label=\"Ghostlight AI admin navigation\">",
    ...navLinks,
    "</nav>",
  ].join("");

  return [
    "<header class=\"admin-topbar\">",
    "<div class=\"topbar-inner\">",
    "<div class=\"topbar-row topbar-row--top\">",
    `<a class="topbar-brand" href="${escapeHtml(homeLocation)}">`,
    "<span class=\"topbar-logo-wrap\" aria-hidden=\"true\"><img class=\"topbar-logo-img\" src=\"/assets/ghostlight-logo.png\" alt=\"\"></span>",
    "<strong class=\"topbar-brand-name\">Ghostlight AI</strong>",
    "</a>",
    "<div class=\"topbar-end\">",
    themeToggle,
    "</div>",
    "</div>",
    "<div class=\"topbar-row topbar-row--nav\">",
    navigationMarkup,
    "</div>",
    "</div>",
    "<details class=\"topbar-mobile\">",
    "<summary class=\"topbar-mobile-summary\">",
    `<a class="topbar-brand" href="${escapeHtml(homeLocation)}">`,
    "<span class=\"topbar-logo-wrap\" aria-hidden=\"true\"><img class=\"topbar-logo-img\" src=\"/assets/ghostlight-logo.png\" alt=\"\"></span>",
    "<strong class=\"topbar-brand-name\">Ghostlight AI</strong>",
    "</a>",
    "<span class=\"topbar-mobile-trigger\">Menu</span>",
    "</summary>",
    "<div class=\"topbar-mobile-panel\">",
    navigationMarkup,
    themeToggle,
    "</div>",
    "</details>",
    "</header>",
  ].join("");
}

function renderSubnav({ items = [], currentKey = "", theme = "light", helpers }) {
  const { escapeHtml, buildAdminLocation } = helpers;

  return [
    "<nav class=\"page-subnav\" aria-label=\"Section navigation\">",
    ...items.map((item) => (
      `<a href="${escapeHtml(buildAdminLocation({ path: item.path, theme, extra: item.extra || {} }))}"${item.key === currentKey ? " aria-current=\"page\"" : ""}>${escapeHtml(item.label)}</a>`
    )),
    "</nav>",
  ].join("");
}

function renderHelpIcon({ help }, helpers) {
  const { escapeHtml } = helpers;

  return [
    `<span class="field-help" tabindex="0" role="button" aria-expanded="false" aria-label="${escapeHtml(help)}" data-help="${escapeHtml(help)}">`,
    "<span aria-hidden=\"true\">?</span>",
    "</span>",
  ].join("");
}

function renderFieldLabelWithHelp({ forId, label, help }, helpers) {
  const { escapeHtml } = helpers;

  return [
    `<label class="field-label-with-help" for="${escapeHtml(forId)}">`,
    `<span>${escapeHtml(label)}</span>`,
    renderHelpIcon({ help }, helpers),
    "</label>",
  ].join("");
}

function renderShell({ currentSection, pageBody, message = "", error = "", theme = "light", themeLinks = null, config = {}, helpers }) {
  const { renderLayout } = helpers;

  const body = [
    "<div class=\"admin-shell lite-shell\">",
    renderAdminTopnav({
      currentSection,
      theme,
      themeLinks,
      appVersion: config.app?.version || "",
      imageTag: config.app?.imageTag || "",
      helpers,
    }),
    `<section class="admin-main lite-main">${pageBody}</section>`,
    "</div>",
  ].join("");

  return renderLayout({
    title: "Ghostlight AI Admin",
    body,
    message,
    error,
    theme,
    themeLinks,
    hideTitle: true,
    hideTopbar: true,
  });
}

function getRuntimeState({ config, dailyThreadAutomation = null, conversationStorage = null, helpers }) {
  const { extractRuntimeSettings } = helpers;
  const runtimeSettings = extractRuntimeSettings(config);

  return {
    runtimeSettings,
    chatModelValue: runtimeSettings["llm.chat.model"] || config.llm?.chat?.model || config.llm?.chatModel || "",
    summaryModelValue: runtimeSettings["llm.summary.model"] || config.llm?.summary?.model || config.llm?.summaryModel || "",
    imageModelValue: runtimeSettings["llm.image.model"] || config.llm?.image?.model || config.llm?.imageModel || "",
    imageGenerationModelValue: runtimeSettings["imageGeneration.model"] || config.imageGeneration?.model || "",
    imageGenerationResolutionValue: runtimeSettings["imageGeneration.resolution"] || config.imageGeneration?.resolution || "1K",
    imageGenerationHomepageFeedModeValue: runtimeSettings["imageGeneration.homepageFeedMode"] || config.imageGeneration?.homepageFeedMode || "randomized",
    audioTtsEnabled: Boolean(runtimeSettings["audio.ttsEnabled"] ?? config.audio?.ttsEnabled),
    audioElevenlabsVoiceId: runtimeSettings["audio.elevenlabsVoiceId"] || config.audio?.elevenlabsVoiceId || "",
    audioReadAloudModel: runtimeSettings["audio.readAloudModel"] || config.audio?.readAloudModel || "eleven_flash_v2_5",
    audioGeneratedAudioModel: runtimeSettings["audio.generatedAudioModel"] || config.audio?.generatedAudioModel || "eleven_multilingual_v2",
    audioGallerySavedSourceSurfaces: Array.isArray(runtimeSettings["audio.gallerySavedSourceSurfaces"])
      ? runtimeSettings["audio.gallerySavedSourceSurfaces"]
      : Array.isArray(config.audio?.gallerySavedSourceSurfaces)
        ? config.audio.gallerySavedSourceSurfaces
        : ["read_aloud", "chat", "scheduled", "heartbeat"],
    audioV3DeliveryTags: runtimeSettings["audio.v3DeliveryTags"] || config.audio?.v3DeliveryTags || "",
    audioVoiceSettingsEnabled: Boolean(runtimeSettings["audio.voiceSettingsEnabled"] ?? config.audio?.voiceSettingsEnabled),
    audioVoiceStability: runtimeSettings["audio.voiceStability"] ?? config.audio?.voiceStability ?? 0.7,
    audioVoiceSimilarityBoost: runtimeSettings["audio.voiceSimilarityBoost"] ?? config.audio?.voiceSimilarityBoost ?? 0.85,
    audioVoiceStyle: runtimeSettings["audio.voiceStyle"] ?? config.audio?.voiceStyle ?? 0,
    audioVoiceSpeed: runtimeSettings["audio.voiceSpeed"] ?? config.audio?.voiceSpeed ?? 1,
    audioVoiceSpeakerBoost: Boolean(runtimeSettings["audio.voiceSpeakerBoost"] ?? config.audio?.voiceSpeakerBoost ?? true),
    embeddingModelValue: runtimeSettings["llm.embedding.model"] || config.llm?.embedding?.model || config.llm?.embeddingModel || "",
    transcriptionModelValue: runtimeSettings["llm.transcription.model"] || config.llm?.transcription?.model || config.llm?.transcriptionModel || "",
    romanceModelValue: runtimeSettings["llm.romance.model"] || config.llm?.romance?.model || "",
    imageGenerationEnabled: Boolean(runtimeSettings["imageGeneration.enabled"] ?? config.imageGeneration?.enabled),
    imageGenerationAllowedAspectRatios: Array.isArray(runtimeSettings["imageGeneration.allowedAspectRatios"])
      ? runtimeSettings["imageGeneration.allowedAspectRatios"]
      : Array.isArray(config.imageGeneration?.allowedAspectRatios)
        ? config.imageGeneration.allowedAspectRatios
        : ["1:1", "9:16", "16:9"],
    historyLimitValue: runtimeSettings["chat.historyLimit"] ?? config.chat?.historyLimit ?? 20,
    timezoneValue: runtimeSettings["chat.timezone"] || config.chat?.timezone || "UTC",
    chatUserIdValue: runtimeSettings["chat.userId"] || config.chat?.userId || "",
    mainUserPresenceContextEnabled: Boolean(runtimeSettings["heartbeat.userPresenceContextEnabled"] ?? config.heartbeat?.userPresenceContextEnabled),
    externalSharedModeEnabled: Boolean(runtimeSettings["discord.externalSharedModeEnabled"] ?? config.discord?.externalSharedModeEnabled),
    externalSharedModeKey: runtimeSettings["discord.externalSharedModeKey"] || config.discord?.externalSharedModeKey || "shared_server",
    timelineDailyWindowDaysValue: runtimeSettings["memory.timelineDailyWindowDays"] ?? config.memory?.timelineDailyWindowDays ?? 14,
    memoryLookupEnabled: Boolean(runtimeSettings["memoryLookup.enabled"] ?? config.memoryLookup?.enabled),
    memoryCuratorEnabled: Boolean(runtimeSettings["memoryCurator.enabled"] ?? config.memoryCurator?.enabled),
    memoryCuratorStageTwoModelMode: runtimeSettings["memoryCurator.stageTwoModelMode"] || config.memoryCurator?.stageTwoModelMode || "summary",
    memoryCuratorAttentionScanLastRunAt: runtimeSettings["memoryCurator.attentionScanLastRunAt"] || config.memoryCurator?.attentionScanLastRunAt || "",
    memoryCuratorLongScanLastRunAt: runtimeSettings["memoryCurator.longScanLastRunAt"] || config.memoryCurator?.longScanLastRunAt || "",
    conversationRetrievalEnabled: Boolean(runtimeSettings["conversationRetrieval.enabled"] ?? config.conversationRetrieval?.enabled),
    dailySummaryEnabled: Boolean(runtimeSettings["memory.dailySummaryEnabled"] ?? config.memory?.dailySummaryEnabled),
    dailySummaryTimeValue: runtimeSettings["memory.dailySummaryTime"] || config.memory?.dailySummaryTime || "04:00",
    dailySummaryChannelIdsValue: Array.isArray(runtimeSettings["memory.dailySummaryChannelIds"])
      ? runtimeSettings["memory.dailySummaryChannelIds"].join("\n")
      : Array.isArray(config.memory?.dailySummaryChannelIds)
        ? config.memory.dailySummaryChannelIds.join("\n")
        : "",
    weeklySummaryEnabled: Boolean(runtimeSettings["memory.weeklySummaryEnabled"] ?? config.memory?.weeklySummaryEnabled),
    weeklySummaryTimeValue: runtimeSettings["memory.weeklySummaryTime"] || config.memory?.weeklySummaryTime || "04:00",
    weeklySummaryDayValue: runtimeSettings["memory.weeklySummaryDay"] || config.memory?.weeklySummaryDay || "monday",
    heartbeatEnabled: Boolean(runtimeSettings["heartbeat.enabled"] ?? config.heartbeat?.enabled),
    heartbeatActivityMode: runtimeSettings["heartbeat.activityMode"] || config.heartbeat?.activityMode || "normal",
    heartbeatGlobalCooldownMinutes: runtimeSettings["heartbeat.globalCooldownMinutes"] ?? config.heartbeat?.globalCooldownMinutes ?? 60,
    heartbeatDailyCap: runtimeSettings["heartbeat.dailyCap"] ?? config.heartbeat?.dailyCap ?? 5,
    heartbeatQuietHoursEnabled: Boolean(runtimeSettings["heartbeat.quietHoursEnabled"] ?? config.heartbeat?.quietHoursEnabled),
    heartbeatQuietHoursStart: runtimeSettings["heartbeat.quietHoursStart"] || config.heartbeat?.quietHoursStart || "22:00",
    heartbeatQuietHoursEnd: runtimeSettings["heartbeat.quietHoursEnd"] || config.heartbeat?.quietHoursEnd || "08:00",
    heartbeatConfidenceThreshold: runtimeSettings["heartbeat.confidenceThreshold"] ?? config.heartbeat?.confidenceThreshold ?? 0.6,
    heartbeatRecentDecisionLimit: runtimeSettings["heartbeat.recentDecisionLimit"] ?? config.heartbeat?.recentDecisionLimit ?? 10,
    adultPrivateModeEnabled: Boolean(runtimeSettings["chat.adultPrivateMode.enabled"] ?? config.chat?.adultPrivateMode?.enabled),
    adultPrivateModeChannelId: runtimeSettings["chat.adultPrivateMode.channelId"] || config.chat?.adultPrivateMode?.channelId || "",
    adultPrivateModeModel: runtimeSettings["chat.adultPrivateMode.model"] || config.chat?.adultPrivateMode?.model || "",
    adultPrivateModeSystemPrompt: runtimeSettings["chat.adultPrivateMode.systemPrompt"] || config.chat?.adultPrivateMode?.systemPrompt || "",
    adultPrivateModeSafeword: runtimeSettings["chat.adultPrivateMode.safeword"] || config.chat?.adultPrivateMode?.safeword || "red",
    adultPrivateModeAftercareEnabled: Boolean(runtimeSettings["chat.adultPrivateMode.aftercareEnabled"] ?? config.chat?.adultPrivateMode?.aftercareEnabled),
    adultPrivateModeAftercarePrompt: runtimeSettings["chat.adultPrivateMode.aftercarePrompt"] || config.chat?.adultPrivateMode?.aftercarePrompt || "",
    adultPrivateModeUserPreferences: runtimeSettings["chat.adultPrivateMode.userPreferences"] || config.chat?.adultPrivateMode?.userPreferences || "",
    adultPrivateModeUserWants: runtimeSettings["chat.adultPrivateMode.userWants"] || config.chat?.adultPrivateMode?.userWants || "",
    adultPrivateModeUserNeeds: runtimeSettings["chat.adultPrivateMode.userNeeds"] || config.chat?.adultPrivateMode?.userNeeds || "",
    adultPrivateModeSoftLimits: runtimeSettings["chat.adultPrivateMode.softLimits"] || config.chat?.adultPrivateMode?.softLimits || "",
    adultPrivateModeHardLimits: runtimeSettings["chat.adultPrivateMode.hardLimits"] || config.chat?.adultPrivateMode?.hardLimits || "",
    dailyThreadEnabled: Boolean(dailyThreadAutomation?.enabled),
    dailyThreadChannelId: dailyThreadAutomation?.channelId || "",
    dailyThreadScheduleTime: dailyThreadAutomation?.scheduleTime || "09:00",
    dailyThreadTitleTemplate: dailyThreadAutomation?.threadTitleTemplate || "MMM-DD [Day] - Daily Thread",
    dailyThreadStarterPrompt: dailyThreadAutomation?.threadStarterPrompt || "",
    dailyThreadEnabledTools: Array.isArray(dailyThreadAutomation?.enabledTools) ? dailyThreadAutomation.enabledTools : [],
    storage: conversationStorage || {
      eventCount: 0,
      messageEventCount: 0,
      oldestEventAt: null,
      newestEventAt: null,
      conversationCount: 0,
      conversationBytes: 0,
      databaseBytes: 0,
      recentConversations: [],
    },
  };
}

function renderPageIntro({ title, copy }) {
  return [
    "<section class=\"lite-panel page-frame\">",
    `<div class="page-head"><h2>${title}</h2><p>${copy}</p></div>`,
    "</section>",
  ].join("");
}

module.exports = {
  renderAdminSidebar: renderAdminTopnav,
  renderSubnav,
  renderHelpIcon,
  renderFieldLabelWithHelp,
  renderShell,
  getRuntimeState,
  renderPageIntro,
};
