const path = require("node:path");
const {
  runMemoryAttentionScan,
  runMemoryCurator,
  normalizeAttentionLookbackHours,
  normalizeLookbackHours,
} = require("../../memory/curator");
const { runMemoryDuplicateScan } = require("../../memory/curatorDedupe");
const { QUIET_ACTION, runMemoryQuietScan } = require("../../memory/curatorQuiet");
const { SPLIT_ACTION, runMemorySplitScan } = require("../../memory/curatorSplit");
const { buildGeneratedWeeklyMemoryRecord, generateWeeklyArtifacts } = require("../../memory/summaryIngestion");
const { stageDailySummaryArtifacts, stageImportedSummaryArtifacts } = require("../../memory/stageSummaryArtifacts");
const { promoteApprovedGeneratedMemories } = require("../../memory/promoteGeneratedMemories");
const { deleteMemoryEverywhere } = require("../../memory/deleteMemories");
const { canSyncMemories, syncMemoriesToQdrant } = require("../../memory/syncMemories");
const { deletePoints } = require("../../memory/qdrantClient");
const {
  buildImportRecordFromForm,
  buildWeeklyImportSourcesFromForm,
  parseMemoryForm,
} = require("../adminFormParsers");
const {
  parseRequestForm,
} = require("../adminRequestUtils");
const {
  normalizeTheme,
  buildAdminLocation,
  buildReturnLocation,
} = require("../adminUiHelpers");
const {
  buildNextReviewQueueLocation,
} = require("../memoryReviewQueue");
const {
  safeSyncMemoriesToQdrant,
  safeSyncMemoryToQdrant,
} = require("./memoryActionSync");
const {
  applyCuratorArchiveApproval,
  applyCuratorMemoryUpdate,
  applyCuratorMergeApproval,
  applyCuratorSplitApproval,
  buildEditedSplitSourcePayload,
  getCuratorAction,
  isCuratorItem,
  touchQuietMemoryKeepDecision,
} = require("./memoryCuratorReviewActions");

function normalizeMaintenanceJobs(value) {
  const values = Array.isArray(value) ? value : [value];
  const allowed = new Set(["duplicates", "long", "quiet"]);

  return [...new Set(values
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => allowed.has(entry)))];
}

async function handleMemoryActions({ req, res, url, context, withAdmin, buildMemoryImportRecords }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/memory-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const submitted = parseMemoryForm(fields);

      const existing = submitted.memoryId
        ? await innerContext.memoryStore.getMemoryById(submitted.memoryId, {
          userScope: innerContext.config.memory.userScope,
        })
        : null;

      const saved = await innerContext.memoryStore.upsertMemory({
        memory_id: existing?.memoryId || undefined,
        title: submitted.title,
        content: submitted.content,
        memory_type: submitted.memoryType,
        domain: submitted.domain,
        sensitivity: submitted.sensitivity,
        importance: submitted.importance || undefined,
        source: existing?.source || "admin_ui",
        active: fields.restoreOnSave === "1" ? true : (existing?.active ?? true),
        created_at: existing?.createdAt,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      let message = fields.restoreOnSave === "1"
        ? `Restored memory "${saved.title}".`
        : `Saved memory "${saved.title}".`;
      let syncWarning = "";

      if (canSyncMemories(innerContext.config)) {
        const syncResult = await safeSyncMemoryToQdrant({
          config: innerContext.config,
          memory: saved,
          logger: innerContext.logger,
        });
        syncWarning = syncResult.errorMessage || "";

        if (!syncResult.skipped) {
          message = fields.restoreOnSave === "1"
            ? `Restored memory "${saved.title}" and synced it to Qdrant.`
            : `Saved memory "${saved.title}" and synced it to Qdrant.`;
        }
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/library",
          message,
          error: syncWarning,
          theme,
          extra: {
            active: fields.active === "archived" ? "archived" : "active",
            q: fields.q,
            memoryType: fields.memoryTypeFilter,
            domain: fields.domainFilter,
            page: fields.page || 1,
            sort: fields.sort || "updatedAt",
            direction: fields.direction || "desc",
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const records = buildMemoryImportRecords({ fields, files });

      const importedMemories = [];

      for (const record of records) {
        const saved = await innerContext.memoryStore.upsertMemory(record, {
          userScope: innerContext.config.memory.userScope,
        });
        importedMemories.push(saved);
      }

      let message = `Imported ${importedMemories.length} ${importedMemories.length === 1 ? "memory" : "memories"}.`;
      let syncWarning = "";

      if (canSyncMemories(innerContext.config)) {
        const syncResult = await safeSyncMemoriesToQdrant({
          config: innerContext.config,
          memories: importedMemories,
          logger: innerContext.logger,
        });
        syncWarning = syncResult.errorMessage || "";

        if (!syncResult.skipped && syncResult.syncedCount > 0) {
          message = `Imported ${importedMemories.length} ${importedMemories.length === 1 ? "memory" : "memories"} and synced ${syncResult.syncedCount} to Qdrant.`;
        }
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/admin",
          message,
          error: syncWarning,
          theme,
          extra: {
            active: fields.active === "archived" ? "archived" : "active",
            q: fields.q,
            memoryType: fields.memoryTypeFilter,
            domain: fields.domainFilter,
            page: fields.page || 1,
            sort: fields.sort || "updatedAt",
            direction: fields.direction || "desc",
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-archive") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const existing = await innerContext.memoryStore.getMemoryById(fields.memoryId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!existing) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/memory/library",
            error: "Memory not found.",
            theme,
          }),
        }).end();
      }

      const nextActiveState = existing.active ? false : true;
      const updated = await innerContext.memoryStore.upsertMemory({
        memory_id: existing.memoryId,
        title: existing.title,
        content: existing.content,
        memory_type: existing.memoryType,
        domain: existing.domain,
        sensitivity: existing.sensitivity,
        importance: existing.importance,
        source: existing.source,
        active: nextActiveState,
        created_at: existing.createdAt,
      }, {
        userScope: innerContext.config.memory.userScope,
      });
      let syncWarning = "";

      if (innerContext.config.qdrant?.url) {
        if (updated.active) {
          const syncResult = await safeSyncMemoryToQdrant({
            config: innerContext.config,
            memory: updated,
            logger: innerContext.logger,
          });
          syncWarning = syncResult.errorMessage || "";
        } else {
          await deletePoints({
            config: innerContext.config,
            ids: [updated.memoryId],
          });
        }
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/library",
          message: `${updated.active ? "Restored" : "Archived"} memory "${updated.title}".`,
          error: syncWarning,
          theme,
          extra: {
            active: fields.active === "archived" ? "archived" : "active",
            q: fields.q,
            memoryType: fields.memoryTypeFilter,
            domain: fields.domainFilter,
            page: fields.page || 1,
            sort: fields.sort || "updatedAt",
            direction: fields.direction || "desc",
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const result = await deleteMemoryEverywhere({
        config: innerContext.config,
        memoryStore: innerContext.memoryStore,
        generatedMemories: innerContext.generatedMemories,
        memoryId: fields.memoryId,
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/library",
          message: result.deleted
            ? `Deleted memory "${result.memory.title}".`
            : "Nothing was deleted.",
          theme,
          extra: {
            active: fields.active === "archived" ? "archived" : "active",
            q: fields.q,
            memoryType: fields.memoryTypeFilter,
            domain: fields.domainFilter,
            page: fields.page || 1,
            sort: fields.sort || "updatedAt",
            direction: fields.direction || "desc",
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-sync") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      if (!canSyncMemories(innerContext.config)) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/memory/library",
            error: "Qdrant sync needs both QDRANT_URL and a working OpenRouter embeddings API key.",
            theme,
            extra: {
              active: fields.active === "archived" ? "archived" : "active",
              q: fields.q,
              memoryType: fields.memoryTypeFilter,
              domain: fields.domainFilter,
              page: fields.page || 1,
              sort: fields.sort || "updatedAt",
              direction: fields.direction || "desc",
            },
          }),
        }).end();
      }

      const memories = await innerContext.memoryStore.listMemories({
        userScope: innerContext.config.memory.userScope,
        limit: 500,
        activeOnly: true,
      });

      const result = await syncMemoriesToQdrant({
        config: innerContext.config,
        memories,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/library",
          message: `Synced ${result.syncedCount} active memories to Qdrant.`,
          theme,
          extra: {
            active: fields.active === "archived" ? "archived" : "active",
            q: fields.q,
            memoryType: fields.memoryTypeFilter,
            domain: fields.domainFilter,
            page: fields.page || 1,
            sort: fields.sort || "updatedAt",
            direction: fields.direction || "desc",
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/stage-daily") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      await stageDailySummaryArtifacts({
        config: innerContext.config,
        conversations: innerContext.conversations,
        generatedMemories: innerContext.generatedMemories,
        summaryDate: fields.summaryDate,
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/review",
          message: `Staged daily proposals for ${fields.summaryDate}`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-curator-run") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const lookbackHours = normalizeLookbackHours(fields.lookbackHours);
      const result = await runMemoryCurator({
        config: innerContext.config,
        conversations: innerContext.conversations,
        generatedMemories: innerContext.generatedMemories,
        memory: innerContext.memory,
        lookbackHours,
      });
      const message = result.skipped
        ? result.reason === "no_ltm_channels"
          ? "Memory Curator skipped: choose channels to scan first."
          : "Memory Curator found no eligible recent events."
        : `Memory Curator staged ${result.stagedCount} ${result.stagedCount === 1 ? "suggestion" : "suggestions"} from ${result.sourceEventCount} events.`;

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/curator",
          message,
          theme,
          extra: {
            lookbackHours,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-curator-attention-run") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const attentionLookbackHours = normalizeAttentionLookbackHours(fields.attentionLookbackHours);
      const result = await runMemoryAttentionScan({
        config: innerContext.config,
        conversations: innerContext.conversations,
        generatedMemories: innerContext.generatedMemories,
        memory: innerContext.memory,
        lookbackHours: attentionLookbackHours,
      });
      const message = result.skipped
        ? result.reason === "no_ltm_channels"
          ? "Recent Attention Scan skipped: choose channels to scan first."
          : "Recent Attention Scan found no eligible recent events."
        : !result.stagedCount && result.duplicatePrunedCandidateCount
          ? `Recent Attention Scan found ${result.duplicatePrunedCandidateCount} already-covered ${result.duplicatePrunedCandidateCount === 1 ? "candidate" : "candidates"} and staged no new suggestions from ${result.sourceEventCount} events.`
        : `Recent Attention Scan staged ${result.stagedCount} ${result.stagedCount === 1 ? "suggestion" : "suggestions"} from ${result.sourceEventCount} events.`;

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/curator",
          message,
          theme,
          extra: {
            attentionLookbackHours,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-curator-dedupe-run") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      try {
        const result = await runMemoryDuplicateScan({
          config: innerContext.config,
          memoryStore: innerContext.memoryStore,
          generatedMemories: innerContext.generatedMemories,
        });
        const message = result.stagedCount
          ? `Staged ${result.stagedCount} duplicate ${result.stagedCount === 1 ? "suggestion" : "suggestions"} for review.`
          : result.candidatePairCount
            ? `Duplicate scan reviewed ${result.candidatePairCount} candidate ${result.candidatePairCount === 1 ? "pair" : "pairs"} and staged no new suggestions.`
            : `Duplicate scan checked ${result.sourceMemoryCount || 0} active durable ${result.sourceMemoryCount === 1 ? "memory" : "memories"} and found no candidate duplicate pairs.`;

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            message,
            theme,
          }),
        }).end();
      } catch (error) {
        innerContext.logger?.warn?.("[memory] Memory duplicate scan failed", {
          error: error?.message || String(error),
        });

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            error: error?.message || "Memory duplicate scan failed.",
            theme,
          }),
        }).end();
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-curator-split-run") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      try {
        const result = await runMemorySplitScan({
          config: innerContext.config,
          memoryStore: innerContext.memoryStore,
          generatedMemories: innerContext.generatedMemories,
        });
        const message = result.stagedCount
          ? `Staged ${result.stagedCount} split ${result.stagedCount === 1 ? "suggestion" : "suggestions"} for review.`
          : "Long-memory scan completed. No new split suggestions were staged.";

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            message,
            theme,
          }),
        }).end();
      } catch (error) {
        innerContext.logger?.warn?.("[memory] Long-memory split scan failed", {
          error: error?.message || String(error),
        });

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            error: error?.message || "Long-memory split scan failed.",
            theme,
          }),
        }).end();
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/stage-chat-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const importKind = String(fields.importKind || "daily").trim().toLowerCase() === "weekly" ? "weekly" : "daily";

      if (importKind === "weekly") {
        if (!fields.startDate || !fields.endDate) {
          throw new Error("Weekly imports need both a start date and an end date.");
        }

        const weeklyFiles = {
          ...files,
          files: files.files || files.file || [],
        };
        const sources = buildWeeklyImportSourcesFromForm({ fields, files: weeklyFiles });
        const generated = await generateWeeklyArtifacts({
          config: innerContext.config,
          groupingLabel: `Weekly rollup for ${fields.startDate} to ${fields.endDate}`,
          sources,
          startDate: fields.startDate,
          endDate: fields.endDate,
        });

        const generatedRecords = buildGeneratedWeeklyMemoryRecord({
          sourceKind: "manual_import",
          sourceRef: `manual_import:weekly:${fields.startDate}:${fields.endDate}`,
          groupingKey: `weekly:${fields.startDate}:${fields.endDate}`,
          userScope: innerContext.config.memory.userScope,
          generated,
          reviewFlags: ["recently_generated"],
          sourcePayload: {
            weekStartDate: fields.startDate,
            weekEndDate: fields.endDate,
            sourceCount: sources.length,
            sourceLabels: sources.map((source) => source.label),
          },
        });

        for (const record of generatedRecords) {
          await innerContext.generatedMemories.upsertGeneratedMemory(record);
        }

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/memory/review",
            message: `Created weekly proposal for ${fields.startDate} to ${fields.endDate}`,
            theme,
          }),
        }).end();
      }

      const dailyFiles = {
        ...files,
        file: files.file || (Array.isArray(files.files) ? files.files[0] : files.files),
      };
      const record = buildImportRecordFromForm({ fields, files: dailyFiles });
      const batchLabel = fields.sourceLabel || fields.conversationLabel || path.basename(record.sourcePath || "admin-import");

      await stageImportedSummaryArtifacts({
        config: innerContext.config,
        generatedMemories: innerContext.generatedMemories,
        imports: [record],
        userScope: innerContext.config.memory.userScope,
        batchLabel,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/review",
          message: `Created fresh memories from ${record.label}`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/stage-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const record = buildImportRecordFromForm({ fields, files });
      const batchLabel = fields.sourceLabel || fields.conversationLabel || path.basename(record.sourcePath || "admin-import");

      await stageImportedSummaryArtifacts({
        config: innerContext.config,
        generatedMemories: innerContext.generatedMemories,
        imports: [record],
        userScope: innerContext.config.memory.userScope,
        batchLabel,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/review",
          message: `Created fresh memories from ${record.label}`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/stage-weekly-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const sources = buildWeeklyImportSourcesFromForm({ fields, files });
      const generated = await generateWeeklyArtifacts({
        config: innerContext.config,
        groupingLabel: `Weekly rollup for ${fields.startDate} to ${fields.endDate}`,
        sources,
        startDate: fields.startDate,
        endDate: fields.endDate,
      });

      const generatedRecords = buildGeneratedWeeklyMemoryRecord({
        sourceKind: "manual_import",
        sourceRef: `manual_import:weekly:${fields.startDate}:${fields.endDate}`,
        groupingKey: `weekly:${fields.startDate}:${fields.endDate}`,
        userScope: innerContext.config.memory.userScope,
        generated,
        reviewFlags: ["recently_generated"],
        sourcePayload: {
          weekStartDate: fields.startDate,
          weekEndDate: fields.endDate,
          sourceCount: sources.length,
          sourceLabels: sources.map((source) => source.label),
        },
      });

      for (const record of generatedRecords) {
        await innerContext.generatedMemories.upsertGeneratedMemory(record);
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/memory/review",
          message: `Created weekly proposal for ${fields.startDate} to ${fields.endDate}`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-curator-quiet-run") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      try {
        const result = await runMemoryQuietScan({
          config: innerContext.config,
          memoryStore: innerContext.memoryStore,
          generatedMemories: innerContext.generatedMemories,
        });
        const message = result.stagedCount
          ? `Staged ${result.stagedCount} quiet-memory ${result.stagedCount === 1 ? "suggestion" : "suggestions"} for review.`
          : result.candidateCount
            ? `Quiet-memory scan reviewed ${result.candidateCount} candidate ${result.candidateCount === 1 ? "memory" : "memories"} and staged no suggestions.`
            : `Quiet-memory scan checked ${result.sourceMemoryCount || 0} active durable ${result.sourceMemoryCount === 1 ? "memory" : "memories"} and found no old unused candidates.`;

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            message,
            theme,
          }),
        }).end();
      } catch (error) {
        innerContext.logger?.warn?.("[memory] Memory quiet scan failed", {
          error: error?.message || String(error),
        });

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            error: error?.message || "Memory quiet scan failed.",
            theme,
          }),
        }).end();
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-curator-maintenance-run") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const jobs = normalizeMaintenanceJobs(fields.maintenanceJob);

      if (!jobs.length) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            error: "Choose at least one maintenance scan to run.",
            theme,
          }),
        }).end();
      }

      try {
        const results = [];

        if (jobs.includes("duplicates")) {
          const result = await runMemoryDuplicateScan({
            config: innerContext.config,
            memoryStore: innerContext.memoryStore,
            generatedMemories: innerContext.generatedMemories,
          });
          results.push({ label: "duplicate", stagedCount: result.stagedCount || 0 });
        }

        if (jobs.includes("long")) {
          const result = await runMemorySplitScan({
            config: innerContext.config,
            memoryStore: innerContext.memoryStore,
            generatedMemories: innerContext.generatedMemories,
          });
          results.push({ label: "long-memory", stagedCount: result.stagedCount || 0 });
        }

        if (jobs.includes("quiet")) {
          const result = await runMemoryQuietScan({
            config: innerContext.config,
            memoryStore: innerContext.memoryStore,
            generatedMemories: innerContext.generatedMemories,
          });
          results.push({ label: "quiet-memory", stagedCount: result.stagedCount || 0 });
        }

        const totalStaged = results.reduce((sum, result) => sum + result.stagedCount, 0);
        const detail = results
          .map((result) => `${result.stagedCount} ${result.label}`)
          .join(", ");
        const message = totalStaged
          ? `Maintenance scan staged ${totalStaged} ${totalStaged === 1 ? "suggestion" : "suggestions"} for review (${detail}).`
          : `Maintenance scan completed. No new suggestions were staged (${detail}).`;

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            message,
            theme,
          }),
        }).end();
      } catch (error) {
        innerContext.logger?.warn?.("[memory] Memory maintenance scan failed", {
          jobs,
          error: error?.message || String(error),
        });

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/memory/curator",
            error: error?.message || "Memory maintenance scan failed.",
            theme,
          }),
        }).end();
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/review") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const requestedStatus = String(fields.status || "").trim().toLowerCase();
      const updates = {};
      const existingReviewItem = await innerContext.generatedMemories.getGeneratedMemoryById(fields.generatedMemoryId);

      if (fields.status) {
        updates.status = fields.status;
      }

      if (fields.title !== undefined) {
        updates.title = fields.title;
      }

      if (fields.content !== undefined) {
        updates.content = fields.content;
      }

      if (fields.domain !== undefined) {
        updates.domain = fields.domain;
      }

      if (fields.memoryType !== undefined) {
        updates.memory_type = fields.memoryType;
      }

      if (fields.sensitivity !== undefined) {
        updates.sensitivity = fields.sensitivity;
      }

      if (requestedStatus === "approved") {
        updates.reviewFlags = [];
      }

      if (isCuratorItem(existingReviewItem) && getCuratorAction(existingReviewItem) === SPLIT_ACTION && fields.splitCount !== undefined) {
        try {
          updates.sourcePayload = buildEditedSplitSourcePayload(existingReviewItem.sourcePayload, fields);
        } catch (error) {
          return innerRes.writeHead(303, {
            Location: buildReturnLocation({
              returnTo: fields.returnTo,
              fallbackPath: "/admin/memory/review",
              error: error?.message || "Split suggestion edits could not be saved.",
              theme,
            }),
          }).end();
        }

        if (requestedStatus === "approved" && updates.sourcePayload.proposedMemories.length < 2) {
          return innerRes.writeHead(303, {
            Location: buildReturnLocation({
              returnTo: fields.returnTo,
              fallbackPath: "/admin/memory/review",
              error: "A split needs at least two proposed replacement memories.",
              theme,
            }),
          }).end();
        }
      }

      let item = await innerContext.generatedMemories.updateGeneratedMemory(fields.generatedMemoryId, updates);
      let syncWarning = "";

      if (requestedStatus === "approved" && isCuratorItem(item)) {
        const curatorResult = await applyCuratorMemoryUpdate({
          item,
          memoryStore: innerContext.memoryStore,
          config: innerContext.config,
          logger: innerContext.logger,
        });
        const mergeResult = curatorResult.handled
          ? null
          : await applyCuratorMergeApproval({
            item,
            memoryStore: innerContext.memoryStore,
            config: innerContext.config,
            logger: innerContext.logger,
          });
        const archiveResult = curatorResult.handled
          || mergeResult?.handled
          ? null
          : await applyCuratorArchiveApproval({
            item,
            memoryStore: innerContext.memoryStore,
            config: innerContext.config,
            logger: innerContext.logger,
          });
        const splitResult = curatorResult.handled
          || mergeResult?.handled
          || archiveResult?.handled
          ? null
          : await applyCuratorSplitApproval({
            item,
            memoryStore: innerContext.memoryStore,
            config: innerContext.config,
            logger: innerContext.logger,
          });

        if (curatorResult.handled) {
          syncWarning = curatorResult.syncWarning || "";
          item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
            status: "approved",
            promotedMemoryId: curatorResult.savedMemory.memoryId,
            reviewFlags: [],
          });
        } else if (mergeResult?.handled) {
          syncWarning = mergeResult.syncWarning || "";
          const archivedDuplicateMemoryIds = mergeResult.archivedMemories.map((memory) => memory.memoryId);
          item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
            status: "approved",
            promotedMemoryId: mergeResult.savedMemory.memoryId,
            reviewFlags: [],
            sourcePayload: {
              ...item.sourcePayload,
              mergedMemoryId: mergeResult.savedMemory.memoryId,
              archivedDuplicateMemoryIds,
            },
          });
        } else if (archiveResult?.handled) {
          syncWarning = archiveResult.syncWarning || "";
          item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
            status: "approved",
            promotedMemoryId: archiveResult.archivedMemory.memoryId,
            reviewFlags: [],
            sourcePayload: {
              ...item.sourcePayload,
              archivedMemoryId: archiveResult.archivedMemory.memoryId,
            },
          });
        } else if (splitResult?.handled) {
          syncWarning = splitResult.syncWarning || "";
          const createdMemoryIds = splitResult.savedMemories.map((memory) => memory.memoryId);
          item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
            status: "approved",
            promotedMemoryId: createdMemoryIds[0] || null,
            reviewFlags: [],
            sourcePayload: {
              ...item.sourcePayload,
              createdMemoryIds,
              archivedMemoryId: splitResult.archivedMemory.memoryId,
            },
          });
        }
      }

      if (["rejected", "archived"].includes(requestedStatus) && isCuratorItem(item) && getCuratorAction(item) === QUIET_ACTION) {
        const touchResult = await touchQuietMemoryKeepDecision({
          item,
          memoryStore: innerContext.memoryStore,
        });

        if (touchResult.touched) {
          item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
            sourcePayload: {
              ...item.sourcePayload,
              keptMemoryId: touchResult.memory.memoryId,
              keptAt: touchResult.memory.updatedAt,
            },
          });
        }
      }

      if (requestedStatus === "rejected" && item.promotedMemoryId && !isCuratorItem(item)) {
        const linkedMemory = await innerContext.memoryStore.getMemoryById(item.promotedMemoryId, {
          userScope: item.userScope,
        });

        if (linkedMemory) {
          if (innerContext.config.qdrant?.url) {
            await deletePoints({
              config: innerContext.config,
              ids: [linkedMemory.memoryId],
            });
          }

          await innerContext.memoryStore.deleteMemoryById(linkedMemory.memoryId, {
            userScope: item.userScope,
          });
        }

        item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
          status: "rejected",
          promotedMemoryId: null,
          reviewFlags: item.reviewFlags.filter((flag) => flag !== "recently_generated"),
        });
      }

      if (item.promotedMemoryId && requestedStatus !== "rejected" && !isCuratorItem(item)) {
        const savedMemory = await innerContext.memoryStore.upsertMemory({
          memory_id: item.promotedMemoryId,
          title: item.title,
          content: item.content,
          memory_type: item.memoryType,
          domain: item.domain,
          sensitivity: item.sensitivity,
          source: `generated_${item.sourceKind}`,
          reference_date: item.referenceDate,
        }, {
          userScope: item.userScope,
        });

        if (canSyncMemories(innerContext.config)) {
          const syncResult = await safeSyncMemoryToQdrant({
            config: innerContext.config,
            memory: savedMemory,
            logger: innerContext.logger,
          });
          syncWarning = syncResult.errorMessage || "";
        }

        if (requestedStatus === "approved" && Array.isArray(item.reviewFlags) && item.reviewFlags.includes("recently_generated")) {
          item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
            status: "approved",
            reviewFlags: item.reviewFlags.filter((flag) => flag !== "recently_generated"),
          });
        }
      }

      if (requestedStatus === "approved" && !item.promotedMemoryId) {
        const promotionResult = await promoteApprovedGeneratedMemories({
          memoryStore: innerContext.memoryStore,
          generatedMemories: innerContext.generatedMemories,
          generatedMemoryId: item.generatedMemoryId,
          userScope: item.userScope,
        });

        if (canSyncMemories(innerContext.config)) {
          for (const memory of promotionResult.promotedItems) {
            const syncResult = await safeSyncMemoryToQdrant({
              config: innerContext.config,
              memory,
              logger: innerContext.logger,
            });
            syncWarning = syncWarning || syncResult.errorMessage || "";
          }
        }

        item = await innerContext.generatedMemories.getGeneratedMemoryById(item.generatedMemoryId);

        if (Array.isArray(item?.reviewFlags) && item.reviewFlags.includes("recently_generated")) {
          item = await innerContext.generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
            status: "approved",
            reviewFlags: item.reviewFlags.filter((flag) => flag !== "recently_generated"),
          });
        }
      }

      const returnPath = String(fields.returnTo || "").trim();
      const savedMessage = `Saved ${item.title}`;
      const nextQueueLocation = await buildNextReviewQueueLocation({
        generatedMemories: innerContext.generatedMemories,
        userScope: item.userScope,
        currentGeneratedMemoryId: item.generatedMemoryId,
        fields,
        theme,
        message: savedMessage,
        error: syncWarning,
      });

      return innerRes.writeHead(303, {
        Location: nextQueueLocation || buildReturnLocation({
          returnTo: returnPath || `/admin/generated/${encodeURIComponent(item.generatedMemoryId)}`,
          fallbackPath: "/admin/memory/review",
          message: savedMessage,
          error: syncWarning,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/promote") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const result = await promoteApprovedGeneratedMemories({
        memoryStore: innerContext.memoryStore,
        generatedMemories: innerContext.generatedMemories,
        generatedMemoryId: fields.generatedMemoryId,
        userScope: innerContext.config.memory.userScope,
      });

      const message = result.promotedCount
        ? `Approved ${result.promotedCount} fresh ${result.promotedCount === 1 ? "memory" : "memories"}`
        : "No approved fresh memory was ready to promote";

      return innerRes.writeHead(303, {
        Location: buildAdminLocation({
          path: `/admin/generated/${encodeURIComponent(fields.generatedMemoryId)}`,
          message,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleMemoryActions,
};
