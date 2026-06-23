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
  appTitle = "Dante",
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
  const llmChatModel = process.env.CHAT_LLM_MODEL || process.env.LLM_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "openai/gpt-4o";
  const llmSummaryModel = process.env.SUMMARY_LLM_MODEL || process.env.LLM_SUMMARY_MODEL || process.env.OPENAI_SUMMARY_MODEL || "openai/gpt-4o-mini";
  const llmImageModel = process.env.IMAGE_LLM_MODEL || process.env.LLM_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "openai/gpt-4o-mini";
  const llmEmbeddingModel = process.env.EMBEDDING_LLM_MODEL || process.env.LLM_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || "openai/text-embedding-3-small";
  const llmTranscriptionModel = process.env.TRANSCRIPTION_LLM_MODEL || process.env.LLM_TRANSCRIPTION_MODEL || process.env.OPENAI_TRANSCRIPTION_MODEL || "openai/whisper-1";
  const llmHttpReferer = process.env.OPENROUTER_HTTP_REFERER || "";
  const llmAppTitle = process.env.OPENROUTER_APP_TITLE || "Dante";
  const imageGenerationModel = process.env.IMAGE_GENERATION_MODEL || process.env.GETIMG_IMAGE_MODEL || "flux-pro";
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

  const fishAudioEnabledByEnv = readBoolean(process.env.FISH_AUDIO_ENABLED, false);
  const defaultTtsProvider = fishAudioEnabledByEnv ? "fish" : "elevenlabs";
  const ttsProvider = String(process.env.AUDIO_TTS_PROVIDER || defaultTtsProvider).trim().toLowerCase();
  const resolvedTtsProvider = ["elevenlabs", "fish"].includes(ttsProvider) ? ttsProvider : "elevenlabs";

  return {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "info",
    app: {
      version: String(packageInfo.version || process.env.DANTE_VERSION || "").trim() || "unknown",
      imageTag: String(process.env.DANTE_IMAGE_TAG || "").trim(),
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
    fishAudio: {
      apiKey: process.env.FISH_AUDIO_API_KEY || "",
      voiceId: process.env.FISH_AUDIO_VOICE_ID || "",
      modelId: process.env.FISH_AUDIO_MODEL_ID || "",
      baseURL: process.env.FISH_AUDIO_BASE_URL || "https://api.fish.audio",
    },
    database: {
      url: process.env.DATABASE_URL || "",
    },
    audio: {
      ttsEnabled: readBoolean(process.env.AUDIO_TTS_ENABLED, false),
      ttsProvider: resolvedTtsProvider,
      elevenlabsVoiceId: String(process.env.ELEVENLABS_VOICE_ID || "").trim(),
      fishVoiceId: String(process.env.FISH_AUDIO_VOICE_ID || "").trim(),
      fishModelId: String(process.env.FISH_AUDIO_MODEL_ID || "").trim(),
      readAloudModel: String(process.env.AUDIO_READ_ALOUD_MODEL || "eleven_flash_v2_5").trim() || "eleven_flash_v2_5",
      generatedAudioModel: String(process.env.AUDIO_GENERATED_MODEL || "eleven_multilingual_v2").trim() || "eleven_multilingual_v2",
      voiceSettingsEnabled: readBoolean(process.env.AUDIO_VOICE_SETTINGS_ENABLED, false),
      voiceStability: readFloat(process.env.AUDIO_VOICE_STABILITY, 0.7, { min: 0, max: 1 }),
      voiceSimilarityBoost: readFloat(process.env.AUDIO_VOICE_SIMILARITY_BOOST, 0.85, { min: 0, max: 1 }),
      voiceStyle: readFloat(process.env.AUDIO_VOICE_STYLE, 0, { min: 0, max: 1 }),
      voiceSpeed: readFloat(process.env.AUDIO_VOICE_SPEED, 1, { min: 0.7, max: 1.2 }),
      voiceSpeakerBoost: readBoolean(process.env.AUDIO_VOICE_SPEAKER_BOOST, true),
      bucketPrefix: String(process.env.AUDIO_BUCKET_PREFIX || "generated-audio").trim() || "generated-audio",
    },
    bucket: {
      name: String(process.env.BUCKET || process.env.BUCKET_NAME || process.env.TIGRIS_BUCKET_NAME || process.env.AWS_BUCKET || "").trim(),
      accessKeyId: String(process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "").trim(),
      secretAccessKey: String(process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
      endpoint: String(process.env.ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || "").trim(),
      region: String(process.env.REGION || process.env.AWS_REGION || "auto").trim() || "auto",
      forcePathStyle: String(process.env.BUCKET_FORCE_PATH_STYLE || "").trim().toLowerCase() === "true",
    },
    localStorage: {
      dir: String(process.env.MEDIA_STORAGE_DIR || "").trim(),
    },
    admin: {
      secret: process.env.ADMIN_SECRET || "",
      username: process.env.ADMIN_USERNAME || "",
      password: process.env.ADMIN_PASSWORD || "",
    },
  };
}

module.exports = {
  loadConfig,
};