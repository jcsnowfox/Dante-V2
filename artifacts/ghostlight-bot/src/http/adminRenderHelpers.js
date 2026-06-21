const { canGenerateAudio } = require("../audio/generateAudio");
const { canSyncMemories } = require("../memory/syncMemories");
const { extractRuntimeSettings } = require("../config/runtimeSettings");
const { SUPPORTED_MEMORY_DOMAINS } = require("../memory/domains");
const {
  SUPPORTED_MEMORY_TYPES,
  SUPPORTED_SENSITIVITY_LEVELS,
} = require("../storage");
const { renderLayout, renderEntryPage: renderSharedEntryPage } = require("./renderShared");
const { renderIcon } = require("./iconLibrary");
const {
  renderMemoriesPage: renderMemoriesPageTemplate,
  renderMemoryEditorPage: renderMemoryEditorPageTemplate,
} = require("./renderMemories");
const { renderProactivePage: renderProactivePageTemplate } = require("./renderProactivePage");
const {
  renderGeneratedMemoryDetailPage: renderGeneratedMemoryDetailPageTemplate,
} = require("./renderGeneratedMemoryDetail");
const {
  renderShell: renderAdminShellTemplate,
  renderSubnav,
  renderHomePage: renderHomePageTemplate,
  renderCompanionPage: renderCompanionPageTemplate,
  renderBehaviourPage: renderBehaviourPageTemplate,
  renderImagesPage: renderImagesPageTemplate,
  renderImagesLayout: renderImagesLayoutTemplate,
  renderImagesGalleryPage: renderImagesGalleryPageTemplate,
  renderImageDetailPage: renderImageDetailPageTemplate,
  renderGalleryLayout: renderGalleryLayoutTemplate,
  renderToolsLayout: renderToolsLayoutTemplate,
  renderGifToolsPage: renderGifToolsPageTemplate,
  renderAudioSettingsPage: renderAudioSettingsPageTemplate,
  renderAudioGalleryPage: renderAudioGalleryPageTemplate,
  renderAudioDetailPage: renderAudioDetailPageTemplate,
  renderMusicGalleryPage: renderMusicGalleryPageTemplate,
  renderMemoryLayout: renderMemoryLayoutTemplate,
  renderMemoryMapPage: renderMemoryMapPageTemplate,
  renderMemoryImportsPage: renderMemoryImportsPageTemplate,
  renderMemoryReviewPage: renderMemoryReviewPageTemplate,
  renderMemoryCuratorPage: renderMemoryCuratorPageTemplate,
  renderSchedulesPage: renderSchedulesPageTemplate,
  renderJournalsPage: renderJournalsPageTemplate,
  renderHeartbeatPage: renderHeartbeatPageTemplate,
  renderAdminToolsPage: renderAdminToolsPageTemplate,
  renderChannelModesPage: renderChannelModesPageTemplate,
  renderEmotionalArcPage: renderEmotionalArcPageTemplate,
  renderFeedbackLearningPage: renderFeedbackLearningPageTemplate,
  renderRelationalStatePage: renderRelationalStatePageTemplate,
  renderSecondLifePage: renderSecondLifePageTemplate,
} = require("./renderAdminPages");
const {
  escapeHtml,
  renderOptions,
  getAutomationTypeLabel,
  renderAutomationTypeOptions,
  buildMemoryCategoryOptions,
  withThemeField,
  buildThemeLinks,
  buildAdminLocation,
  buildReturnLocation,
  getMessage,
  getError,
  normalizeTheme,
} = require("./adminUiHelpers");
const { renderHelpIcon } = require("./renderAdminPages/shared");

const DURABLE_MEMORY_TYPES = Object.freeze(["anchor", "canon", "resolved"]);
const MANUAL_MEMORY_TYPES = Object.freeze([
  "anchor",
  "canon",
  "resolved",
  "roleplay",
  "timeline_daily",
  "timeline_weekly",
]);
const MEMORY_DELETE_CONFIRMATION_MESSAGE = "Are you sure you want to delete this memory?\n\nThis action can't be undone. If you only want to remove it from the active memory pool for now, archive it instead.";

function renderIconImage(kind, theme, alt = "", className = "icon-image") {
  if (kind === "logo") {
    return `<img src="/assets/ghostlight-logo.webp" alt="${escapeHtml(alt)}" class="${escapeHtml(className)}">`;
  }

  return renderIcon(kind, { className, alt });
}

function renderConfirmOnSubmit(message) {
  return ` onsubmit="return confirm(${escapeHtml(JSON.stringify(String(message || "")))})"`;
}

function renderEntryPage(options) {
  return renderSharedEntryPage({
    ...options,
    productLabel: "Ghostlight",
    renderIconImage,
  });
}

function formatDateValue(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString().slice(0, 10);
}

function formatBytes(value) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const decimals = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function renderGeneratedMemoryDetailPage(params) {
  return renderGeneratedMemoryDetailPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      withThemeField,
      renderOptions,
      renderLayout,
      supportedMemoryDomains: SUPPORTED_MEMORY_DOMAINS,
      supportedMemoryTypes: SUPPORTED_MEMORY_TYPES,
      supportedSensitivityLevels: SUPPORTED_SENSITIVITY_LEVELS,
    },
  });
}

function renderAdminShell(params) {
  return renderAdminShellTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      renderSubnav,
      renderIconImage,
      renderLayout,
    },
  });
}

function renderHomePage(params) {
  return renderHomePageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      renderIconImage,
      withThemeField,
    },
  });
}

function renderCompanionPage(params) {
  return renderCompanionPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      withThemeField,
      buildAdminLocation,
    },
  });
}

function renderBehaviourPage(params) {
  return renderBehaviourPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      withThemeField,
      renderOptions,
      buildAdminLocation,
    },
  });
}

function renderImagesPage(params) {
  return renderImagesPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      buildAdminLocation,
      withThemeField,
      renderConfirmOnSubmit,
    },
  });
}

function renderImagesLayout(params) {
  return renderImagesLayoutTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
    },
  });
}

function renderImagesGalleryPage(params) {
  return renderImagesGalleryPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      withThemeField,
    },
  });
}

function renderImageDetailPage(params) {
  return renderImageDetailPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      withThemeField,
      renderConfirmOnSubmit,
    },
  });
}

function renderGalleryLayout(params) {
  return renderGalleryLayoutTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
    },
  });
}

function renderToolsLayout(params) {
  return renderToolsLayoutTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
    },
  });
}

function renderAudioSettingsPage(params) {
  return renderAudioSettingsPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      buildAdminLocation,
      withThemeField,
    },
  });
}

function renderGifToolsPage(params) {
  return renderGifToolsPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
    },
  });
}

function renderAudioGalleryPage(params) {
  return renderAudioGalleryPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      withThemeField,
      renderConfirmOnSubmit,
      renderIconImage,
    },
  });
}

function renderAudioDetailPage(params) {
  return renderAudioDetailPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      withThemeField,
      renderConfirmOnSubmit,
    },
  });
}

function renderMusicGalleryPage(params) {
  return renderMusicGalleryPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      formatDateValue,
      withThemeField,
      renderIconImage,
    },
  });
}

function renderMemoryLayout(params) {
  return renderMemoryLayoutTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
    },
  });
}

function renderMemoryImportsPage(params) {
  return renderMemoryImportsPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      withThemeField,
    },
  });
}

function renderMemoryMapPage(params) {
  return renderMemoryMapPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
    },
  });
}

function renderMemoryReviewPage(params) {
  return renderMemoryReviewPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      renderOptions,
      formatDateValue,
      withThemeField,
      DURABLE_MEMORY_TYPES,
      MANUAL_MEMORY_TYPES,
    },
  });
}

function renderMemoryCuratorPage(params) {
  return renderMemoryCuratorPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      buildAdminLocation,
      formatDateValue,
      renderHelpIcon,
      withThemeField,
    },
  });
}

function renderSchedulesPage(params) {
  return renderSchedulesPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      buildAdminLocation,
      renderIconImage,
      renderOptions,
      withThemeField,
      renderProactivePage: (proactiveParams) => renderProactivePageTemplate({
        ...proactiveParams,
        helpers: {
          escapeHtml,
          formatDateValue,
          getAutomationTypeLabel,
          renderAutomationTypeOptions,
          buildAdminLocation,
          renderIconImage,
          renderConfirmOnSubmit,
          withThemeField,
          targetOptions: params.targetOptions || [],
          targetLabelsByValue: params.targetLabelsByValue || new Map(),
          timezoneDefault: params.config.chat?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          globalUserId: params.config.chat?.userId || "",
        },
      }),
    },
    targetOptions: params.targetOptions || [],
    targetLabelsByValue: params.targetLabelsByValue || new Map(),
  });
}

function renderJournalsPage(params) {
  return renderJournalsPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      buildAdminLocation,
      renderConfirmOnSubmit,
      withThemeField,
    },
  });
}

function renderHeartbeatPage(params) {
  return renderHeartbeatPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      buildAdminLocation,
      formatDateValue,
      renderIconImage,
      renderOptions,
      targetOptions: params.targetOptions || [],
      targetLabelsByValue: params.targetLabelsByValue || new Map(),
      withThemeField,
    },
  });
}

function renderAdminToolsPage(params) {
  return renderAdminToolsPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      buildAdminLocation,
      formatDateValue,
      formatBytes,
      renderConfirmOnSubmit,
      withThemeField,
      renderOptions,
    },
  });
}

function renderChannelModesPage(params) {
  return renderChannelModesPageTemplate({
    ...params,
    helpers: {
      extractRuntimeSettings,
      escapeHtml,
      buildAdminLocation,
      withThemeField,
      renderOptions,
    },
  });
}

function renderEmotionalArcPage(params) {
  return renderEmotionalArcPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      withThemeField,
      buildAdminLocation,
    },
  });
}

function renderFeedbackLearningPage(params) {
  return renderFeedbackLearningPageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      withThemeField,
      buildAdminLocation,
    },
  });
}

function renderRelationalStatePage(params) {
  return renderRelationalStatePageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      withThemeField,
      buildAdminLocation,
    },
  });
}

function renderSecondLifePage(params) {
  return renderSecondLifePageTemplate({
    ...params,
    helpers: {
      escapeHtml,
      withThemeField,
      buildAdminLocation,
    },
  });
}

function buildAdminPageHelpers({ sortMemories, config = {} }) {
  return {
    normalizeTheme,
    buildThemeLinks,
    buildAdminLocation,
    renderIconImage,
    getMessage,
    getError,
    renderAdminShell: (params) => renderAdminShell({
      config,
      ...params,
    }),
    renderHomePage,
    renderCompanionPage,
    renderBehaviourPage,
    renderImagesPage,
    renderImagesLayout,
    renderImagesGalleryPage,
    renderImageDetailPage,
    renderGalleryLayout,
    renderToolsLayout,
    renderGifToolsPage,
    renderAudioSettingsPage,
    renderAudioGalleryPage,
    renderAudioDetailPage,
    renderMusicGalleryPage,
    renderMemoriesPage: (params) => renderMemoriesPageTemplate({
      ...params,
      helpers: {
        canSyncMemories,
        escapeHtml,
        formatDateValue,
        renderOptions,
        buildMemoryCategoryOptions,
        buildAdminLocation,
        renderIconImage,
        renderConfirmOnSubmit,
        withThemeField,
        DURABLE_MEMORY_TYPES,
        MANUAL_MEMORY_TYPES,
        MEMORY_DELETE_CONFIRMATION_MESSAGE,
      },
    }),
    renderMemoryEditorPage: (params) => renderMemoryEditorPageTemplate({
      ...params,
      helpers: {
        escapeHtml,
        renderOptions,
        buildMemoryCategoryOptions,
        buildAdminLocation,
        withThemeField,
        MANUAL_MEMORY_TYPES,
        SUPPORTED_SENSITIVITY_LEVELS,
      },
    }),
    renderMemoryLayout,
    renderMemoryMapPage,
    renderMemoryImportsPage,
    renderMemoryReviewPage,
    renderMemoryCuratorPage,
    renderSchedulesPage,
    renderJournalsPage,
    renderHeartbeatPage,
    renderAdminToolsPage,
    renderChannelModesPage,
    renderEmotionalArcPage,
    renderFeedbackLearningPage,
    renderRelationalStatePage,
    renderSecondLifePage,
    escapeHtml,
    formatDateValue,
    renderOptions,
    buildAdminLocation,
    withThemeField,
    extractRuntimeSettings,
    sortMemories,
  };
}

function renderAdminWorkspacePage(params) {
  const theme = params.theme || "light";
  const themeLinks = params.themeLinks || null;
  const view = String(params.currentView || "home");
  const renderWorkspaceShell = (options) => renderAdminShell({
    config: params.config,
    ...options,
  });

  if (view === "companion") {
    return renderWorkspaceShell({
      currentSection: "companion",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderCompanionPage({
        config: params.config,
        theme,
      }),
    });
  }

  if (view === "behaviour") {
    return renderWorkspaceShell({
      currentSection: "behaviour",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderBehaviourPage({
        config: params.config,
        theme,
        customReactionEmojiOptions: params.customReactionEmojiOptions || [],
        behaviourTab: params.behaviourTab,
      }),
    });
  }

  if (view === "images") {
    return renderWorkspaceShell({
      currentSection: "tools",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderImagesPage({
        config: params.config,
        theme,
        stylePresets: params.stylePresets || [],
        appearancePresets: params.appearancePresets || [],
        selectedStylePreset: params.selectedStylePreset || null,
        selectedAppearancePreset: params.selectedAppearancePreset || null,
        currentTab: params.currentImagesTab || "",
      }),
    });
  }

  if (view === "gifs") {
    return renderWorkspaceShell({
      currentSection: "tools",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderToolsLayout({
        currentTab: "gifs",
        theme,
        tabBody: renderGifToolsPage({
          config: params.config,
        }),
      }),
    });
  }

  if (view === "memory" || view === "memories") {
    const currentMemoryTab = String(params.currentMemoryTab || "library");
    const memoryTabBody = currentMemoryTab === "map"
      ? renderMemoryMapPage({
        mapData: params.mapData || {},
        theme,
      })
      : renderMemoriesPageTemplate({
        ...params,
        currentPath: "/admin/memory/library",
        helpers: {
          canSyncMemories,
          escapeHtml,
          formatDateValue,
          renderOptions,
          buildMemoryCategoryOptions,
          buildAdminLocation,
          renderIconImage,
          renderConfirmOnSubmit,
          withThemeField,
          DURABLE_MEMORY_TYPES,
          MANUAL_MEMORY_TYPES,
          MEMORY_DELETE_CONFIRMATION_MESSAGE,
        },
      });

    return renderWorkspaceShell({
      currentSection: "memory",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderMemoryLayout({
        currentTab: currentMemoryTab,
        theme,
        tabBody: memoryTabBody,
      }),
    });
  }

  if (view === "schedules") {
    const automations = params.automations || [];

    return renderWorkspaceShell({
      currentSection: "schedules",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderSchedulesPage({
        config: params.config,
        currentTab: params.currentSchedulesTab || "actions",
        automations,
        failedAutomations: params.failedAutomations || automations.filter((automation) => String(automation.lastError || "").trim()),
        editingAutomation: params.editingAutomation || null,
        dailyThreadAutomation: params.dailyThreadAutomation || null,
        targetOptions: params.targetOptions || [],
        targetLabelsByValue: params.targetLabelsByValue || new Map(),
        theme,
      }),
    });
  }

  if (view === "journals") {
    return renderWorkspaceShell({
      currentSection: "journals",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderJournalsPage({
        config: params.config,
        journalEntries: params.journalEntries || [],
        currentEntry: params.currentEntry || null,
        journalPage: params.journalPage || 1,
        journalTotalPages: params.journalTotalPages || 1,
        theme,
      }),
    });
  }

  if (view === "heartbeat") {
    return renderWorkspaceShell({
      currentSection: "heartbeat",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderHeartbeatPage({
        currentTab: params.currentTab || "overview",
        selectedActionId: params.selectedActionId || "",
        theme,
        config: params.config,
        actions: params.actions || [],
        runtime: params.runtime || {},
        targetOptions: params.targetOptions || [],
        targetLabelsByValue: params.targetLabelsByValue || new Map(),
      }),
    });
  }

  if (view === "channelModes") {
    return renderWorkspaceShell({
      currentSection: "admin",
      theme,
      themeLinks,
      message: params.message,
      error: params.error,
      pageBody: renderChannelModesPage({
        config: params.config,
        modes: params.modes || [],
        channelOptions: params.channelOptions || [],
        channelModeAssignments: params.channelModeAssignments || [],
        selectedModeKey: params.selectedModeKey || "",
        theme,
      }),
    });
  }

  return renderWorkspaceShell({
    currentSection: "home",
    theme,
    themeLinks,
    message: params.message,
    error: params.error,
    pageBody: renderHomePage({
      stats: {
        activeModel: params.config?.llm?.chat?.model || params.config?.llm?.chatModel || params.config?.openai?.chatModel || "Not set",
        memoryCount: params.totalMemories || params.memories?.length || 0,
        stagedCount: params.totalItems || 0,
        scheduleCount: Array.isArray(params.automations) ? params.automations.length : 0,
        dailyThreadStatus: params.dailyThreadAutomation?.enabled
          ? `Enabled at ${params.dailyThreadAutomation.scheduleTime}`
          : (params.dailyThreadAutomation ? "Paused" : "Not configured"),
        heartbeatStatus: params.config?.heartbeat?.activityMode === "off" ? "Off" : (params.config?.heartbeat?.activityMode || "normal"),
        timezone: params.config?.chat?.timezone || "UTC",
        nextScheduleLabel: params.automations?.[0]?.label || params.automations?.[0]?.name || "",
        journalCount: Array.isArray(params.journalEntries) ? params.journalEntries.length : 0,
        warningText: params.error || "",
        warnings: params.warnings || [],
        statuses: params.statuses || [
          {
            label: "Chat model",
            value: params.config?.llm?.chat?.model || params.config?.llm?.chatModel || params.config?.openai?.chatModel || "Not set",
            icon: "chat_model",
            helpText: "Current default chat model.",
          },
          {
            label: "Daily thread",
            value: params.dailyThreadAutomation?.enabled
              ? `${params.dailyThreadAutomation.scheduleTime}${params.dailyThreadAutomation.timezone ? ` (${params.dailyThreadAutomation.timezone})` : ""}`
              : "Off",
            icon: params.dailyThreadAutomation?.enabled ? "daily_enabled" : "daily_disabled",
            helpText: params.dailyThreadAutomation?.enabled ? "Daily thread is on." : "Daily thread is off.",
          },
          {
            label: "Heartbeat",
            value: params.config?.heartbeat?.activityMode === "off" ? "Off" : (params.config?.heartbeat?.activityMode || "normal"),
            icon: "heartbeat",
            helpText: "Current heartbeat mode.",
          },
        ],
        featureStates: params.featureStates || [
          {
            label: "Timeline memories",
            icon: "timeline",
            active: Boolean(params.config?.memory?.dailySummaryEnabled || params.config?.memory?.weeklySummaryEnabled),
            path: "/admin/memory/curator",
            helpText: `Timeline memory creation is ${params.config?.memory?.dailySummaryEnabled || params.config?.memory?.weeklySummaryEnabled ? "On" : "Off"}.`,
          },
          {
            label: "Memory suggestions",
            icon: "memories",
            active: Boolean(params.config?.memoryCurator?.enabled),
            path: "/admin/memory/curator",
            helpText: `Memory suggestions are ${params.config?.memoryCurator?.enabled ? "On" : "Off"}.`,
          },
          {
            label: "GIFs",
            icon: "gif",
            active: Boolean(params.config?.giphy?.apiKey),
            path: "/admin/tools/gifs",
            helpText: `GIF search is ${params.config?.giphy?.apiKey ? "On" : "Off"}.`,
          },
          {
            label: "Images",
            icon: "images",
            active: Boolean(params.config?.imageGeneration?.enabled),
            path: "/admin/tools/images",
            helpText: `Image generation is ${params.config?.imageGeneration?.enabled ? "On" : "Off"}.`,
          },
          {
            label: "Audio",
            icon: "audio",
            active: canGenerateAudio(params.config),
            path: "/admin/tools/audio",
            helpText: `Audio generation is ${canGenerateAudio(params.config) ? "On" : "Off"}.`,
          },
          {
            label: "Spotify",
            icon: "playlist",
            active: Boolean(
              params.config?.spotify?.enabled !== false
              && params.config?.spotify?.clientId
              && params.config?.spotify?.clientSecret
            ),
            path: "/admin/tools/music",
            helpText: `Spotify music curation is ${
              params.config?.spotify?.enabled !== false
              && params.config?.spotify?.clientId
              && params.config?.spotify?.clientSecret
                ? "On"
                : "Off"
            }.`,
          },
        ],
        recentDecisions: params.recentDecisions || (Array.isArray(params.heartbeatRuntime?.recentDecisions) ? params.heartbeatRuntime.recentDecisions : [])
          .filter((item) => item && (item.status === "fired" || (item.status === "skipped" && ["low_confidence", "hold_back"].includes(item.reason))))
          .slice(0, 2)
          .map((item) => ({
            label: item.status === "fired" ? (item.actionId || item.executorType || "Heartbeat") : "Held back",
            status: item.status,
            executorType: item.executorType || "",
            at: item.at || "",
            why: item.why || "",
          })),
        recentJournals: params.recentJournals || (Array.isArray(params.journalEntries) ? params.journalEntries : []).slice(0, 5).map((entry) => ({
          entryId: entry.entryId,
          title: entry.title || "Journal entry",
          content: entry.content || "",
          createdAt: entry.createdAt || "",
        })),
        recentImages: Array.isArray(params.recentImages) ? params.recentImages : [],
      },
      theme,
    }),
  });
}

module.exports = {
  DURABLE_MEMORY_TYPES,
  MANUAL_MEMORY_TYPES,
  MEMORY_DELETE_CONFIRMATION_MESSAGE,
  normalizeTheme,
  escapeHtml,
  renderOptions,
  getAutomationTypeLabel,
  renderAutomationTypeOptions,
  buildMemoryCategoryOptions,
  withThemeField,
  buildThemeLinks,
  buildAdminLocation,
  buildReturnLocation,
  getMessage,
  getError,
  renderIconImage,
  renderConfirmOnSubmit,
  renderEntryPage,
  renderGeneratedMemoryDetailPage,
  renderAdminShell,
  renderHomePage,
  renderCompanionPage,
  renderBehaviourPage,
  renderImagesPage,
  renderImagesLayout,
  renderImagesGalleryPage,
  renderImageDetailPage,
  renderGalleryLayout,
  renderToolsLayout,
  renderGifToolsPage,
  renderAudioSettingsPage,
    renderAudioGalleryPage,
    renderAudioDetailPage,
    renderMusicGalleryPage,
    renderMemoryLayout,
  renderMemoryMapPage,
  renderMemoryImportsPage,
  renderMemoryReviewPage,
  renderMemoryCuratorPage,
  renderSchedulesPage,
  renderJournalsPage,
  renderHeartbeatPage,
  renderAdminToolsPage,
  buildAdminPageHelpers,
  renderAdminWorkspacePage,
  formatDateValue,
  formatBytes,
};
