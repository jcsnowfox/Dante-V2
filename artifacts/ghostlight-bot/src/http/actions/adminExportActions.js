const { ZipFile } = require("yazl");
const { downloadBufferFromBucket } = require("../../images/bucketStorage");
const { parseRequestForm } = require("../adminRequestUtils");
const { isDailyThreadAction } = require("../../automations/dailyThreadAction");
const {
  normalizeImageGalleryQueryState,
  buildGeneratedImageTags,
} = require("../adminPageHandlers");
const {
  buildMemoryExportPayload,
  buildAppStateExportPayload,
  buildProactiveActionPackPayload,
  buildProactiveActionPackFilename,
  normalizeSelectedActionIds,
  buildImageExportFilename,
  buildConversationEventsCsv,
  buildConversationLogFilename,
  buildConversationLogIndexCsv,
} = require("../adminDataExchange");

const CONVERSATION_LOG_EXPORT_LIMITS = Object.freeze({
  conversations: 1000,
  eventsPerConversation: 10000,
});

function normalizeSelectedImageIdsFromUrl(url) {
  return Array.from(new Set(
    url.searchParams.getAll("imageId")
      .concat(url.searchParams.getAll("imageIds"))
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

async function handleAdminExportActions({
  req,
  res,
  url,
  context,
  withAdmin,
}) {
  if (req.method === "GET" && url.pathname === "/admin/exports/memories") {
    return withAdmin(async (_req, innerRes, innerContext) => {
      const allMemories = await innerContext.memoryStore.listMemories({
        userScope: innerContext.config.memory.userScope,
        limit: 5000,
        activeOnly: false,
      });
      const exportMemories = allMemories
        .sort((left, right) => {
          const leftTime = Date.parse(left.updatedAt || "") || 0;
          const rightTime = Date.parse(right.updatedAt || "") || 0;
          return rightTime - leftTime;
        });
      const payload = buildMemoryExportPayload({
        config: innerContext.config,
        memories: exportMemories,
      });
      const dateStamp = new Date().toISOString().slice(0, 10);

      innerRes.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ghostlight-memories-${dateStamp}.json"`,
        "Cache-Control": "no-store",
      });
      innerRes.end(JSON.stringify(payload, null, 2));
    })(req, res, context);
  }

  if (req.method === "GET" && url.pathname === "/admin/exports/music-library") {
    return withAdmin(async (_req, innerRes, innerContext) => {
      if (!innerContext.musicLibrary?.exportLibraryData) {
        throw new Error("Music library export is not available.");
      }

      const payload = await innerContext.musicLibrary.exportLibraryData({
        userScope: innerContext.config.memory.userScope,
      });
      const dateStamp = new Date().toISOString().slice(0, 10);

      innerRes.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ghostlight-music-library-${dateStamp}.json"`,
        "Cache-Control": "no-store",
      });
      innerRes.end(JSON.stringify(payload, null, 2));
    })(req, res, context);
  }

  if (req.method === "GET" && url.pathname === "/admin/exports/app-state") {
    return withAdmin(async (_req, innerRes, innerContext) => {
      const settings = await innerContext.settingsStore.listSettings();
      const legacyAutomations = await innerContext.automationStore.listAutomations({
        userScope: innerContext.config.memory.userScope,
      });
      const proactiveActions = await innerContext.proactiveActionStore.listActions({
        userScope: innerContext.config.memory.userScope,
      });
      const hasProactiveDailyThread = proactiveActions.some(isDailyThreadAction);
      const automations = legacyAutomations.filter((automation) => !(hasProactiveDailyThread && automation.type === "daily_thread"));
      const journalCount = await innerContext.journalStore.countEntries({
        userScope: innerContext.config.memory.userScope,
      });
      const journals = [];

      for (let offset = 0; offset < journalCount; offset += 1000) {
        const batch = await innerContext.journalStore.listEntries({
          userScope: innerContext.config.memory.userScope,
          limit: 1000,
          offset,
        });
        journals.push(...batch);
      }

      const allModeDefinitions = innerContext.channelModeStore?.listModeDefinitions
        ? await innerContext.channelModeStore.listModeDefinitions()
        : innerContext.channelModes?.listModes
          ? await innerContext.channelModes.listModes()
          : [];
      const modeDefinitions = allModeDefinitions.filter((definition) => !definition.isBuiltin);
      const channelAssignments = innerContext.channelModeStore?.listChannelAssignments
        ? await innerContext.channelModeStore.listChannelAssignments({
          guildId: innerContext.config.discord.guildId || "",
        })
        : innerContext.channelModes?.listAssignments
          ? await innerContext.channelModes.listAssignments({
            guildId: innerContext.config.discord.guildId || "",
          })
          : [];
      const payload = buildAppStateExportPayload({
        config: innerContext.config,
        settings,
        automations,
        proactiveActions,
        journals,
        modeDefinitions,
        channelAssignments,
      });
      const dateStamp = new Date().toISOString().slice(0, 10);

      innerRes.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ghostlight-app-data-${dateStamp}.json"`,
        "Cache-Control": "no-store",
      });
      innerRes.end(JSON.stringify(payload, null, 2));
    })(req, res, context);
  }

  if (req.method === "GET" && url.pathname === "/admin/exports/conversation-events.csv") {
    return withAdmin(async (_req, innerRes, innerContext) => {
      const events = await innerContext.conversations.listEventsForExport({
        guildId: innerContext.config.discord.guildId || "",
      });
      const csv = buildConversationEventsCsv({ events });
      const dateStamp = new Date().toISOString().slice(0, 10);

      innerRes.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ghostlight-chat-events-${dateStamp}.csv"`,
        "Cache-Control": "no-store",
      });
      innerRes.end(csv);
    })(req, res, context);
  }

  if (req.method === "GET" && url.pathname === "/admin/exports/conversation-logs") {
    return withAdmin(async (_req, innerRes, innerContext) => {
      const conversations = await innerContext.conversations.listConversations({
        guildId: innerContext.config.discord.guildId || "",
        limit: CONVERSATION_LOG_EXPORT_LIMITS.conversations,
      });
      const zipfile = new ZipFile();
      const filenameCounts = new Map();
      const indexEntries = [];

      for (const conversation of conversations) {
        const baseFilename = buildConversationLogFilename({ conversation });
        const duplicateCount = filenameCounts.get(baseFilename) || 0;
        filenameCounts.set(baseFilename, duplicateCount + 1);
        const filename = duplicateCount
          ? buildConversationLogFilename({ conversation, duplicateCount })
          : baseFilename;
        const events = await innerContext.conversations.listEventsByConversationId({
          conversationId: conversation.conversationId,
          limit: CONVERSATION_LOG_EXPORT_LIMITS.eventsPerConversation,
        });
        const body = innerContext.conversations.formatConversationExport(events, {
          conversation,
          includeHeader: true,
          includeSystem: true,
          includeSummaries: true,
        });

        zipfile.addBuffer(Buffer.from(body, "utf8"), `logs/${filename}`);
        indexEntries.push({
          filename: `logs/${filename}`,
          conversation_id: conversation.conversationId,
          label: conversation.label,
          channel_name: conversation.channelName || "",
          thread_name: conversation.threadName || "",
          event_count: conversation.eventCount,
          message_event_count: conversation.messageEventCount,
          first_event_at: conversation.firstEventAt ? new Date(conversation.firstEventAt).toISOString() : "",
          last_event_at: conversation.lastEventAt ? new Date(conversation.lastEventAt).toISOString() : "",
        });
      }

      zipfile.addBuffer(Buffer.from(buildConversationLogIndexCsv({ entries: indexEntries }), "utf8"), "index.csv");
      zipfile.addBuffer(Buffer.from(JSON.stringify({
        exportedAt: new Date().toISOString(),
        product: "ghostlight",
        exportType: "conversation_logs",
        conversationCount: conversations.length,
        limits: CONVERSATION_LOG_EXPORT_LIMITS,
      }, null, 2), "utf8"), "metadata.json");
      zipfile.end();

      const dateStamp = new Date().toISOString().slice(0, 10);
      innerRes.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ghostlight-conversation-logs-${dateStamp}.zip"`,
        "Cache-Control": "no-store",
      });
      zipfile.outputStream.pipe(innerRes);
    })(req, res, context);
  }

  if (req.method === "GET" && url.pathname === "/admin/exports/images") {
    return withAdmin(async (_req, innerRes, innerContext) => {
      const filters = normalizeImageGalleryQueryState(url);
      const selectedImageIds = normalizeSelectedImageIdsFromUrl(url);
      const stylePresets = await innerContext.imageStylePresets.listPresets({
        userScope: innerContext.config.memory.userScope,
        archived: "all",
      });
      const appearancePresets = await innerContext.imageAppearancePresets.listPresets({
        userScope: innerContext.config.memory.userScope,
        archived: "all",
      });
      const stylePresetNamesById = new Map(stylePresets.map((preset) => [preset.presetId, preset.name]));
      const appearancePresetNamesById = new Map(appearancePresets.map((preset) => [preset.presetId, preset.name]));
      const selectedStylePresetIds = filters.filterTags
        .filter((value) => value.startsWith("style:"))
        .map((value) => value.slice("style:".length));
      const selectedAppearancePresetIds = filters.filterTags
        .filter((value) => value.startsWith("appearance:"))
        .map((value) => value.slice("appearance:".length));
      const selectedAspectRatios = filters.filterTags
        .filter((value) => value.startsWith("aspect:"))
        .map((value) => value.slice("aspect:".length));
      const selectedCustomTags = filters.filterTags
        .filter((value) => value.startsWith("tag:"))
        .map((value) => value.slice("tag:".length));
      const exportableStatus = !filters.status || filters.status === "completed"
        ? "completed"
        : "__none__";
      const images = [];

      if (selectedImageIds.length) {
        for (const imageId of selectedImageIds) {
          const image = await innerContext.generatedImages.getImageById(imageId, {
            userScope: innerContext.config.memory.userScope,
          });

          if (image?.status === "completed" && !image.deletedAt) {
            images.push(image);
          }
        }
      } else if (exportableStatus !== "__none__") {
        const batchSize = 100;

        for (let offset = 0; ; offset += batchSize) {
          const batch = await innerContext.generatedImages.listImages({
            userScope: innerContext.config.memory.userScope,
            limit: batchSize,
            offset,
            favoritesOnly: filters.favoritesOnly,
            status: exportableStatus,
            q: filters.q,
            aspectRatios: selectedAspectRatios,
            stylePresetIds: selectedStylePresetIds,
            appearancePresetIds: selectedAppearancePresetIds,
            tags: selectedCustomTags,
          });
          images.push(...batch);

          if (batch.length < batchSize) {
            break;
          }
        }
      }

      const metadata = [];
      const zipfile = new ZipFile();
      const fileNameCounts = new Map();

      for (const image of images) {
        if (!image.storageKey) {
          continue;
        }

        const download = await downloadBufferFromBucket({
          config: innerContext.config,
          key: image.storageKey,
        });
        const baseFilename = buildImageExportFilename(image);
        const duplicateCount = fileNameCounts.get(baseFilename) || 0;
        fileNameCounts.set(baseFilename, duplicateCount + 1);
        const exportFilename = duplicateCount
          ? baseFilename.replace(/(\.[^.]+)$/u, `-${duplicateCount + 1}$1`)
          : baseFilename;

        zipfile.addBuffer(download.buffer, `images/${exportFilename}`);
        metadata.push({
          imageId: image.imageId,
          createdAt: image.createdAt,
          prompt: image.prompt,
          composedPrompt: image.composedPrompt,
          tags: buildGeneratedImageTags({
            image,
            stylePresetNamesById,
            appearancePresetNamesById,
          }),
          stylePresetIds: image.stylePresetIds,
          stylePresetNames: image.stylePresetIds.map((presetId) => stylePresetNamesById.get(presetId)).filter(Boolean),
          appearancePresetIds: image.appearancePresetIds,
          appearancePresetNames: image.appearancePresetIds.map((presetId) => appearancePresetNamesById.get(presetId)).filter(Boolean),
          customTags: image.customTags,
          model: image.model,
          aspectRatio: image.aspectRatio,
          mimeType: image.mimeType,
          fileSizeBytes: image.fileSizeBytes,
          status: image.status,
          file: `images/${exportFilename}`,
        });
      }

      zipfile.addBuffer(Buffer.from(JSON.stringify({
        exportedAt: new Date().toISOString(),
        product: "ghostlight",
        exportType: "generated_images",
        filterState: {
          favoritesOnly: filters.favoritesOnly,
          status: filters.status || "",
          q: filters.q,
          filterTags: filters.filterTags,
          imageIds: selectedImageIds,
        },
        exportedImageCount: metadata.length,
        images: metadata,
      }, null, 2), "utf8"), "metadata.json");
      zipfile.end();

      const dateStamp = new Date().toISOString().slice(0, 10);
      innerRes.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ghostlight-images-${dateStamp}.zip"`,
        "Cache-Control": "no-store",
      });
      zipfile.outputStream.pipe(innerRes);
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/exports/proactive-pack") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const triggerType = String(fields.triggerType || "").trim().toLowerCase();
      const actionIds = normalizeSelectedActionIds(fields.actionIds);

      if (!actionIds.length) {
        throw new Error("Select at least one action to export.");
      }

      const allActions = await innerContext.proactiveActionStore.listActions({
        userScope: innerContext.config.memory.userScope,
        triggerType,
      });
      const actionsById = new Map(allActions.map((action) => [action.actionId, action]));
      const selectedActions = actionIds
        .map((actionId) => actionsById.get(actionId))
        .filter(Boolean);

      if (!selectedActions.length) {
        throw new Error("None of the selected actions could be exported.");
      }

      const metadata = {
        name: fields.packName,
        description: fields.packDescription,
        author: fields.packAuthor,
      };
      const payload = buildProactiveActionPackPayload({
        actions: selectedActions,
        metadata,
      });
      const filename = buildProactiveActionPackFilename({
        metadata,
        triggerType,
      });

      innerRes.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      });
      innerRes.end(JSON.stringify(payload, null, 2));
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleAdminExportActions,
};
