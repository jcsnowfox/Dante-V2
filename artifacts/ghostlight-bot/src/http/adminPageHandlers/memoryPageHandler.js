const { prepareMemoryMapData } = require("../memoryMapData");
const { itemMatchesReviewFilters } = require("../memoryReviewQueue");
const { buildMemoryQueryState, loadDiscordTargetOptions } = require("./shared");

async function handleMemoryPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks }) {
  const {
    getMessage,
    getError,
    renderAdminShell,
    renderMemoriesPage,
    renderMemoryEditorPage,
    renderMemoryLayout,
    renderMemoryMapPage,
    renderMemoryImportsPage,
    renderMemoryReviewPage,
    renderMemoryCuratorPage,
    sortMemories,
  } = helpers;

  const memoryQueryState = buildMemoryQueryState(url);
  const requestedPage = Number(url.searchParams.get("page")) || 1;
  const page = Math.max(1, requestedPage);
  const pageSize = 10;

  if (route.editor) {
    const editId = url.searchParams.get("edit") || "";
    const editingMemory = editId
      ? await innerContext.memoryStore.getMemoryById(editId, {
        userScope: innerContext.config.memory.userScope,
      })
      : null;

    innerRes.end(renderAdminShell({
      currentSection: "memory",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderMemoryLayout({
        currentTab: "library",
        theme,
        tabBody: renderMemoryEditorPage({
          config: innerContext.config,
          editingMemory,
          activeFilter: memoryQueryState.active,
          page,
          theme,
          searchQuery: memoryQueryState.q,
          memoryTypeFilter: memoryQueryState.memoryType,
          domainFilter: memoryQueryState.domain,
          sortKey: memoryQueryState.sort,
          sortDirection: memoryQueryState.direction,
          currentPath: "/admin/memory/library",
        }),
      }),
    }));
    return;
  }

  if (route.tab === "review") {
    const selectedStatus = String(url.searchParams.get("status") || "needs_review").trim().toLowerCase();
    const selectedAction = String(url.searchParams.get("action") || "").trim().toLowerCase();
    const rejectedRetentionDays = innerContext.config.memory.reviewRejectedRetentionDays || 30;

    if (typeof innerContext.generatedMemories.deleteRejectedGeneratedMemoriesOlderThan === "function") {
      try {
        await innerContext.generatedMemories.deleteRejectedGeneratedMemoriesOlderThan({
          userScope: innerContext.config.memory.userScope,
          retentionDays: rejectedRetentionDays,
        });
      } catch (error) {
        innerContext.logger?.warn?.("[memory] Failed to prune old rejected review items", {
          error: error?.message || String(error),
        });
      }
    }

    const allGeneratedItems = await innerContext.generatedMemories.listGeneratedMemories({
      status: ["proposed", "approved", "rejected", "archived"].includes(selectedStatus) ? selectedStatus : undefined,
      userScope: innerContext.config.memory.userScope,
      limit: 500,
    });
    const reviewFilters = {
      status: selectedStatus,
      action: selectedAction,
    };
    const generatedItems = allGeneratedItems.filter((item) => itemMatchesReviewFilters(item, reviewFilters));
    const startIndex = (page - 1) * pageSize;
    const items = generatedItems.slice(startIndex, startIndex + pageSize);

    innerRes.end(renderAdminShell({
      currentSection: "memory",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderMemoryLayout({
        currentTab: "review",
        theme,
        tabBody: renderMemoryReviewPage({
          items,
          filters: {
            ...reviewFilters,
          },
          page,
          pageSize,
          totalItems: generatedItems.length,
          theme,
        }),
      }),
    }));
    return;
  }

  if (route.tab === "map") {
    let mapData;
    try {
      mapData = await prepareMemoryMapData({
        memoryStore: innerContext.memoryStore,
        config: innerContext.config,
        theme,
        buildAdminLocation: helpers.buildAdminLocation,
      });
    } catch (err) {
      innerContext.logger?.warn?.("[memory-map] Failed to load map data; rendering error state", {
        error: err?.message || String(err),
      });
      const savedCount = typeof innerContext.memoryStore?.countMemories === "function"
        ? await innerContext.memoryStore.countMemories({ userScope: innerContext.config?.memory?.userScope || "", activeOnly: true }).catch(() => 0)
        : 0;
      mapData = {
        totalActiveMemories: savedCount,
        plottedCount: 0,
        omittedWithoutVectorCount: 0,
        capped: false,
        projectionMethod: "pca",
        availableDomains: [],
        availableMemoryTypes: [],
        points: [],
        qdrantError: err?.message || String(err),
        savedMemoryCount: savedCount,
      };
    }

    innerRes.end(renderAdminShell({
      currentSection: "memory",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderMemoryLayout({
        currentTab: "map",
        theme,
        tabBody: renderMemoryMapPage({
          mapData,
          theme,
        }),
      }),
    }));
    return;
  }

  if (route.tab === "curator") {
    const configuredChannelIds = Array.isArray(innerContext.config.memory?.dailySummaryChannelIds)
      ? innerContext.config.memory.dailySummaryChannelIds.filter(Boolean)
      : [];
    const channelTargets = await loadDiscordTargetOptions(innerContext, configuredChannelIds, {
      includeThreads: false,
    });
    const lookbackHours = Number(url.searchParams.get("lookbackHours")) || 24;
    const attentionLookbackHours = Number(url.searchParams.get("attentionLookbackHours")) || 6;

    let curatorGeneratedItems = [];
    if (typeof innerContext.generatedMemories?.listGeneratedMemories === "function") {
      curatorGeneratedItems = await innerContext.generatedMemories.listGeneratedMemories({
        status: "proposed",
        userScope: innerContext.config.memory.userScope,
        limit: 500,
      });
    }
    const pendingReviewCount = curatorGeneratedItems.filter((item) => itemMatchesReviewFilters(item, {
      status: "needs_review",
      action: "",
    })).length;
    const suggestedMemoryCount = curatorGeneratedItems.filter((item) => item.sourceKind === "memory_curator").length;

    innerRes.end(renderAdminShell({
      currentSection: "memory",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderMemoryLayout({
        currentTab: "curator",
        theme,
        tabBody: renderMemoryCuratorPage({
          lookbackHours,
          attentionLookbackHours,
          channelCount: configuredChannelIds.length,
          channelOptions: channelTargets.options.filter((option) => option.value !== "daily"),
          selectedChannelIds: configuredChannelIds,
          timelineMemoryEnabled: Boolean(innerContext.config.memory?.dailySummaryEnabled || innerContext.config.memory?.weeklySummaryEnabled),
          dailySummaryTime: innerContext.config.memory?.dailySummaryTime || "04:00",
          weeklySummaryDay: innerContext.config.memory?.weeklySummaryDay || "monday",
          memoryCuratorEnabled: Boolean(innerContext.config.memoryCurator?.enabled),
          stageTwoModelMode: innerContext.config.memoryCurator?.stageTwoModelMode || "summary",
          attentionScanLastRunAt: innerContext.config.memoryCurator?.attentionScanLastRunAt || "",
          longScanLastRunAt: innerContext.config.memoryCurator?.longScanLastRunAt || "",
          pendingReviewCount,
          suggestedMemoryCount,
          theme,
        }),
      }),
    }));
    return;
  }

  if (route.tab === "imports") {
    innerRes.end(renderAdminShell({
      currentSection: "memory",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderMemoryLayout({
        currentTab: "imports",
        theme,
        tabBody: renderMemoryImportsPage({ theme }),
      }),
    }));
    return;
  }

  const allMemories = await innerContext.memoryStore.listMemories({
    userScope: innerContext.config.memory.userScope,
    limit: 1000,
    activeOnly: false,
  });
  const filteredMemories = allMemories
    .filter((memory) => (memoryQueryState.active === "archived" ? !memory.active : memory.active))
    .filter((memory) => {
      if (memoryQueryState.memoryType && memory.memoryType !== memoryQueryState.memoryType) {
        return false;
      }

      if (memoryQueryState.domain && memory.domain !== memoryQueryState.domain) {
        return false;
      }

      if (!memoryQueryState.q) {
        return true;
      }

      const haystack = `${memory.title}\n${memory.content}`.toLowerCase();
      return haystack.includes(memoryQueryState.q.toLowerCase());
    });

  const sortedMemories = sortMemories(filteredMemories, memoryQueryState.sort, memoryQueryState.direction);
  const totalMemories = sortedMemories.length;
  const memories = sortedMemories.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  innerRes.end(renderAdminShell({
    currentSection: "memory",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderMemoryLayout({
      currentTab: "library",
      theme,
      tabBody: renderMemoriesPage({
        config: innerContext.config,
        memories,
        activeFilter: memoryQueryState.active,
        page,
        pageSize,
        totalMemories,
        theme,
        searchQuery: memoryQueryState.q,
        memoryTypeFilter: memoryQueryState.memoryType,
        domainFilter: memoryQueryState.domain,
        sortKey: memoryQueryState.sort,
        sortDirection: memoryQueryState.direction,
        currentPath: "/admin/memory/library",
      }),
    }),
  }));
}

async function handleGeneratedDetailRequest({
  url,
  innerRes,
  innerContext,
  helpers,
  currentTheme = "",
}) {
  const {
    getMessage,
    getError,
    normalizeTheme,
    buildThemeLinks,
    renderAdminShell,
    renderMemoryLayout,
    renderGeneratedMemoryDetailPage,
  } = helpers;

  const generatedMemoryId = decodeURIComponent(url.pathname.slice("/admin/generated/".length));
  const item = await innerContext.generatedMemories.getGeneratedMemoryById(generatedMemoryId);

  if (!item) {
    innerRes.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    innerRes.end("Generated memory not found.");
    return;
  }

  const theme = normalizeTheme(currentTheme || url.searchParams.get("theme"));
  const payload = item.sourcePayload || {};
  const relatedIds = [
    payload.targetMemoryId,
    ...(Array.isArray(payload.relatedMemoryIds) ? payload.relatedMemoryIds : []),
  ].map((id) => String(id || "").trim()).filter(Boolean);
  const relatedMemories = relatedIds.length
    ? await innerContext.memoryStore.getMemoriesByIds(relatedIds, {
      userScope: item.userScope,
    })
    : [];
  const targetMemory = payload.targetMemoryId
    ? relatedMemories.find((memory) => memory.memoryId === payload.targetMemoryId) || null
    : null;
  const queueEnabled = url.searchParams.get("queue") === "1";
  const queueFilters = {
    status: String(url.searchParams.get("status") || "needs_review").trim().toLowerCase(),
    source: String(url.searchParams.get("source") || "").trim().toLowerCase(),
    action: String(url.searchParams.get("action") || "").trim().toLowerCase(),
    memoryType: String(url.searchParams.get("memoryType") || "").trim().toLowerCase(),
  };
  const requestedQueueExitHref = String(url.searchParams.get("returnTo") || "").trim();
  const queueExitHref = requestedQueueExitHref.startsWith("/admin")
    ? requestedQueueExitHref
    : helpers.buildAdminLocation({
      path: "/admin/memory/review",
      theme,
      extra: queueFilters,
    });
  let queueState = null;

  if (queueEnabled) {
    const queueItems = await innerContext.generatedMemories.listGeneratedMemories({
      status: ["proposed", "approved", "rejected", "archived"].includes(queueFilters.status) ? queueFilters.status : undefined,
      userScope: item.userScope,
      limit: 500,
    });
    const matchingQueueItems = queueItems.filter((queueItem) => itemMatchesReviewFilters(queueItem, queueFilters));
    const currentIndex = matchingQueueItems.findIndex((queueItem) => queueItem.generatedMemoryId === item.generatedMemoryId);
    const requestedQueueTotal = Number.parseInt(String(url.searchParams.get("queueTotal") || ""), 10);
    const requestedQueueStep = Number.parseInt(String(url.searchParams.get("queueStep") || ""), 10);

    queueState = {
      enabled: true,
      filters: queueFilters,
      total: Number.isFinite(requestedQueueTotal) && requestedQueueTotal > 0
        ? requestedQueueTotal
        : matchingQueueItems.length,
      position: Number.isFinite(requestedQueueStep) && requestedQueueStep > 0
        ? requestedQueueStep
        : currentIndex >= 0 ? currentIndex + 1 : 0,
      exitHref: queueExitHref,
    };
  }

  innerRes.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  innerRes.end(renderAdminShell({
    currentSection: "memory",
    theme,
    themeLinks: buildThemeLinks(url),
    message: getMessage(url),
    error: getError(url),
    pageBody: renderMemoryLayout({
      currentTab: "review",
      theme,
      tabBody: renderGeneratedMemoryDetailPage({
        item,
        targetMemory,
        relatedMemories,
        personaName: innerContext.config.chat?.promptBlocks?.personaName || "Ghostlight",
        queueState,
        theme,
        shellOnly: true,
      }),
    }),
  }));
}

module.exports = {
  handleMemoryPageRequest,
  handleGeneratedDetailRequest,
};
