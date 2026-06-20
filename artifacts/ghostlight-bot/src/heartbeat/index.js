const { getNextLocalMidnight, resolveAutomationChannelId } = require("../automations/time");
const {
  HEARTBEAT_BUILTIN_ACTIONS,
  ACTIVITY_MODE_PROBABILITIES,
  ACTION_COOLDOWN_HOURS,
  HEARTBEAT_TICK_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MINUTES,
  HEARTBEAT_QUIET_INTERVAL_MINUTES,
  HEARTBEAT_QUIET_JITTER_MINUTES,
  CONDUCTOR_RECENT_CONTEXT_MESSAGE_LIMIT,
  DEBUG_EVENT_LIMIT,
  CACHE_KEYS,
} = require("./constants");
const {
  getLocalDateParts,
  getHeartbeatDateKey,
  getTickSlotKey,
  isInQuietHours,
  coerceNumber,
  getActionCooldownHours,
  getDeterministicJitterMinutes,
  readRecentDecisions,
  writeRecentDecision,
  readRecentDebugEvents,
  writeRecentDebugEvent,
  loadRecentServerContext,
  buildActionDailyCountKey,
  buildActionLastUsedKey,
  buildTodayCountKey,
} = require("./helpers");
const {
  summarizeActionForConductor,
  runConductor,
} = require("./conductor");
const {
  persistProactiveActionState,
  runProactiveAction,
} = require("../proactiveActions");

function rollShouldAct(activityMode, randomFn = Math.random) {
  const normalized = String(activityMode || "normal").trim().toLowerCase();
  const aliases = {
    low: "gentle",
    high: "feral",
  };
  const resolved = aliases[normalized] || normalized;
  const probability = ACTIVITY_MODE_PROBABILITIES[resolved] ?? ACTIVITY_MODE_PROBABILITIES.normal;
  return randomFn() < probability;
}

function shuffleItems(items, randomFn = Math.random) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(randomFn() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function actionNeedsVarietyBoost(item) {
  const freshness = String(item?.summary?.freshness || "").trim();

  return freshness === "never_used" || freshness === "stale" || freshness === "very_stale";
}

function actionUsesSpotifyPlayback(item) {
  return Array.isArray(item?.summary?.enabledTools)
    && item.summary.enabledTools.includes("spotify_playback");
}

function summarizeHeartbeatFailure(error = null) {
  const message = String(error?.message || error || "").trim();
  const providerMatch = message.match(/\bprovider error:\s*([^.]*(?:\.[^ ]*)?)/i);
  const responseMatch = message.match(/\bresponse:\s*([^\s.]+)/i);
  const statusMatch = message.match(/\bstatus:\s*([^\s.]+)/i);

  return {
    error: message,
    errorCategory: /provider error|service temporarily unavailable|status:\s*failed/i.test(message)
      ? "provider_response_failed"
      : "heartbeat_action_failed",
    providerError: providerMatch ? providerMatch[1].trim() : "",
    responseId: responseMatch ? responseMatch[1].trim() : "",
    status: statusMatch ? statusMatch[1].trim() : "",
  };
}

function selectActionsForConductor(available = [], {
  limit = 8,
  randomFn = Math.random,
} = {}) {
  const actions = Array.isArray(available) ? available : [];
  const normalizedLimit = Math.floor(coerceNumber(limit, 12));

  if (normalizedLimit <= 0 || actions.length <= normalizedLimit) {
    return actions;
  }

  const boosted = actions.filter(actionNeedsVarietyBoost);
  const regular = actions.filter((item) => !actionNeedsVarietyBoost(item));
  const boostedSelection = boosted.length > normalizedLimit
    ? shuffleItems(boosted, randomFn).slice(0, normalizedLimit)
    : boosted;
  const remainingSlots = Math.max(0, normalizedLimit - boostedSelection.length);
  const regularSelection = remainingSlots > 0
    ? shuffleItems(regular, randomFn).slice(0, remainingSlots)
    : [];

  return shuffleItems([...boostedSelection, ...regularSelection], randomFn);
}

function formatHeartbeatLocalDateTime(date, timeZone) {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const local = getLocalDateParts(date, timeZone);
  return `${local.dateKey} ${local.timeKey} ${timeZone}`;
}

function buildHeartbeatTimeContext({ now, timeZone, mostRecentUserMessage = null }) {
  const lastUserMessageDate = mostRecentUserMessage?.createdTimestamp
    ? new Date(mostRecentUserMessage.createdTimestamp)
    : null;
  const recentUserActivityMinutes = lastUserMessageDate
    ? Math.max(0, Number(((now.getTime() - lastUserMessageDate.getTime()) / (1000 * 60)).toFixed(1)))
    : null;

  return {
    timeZone,
    currentLocalDate: getLocalDateParts(now, timeZone).dateKey,
    currentLocalTime: formatHeartbeatLocalDateTime(now, timeZone),
    lastUserMessageIso: lastUserMessageDate ? lastUserMessageDate.toISOString() : "",
    lastUserMessageLocalTime: lastUserMessageDate
      ? formatHeartbeatLocalDateTime(lastUserMessageDate, timeZone)
      : "",
    recentUserActivityMinutes,
  };
}

function createHeartbeatService({
  client,
  config,
  logger,
  mainUserPresence = null,
  reactionContext = null,
  cache,
  settingsStore,
  proactiveActionStore,
  channelModes,
  memory,
  journalStore,
  conversations,
  tools,
  generatedImages,
  generatedAudio,
  imageStylePresets,
  imageAppearancePresets,
}) {
  let interval = null;
  let running = false;

  function normalizeDismissedBuiltinActionIds(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
    }

    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return Array.from(new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean)));
        }
      } catch {
        return [];
      }
    }

    return [];
  }

  async function seedBuiltinActions() {
    if (!proactiveActionStore?.persistenceEnabled || !proactiveActionStore?.upsertAction) {
      return;
    }

    const settings = settingsStore?.listSettings
      ? await settingsStore.listSettings()
      : {};
    const dismissedBuiltinActionIds = new Set(normalizeDismissedBuiltinActionIds(
      settings?.["heartbeat.dismissedBuiltinActionIds"],
    ));

    for (const action of HEARTBEAT_BUILTIN_ACTIONS) {
      if (dismissedBuiltinActionIds.has(action.actionId)) {
        continue;
      }

      if (proactiveActionStore.getActionById) {
        const existing = await proactiveActionStore.getActionById(action.actionId, {
          userScope: config.memory.userScope,
        });

        if (existing) {
          continue;
        }
      }

      await proactiveActionStore.upsertAction({
        actionId: action.actionId,
        triggerType: "heartbeat",
        name: action.label,
        actionType: action.actionType || "message",
        target: action.targetChannelId,
        prompt: action.prompt,
        enabledTools: action.enabledTools || [],
        enabled: action.enabled,
        frequency: action.frequency,
        quietHoursAllowed: action.quietHoursAllowed,
        mentionUser: action.mentionUser,
        isBuiltin: action.isBuiltin,
      }, {
        userScope: config.memory.userScope,
      });
    }
  }

  async function listActions({ enabledOnly = false } = {}) {
    return proactiveActionStore.listActions({
      userScope: config.memory.userScope,
      enabledOnly,
      triggerType: "heartbeat",
    });
  }

  async function getActionState(action, now = new Date()) {
    const timeZone = config.chat?.timezone || "UTC";
    const dateKey = getHeartbeatDateKey(now, timeZone);
    const [lastUsedAt, todayCount] = await Promise.all([
      cache.get(buildActionLastUsedKey(action.actionId)),
      cache.get(buildActionDailyCountKey(action.actionId, dateKey)),
    ]);

    return {
      lastUsedAt: typeof lastUsedAt === "string" ? lastUsedAt : "",
      todayCount: coerceNumber(todayCount, 0),
    };
  }

  async function resolveTarget(action) {
    if (!String(action.target || "").trim()) {
      return null;
    }

    let resolvedChannelId;

    try {
      resolvedChannelId = await resolveAutomationChannelId(action.target, {
        cache,
        userScope: config.memory.userScope,
      });
    } catch (_error) {
      return null;
    }

    const channel = await client.channels.fetch(resolvedChannelId);

    if (!channel) {
      return null;
    }

    const mode = channelModes?.resolveModeForChannel
      ? await channelModes.resolveModeForChannel({
        guildId: config.discord.guildId || "",
        channelId: channel?.id || resolvedChannelId,
        parentChannelId: channel?.isThread?.() ? channel.parentId : null,
        fallbackModeKey: config.chat?.defaultMode || "default",
      })
      : null;

    return {
      channelId: resolvedChannelId,
      parentChannelId: channel?.isThread?.() ? channel.parentId : null,
      matchedBy: action.target.toLowerCase() === "daily" || action.target === "{{todays_thread}}"
        ? "currentDailyThread"
        : "targetChannelId",
      mode,
    };
  }

  async function buildAvailableActions(now = new Date()) {
    const actions = await listActions({ enabledOnly: true });
    const available = [];

    for (const action of actions) {
      let target = null;

      try {
        target = await resolveTarget(action);
      } catch (error) {
        const errorMessage = error?.message || String(error);
        await markActionError(action, errorMessage);
        await recordDebugEvent({
          at: now.toISOString(),
          status: "failed",
          reason: errorMessage,
          actionId: action.actionId,
        });
        continue;
      }

      if (!target?.channelId) {
        continue;
      }

      const state = await getActionState(action, now);
      const cooldownHours = getActionCooldownHours(action);

      if (state.lastUsedAt && cooldownHours > 0) {
        const elapsedMs = now.getTime() - new Date(state.lastUsedAt).getTime();

        if (elapsedMs < cooldownHours * 60 * 60 * 1000) {
          continue;
        }
      }

      available.push({
        action,
        target,
        state,
        summary: summarizeActionForConductor(action, target, state, now),
      });
    }

    return available;
  }

  function buildReactionContextSectionsForActions(actions = []) {
    if (!reactionContext?.peekContextSection) {
      return [];
    }

    const groupedByConversationId = new Map();

    for (const item of Array.isArray(actions) ? actions : []) {
      const conversationId = String(item?.target?.channelId || "").trim();
      const actionId = String(item?.action?.actionId || item?.summary?.actionId || "").trim();

      if (!conversationId) {
        continue;
      }

      const existing = groupedByConversationId.get(conversationId) || {
        conversationId,
        actionIds: [],
      };

      if (actionId && !existing.actionIds.includes(actionId)) {
        existing.actionIds.push(actionId);
      }

      groupedByConversationId.set(conversationId, existing);
    }

    return Array.from(groupedByConversationId.values())
      .map((item) => {
        const section = reactionContext.peekContextSection({ conversationId: item.conversationId });

        if (!section) {
          return null;
        }

        return {
          conversationId: item.conversationId,
          actionIds: item.actionIds,
          label: section.label,
          content: section.content,
        };
      })
      .filter(Boolean);
  }

  async function getCurrentState(now = new Date()) {
    const timeZone = config.chat?.timezone || "UTC";
    const dateKey = getHeartbeatDateKey(now, timeZone);
    const [lastSuccessAt, todayCount, recentDecisions] = await Promise.all([
      cache.get(CACHE_KEYS.lastSuccessAt),
      cache.get(buildTodayCountKey(dateKey)),
      readRecentDecisions(cache),
    ]);

    return {
      lastSuccessAt: typeof lastSuccessAt === "string" ? lastSuccessAt : "",
      todayCount: coerceNumber(todayCount, 0),
      recentDecisions,
    };
  }

  async function recordDecision(entry) {
    await writeRecentDecision({
      cache,
      decision: entry,
      limit: config.heartbeat?.recentDecisionLimit || 10,
    });
  }

  async function recordDebugEvent(entry) {
    await writeRecentDebugEvent({
      cache,
      event: entry,
      limit: DEBUG_EVENT_LIMIT,
    });
  }

  async function markActionError(action, errorMessage) {
    if (!action?.actionId || !proactiveActionStore?.upsertAction) {
      return;
    }

    await persistProactiveActionState(proactiveActionStore, action, {
      lastError: errorMessage,
    }).catch((error) => {
      logger.warn("[heartbeat] Failed to persist heartbeat action error", {
        actionId: action.actionId,
        error: error?.message || String(error),
      });
    });
  }

  function shouldRecordSkipEvent({ quietHoursActive = false } = {}) {
    return !quietHoursActive;
  }

  async function updateSuccessState({ action, decision, execution, now = new Date() }) {
    const timeZone = config.chat?.timezone || "UTC";
    const dateKey = getHeartbeatDateKey(now, timeZone);
    const dailyCountExpiresAt = getNextLocalMidnight(now, timeZone);
    const nextTodayCount = coerceNumber(await cache.get(buildTodayCountKey(dateKey)), 0) + 1;
    const nextActionCount = coerceNumber(await cache.get(buildActionDailyCountKey(action.actionId, dateKey)), 0) + 1;

    await Promise.all([
      cache.set(CACHE_KEYS.lastSuccessAt, now.toISOString()),
      cache.set(buildTodayCountKey(dateKey), nextTodayCount, {
        expiresAt: dailyCountExpiresAt,
      }),
      cache.set(buildActionLastUsedKey(action.actionId), now.toISOString()),
      cache.set(buildActionDailyCountKey(action.actionId, dateKey), nextActionCount, {
        expiresAt: dailyCountExpiresAt,
      }),
      proactiveActionStore?.upsertAction
        ? persistProactiveActionState(proactiveActionStore, action, {
          lastRunAt: now.toISOString(),
          lastError: "",
        })
        : Promise.resolve(),
      recordDecision({
        at: now.toISOString(),
        status: "fired",
        actionId: action.actionId,
        executorType: action.actionType,
        confidence: decision.confidence,
        why: decision.why,
        tone: decision.tone,
        channelId: execution.channelId,
        threadId: execution.threadId,
      }),
    ]);
  }

  async function shouldRunTick(now = new Date()) {
    const timeZone = config.chat?.timezone || "UTC";
    const local = getLocalDateParts(now, timeZone);
    const currentMinutes = (local.hour * 60) + local.minute;
    const slotStartMinutes = (local.hour * 60) + (local.minute < 30 ? 0 : 30);
    const quietHoursActive = isInQuietHours(now, timeZone, {
      enabled: config.heartbeat?.quietHoursEnabled,
      start: config.heartbeat?.quietHoursStart,
      end: config.heartbeat?.quietHoursEnd,
    });

    const slotKey = getTickSlotKey(now, timeZone);
    const lastTickSlot = await cache.get(CACHE_KEYS.lastTickSlot);

    if (quietHoursActive) {
      const nextQuietTickAt = await cache.get(CACHE_KEYS.nextQuietTickAt);
      const nextQuietTickDate = nextQuietTickAt ? new Date(nextQuietTickAt) : null;

      if (
        nextQuietTickDate
        && !Number.isNaN(nextQuietTickDate.getTime())
        && now.getTime() < nextQuietTickDate.getTime()
      ) {
        return false;
      }

      if (slotKey === lastTickSlot) {
        return false;
      }

      const quietJitterMinutes = getDeterministicJitterMinutes(
        `${slotKey}:quiet`,
        config.memory?.userScope || "",
        HEARTBEAT_QUIET_JITTER_MINUTES,
      );
      const nextQuietDueAt = new Date(
        now.getTime() + ((HEARTBEAT_QUIET_INTERVAL_MINUTES + quietJitterMinutes) * 60 * 1000),
      );
      await cache.set(CACHE_KEYS.nextQuietTickAt, nextQuietDueAt.toISOString());

      return true;
    }

    if (await cache.get(CACHE_KEYS.nextQuietTickAt)) {
      await cache.set(CACHE_KEYS.nextQuietTickAt, "");
    }

    const jitterMinutes = getDeterministicJitterMinutes(slotKey, config.memory?.userScope || "");
    const triggerMinutes = slotStartMinutes + jitterMinutes;

    if (currentMinutes < triggerMinutes) {
      return false;
    }

    return slotKey !== lastTickSlot;
  }

  async function runGate(now = new Date(), { randomFn = Math.random } = {}) {
    const settings = config.heartbeat || {};
    const timeZone = config.chat?.timezone || "UTC";
    const currentState = await getCurrentState(now);
    const quietHoursActive = isInQuietHours(now, timeZone, {
      enabled: settings.quietHoursEnabled,
      start: settings.quietHoursStart,
      end: settings.quietHoursEnd,
    });

    if (settings.activityMode === "off") {
      return {
        allowed: false,
        reason: "disabled",
        currentState,
        quietHoursActive,
      };
    }

    if (settings.dailyCap > 0 && currentState.todayCount >= settings.dailyCap) {
      return {
        allowed: false,
        reason: "daily_cap",
        currentState,
        quietHoursActive,
      };
    }

    if (currentState.lastSuccessAt && settings.globalCooldownMinutes > 0) {
      const elapsedMs = now.getTime() - new Date(currentState.lastSuccessAt).getTime();

      if (elapsedMs < settings.globalCooldownMinutes * 60 * 1000) {
        return {
          allowed: false,
          reason: "global_cooldown",
          currentState,
          quietHoursActive,
        };
      }
    }

    const deferredRollAt = await cache.get(CACHE_KEYS.deferredRollAt);

    if (deferredRollAt) {
      await cache.set(CACHE_KEYS.deferredRollAt, "");
      return {
        allowed: true,
        reason: "deferred_roll",
        currentState,
        quietHoursActive,
      };
    }

    if (!rollShouldAct(settings.activityMode, randomFn)) {
      return {
        allowed: false,
        reason: "roll_failed",
        currentState,
        quietHoursActive,
      };
    }

    return {
      allowed: true,
      reason: "passed",
      currentState,
      quietHoursActive,
    };
  }

  async function runNow(now = new Date(), { randomFn = Math.random } = {}) {
    if (running) {
      return { skipped: true, reason: "already_running" };
    }

    running = true;
    let selectedActionForError = null;

    try {
      const timeZone = config.chat?.timezone || "UTC";
      const slotKey = getTickSlotKey(now, timeZone);
      await cache.set(CACHE_KEYS.lastTickSlot, slotKey);

      const gate = await runGate(now, { randomFn });

      if (!gate.allowed) {
        if (!["roll_failed", "disabled"].includes(gate.reason) && shouldRecordSkipEvent(gate)) {
          await recordDebugEvent({
            at: now.toISOString(),
            status: "skipped",
            reason: gate.reason,
          });
        }
        return { skipped: true, reason: gate.reason };
      }

      const available = await buildAvailableActions(now);

      if (!available.length) {
        if (shouldRecordSkipEvent(gate)) {
          await recordDebugEvent({
            at: now.toISOString(),
            status: "skipped",
            reason: "no_available_actions",
          });
        }
        return { skipped: true, reason: "no_available_actions" };
      }

      let availableForConductor = available;
      let spotifyPlaybackContext = null;
      const hasSpotifyPlaybackAvailable = available.some(actionUsesSpotifyPlayback);

      if (hasSpotifyPlaybackAvailable) {
        if (tools?.has?.("get_current_spotify_track")) {
          try {
            const currentSpotify = await tools.execute("get_current_spotify_track", {}, {
              surface: "heartbeat",
              userScope: config.memory?.userScope,
            });
            spotifyPlaybackContext = {
              playbackActive: Boolean(currentSpotify?.isPlaying),
              currentlyPlayingType: currentSpotify?.currentlyPlayingType || "",
              track: currentSpotify?.track
                ? {
                  title: currentSpotify.track.title,
                  artists: currentSpotify.track.artists,
                  spotifyTrackId: currentSpotify.track.spotifyTrackId,
                }
                : null,
            };
          } catch (error) {
            spotifyPlaybackContext = {
              playbackActive: false,
              error: error?.message || String(error),
            };
          }
        } else {
          spotifyPlaybackContext = {
            playbackActive: false,
            error: "Spotify current-track lookup is not available.",
          };
        }

        if (!spotifyPlaybackContext.playbackActive) {
          availableForConductor = available.filter((item) => !actionUsesSpotifyPlayback(item));

          if (!availableForConductor.length) {
            if (shouldRecordSkipEvent(gate)) {
              await recordDebugEvent({
                at: now.toISOString(),
                status: "skipped",
                reason: "spotify_playback_inactive",
              });
            }
            return { skipped: true, reason: "spotify_playback_inactive" };
          }

          spotifyPlaybackContext = null;
        }
      }

      const primaryContext = availableForConductor.find((item) => item.action.target === "daily")
        || availableForConductor[0];
      const conductorActions = selectActionsForConductor(availableForConductor, {
        limit: coerceNumber(config.heartbeat?.conductorActionLimit, 8),
        randomFn,
      });
      const conductorContextChannelIds = [
        ...new Set(availableForConductor.flatMap((item) => [
          item.target?.channelId,
          item.target?.parentChannelId,
        ]).map((channelId) => String(channelId || "").trim()).filter(Boolean)),
      ];
      const recentMessages = await loadRecentServerContext({
        conversations,
        config,
        now,
        limit: CONDUCTOR_RECENT_CONTEXT_MESSAGE_LIMIT,
        additionalChannelIds: conductorContextChannelIds,
      });
      const mostRecentUserMessage = [...recentMessages].reverse().find((item) => !item.isBot) || null;
      const recentUserActivityHours = mostRecentUserMessage
        ? Number(((now.getTime() - mostRecentUserMessage.createdTimestamp) / (1000 * 60 * 60)).toFixed(2))
        : null;
      const currentTimeContext = buildHeartbeatTimeContext({
        now,
        timeZone,
        mostRecentUserMessage,
      });
      const mainUserPresenceSnapshot = mainUserPresence?.getSnapshot?.() || null;
      const reactionContextSections = buildReactionContextSectionsForActions(conductorActions);
      const heartbeatContext = {
        currentLocalTime: currentTimeContext.currentLocalTime,
        currentLocalDate: currentTimeContext.currentLocalDate,
        lastUserMessageLocalTime: currentTimeContext.lastUserMessageLocalTime,
        recentUserActivityMinutes: currentTimeContext.recentUserActivityMinutes,
        presenceSnapshot: mainUserPresenceSnapshot,
      };

      if ((config.heartbeat?.maxIdleHours || 0) > 0 && recentUserActivityHours !== null && recentUserActivityHours > config.heartbeat.maxIdleHours) {
        if (shouldRecordSkipEvent(gate)) {
          await recordDebugEvent({
            at: now.toISOString(),
            status: "skipped",
            reason: "user_idle",
          });
        }
        return { skipped: true, reason: "user_idle" };
      }

      const recentUserActivityDeferMinutes = coerceNumber(config.heartbeat?.recentUserActivityDeferMinutes, 5);

      if (
        recentUserActivityDeferMinutes > 0
        && currentTimeContext.recentUserActivityMinutes !== null
        && currentTimeContext.recentUserActivityMinutes <= recentUserActivityDeferMinutes
      ) {
        await cache.set(CACHE_KEYS.deferredRollAt, now.toISOString());

        if (shouldRecordSkipEvent(gate)) {
          await recordDebugEvent({
            at: now.toISOString(),
            status: "skipped",
            reason: "recent_user_activity_defer",
          });
        }

        return {
          skipped: true,
          reason: "recent_user_activity_defer",
        };
      }

      const decision = await runConductor({
        config,
        mode: primaryContext.target.mode,
        recentMessages,
        currentState: gate.currentState,
        actions: conductorActions.map((item) => item.summary),
        recentDecisions: gate.currentState.recentDecisions,
        quietHoursActive: gate.quietHoursActive,
        recentUserActivityHours,
        currentTimeContext,
        mainUserPresenceSnapshot,
        reactionContextSections,
        spotifyPlaybackContext,
      });

      if (!decision?.actionId) {
        if (shouldRecordSkipEvent(gate)) {
          await recordDebugEvent({
            at: now.toISOString(),
            status: "skipped",
            reason: "no_decision",
          });
        }
        return { skipped: true, reason: "no_decision" };
      }

      const selected = available.find((item) => item.action.actionId === decision.actionId);

      if (!selected) {
        if (shouldRecordSkipEvent(gate)) {
          await recordDebugEvent({
            at: now.toISOString(),
            status: "skipped",
            reason: "invalid_action",
            actionId: decision.actionId,
          });
        }
        return { skipped: true, reason: "invalid_action" };
      }

      selectedActionForError = selected.action;

      const confidenceThreshold = coerceNumber(config.heartbeat?.confidenceThreshold, 0);

      if (confidenceThreshold > 0 && decision.confidence < confidenceThreshold) {
        if (shouldRecordSkipEvent(gate)) {
          const heldBackWhy = String(decision.heldBackWhy || "").trim();
          const consideredWhy = String(decision.why || "").trim();

          await recordDecision({
            at: now.toISOString(),
            status: "skipped",
            reason: "low_confidence",
            actionId: selected.action.actionId,
            executorType: selected.action.actionType,
            confidence: decision.confidence,
            why: heldBackWhy || consideredWhy,
            consideredWhy,
            tone: decision.tone,
            channelId: selected.target.channelId,
            threadId: null,
          });
        }

        return {
          skipped: true,
          reason: "low_confidence",
          actionId: selected.action.actionId,
        };
      }

      if (gate.quietHoursActive && !selected.action.quietHoursAllowed) {
        return { skipped: true, reason: "quiet_hours_blocked" };
      }

      const selectedReactionContextSection = reactionContext?.peekContextSection?.({
        conversationId: selected.target.channelId,
      });
      const executionHeartbeatContext = {
        ...heartbeatContext,
        reactionContext: selectedReactionContextSection
          ? {
              label: selectedReactionContextSection.label,
              content: selectedReactionContextSection.content,
            }
          : null,
      };

      const execution = await runProactiveAction({
        client,
        config,
        logger,
        memory,
        journalStore,
        conversations,
        proactiveActionStore,
        cache,
        tools,
        action: selected.action,
        target: selected.target,
        channelModes,
        generatedImages,
        generatedAudio,
        imageStylePresets,
        imageAppearancePresets,
        tone: decision.tone,
        heartbeatDecision: {
          tone: decision.tone,
          why: decision.why,
        },
        heartbeatContext: executionHeartbeatContext,
        reactionContext,
        now,
      });

      await updateSuccessState({
        action: selected.action,
        decision,
        execution,
        now,
      });

      logger.info("[heartbeat] Heartbeat action executed", {
        actionId: selected.action.actionId,
        executorType: selected.action.actionType,
        channelId: execution.channelId,
        threadId: execution.threadId,
      });

      return {
        skipped: false,
        actionId: selected.action.actionId,
        execution,
      };
    } catch (error) {
      const errorMessage = error?.message || String(error);
      const failure = summarizeHeartbeatFailure(error);
      logger.error("[heartbeat] Heartbeat tick failed", {
        actionId: selectedActionForError?.actionId || selected?.action?.actionId || "",
        actionName: selectedActionForError?.name || selectedActionForError?.label || selected?.action?.name || selected?.action?.label || "",
        actionType: selectedActionForError?.actionType || selected?.action?.actionType || "",
        target: selectedActionForError?.target || selected?.target?.channelId || "",
        enabledTools: Array.isArray(selectedActionForError?.enabledTools)
          ? selectedActionForError.enabledTools
          : Array.isArray(selected?.action?.enabledTools)
            ? selected.action.enabledTools
            : [],
        decisionTone: decision?.tone || "",
        ...failure,
      }, error);

      if (selectedActionForError) {
        await markActionError(selectedActionForError, errorMessage);
      }

      await recordDebugEvent({
        at: now.toISOString(),
        status: "failed",
        reason: errorMessage,
        actionId: selectedActionForError?.actionId,
      });

      return {
        skipped: true,
        reason: "failed",
        error: errorMessage,
      };
    } finally {
      running = false;
    }
  }

  return {
    async init() {
      await seedBuiltinActions();
    },
    async listActions(options) {
      return listActions(options);
    },
    async getRuntimeSnapshot(now = new Date()) {
      const currentState = await getCurrentState(now);
      const recentDebugEvents = await readRecentDebugEvents(cache);
      return {
        settings: config.heartbeat || {},
        lastSuccessAt: currentState.lastSuccessAt || "",
        todayCount: currentState.todayCount || 0,
        recentDecisions: currentState.recentDecisions || [],
        recentDebugEvents,
      };
    },
    async clearRecentErrors() {
      const recentDebugEvents = await readRecentDebugEvents(cache);
      const remainingEvents = recentDebugEvents.filter((item) => item.status !== "failed");
      await cache.set(CACHE_KEYS.recentDebugEvents, remainingEvents);
      return recentDebugEvents.length - remainingEvents.length;
    },
    async shouldTick(now = new Date()) {
      return shouldRunTick(now);
    },
    async runNow(now = new Date(), options = {}) {
      return runNow(now, options);
    },
    start() {
      if (interval) {
        return;
      }

      interval = setInterval(() => {
        this.shouldTick()
          .then((shouldRun) => {
            if (!shouldRun) {
              return null;
            }

            return this.runNow();
          })
          .catch((error) => {
            logger.error("[heartbeat] Scheduler tick failed", {
              error: error.message,
            }, error);
          });
      }, HEARTBEAT_TICK_INTERVAL_MS);
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}

module.exports = {
  HEARTBEAT_BUILTIN_ACTIONS,
  ACTIVITY_MODE_PROBABILITIES,
  ACTION_COOLDOWN_HOURS,
  HEARTBEAT_INTERVAL_MINUTES,
  HEARTBEAT_QUIET_INTERVAL_MINUTES,
  getActionCooldownHours,
  getDeterministicJitterMinutes,
  isInQuietHours,
  rollShouldAct,
  selectActionsForConductor,
  getTickSlotKey,
  createHeartbeatService,
};
