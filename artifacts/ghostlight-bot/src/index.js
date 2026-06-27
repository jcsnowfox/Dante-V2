const { loadConfig } = require("./config/env");
const { applyRuntimeSettings } = require("./config/runtimeSettings");
const { createLogger, formatErrorForLog } = require("./utils/logger");
const { createHealthServer } = require("./http/createHealthServer");
const { createDiscordClient, getDiscordGatewayIntentDiagnostics } = require("./bot/createDiscordClient");
const { createMainUserPresenceTracker } = require("./bot/mainUserPresence");
const { createReactionContextTracker } = require("./bot/reactionContext");
const { registerEventHandlers } = require("./bot/registerEventHandlers");
const { loadCommands } = require("./bot/commands");
const { createMemoryService } = require("./memory");
const { createSpotifyService } = require("./music/spotify");
const { createMusicBrainzService } = require("./music/musicbrainz");
const { createMusicLibraryService } = require("./music/library");
const { createToolRegistry } = require("./tools");
const { createChatPipeline } = require("./chat/createChatPipeline");
const {
  createConversationStore,
  createMemoryStore,
  createGeneratedMemoryStore,
  createSettingsStore,
  createGeneratedImageStore,
  createGeneratedAudioStore,
  createMusicStore,
  createImageStylePresetStore,
  createImageAppearancePresetStore,
  createCacheStore,
  createSummaryQueueStore,
  createJournalStore,
  createChannelModeStore,
  createAutomationStore,
  createHeartbeatActionStore,
  createProactiveActionStore,
  createEmotionalBeatStore,
  createPromiseLedger,
  createMicroPreferenceStore,
  createPersonalTimelineStore,
  createFollowUpStore,
  createChannelAwarenessStore,
  createInnerWeatherStore,
  createAttentionResidueStore,
  createInteractionPresenceStore,
  createBoundaryConsentStore,
  createDoNotAskStore,
  createUserEnergyStore,
  createRecurringThemeStore,
  createMemoryConfidenceProfileStore,
  createSelfReflectionStore,
  createProactivePresenceRuleStore,
  createRecentDecisionStore,
  createConversationFollowupStore,
  createTimedNotesStore,
  createProactiveVarietyMemoryStore,
  createSituationalAwarenessStore,
} = require("./storage");
const { createWebSearchService } = require("./tools/webSearchService");
const { createHumanSimulationEngine } = require("./humanSimulation/humanSimulationEngine");
const { createSituationalAwarenessEngine } = require("./awareness/situationalAwarenessEngine");
const { seedStarterHeartbeatActions } = require("./storage/heartbeatActions/seedStarterActions");
const { createCacheService } = require("./cache");
const { createChannelModeService } = require("./channelModes");
const { createAutomationRunner } = require("./automations");
const { createHeartbeatService } = require("./heartbeat");
const { getHeartbeatDateKey } = require("./heartbeat/helpers");
const { createLicenseService } = require("./license");
const { createEmotionalArcEngine } = require("./companionSystems/emotionalArc");
const { createFeedbackLearningEngine } = require("./companionSystems/feedbackLearning");
const { createRelationalStateEngine } = require("./companionSystems/relationalState");
const { createInnerLifeEngine } = require("./innerLife/innerLifeEngine");
const { createContinuityEngine } = require("./continuity/continuityEngine");
const { resolveCompanionId } = require("./companion/resolveCompanionId");
const { createSecondLifeStore } = require("./storage/secondLife");
const { createSecondLifeReplyGenerator } = require("./companion/secondLifeReplyGenerator");
const { createSecondLifeAdapter } = require("./channels/secondLifeAdapter");
const { createIdentityResolver } = require("./secondLife/slIdentityResolver");
const { createSocialEngine } = require("./secondLife/slSocialEngine");
const { createCommandRegistry } = require("./secondLife/slCommandRegistry");
const { createOutfitManager } = require("./secondLife/slOutfitManager");
const { createLandmarkManager } = require("./secondLife/slLandmarkManager");
const { createMovementEngine } = require("./secondLife/slMovementEngine");
const { createObjectInteractionEngine } = require("./secondLife/slObjectInteractionEngine");
const { createLifeEngine } = require("./lifeEngine");
const { createCompanionEventProcessor } = require("./companion/processCompanionEvent");
const { createGameSystem } = require("./games");
const { createNorwegianLearningStore } = require("./norwegian");
const { runSchemaGuard } = require("./storage/postgres/runSchemaGuard");
const { createAliveEventsStore } = require("./alive/aliveEventsStore");
const { createIntentionQueueStore } = require("./alive/intentionQueueStore");
const { createAliveEngine } = require("./alive/aliveEngine");
const { createAlivePresenceStore } = require("./alive/alivePresenceStore");
const { executeNextIntention } = require("./alive/aliveExecutor");
const { createSchedulerRegistry } = require("./runtime/schedulerRegistry");

async function pruneStartupCache({ cache, config, logger, now = new Date() }) {
  if (!cache?.deleteExpired && !cache?.deleteHeartbeatDailyCountsBefore) {
    return;
  }

  const timeZone = config.chat?.timezone || "UTC";
  const dateKey = getHeartbeatDateKey(now, timeZone);

  try {
    const [expiredCount, heartbeatDailyCount] = await Promise.all([
      cache.deleteExpired ? cache.deleteExpired({ now }) : 0,
      cache.deleteHeartbeatDailyCountsBefore
        ? cache.deleteHeartbeatDailyCountsBefore({ dateKey })
        : 0,
    ]);

    if (expiredCount || heartbeatDailyCount) {
      logger.info("[cache] Pruned startup cache entries", {
        expiredCount,
        heartbeatDailyCount,
        dateKey,
      });
    }
  } catch (error) {
    logger.warn("[cache] Startup cache prune failed", {
      error: error?.message || String(error),
    });
  }
}

async function runStartupStep(step, logger, action) {
  try {
    const result = await action();
    logger.info("[app] Startup step completed", { step });
    return result;
  } catch (error) {
    logger.error("[app] Startup step failed", {
      step,
      error: formatErrorForLog(error),
    });
    throw error;
  }
}

async function startApp() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const databaseHost = (() => {
    try { return new URL(config?.database?.url || process.env.DATABASE_URL || "").hostname || null; } catch { return null; }
  })();
  logger.info("[app] Starting Ghostlight", {
    nodeEnv: config.nodeEnv,
    railwayServiceId: process.env.RAILWAY_SERVICE_ID || null,
    railwayDeploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null,
    railwayReplicaId: process.env.RAILWAY_REPLICA_ID || null,
    railwayEnvironmentId: process.env.RAILWAY_ENVIRONMENT_ID || null,
    databaseHost,
  });

  await runStartupStep("schemaGuard", logger, () => runSchemaGuard({ config, logger }));

  const settingsStore = createSettingsStore({ config, logger });
  await runStartupStep("settingsStore.init", logger, () => settingsStore.init());
  await runStartupStep("runtimeSettings.apply", logger, async () => {
    applyRuntimeSettings(config, await settingsStore.listSettings());
  });
  const discordIntentDiagnostics = getDiscordGatewayIntentDiagnostics({ config });
  logger.info("[bot] Discord gateway intents configured", discordIntentDiagnostics);

  const commands = loadCommands(config);
  const memoryStore = createMemoryStore({ config, logger });
  const memory = createMemoryService({ config, logger, memoryStore });
  const generatedMemories = createGeneratedMemoryStore({ config, logger });
  const generatedImages = createGeneratedImageStore({ config, logger });
  const generatedAudio = createGeneratedAudioStore({ config, logger });
  const musicStore = createMusicStore({ config, logger });
  const imageStylePresets = createImageStylePresetStore({ config, logger });
  const imageAppearancePresets = createImageAppearancePresetStore({ config, logger });
  const cacheStore = createCacheStore({ config, logger });
  const summaryQueueStore = createSummaryQueueStore({ config, logger });
  const cache = createCacheService({ store: cacheStore, config });
  const license = createLicenseService({ config, cache, logger });
  const journalStore = createJournalStore({ config, logger });
  const channelModeStore = createChannelModeStore({ config, logger });
  const automationStore = createAutomationStore({ config, logger });
  const heartbeatActionStore = createHeartbeatActionStore({ config, logger });
  const proactiveActionStore = createProactiveActionStore({ config, logger });
  const emotionalBeatStore = createEmotionalBeatStore({ config, logger });
  const promiseLedger = createPromiseLedger({ config, logger });
  const microPreferenceStore = createMicroPreferenceStore({ config, logger });
  const personalTimelineStore = createPersonalTimelineStore({ config, logger });
  const followUpStore = createFollowUpStore({ config, logger });
  const channelAwarenessStore = createChannelAwarenessStore({ config, logger });
  const innerWeatherStore = createInnerWeatherStore({ config, logger });
  const attentionResidueStore = createAttentionResidueStore({ config, logger });
  const interactionPresenceStore = createInteractionPresenceStore({ config, logger });
  const boundaryConsentStore = createBoundaryConsentStore({ config, logger });
  const doNotAskStore = createDoNotAskStore({ config, logger });
  const userEnergyStore = createUserEnergyStore({ config, logger });
  const recurringThemeStore = createRecurringThemeStore({ config, logger });
  const memoryConfidenceStore = createMemoryConfidenceProfileStore({ config, logger });
  const selfReflectionStore = createSelfReflectionStore({ config, logger });
  const proactivePresenceStore = createProactivePresenceRuleStore({ config, logger });
  const recentDecisionStore = createRecentDecisionStore({ config, logger });
  const conversationFollowupStore = createConversationFollowupStore({ config, logger });
  const timedNotesStore = createTimedNotesStore({ config, logger });
  const proactiveVarietyMemoryStore = createProactiveVarietyMemoryStore({ config, logger });
  const situationalAwarenessStore = createSituationalAwarenessStore({ config, logger });
  const webSearchService = createWebSearchService({ config, logger });
  const humanSimulation = createHumanSimulationEngine({ config, logger, microPreferenceStore, personalTimelineStore, followUpStore, channelAwarenessStore, innerWeatherStore, attentionResidueStore, interactionPresenceStore, boundaryConsentStore, doNotAskStore, userEnergyStore, recurringThemeStore, memoryConfidenceStore, selfReflectionStore, proactivePresenceStore });
  const situationalAwarenessEngine = createSituationalAwarenessEngine({ config, logger, timedNotesStore, conversationFollowupStore, proactiveVarietyMemoryStore, emotionalBeatStore, promiseLedger, recentDecisionStore, innerWeatherStore, situationalAwarenessStore });
  const spotify = createSpotifyService({ config, store: musicStore, logger });
  const musicBrainz = createMusicBrainzService({ config, logger });
  const musicLibrary = createMusicLibraryService({ config, store: musicStore, spotify, musicBrainz, logger });
  const channelModes = createChannelModeService({ config, logger, store: channelModeStore });
  const conversations = createConversationStore({ config, logger });
  const tools = createToolRegistry({
    config,
    logger,
    generatedImages,
    generatedAudio,
    musicLibrary,
    spotify,
    imageStylePresets,
    imageAppearancePresets,
    conversations,
    channelModes,
    memory,
    memoryStore,
    generatedMemories,
  });
  const mainUserPresence = createMainUserPresenceTracker({ config, logger });
  const reactionContext = createReactionContextTracker({ config, logger });
  const emotionalArc = createEmotionalArcEngine({
    config,
    logger,
    stagedMemories: generatedMemories,
  });
  const feedbackLearning = createFeedbackLearningEngine({
    config,
    logger,
    stagedMemories: generatedMemories,
  });
  const relationalState = createRelationalStateEngine({
    config,
    logger,
    stagedMemories: generatedMemories,
    emotionalArc,
    feedbackLearning,
  });
  const aliveEventsStore = createAliveEventsStore({ config, logger });
  const intentionQueue = createIntentionQueueStore({ config, logger });
  const alivePresenceStore = createAlivePresenceStore({ config, logger });
  const innerLife = createInnerLifeEngine({ config, logger });
  const continuity = createContinuityEngine({ config, logger });
  const secondLife = createSecondLifeStore({ config, logger });
  const chatPipeline = createChatPipeline({
    config,
    logger,
    memory,
    memoryStore,
    tools,
    conversations,
    cache,
    mainUserPresence,
    reactionContext,
    imageStylePresets,
    imageAppearancePresets,
    emotionalArc,
    feedbackLearning,
    relationalState,
    innerLife,
    continuity,
    emotionalBeatStore,
    promiseLedger,
    humanSimulation,
    webSearchService,
    recentDecisionStore,
    timedNotesStore,
    situationalAwarenessEngine,
    alivePresenceStore,
    aliveEventsStore,
    intentionQueue,
  });
  const secondLifeReplyGenerator = createSecondLifeReplyGenerator({
    config,
    logger,
    // Tools are intentionally omitted: the Discord tool registry assumes a raw
    // Discord message in its tool context, so the Second Life surface runs with
    // no tools (least privilege) until an SL-safe tool subset exists.
  });
  const companion = createCompanionEventProcessor({ chatPipeline, logger, secondLifeReplyGenerator });
  const secondLifeIdentityResolver = createIdentityResolver({ secondLife, config, logger });
  const secondLifeSocialEngine = createSocialEngine({ secondLife, config, logger });
  const secondLifeCommandRegistry = createCommandRegistry({ secondLife, config, logger });
  const secondLifeOutfitManager = createOutfitManager({ secondLife, config, logger });
  const secondLifeLandmarkManager = createLandmarkManager({ secondLife, config, logger });
  const secondLifeMovementEngine = createMovementEngine({ secondLife, config, logger });
  const secondLifeObjectInteractionEngine = createObjectInteractionEngine({ secondLife, config, logger });
  const secondLifeLifeEngine = createLifeEngine({ secondLife, config, logger });
  const secondLifeAdapter = createSecondLifeAdapter({
    secondLife,
    companion,
    config,
    logger,
    identityResolver: secondLifeIdentityResolver,
    socialEngine: secondLifeSocialEngine,
    commandRegistry: secondLifeCommandRegistry,
    outfitManager: secondLifeOutfitManager,
    landmarkManager: secondLifeLandmarkManager,
    movementEngine: secondLifeMovementEngine,
    objectInteractionEngine: secondLifeObjectInteractionEngine,
  });
  const gameSystem = createGameSystem({ config, logger });
  const norwegianLearning = createNorwegianLearningStore({ config, logger });
  const client = createDiscordClient({ config });
  const heartbeat = createHeartbeatService({
    client,
    config,
    logger,
    mainUserPresence,
    reactionContext,
    cache,
    settingsStore,
    proactiveActionStore,
    channelModes,
    automationStore,
    memory,
    journalStore,
    conversations,
    tools,
    generatedImages,
    generatedAudio,
    musicStore,
    spotify,
    musicLibrary,
    imageStylePresets,
    imageAppearancePresets,
    situationalAwarenessEngine,
  });
  const aliveEngine = createAliveEngine({
    config,
    logger,
    aliveEventsStore,
    intentionQueue,
    interactionPresenceStore,
    executor: () => executeNextIntention({
      intentionQueue,
      alivePresenceStore,
      aliveEventsStore,
      client,
      config,
      logger,
      memory,
      tools,
      conversations,
    }),
  });
  const automationRunner = createAutomationRunner({
    client,
    config,
    logger,
    automationStore,
    memory,
    memoryStore,
    generatedMemories,
    cache,
    summaryQueueStore,
    settingsStore,
    journalStore,
    tools,
    conversations,
    channelModes,
    proactiveActionStore,
    generatedImages,
    generatedAudio,
    imageStylePresets,
    imageAppearancePresets,
  });
  const appContext = {
    client,
    config,
    conversations,
    logger,
    memory,
    memoryStore,
    settingsStore,
    generatedImages,
    generatedAudio,
    musicStore,
    spotify,
    musicLibrary,
    imageStylePresets,
    imageAppearancePresets,
    cache,
    cacheStore,
    summaryQueueStore,
    journalStore,
    generatedMemories,
    automationStore,
    heartbeatActionStore,
    proactiveActionStore,
    heartbeat,
    mainUserPresence,
    reactionContext,
    channelModes,
    emotionalArc,
    feedbackLearning,
    relationalState,
    innerLife,
    continuity,
    emotionalBeatStore,
    promiseLedger,
    humanSimulation,
    microPreferenceStore,
    personalTimelineStore,
    followUpStore,
    channelAwarenessStore,
    innerWeatherStore,
    attentionResidueStore,
    interactionPresenceStore,
    boundaryConsentStore,
    doNotAskStore,
    userEnergyStore,
    recurringThemeStore,
    memoryConfidenceStore,
    selfReflectionStore,
    proactivePresenceStore,
    recentDecisionStore,
    conversationFollowupStore,
    timedNotesStore,
    proactiveVarietyMemoryStore,
    situationalAwarenessStore,
    situationalAwarenessEngine,
    webSearchService,
    aliveEventsStore,
    intentionQueue,
    alivePresenceStore,
    aliveEngine,
    secondLife,
    secondLifeAdapter,
    secondLifeIdentityResolver,
    secondLifeSocialEngine,
    secondLifeCommandRegistry,
    secondLifeOutfitManager,
    secondLifeLandmarkManager,
    secondLifeMovementEngine,
    secondLifeObjectInteractionEngine,
    secondLifeLifeEngine,
    companion,
    gameRegistry: gameSystem.gameRegistry,
    gameSessionStore: gameSystem.gameSessionStore,
    gameSettings: {},
    licenseRuntime: license.createInitialRuntime(),
    norwegianLearning,
    ready: false,
  };
  client.appContext = {
    client,
    config,
    conversations,
    logger,
    settingsStore,
    generatedImages,
    generatedAudio,
    musicStore,
    spotify,
    musicLibrary,
    imageStylePresets,
    imageAppearancePresets,
    cache,
    cacheStore,
    summaryQueueStore,
    journalStore,
    heartbeatActionStore,
    proactiveActionStore,
    conversationFollowupStore,
    timedNotesStore,
    proactiveVarietyMemoryStore,
    situationalAwarenessStore,
    situationalAwarenessEngine,
    aliveEventsStore,
    intentionQueue,
    alivePresenceStore,
    aliveEngine,
    heartbeat,
    mainUserPresence,
    reactionContext,
    channelModes,
    secondLife,
    secondLifeAdapter,
    secondLifeIdentityResolver,
    secondLifeSocialEngine,
    secondLifeCommandRegistry,
    secondLifeOutfitManager,
    secondLifeLandmarkManager,
    secondLifeMovementEngine,
    secondLifeObjectInteractionEngine,
    secondLifeLifeEngine,
    gameRegistry: gameSystem.gameRegistry,
    gameSessionStore: gameSystem.gameSessionStore,
    gameSettings: appContext.gameSettings,
    licenseRuntime: appContext.licenseRuntime,
    norwegianLearning,
    emotionalBeatStore,
    promiseLedger,
    humanSimulation,
    microPreferenceStore,
    personalTimelineStore,
    followUpStore,
    channelAwarenessStore,
    innerWeatherStore,
    attentionResidueStore,
    interactionPresenceStore,
  };

  const gameButtonHandler = gameSystem.createButtonHandler({ appContext });
  client.appContext.gameButtonHandler = gameButtonHandler;

  createHealthServer({
    port: config.port,
    logger,
    appContext,
  });

  await runStartupStep("conversations.init", logger, () => conversations.init());
  await runStartupStep("memoryStore.init", logger, () => memoryStore.init());
  await runStartupStep("emotionalBeatStore.init", logger, () => emotionalBeatStore.init());
  await runStartupStep("promiseLedger.init", logger, () => promiseLedger.init());
  await runStartupStep("generatedMemories.init", logger, () => generatedMemories.init());
  await runStartupStep("generatedImages.init", logger, () => generatedImages.init());
  await runStartupStep("generatedAudio.init", logger, () => generatedAudio.init());
  await runStartupStep("musicStore.init", logger, () => musicStore.init());
  await runStartupStep("imageStylePresets.init", logger, () => imageStylePresets.init());
  await runStartupStep("imageAppearancePresets.init", logger, () => imageAppearancePresets.init());
  await runStartupStep("cacheStore.init", logger, () => cacheStore.init());
  await runStartupStep("cache.pruneStartup", logger, () => pruneStartupCache({ cache, config, logger }));
  await runStartupStep("summaryQueueStore.init", logger, () => summaryQueueStore.init());
  await runStartupStep("journalStore.init", logger, () => journalStore.init());
  await runStartupStep("automationStore.init", logger, () => automationStore.init());
  await runStartupStep("heartbeatActionStore.init", logger, () => heartbeatActionStore.init());
  await runStartupStep("heartbeatActionStore.seedStarters", logger, () => seedStarterHeartbeatActions({
    heartbeatActionStore,
    userScope: config.memory?.userScope || "user",
    logger,
  }));
  await runStartupStep("proactiveActionStore.init", logger, () => proactiveActionStore.init({
    automationStore,
    heartbeatActionStore,
  }));
  await runStartupStep("channelModes.init", logger, () => channelModes.init());
  await runStartupStep("emotionalArc.init", logger, () => emotionalArc.init());
  await runStartupStep("feedbackLearning.init", logger, () => feedbackLearning.init());
  await runStartupStep("relationalState.init", logger, () => relationalState.init());
  await runStartupStep("aliveEventsStore.init", logger, () => aliveEventsStore.init());
  await runStartupStep("intentionQueue.init", logger, () => intentionQueue.init());
  await runStartupStep("alivePresenceStore.init", logger, () => alivePresenceStore.init());
  await runStartupStep("recentDecisionStore.init", logger, () => recentDecisionStore.init());
  await runStartupStep("conversationFollowupStore.init", logger, () => conversationFollowupStore.init());
  await runStartupStep("timedNotesStore.init", logger, () => timedNotesStore.init());
  await runStartupStep("proactiveVarietyMemoryStore.init", logger, () => proactiveVarietyMemoryStore.init());
  await runStartupStep("situationalAwarenessStore.init", logger, async () => {
    if (config.situationalAwareness?.storeSnapshots) {
      await situationalAwarenessStore.init();
    }
  });
  await runStartupStep("situationalAwarenessEngine.init", logger, () => situationalAwarenessEngine.init());
  await runStartupStep("innerLife.init", logger, () => innerLife.init());
  await runStartupStep("continuity.init", logger, () => continuity.init());
  await runStartupStep("humanSimulation.init", logger, () => humanSimulation.init());
  await runStartupStep("secondLife.init", logger, () => secondLife.init());
  await runStartupStep("secondLife.seedCommands", logger, async () => {
    if (!secondLife || secondLife.available !== true) return;
    let companionId = "";
    try {
      companionId = resolveCompanionId(config);
    } catch {
      companionId = "";
    }
    if (!companionId) return;
    await secondLifeCommandRegistry.seedDefaults({ companionId });
  });
  await runStartupStep("secondLife.seedOutfits", logger, async () => {
    if (!secondLife || secondLife.available !== true) return;
    let companionId = "";
    try {
      companionId = resolveCompanionId(config);
    } catch {
      companionId = "";
    }
    if (!companionId) return;
    await secondLifeOutfitManager.seedDefaults({ companionId });
  });
  await runStartupStep("secondLife.seedSchedule", logger, async () => {
    if (!secondLife || secondLife.available !== true) return;
    let companionId = "";
    try {
      companionId = resolveCompanionId(config);
    } catch {
      companionId = "";
    }
    if (!companionId) return;
    await secondLifeLifeEngine.seed({ companionId });
  });
  await runStartupStep("gameSystem.init", logger, () => gameSystem.init());
  await runStartupStep("norwegianLearning.init", logger, () => norwegianLearning.init());
  await runStartupStep("gameSettings.load", logger, async () => {
    const allSettings = await settingsStore.listSettings();
    const loaded = allSettings?.gameSettings || {};
    appContext.gameSettings = loaded;
    client.appContext.gameSettings = loaded;
  });
  await runStartupStep("heartbeat.init", logger, () => heartbeat.init());
  const schedulerRegistry = createSchedulerRegistry({ logger });
  schedulerRegistry.registerBackground("aliveEngine", () => aliveEngine.start());
  await schedulerRegistry.startBackground();
  await runStartupStep("musicLibrary.background.start", logger, () => musicLibrary.startBackgroundProcessing?.({
    userScope: config.memory?.userScope || "user",
  }));
  const licenseRuntime = await runStartupStep("license.validateStartup", logger, () => license.validateStartup());
  appContext.licenseRuntime = licenseRuntime;
  client.appContext.licenseRuntime = licenseRuntime;
  appContext.ready = true;

  registerEventHandlers({
    client,
    config,
    logger,
    commands,
    chatPipeline,
    companion,
    conversations,
    channelModes,
    generatedImages,
    generatedAudio,
    cache,
    reactionContext,
    settingsStore,
    norwegianLearning,
    conversationFollowupStore,
    timedNotesStore,
    proactiveVarietyMemoryStore,
  });

  if (!config.discord.token) {
    logger.error("[bot] DISCORD_TOKEN is missing. Railway health checks will still pass, but the bot cannot log in.");
    process.exitCode = 1;
    return;
  }

  if (!licenseRuntime.canRunBot) {
    logger.warn("[app] Ghostlight runtime is blocked", {
      status: licenseRuntime.status,
      reason: licenseRuntime.blockingReason,
      message: licenseRuntime.message,
    });
    return;
  }

  try {
    await client.login(config.discord.token);
  } catch (error) {
    if (/disallowed intents/i.test(String(error?.message || ""))) {
      logger.error("[bot] Discord rejected the requested gateway intents. Enable the listed Privileged Gateway Intents in the Discord Developer Portal, or turn off the related Ghostlight feature before redeploying.", discordIntentDiagnostics);
    }

    throw error;
  }
  schedulerRegistry.registerPostLogin("automationRunner", () => automationRunner.start());
  schedulerRegistry.registerPostLogin("heartbeat", () => heartbeat.start());
  if (secondLifeLifeEngine.isEnabled()) {
    const lifeTickMs = secondLifeLifeEngine.getTickIntervalMs();
    const runLifeTick = async () => {
      let companionId = "";
      try {
        companionId = resolveCompanionId(config);
      } catch {
        companionId = "";
      }
      if (!companionId) return;
      try {
        await secondLifeLifeEngine.tick({ companionId });
      } catch (error) {
        logger.warn("[life-engine] tick failed.", { error: error.message });
      }
    };
    schedulerRegistry.registerPostLogin("secondLifeLifeEngine", () => {
      const lifeTimer = setInterval(runLifeTick, lifeTickMs);
      if (typeof lifeTimer.unref === "function") lifeTimer.unref();
      logger.info("[life-engine] Companion Life Engine enabled.", { tickIntervalMs: lifeTickMs });
    });
  }
  schedulerRegistry.registerPostLogin("emotionalArc.scheduler", () => emotionalArc.scheduler.start());
  await schedulerRegistry.startPostLogin();
  appContext.schedulerRegistry = schedulerRegistry;
  client.appContext.schedulerRegistry = schedulerRegistry;
  await automationRunner.runNow();
}

startApp().catch((error) => {
  const logger = createLogger(process.env.LOG_LEVEL || "info");
  logger.error("[app] Failed to start Ghostlight", {
    error: formatErrorForLog(error),
  });
  process.exit(1);
});
