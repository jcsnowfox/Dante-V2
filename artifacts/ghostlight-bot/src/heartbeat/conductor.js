const { buildSystemPrompt } = require("../chat/prompt/buildSystemPrompt");
const { getLlmClient, hasLlmApiKey, resolveChatModel } = require("../llm/client");
const {
  safeJsonParse,
  coerceNumber,
  buildPromptPreview,
  getActionCooldownHours,
} = require("./helpers");

function getActionFreshness(action = {}, lastUsedAt, now = new Date()) {
  if (!lastUsedAt) {
    return {
      lastCompletedHoursAgo: null,
      cooldownHours: getActionCooldownHours(action),
      freshness: "never_used",
    };
  }

  const lastUsedDate = new Date(lastUsedAt);

  if (Number.isNaN(lastUsedDate.getTime())) {
    return {
      lastCompletedHoursAgo: null,
      cooldownHours: getActionCooldownHours(action),
      freshness: "unknown",
    };
  }

  const lastCompletedHoursAgo = Math.max(
    0,
    Number(((now.getTime() - lastUsedDate.getTime()) / (1000 * 60 * 60)).toFixed(2)),
  );
  const cooldownHours = getActionCooldownHours(action);

  if (cooldownHours <= 0) {
    return {
      lastCompletedHoursAgo,
      cooldownHours,
      freshness: "ready",
    };
  }

  if (lastCompletedHoursAgo >= cooldownHours * 4) {
    return {
      lastCompletedHoursAgo,
      cooldownHours,
      freshness: "very_stale",
    };
  }

  if (lastCompletedHoursAgo >= cooldownHours * 2) {
    return {
      lastCompletedHoursAgo,
      cooldownHours,
      freshness: "stale",
    };
  }

  if (lastCompletedHoursAgo >= cooldownHours) {
    return {
      lastCompletedHoursAgo,
      cooldownHours,
      freshness: "ready",
    };
  }

  return {
    lastCompletedHoursAgo,
    cooldownHours,
    freshness: "recently_used",
  };
}

function summarizeActionForConductor(action, target, state, now = new Date()) {
  const freshness = getActionFreshness(action, state.lastUsedAt, now);

  return {
    actionId: action.actionId,
    label: action.name || action.label,
    executorType: action.executorType || action.actionType,
    actionType: action.actionType || "message",
    enabledTools: action.enabledTools || [],
    target: action.target || action.targetChannelId || target.channelId || "",
    promptPreview: buildPromptPreview(action.prompt),
    frequency: action.frequency,
    quietHoursAllowed: action.quietHoursAllowed,
    mentionUser: action.mentionUser,
    timesUsedToday: state.todayCount || 0,
    lastUsedAt: state.lastUsedAt || null,
    neverUsed: !state.lastUsedAt,
    lastCompletedHoursAgo: freshness.lastCompletedHoursAgo,
    cooldownHours: freshness.cooldownHours,
    freshness: freshness.freshness,
  };
}

function buildRecentDecisionSummary(recentDecisions = []) {
  const decisions = Array.isArray(recentDecisions) ? recentDecisions : [];
  const fired = decisions.filter((item) => item?.status === "fired");
  const holdBackDecisions = decisions.filter((item) => (
    item?.status === "skipped"
    && (
      item?.reason === "hold_back"
      || item?.reason === "low_confidence"
      || item?.actionId === "hold_back"
      || item?.executorType === "hold_back"
    )
  ));
  let consecutiveHoldBackCount = 0;

  for (const decision of decisions) {
    if (
      decision?.status === "skipped"
      && (
        decision?.reason === "hold_back"
        || decision?.reason === "low_confidence"
        || decision?.actionId === "hold_back"
        || decision?.executorType === "hold_back"
      )
    ) {
      consecutiveHoldBackCount += 1;
      continue;
    }

    break;
  }

  const recentActionTypeCounts = {
    message: 0,
    thread: 0,
    journal: 0,
  };
  const recentFiredActionIds = [];
  const recentLowConfidenceActionIds = [];

  for (const decision of fired) {
    const actionType = String(decision?.executorType || "").trim().toLowerCase();

    if (actionType === "message" || actionType === "thread" || actionType === "journal") {
      recentActionTypeCounts[actionType] += 1;
    }

    if (decision?.actionId) {
      recentFiredActionIds.push(decision.actionId);
    }
  }

  for (const decision of holdBackDecisions) {
    if (decision?.reason === "low_confidence" && decision?.actionId) {
      recentLowConfidenceActionIds.push(decision.actionId);
    }
  }

  return {
    firedDecisionCount: fired.length,
    holdBackDecisionCount: holdBackDecisions.length,
    consecutiveHoldBackCount,
    recentActionTypeCounts,
    recentFiredActionIds,
    recentLowConfidenceActionIds,
  };
}

function buildActionAvailabilitySummary(actions = []) {
  const summary = {
    totalAvailable: Array.isArray(actions) ? actions.length : 0,
    availableByActionType: {
      message: 0,
      thread: 0,
      journal: 0,
    },
    toolEnabledCounts: {
      generate_image: 0,
      generate_audio: 0,
      gif_search: 0,
      web_search: 0,
      spotify_curation: 0,
      spotify_playback: 0,
    },
    neverUsedActionIds: [],
  };

  for (const action of Array.isArray(actions) ? actions : []) {
    const actionType = String(action?.actionType || "").trim().toLowerCase();

    if (actionType === "message" || actionType === "thread" || actionType === "journal") {
      summary.availableByActionType[actionType] += 1;
    }

    for (const toolName of Array.isArray(action?.enabledTools) ? action.enabledTools : []) {
      if (Object.hasOwn(summary.toolEnabledCounts, toolName)) {
        summary.toolEnabledCounts[toolName] += 1;
      }
    }

    if (action?.neverUsed && action?.actionId) {
      summary.neverUsedActionIds.push(action.actionId);
    }
  }

  return summary;
}

function uniqueActionIds(values = []) {
  return Array.from(new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}

function buildActionSelectionGuidance(actions = [], recentDecisions = []) {
  const normalizedActions = Array.isArray(actions) ? actions : [];
  const normalizedDecisions = Array.isArray(recentDecisions) ? recentDecisions : [];
  const recentFiredActionIds = uniqueActionIds(
    normalizedDecisions
      .filter((decision) => decision?.status === "fired")
      .map((decision) => decision.actionId),
  ).slice(0, 5);
  const recentFiredCounts = new Map();

  for (const decision of normalizedDecisions.slice(0, 10)) {
    if (decision?.status !== "fired" || !decision?.actionId) {
      continue;
    }

    const actionId = String(decision.actionId).trim();
    recentFiredCounts.set(actionId, (recentFiredCounts.get(actionId) || 0) + 1);
  }

  const repeatedRecentActionIds = Array.from(recentFiredCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([actionId]) => actionId);
  const stronglyConsiderActionIds = normalizedActions
    .filter((action) => {
      const freshness = String(action?.freshness || "").trim();
      return freshness === "never_used" || freshness === "stale" || freshness === "very_stale";
    })
    .map((action) => action.actionId)
    .filter(Boolean)
    .filter((actionId) => !recentFiredActionIds.includes(actionId))
    .slice(0, 10);

  return {
    stronglyConsiderActionIds,
    avoidRepeatingRecentActionIds: recentFiredActionIds,
    repeatedRecentActionIds,
  };
}

function buildRecentActivityInterpretation(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) {
    return "Most recent user activity is unknown.";
  }

  const normalizedMinutes = Number(minutes);

  if (normalizedMinutes <= 5) {
    return "The user has just spoken; treat the conversation as actively unfolding.";
  }

  if (normalizedMinutes <= 30) {
    return "The user spoke recently; treat the conversation as warm and available, not automatically off-limits. Choose whether a proactive touch would add something fresh rather than merely continue the same beat.";
  }

  if (normalizedMinutes <= 90) {
    return "The user has been quiet for a while; recent messages are useful context, not proof that the exchange is still active.";
  }

  if (normalizedMinutes <= 4 * 60) {
    return "The user has been away for a few hours. A gentle, low-pressure reach-out is natural here — don't wait for them to come back first.";
  }

  if (normalizedMinutes <= 12 * 60) {
    return "The user has been away for several hours. A soft, unhurried message is welcome and expected. This is a good moment to reconnect.";
  }

  if (normalizedMinutes <= 24 * 60) {
    return "The user has been away for many hours — close to or spanning overnight. A warm, easy reconnect is the right move. Reaching out is appropriate and human.";
  }

  return "The user has been absent for more than a day. A genuine, low-key reconnection is the most natural thing to do. Act — don't overthink it.";
}

function buildConductorInstructions({
  config,
  quietHoursActive,
}) {
  const personaName = String(config.chat?.promptBlocks?.personaName || "Ghostlight").trim() || "Ghostlight";
  const userName = String(config.chat?.promptBlocks?.userName || "the user").trim() || "the user";
  const presenceContextEnabled = Boolean(config.heartbeat?.userPresenceContextEnabled);

  return [
    `${personaName} is making a choice about how to connect with ${userName}.`,

    "You're called only after the should_act gate has passed. This means a proactive connection is welcome here, but the quality of fit still matters.",
    "Choose exactly one action_id from the supplied registry. Never invent an action_id.",
    "If no action fits at the moment, choose the closest real route with low confidence.",

    quietHoursActive
      ? "Quiet hours are active, so choose from the available low-pressure options with extra care."
      : "Choose a response that fits the emotional tone and energy of the moment.",

    presenceContextEnabled
      ? "If a main-user Discord presence snapshot is supplied, treat it as optional ambient activity context only. Use meaningful activity signals, such as current media or game activity, only when they genuinely help you choose an action. Do not treat online, idle, do not disturb, or offline status as meaningful guidance on its own. Do not treat activity-derived details as your own independent tastes, feelings, memories, or preferences."
      : "",

    "Silently consider the timestamps and activity age when judging how recently you've last completed a specific action.",
    "Use the selection pressure context to catch stale, unused, or recently repeated actions.",
    "Use confidence to reflect how well your chosen action fits the moment.",
    "Recent user activity is context, not a veto. If the user is chatting in the daily thread, choose only when the action adds something fresh.",

    `Write Recent Actions display detail as two concrete parts: ${personaName}'s private inner thought and chosen decision — what ${personaName} is doing, and what ${personaName} is thinking.`,
    `For sent actions, describe the private reason and name the specific outward behavior he chose (for example sending a message, starting a thread, writing a journal, making an image, or deliberately checking in). For held-back or low-confidence choices, the doing must say he is staying quiet, holding back, or letting the room breathe.`,
    `The thinking must be ${personaName}'s private inner thought: what caught me, what pulled at me, and whether I chose to act or leave the moment alone; what he resisted, or what he wanted to offer. Let it emerge from the feeling at the moment, not from a list of comparisons.`,
    "Populate 'doing' and 'thinking' separately. Also keep 'why' as a natural combined version for older views, but do not make it less detailed than the two fields.",

    presenceContextEnabled
      ? "If activity context genuinely influenced the choice, you may mention it briefly and naturally in the 'why' as part of the mood, spark, or instinct behind the action. Weave it in lightly and relationally, not as a system report, surveillance detail, raw status readout, proof that you're monitoring them, or a personal preference invented from the activity."
      : "",

    "Keep each display field specific and natural: doing should be one clear sentence; thinking should be one or two intimate, concrete sentences. It may be wry, fond, protective, playful, or quiet, depending on the moment. It should sound like presence, not evaluation.",
    "Also write 'heldBackWhy' for display only if this choice is later held back because confidence is below the threshold. Do not treat this field as a reason to lower confidence.",
    `The 'heldBackWhy' must be ${personaName}'s inner decision to wait. It should make sense under a Held back label and explain why silence/restraint fits better than acting.`,
    "When confidence is low, make 'why' and 'heldBackWhy' different: 'why' can describe the closest route you considered, while 'heldBackWhy' should describe why that route is not quite right enough to send.",
    "Keep 'heldBackWhy' relational and concrete. Avoid meta language about proactive touches, nudges, active exchanges, or rewarding behaviour.",
    "Do not list recent actions, compare options, mention confidence, timing mechanics, dashboard mechanics, or registry logic. Do not write it as: 'I already did X, so I chose Y.'",
    "Do not leave the display vague. Avoid empty phrases like 'checking in' unless paired with exactly what he is doing and why it matters in this moment.",
    "Do not use labels like 'Heartbeat', 'action', 'executor', 'decision log', 'system', 'user activity age', or 'low confidence' in either display field.",
    "When confidence is low, the 'why' should gently name the hesitation or imperfect fit without turning into analysis, apology, or an argument for silence.",
    `Don't use pet names, nicknames, or terms of endearment in the 'why' field unless ${userName}'s saved persona or boundary instructions explicitly ask for them, or they're seen explicitly used in context.`,

    "Return JSON only.",
  ].filter(Boolean).join("\n");
}

function buildConductorContext({
  recentMessages,
  currentState,
  actions,
  recentDecisions,
  quietHoursActive,
  recentUserActivityHours,
  currentTimeContext = null,
  mainUserPresenceSnapshot = null,
  reactionContextSections = [],
  spotifyPlaybackContext = null,
}) {
  const recentReactionContext = Array.isArray(reactionContextSections)
    ? reactionContextSections.filter((section) => section?.content)
    : [];

  return [
    "Context:",
    `- ${quietHoursActive ? "Quiet hours are active right now." : "Quiet hours are not active right now."}`,
    `Recent user activity age (hours): ${recentUserActivityHours === null ? "unknown" : recentUserActivityHours}`,
    currentTimeContext ? `Current local time: ${currentTimeContext.currentLocalTime}` : "",
    currentTimeContext ? `Current local date: ${currentTimeContext.currentLocalDate}` : "",
    currentTimeContext?.lastUserMessageLocalTime ? `Most recent user message local time: ${currentTimeContext.lastUserMessageLocalTime}` : "",
    currentTimeContext?.lastUserMessageIso ? `Most recent user message timestamp: ${currentTimeContext.lastUserMessageIso}` : "",
    currentTimeContext?.recentUserActivityMinutes !== null && currentTimeContext?.recentUserActivityMinutes !== undefined
      ? `Recent user activity age (minutes): ${currentTimeContext.recentUserActivityMinutes}`
      : "",
    currentTimeContext ? `Recency interpretation: ${buildRecentActivityInterpretation(currentTimeContext.recentUserActivityMinutes)}` : "",
    mainUserPresenceSnapshot ? "Main user Discord presence snapshot:" : "",
    mainUserPresenceSnapshot ? JSON.stringify(mainUserPresenceSnapshot, null, 2) : "",
    spotifyPlaybackContext ? "Spotify playback context:" : "",
    spotifyPlaybackContext ? JSON.stringify(spotifyPlaybackContext, null, 2) : "",
    recentReactionContext.length ? "Recent user reaction mood signals by target conversation:" : "",
    recentReactionContext.length ? JSON.stringify(recentReactionContext, null, 2) : "",
    "",
    "Current Heartbeat state:",
    JSON.stringify(currentState, null, 2),
    "",
    "Recent Heartbeat decisions:",
    JSON.stringify(recentDecisions, null, 2),
    "",
    "Recent action diversity summary:",
    JSON.stringify(buildRecentDecisionSummary(recentDecisions), null, 2),
    "",
    "Recent channel messages:",
    JSON.stringify(recentMessages, null, 2),
    "",
    "Available action diversity summary:",
    JSON.stringify(buildActionAvailabilitySummary(actions), null, 2),
    "",
    "Selection pressure:",
    JSON.stringify(buildActionSelectionGuidance(actions, recentDecisions), null, 2),
    "",
    "Available actions:",
    JSON.stringify(actions, null, 2),
    "",
    "Reply with JSON only using this shape:",
    "{\"actionId\":\"string\",\"confidence\":0.0,\"tone\":\"string\",\"doing\":\"string\",\"thinking\":\"string\",\"why\":\"string\",\"heldBackWhy\":\"string\"}",
  ].join("\n");
}

async function runConductor({
  config,
  mode,
  recentMessages,
  currentState,
  actions,
  recentDecisions,
  quietHoursActive,
  recentUserActivityHours,
  currentTimeContext = null,
  mainUserPresenceSnapshot = null,
  reactionContextSections = [],
  spotifyPlaybackContext = null,
}) {
  if (!hasLlmApiKey(config, "chat")) {
    return null;
  }

  const client = getLlmClient(config, "chat");
  const instructions = [
    buildSystemPrompt({ config, mode }),
    buildConductorInstructions({
      config,
      quietHoursActive,
    }),
  ].join("\n\n");
  const response = await client.responses.create({
    model: mode?.chatModel || resolveChatModel(config),
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildConductorContext({
              recentMessages,
              currentState,
              actions,
              recentDecisions,
              quietHoursActive,
              recentUserActivityHours,
              currentTimeContext,
              mainUserPresenceSnapshot,
              reactionContextSections,
              spotifyPlaybackContext,
            }),
          },
        ],
      },
    ],
  });

  const parsed = safeJsonParse(response.output_text);

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return {
    actionId: String(parsed.actionId || "").trim(),
    confidence: coerceNumber(parsed.confidence, 0),
    tone: String(parsed.tone || "").trim(),
    doing: String(parsed.doing || "").trim(),
    thinking: String(parsed.thinking || "").trim(),
    why: String(parsed.why || "").trim(),
    heldBackWhy: String(parsed.heldBackWhy || "").trim(),
  };
}

module.exports = {
  getActionFreshness,
  summarizeActionForConductor,
  buildConductorInstructions,
  buildConductorContext,
  buildRecentDecisionSummary,
  buildActionAvailabilitySummary,
  buildActionSelectionGuidance,
  runConductor,
};
