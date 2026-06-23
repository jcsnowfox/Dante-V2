require("dotenv").config({ quiet: true });

const packageInfo = require("../../package.json");
const { normalizeAudioGallerySavedSourceSurfaces } = require("../audio/galleryPolicy");
const { normalizeIanaTimezone } = require("./timezones");

function readBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function readProvider(value, defaultValue = "openrouter") {
  const normalized = String(value || defaultValue).trim().toLowerCase();

  if (normalized === "openrouter") {
    return normalized;
  }

  return defaultValue;
}

function readHistoryLimit(value, defaultValue = 20) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(0, Math.min(parsed, 50));
}

function readMemoryWindowDays(value, defaultValue = 14) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(0, Math.min(parsed, 365));
}

function readCuratorStageTwoModelMode(value, defaultValue = "summary") {
  const normalized = String(value || defaultValue).trim().toLowerCase().replace(/[_\s-]+/g, "_");

  if (["chat", "intelligent", "smart"].includes(normalized)) {
    return "chat";
  }

  return "summary";
}

function readPositiveInt(value, defaultValue, { min = 0, max = 10000 } = {}) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(parsed, max));
}

function readFloat(value, defaultValue, { min = 0, max = 1 } = {}) {
  const parsed = Number.parseFloat(String(value || "").trim());

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(parsed, max));
}

function buildCapabilityConfig({
  capability,
  fallbackModel,
  httpReferer = "",
  appTitle = "Ghostlight",
}) {
  const upperCapability = String(capability || "").trim().toUpperCase();
  const model = process.env[`${upperCapability}_LLM_MODEL`] || fallbackModel;

  return {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    httpReferer,
    appTitle,
    model,
  };
}

function logDbEnvDiagnostic() {
  const rawUrl = process.env.DATABASE_URL || "";
  if (!rawUrl) {
    console.warn("[db:env] DATABASE_URL is not set — database persistence is disabled");
    return;
  }

  try {
    const url = new URL(rawUrl);
    const sslMode = process.env.PGSSLMODE || url.searchParams.get("sslmode") || "default";
    const passwordLength = url.password ? url.password.length : 0;
    console.info(
      `[db:env] database url detected host=${url.hostname} port=${url.port || "5432"} user=${url.username} database=${url.pathname.replace(/^\//, "")} passwordLength=${passwordLength} sslMode=${sslMode}`,
    );
  } catch {
    console.warn("[db:env] DATABASE_URL is set but could not be parsed as a URL");
  }

  // Log presence of related DB env vars (values never logged — only presence)
  const dbEnvVars = [
    "DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE",
    "PGSSLMODE", "PGSSLCERT", "PGSSLKEY", "PGSSLROOTCERT",
    "DATABASE_PRIVATE_URL", "DATABASE_PUBLIC_URL",
  ];
  const present = dbEnvVars.filter((v) => Boolean(process.env[v]));
  const absent = dbEnvVars.filter((v) => !process.env[v]);
  console.info("[db:env] env vars present:", present.join(", ") || "(none)");
  if (absent.length) {
    console.info("[db:env] env vars absent:", absent.join(", "));
  }
}

function loadConfig() {
  logDbEnvDiagnostic();
  const llmProvider = readProvider(process.env.LLM_PROVIDER, "openrouter");
  const llmChatModel = process.env.CHAT_LLM_MODEL || process.env.LLM_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "openai/gpt-5.4";
  const llmSummaryModel = process.env.SUMMARY_LLM_MODEL || process.env.LLM_SUMMARY_MODEL || process.env.OPENAI_SUMMARY_MODEL || "openai/gpt-5.4-mini";
  const llmImageModel = process.env.IMAGE_LLM_MODEL || process.env.LLM_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "openai/gpt-5.4-mini";
  const llmEmbeddingModel = process.env.EMBEDDING_LLM_MODEL || process.env.LLM_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || "openai/text-embedding-3-small";
  const llmTranscriptionModel = process.env.TRANSCRIPTION_LLM_MODEL || process.env.LLM_TRANSCRIPTION_MODEL || process.env.OPENAI_TRANSCRIPTION_MODEL || "google/gemini-2.5-flash";
  const llmHttpReferer = process.env.OPENROUTER_HTTP_REFERER || "";
  const llmAppTitle = process.env.OPENROUTER_APP_TITLE || "Ghostlight";
  const imageGenerationModel = process.env.IMAGE_GENERATION_MODEL || process.env.GETIMG_IMAGE_MODEL || "gemini-3-1-flash-image";
  const imageGenerationResolution = process.env.IMAGE_GENERATION_RESOLUTION || "1K";

  const llmChat = buildCapabilityConfig({
    capability: "chat",
    fallbackModel: llmChatModel,
    httpReferer: llmHttpReferer,
    appTitle: llmAppTitle,
  });
  const llmSummary = buildCapabilityConfig({
    capability: "summary",
    fallbackModel: llmSummaryModel,
    httpReferer: llmHttpReferer,
    appTitle: llmAppTitle,
  });
  const llmImage = buildCapabilityConfig({
    capability: "image",
    fallbackModel: llmImageModel,
    httpReferer: llmHttpReferer,
    appTitle: llmAppTitle,
  });
  const llmEmbedding = buildCapabilityConfig({
    capability: "embedding",
    fallbackModel: llmEmbeddingModel,
    httpReferer: llmHttpReferer,
    appTitle: llmAppTitle,
  });
  const llmTranscription = buildCapabilityConfig({
    capability: "transcription",
    fallbackModel: llmTranscriptionModel,
    httpReferer: llmHttpReferer,
    appTitle: llmAppTitle,
  });

  return {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "info",
    app: {
      version: String(packageInfo.version || process.env.GHOSTLIGHT_VERSION || "").trim() || "unknown",
      imageTag: String(process.env.GHOSTLIGHT_IMAGE_TAG || "").trim(),
    },
    discord: {
      token: process.env.DISCORD_TOKEN || "",
      clientId: process.env.DISCORD_CLIENT_ID || "",
      guildId: process.env.DISCORD_GUILD_ID || "",
      allowedChannelId: process.env.DISCORD_ALLOWED_CHANNEL_ID || "",
      respondToMentionsOnly: readBoolean(process.env.DISCORD_RESPOND_TO_MENTIONS_ONLY, false),
      externalSharedModeEnabled: readBoolean(process.env.DISCORD_EXTERNAL_SHARED_MODE_ENABLED, false),
      externalSharedModeKey: String(process.env.DISCORD_EXTERNAL_SHARED_MODE_KEY || "shared_server").trim() || "shared_server",
    },
    chat: {
      historyLimit: readHistoryLimit(process.env.CHAT_HISTORY_LIMIT, 20),
      defaultMode: process.env.DEFAULT_CHAT_MODE || "default",
      includeTimeContext: readBoolean(process.env.CHAT_INCLUDE_TIME_CONTEXT, true),
      timezone: normalizeIanaTimezone(process.env.CHAT_TIMEZONE || "UTC"),
      internalThoughtEnabled: readBoolean(process.env.CHAT_INTERNAL_THOUGHT_ENABLED, false),
      placeholderModel: llmChatModel,
      promptBlocks: {
        personaName: process.env.CHAT_PROMPT_PERSONA_NAME || "Ghostlight",
        userName: process.env.CHAT_PROMPT_USER_NAME || process.env.MEMORY_USER_SCOPE || "the user",
        personaProfile: process.env.CHAT_PROMPT_PERSONA_PROFILE || "",
        toneGuidelines: process.env.CHAT_PROMPT_TONE_GUIDELINES || "",
        userProfile: process.env.CHAT_PROMPT_USER_PROFILE || "",
        companionPurpose: process.env.CHAT_PROMPT_COMPANION_PURPOSE || "",
        boundaryRules: process.env.CHAT_PROMPT_BOUNDARY_RULES || "",
      },
      customReactionEmojis: [],
    },
    llm: {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY || "",
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      httpReferer: llmHttpReferer,
      appTitle: llmAppTitle,
      chatModel: llmChatModel,
      summaryModel: llmSummaryModel,
      imageModel: llmImageModel,
      embeddingModel: llmEmbedding.model,
      transcriptionModel: llmTranscription.model,
      chat: llmChat,
      summary: llmSummary,
      image: llmImage,
      embedding: llmEmbedding,
      transcription: llmTranscription,
    },
    openai: {
      apiKey: "",
      chatModel: llmChatModel,
      embeddingModel: llmEmbeddingModel,
      imageModel: llmImageModel,
      transcriptionModel: llmTranscriptionModel,
      summaryModel: llmSummaryModel,
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || "",
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    },
    getimg: {
      apiKey: process.env.GETIMG_API_KEY || "",
      baseURL: process.env.GETIMG_BASE_URL || "https://api.getimg.ai",
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || "",
      baseURL: process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io",
    },
    spotify: {
      enabled: readBoolean(process.env.SPOTIFY_ENABLED, true),
      clientId: process.env.SPOTIFY_CLIENT_ID || "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
      redirectUri: process.env.SPOTIFY_REDIRECT_URI || "",
      accountsBaseURL: process.env.SPOTIFY_ACCOUNTS_BASE_URL || "https://accounts.spotify.com",
      apiBaseURL: process.env.SPOTIFY_API_BASE_URL || "https://api.spotify.com/v1",
      createPlaylistCovers: readBoolean(process.env.SPOTIFY_CREATE_PLAYLIST_COVERS, false),
      curationGuidance: "",
    },
    musicBrainz: {
      enabled: readBoolean(process.env.MUSICBRAINZ_ENABLED, true),
      baseURL: process.env.MUSICBRAINZ_BASE_URL || "https://musicbrainz.org/ws/2",
      userAgent: process.env.MUSICBRAINZ_USER_AGENT || `Ghostlight/${String(packageInfo.version || "unknown").trim() || "unknown"} (music metadata enrichment)`,
    },
    database: {
      url: process.env.DATABASE_URL || "",
    },
    qdrant: {
      url: process.env.QDRANT_URL || "",
      apiKey: process.env.QDRANT_API_KEY || "",
      collection: process.env.QDRANT_COLLECTION || "ghostlight-memory",
      musicCollection: process.env.QDRANT_MUSIC_COLLECTION || "ghostlight-music",
    },
    memory: {
      userScope: process.env.MEMORY_USER_SCOPE || "user",
      timelineDailyWindowDays: readMemoryWindowDays(process.env.MEMORY_TIMELINE_DAILY_WINDOW_DAYS, 14),
      reviewRejectedRetentionDays: readPositiveInt(process.env.MEMORY_REVIEW_REJECTED_RETENTION_DAYS, 30, { min: 1, max: 365 }),
    },
    memoryLookup: {
      enabled: readBoolean(process.env.MEMORY_LOOKUP_ENABLED, false),
    },
    memoryCurator: {
      enabled: readBoolean(process.env.MEMORY_CURATOR_ENABLED, false),
      stageTwoModelMode: readCuratorStageTwoModelMode(process.env.MEMORY_CURATOR_STAGE_TWO_MODEL_MODE),
      attentionScanLastRunAt: String(process.env.MEMORY_CURATOR_ATTENTION_SCAN_LAST_RUN_AT || "").trim(),
      longScanLastRunAt: String(process.env.MEMORY_CURATOR_LONG_SCAN_LAST_RUN_AT || "").trim(),
    },
    conversationRetrieval: {
      enabled: readBoolean(process.env.CONVERSATION_RETRIEVAL_ENABLED, false),
    },
    imageGeneration: {
      enabled: readBoolean(process.env.IMAGE_GENERATION_ENABLED, false),
      model: String(imageGenerationModel || "").trim(),
      resolution: ["1K", "2K", "4K"].includes(String(imageGenerationResolution || "").trim().toUpperCase())
        ? String(imageGenerationResolution || "").trim().toUpperCase()
        : "1K",
      allowedAspectRatios: ["1:1", "9:16", "16:9"],
      bucketPrefix: String(process.env.IMAGE_GENERATION_BUCKET_PREFIX || "generated-images").trim() || "generated-images",
    },
    audio: {
      ttsEnabled: readBoolean(process.env.AUDIO_TTS_ENABLED, false),
      elevenlabsVoiceId: String(process.env.ELEVENLABS_VOICE_ID || "").trim(),
      readAloudModel: String(process.env.AUDIO_READ_ALOUD_MODEL || "eleven_flash_v2_5").trim() || "eleven_flash_v2_5",
      generatedAudioModel: String(process.env.AUDIO_GENERATED_MODEL || "eleven_multilingual_v2").trim() || "eleven_multilingual_v2",
      gallerySavedSourceSurfaces: normalizeAudioGallerySavedSourceSurfaces(process.env.AUDIO_GALLERY_SAVED_SOURCE_SURFACES, { defaultToAll: true }),
      v3DeliveryTags: String(process.env.AUDIO_V3_DELIVERY_TAGS || "").trim().replace(/\s+/g, " ").slice(0, 240),
      voiceSettingsEnabled: readBoolean(process.env.AUDIO_VOICE_SETTINGS_ENABLED, false),
      voiceStability: readFloat(process.env.AUDIO_VOICE_STABILITY, 0.7, { min: 0, max: 1 }),
      voiceSimilarityBoost: readFloat(process.env.AUDIO_VOICE_SIMILARITY_BOOST, 0.85, { min: 0, max: 1 }),
      voiceStyle: readFloat(process.env.AUDIO_VOICE_STYLE, 0, { min: 0, max: 1 }),
      voiceSpeed: readFloat(process.env.AUDIO_VOICE_SPEED, 1, { min: 0.7, max: 1.2 }),
      voiceSpeakerBoost: readBoolean(process.env.AUDIO_VOICE_SPEAKER_BOOST, true),
      bucketPrefix: String(process.env.AUDIO_BUCKET_PREFIX || "generated-audio").trim() || "generated-audio",
    },
    heartbeat: {
      // HEARTBEAT_* are the current names; METRONOME_* aliases kept for backwards compat
      // with existing deployments that have the old secret names set.
      enabled: readBoolean(process.env.HEARTBEAT_ENABLED ?? process.env.METRONOME_ENABLED, true),
      activityMode: String(process.env.HEARTBEAT_ACTIVITY_MODE ?? process.env.METRONOME_ACTIVITY_MODE ?? "normal").trim().toLowerCase() || "normal",
      globalCooldownMinutes: readPositiveInt(process.env.HEARTBEAT_GLOBAL_COOLDOWN_MINUTES ?? process.env.METRONOME_GLOBAL_COOLDOWN_MINUTES, 60, { min: 0, max: 24 * 60 }),
      dailyCap: readPositiveInt(process.env.HEARTBEAT_DAILY_CAP ?? process.env.METRONOME_DAILY_CAP, 5, { min: 0, max: 100 }),
      quietHoursEnabled: readBoolean(process.env.HEARTBEAT_QUIET_HOURS_ENABLED ?? process.env.METRONOME_QUIET_HOURS_ENABLED, true),
      quietHoursStart: String(process.env.HEARTBEAT_QUIET_HOURS_START ?? process.env.METRONOME_QUIET_HOURS_START ?? "22:00").trim() || "22:00",
      quietHoursEnd: String(process.env.HEARTBEAT_QUIET_HOURS_END ?? process.env.METRONOME_QUIET_HOURS_END ?? "08:00").trim() || "08:00",
      confidenceThreshold: Math.max(0, Math.min(Number.parseFloat(String(process.env.HEARTBEAT_CONFIDENCE_THRESHOLD ?? process.env.METRONOME_CONFIDENCE_THRESHOLD ?? "0.6").trim()) || 0.6, 1)),
      recentDecisionLimit: readPositiveInt(process.env.HEARTBEAT_RECENT_DECISION_LIMIT ?? process.env.METRONOME_RECENT_DECISION_LIMIT, 10, { min: 1, max: 50 }),
      maxIdleHours: readPositiveInt(process.env.HEARTBEAT_MAX_IDLE_HOURS ?? process.env.METRONOME_MAX_IDLE_HOURS, 0, { min: 0, max: 24 * 30 }),
      recentUserActivityDeferMinutes: readPositiveInt(process.env.HEARTBEAT_RECENT_USER_ACTIVITY_DEFER_MINUTES ?? process.env.METRONOME_RECENT_USER_ACTIVITY_DEFER_MINUTES, 5, { min: 0, max: 60 }),
      userPresenceContextEnabled: readBoolean(process.env.HEARTBEAT_USER_PRESENCE_CONTEXT_ENABLED ?? process.env.METRONOME_USER_PRESENCE_CONTEXT_ENABLED, false),
    },
    secondLife: {
      // Stage 5 — Companion Life Engine. Disabled by default so existing
      // Discord-only deployments are completely unaffected; the owner opts in
      // from the dashboard (or via SECOND_LIFE_LIFE_ENGINE_ENABLED).
      lifeEngine: {
        enabled: readBoolean(process.env.SECOND_LIFE_LIFE_ENGINE_ENABLED, false),
        autonomyLevel: String(process.env.SECOND_LIFE_LIFE_ENGINE_AUTONOMY ?? "medium").trim().toLowerCase() || "medium",
        tickIntervalMs: readPositiveInt(process.env.SECOND_LIFE_LIFE_ENGINE_TICK_MS, 5 * 60 * 1000, { min: 30 * 1000, max: 60 * 60 * 1000 }),
        // Stage 6 / Phase 18 — initiative engine. Disabled by default: the
        // companion never starts anything on its own unless the owner opts in.
        initiative: {
          enabled: readBoolean(process.env.SECOND_LIFE_INITIATIVE_ENABLED, false),
          maxPerDay: readPositiveInt(process.env.SECOND_LIFE_INITIATIVE_MAX_PER_DAY, 3, { min: 0, max: 50 }),
          cooldownMinutes: readPositiveInt(process.env.SECOND_LIFE_INITIATIVE_COOLDOWN_MIN, 120, { min: 0, max: 24 * 60 }),
          quietHoursStart: readPositiveInt(process.env.SECOND_LIFE_INITIATIVE_QUIET_START, 22, { min: 0, max: 23 }),
          quietHoursEnd: readPositiveInt(process.env.SECOND_LIFE_INITIATIVE_QUIET_END, 7, { min: 0, max: 23 }),
        },
      },
    },
    admin: {
      secret: process.env.ADMIN_SECRET || "",
      username: process.env.ADMIN_USERNAME || "",
      password: process.env.ADMIN_PASSWORD || "",
    },
    giphy: {
      apiKey: process.env.GIPHY_API_KEY || "",
    },
    bucket: {
      name: String(process.env.BUCKET || process.env.BUCKET_NAME || process.env.TIGRIS_BUCKET_NAME || process.env.AWS_BUCKET || "").trim(),
      accessKeyId: String(process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "").trim(),
      secretAccessKey: String(process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
      endpoint: String(process.env.ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || "").trim(),
      region: String(process.env.REGION || process.env.AWS_REGION || "auto").trim() || "auto",
      // Most providers (Tigris/storageapi.dev, AWS, R2) use virtual-hosted-style
      // URLs. Set BUCKET_FORCE_PATH_STYLE=true only for path-style-only providers.
      forcePathStyle: String(process.env.BUCKET_FORCE_PATH_STYLE || "").trim().toLowerCase() === "true",
    },
    // Local filesystem media storage. Used when no S3 bucket is configured
    // (e.g. a Railway volume mounted at /data). Set MEDIA_STORAGE_DIR=/data.
    localStorage: {
      dir: String(process.env.MEDIA_STORAGE_DIR || "").trim(),
    },
    developer: {
      // Comma-separated extra Discord user IDs that get developer mode in test channels.
      // JC (608669463427940362) is hardcoded and does not need to appear here.
      extraUserIds: String(process.env.DEVELOPER_USER_IDS || "").trim(),
      // Optional Railway API token for fetching deployment logs on demand.
      // Set this + RAILWAY_SERVICE_ID to enable the Railway logs feature.
      // RAILWAY_ENVIRONMENT_ID is auto-injected by Railway when running on their platform.
      railwayToken: String(process.env.RAILWAY_TOKEN || "").trim(),
      railwayServiceId: String(process.env.RAILWAY_SERVICE_ID || "").trim(),
      railwayEnvironmentId: String(process.env.RAILWAY_ENVIRONMENT_ID || "").trim(),
    },
  };
}

module.exports = {
  loadConfig,
};
