const NAV_GROUPS = [
  { label: "Core", links: [
    { section: "home", label: "Home", path: "/admin", icon: "home" },
    { section: "companion", label: "Companion", path: "/admin/companion", icon: "companion" },
  ] },
  { label: "Self & State", links: [
    { section: "emotionalArc", label: "Emotional Arc", path: "/admin/emotional-arc", icon: "emotionalArc" },
    { section: "innerLife", label: "Inner Life", path: "/admin/inner-life", icon: "emotionalArc" },
    { section: "relationalState", label: "Relational State", path: "/admin/relational-state", icon: "relationalState" },
    { section: "feedbackLearning", label: "Feedback & Learning", path: "/admin/feedback-learning", icon: "feedbackLearning" },
  ] },
  { label: "Memory", links: [
    { section: "memory", label: "Memory", path: "/admin/memory/library", icon: "memories" },
    { section: "continuity", label: "Continuity", path: "/admin/continuity/overview", icon: "automation" },
    { section: "journals", label: "Journals", path: "/admin/journals", icon: "journals" },
  ] },
  { label: "World", links: [
    { section: "secondLife", label: "Second Life", path: "/admin/second-life", icon: "companion" },
    { section: "travel", label: "Travel", path: "/admin/travel", icon: "companion" },
  ] },
  { label: "Learning", links: [
    { section: "norwegian", label: "Norwegian", path: "/admin/norwegian", icon: "feedbackLearning" },
  ] },
  { label: "Systems", links: [
    { section: "alive", label: "Alive Layer", path: "/admin/alive", icon: "heartbeat" },
    { section: "games", label: "Games", path: "/admin/games", icon: "tools" },
    { section: "heartbeat", label: "Heartbeat", path: "/admin/heartbeat/timing", icon: "heartbeat" },
    { section: "schedules", label: "Schedules", path: "/admin/schedules", icon: "automation" },
    { section: "gallery", label: "Gallery", path: "/admin/gallery/images", icon: "gallery" },
    { section: "tools", label: "Tools", path: "/admin/tools/images", icon: "tools" },
  ] },
  { label: "Developer", links: [
    { section: "engineering", label: "Engineering", path: "/admin/engineering", icon: "dashboard" },
    { section: "engineering", label: "AI Diagnostics", path: "/admin/engineering/ai", icon: "dashboard" },
  ] },
  { label: "Admin", links: [
    { section: "admin", label: "Admin", path: "/admin/admin", icon: "dashboard" },
  ] },
];

function buildSidebarNav({ currentSection, theme, themeLinks, escapeHtml, buildAdminLocation, renderIconImage }) {
  const groupsMarkup = NAV_GROUPS.map((group) => {
    const groupLinks = group.links.map((link) => {
      const href = escapeHtml(buildAdminLocation({ path: link.path, theme }));
      const active = currentSection === link.section ? " aria-current=\"page\"" : "";
      const icon = renderIconImage(link.icon, theme, "", "gl-nav-icon-img");
      return `<a class="gl-nav-link" href="${href}"${active}><span class="gl-nav-icon" aria-hidden="true">${icon}</span><span class="gl-nav-label">${escapeHtml(link.label)}</span></a>`;
    }).join("");
    return [
      "<div class=\"gl-nav-group\">",
      `<span class="gl-nav-group-label">${escapeHtml(group.label)}</span>`,
      groupLinks,
      "</div>",
    ].join("");
  }).join("");

  const themeToggle = themeLinks
    ? [
      "<div class=\"gl-sidebar-theme theme-switcher\" aria-label=\"Theme toggle\">",
      `<a href="${escapeHtml(themeLinks.light)}"${theme === "light" ? " aria-current=\"page\"" : ""}>Light</a>`,
      `<a href="${escapeHtml(themeLinks.dark)}"${theme === "dark" ? " aria-current=\"page\"" : ""}>Dark</a>`,
      "</div>",
    ].join("")
    : "";

  return { groupsMarkup, themeToggle };
}

function renderAdminSidebar({ currentSection = "home", theme = "light", themeLinks = null, helpers }) {
  const { escapeHtml, buildAdminLocation, renderIconImage } = helpers;
  const homeLocation = escapeHtml(buildAdminLocation({ path: "/admin", theme }));
  const { groupsMarkup, themeToggle } = buildSidebarNav({ currentSection, theme, themeLinks, escapeHtml, buildAdminLocation, renderIconImage });

  const sidebar = [
    "<aside class=\"gl-sidebar\">",
    "<div class=\"gl-sidebar-inner\">",
    `<a class="gl-sidebar-brand" href="${homeLocation}">`,
    "<span class=\"gl-sidebar-logo\" aria-hidden=\"true\"><img src=\"/assets/ghostlight-logo.webp\" alt=\"\"></span>",
    "<span class=\"gl-sidebar-brand-name\">Ghostlight AI</span>",
    "</a>",
    "<nav class=\"gl-sidebar-nav\" aria-label=\"Ghostlight AI admin navigation\">",
    groupsMarkup,
    "</nav>",
    "<div class=\"gl-sidebar-footer\">",
    themeToggle,
    "</div>",
    "</div>",
    "</aside>",
  ].join("");

  const mobileNav = [
    "<details class=\"gl-mobile-nav\">",
    "<summary class=\"gl-mobile-nav-summary\">",
    `<a class="gl-mobile-brand" href="${homeLocation}">`,
    "<img src=\"/assets/ghostlight-logo.webp\" alt=\"\" class=\"gl-mobile-logo\">",
    "<span>Ghostlight AI</span>",
    "</a>",
    "<span class=\"gl-mobile-trigger\" aria-hidden=\"true\">&#9776;</span>",
    "</summary>",
    "<div class=\"gl-mobile-panel\">",
    "<nav aria-label=\"Ghostlight AI admin navigation\">",
    groupsMarkup,
    "</nav>",
    themeToggle,
    "</div>",
    "</details>",
  ].join("");

  return sidebar + mobileNav;
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
  const { renderLayout, escapeHtml } = helpers;
  const notice = message ? `<p class="notice success">${escapeHtml(message)}</p>` : "";
  const warning = error ? `<p class="notice error">${escapeHtml(error)}</p>` : "";

  const body = [
    "<div class=\"gl-app-shell\">",
    renderAdminSidebar({ currentSection, theme, themeLinks, helpers }),
    "<div class=\"gl-app-content lite-main\">",
    notice,
    warning,
    pageBody,
    "</div>",
    "</div>",
  ].join("");

  return renderLayout({
    title: "Ghostlight AI Admin",
    body,
    message: "",
    error: "",
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
    audioTtsProvider: runtimeSettings["audio.ttsProvider"] || config.audio?.ttsProvider || (runtimeSettings["audio.ttsEnabled"] ?? config.audio?.ttsEnabled ? "elevenlabs" : "none"),
    audioElevenlabsVoiceId: runtimeSettings["audio.elevenlabsVoiceId"] || config.audio?.elevenlabsVoiceId || "",
    audioFishVoiceId: runtimeSettings["audio.fishVoiceId"] || config.audio?.fishVoiceId || config.fishAudio?.voiceId || "",
    audioFishModelId: runtimeSettings["audio.fishModelId"] || config.audio?.fishModelId || config.fishAudio?.modelId || "",
    fishAudioKeyConfigured: Boolean(String(config.fishAudio?.apiKey || "").trim()),
    audioReadAloudModel: runtimeSettings["audio.readAloudModel"] || config.audio?.readAloudModel || "eleven_flash_v2_5",
    audioGeneratedAudioModel: runtimeSettings["audio.generatedAudioModel"] || config.audio?.generatedAudioModel || "eleven_multilingual_v2",
    audioGallerySavedSourceSurfaces: Array.isArray(runtimeSettings["audio.gallerySavedSourceSurfaces"])
      ? runtimeSettings["audio.gallerySavedSourceSurfaces"]
      : Array.isArray(config.audio?.gallerySavedSourceSurfaces)
        ? config.audio.gallerySavedSourceSurfaces
        : ["read_aloud", "chat", "scheduled", "heartbeat"],
    audioV3DeliveryTags: runtimeSettings["audio.v3DeliveryTags"] || config.audio?.v3DeliveryTags || "",
    audioFishNlTags: runtimeSettings["audio.fishNlTags"] || config.audio?.fishNlTags || "",
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
  renderAdminSidebar,
  renderSubnav,
  renderHelpIcon,
  renderFieldLabelWithHelp,
  renderShell,
  getRuntimeState,
  renderPageIntro,
};
