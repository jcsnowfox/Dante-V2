const { normalizeCustomReactionEmojis } = require("../reactions/customEmojiPalette");
const { normalizeAudioGallerySavedSourceSurfaces } = require("../audio/galleryPolicy");
const { isFixedOffsetTimezone, normalizeIanaTimezone } = require("./timezones");

const SPOTIFY_CURATION_GUIDANCE_LIMIT = 600;

const EDITABLE_RUNTIME_SETTINGS = Object.freeze([
  {
    key: "llm.chat.model",
    path: ["llm", "chat", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "llm.summary.model",
    path: ["llm", "summary", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "llm.image.model",
    path: ["llm", "image", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "imageGeneration.model",
    path: ["imageGeneration", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "imageGeneration.resolution",
    path: ["imageGeneration", "resolution"],
    normalize: (value) => {
      const normalized = String(value || "").trim().toUpperCase();
      return ["1K", "2K", "4K"].includes(normalized) ? normalized : "1K";
    },
  },
  {
    key: "imageGeneration.homepageFeedMode",
    path: ["imageGeneration", "homepageFeedMode"],
    normalize: (value) => {
      const normalized = String(value || "").trim().toLowerCase();
      return ["recent", "randomized"].includes(normalized) ? normalized : "randomized";
    },
  },
  {
    key: "spotify.enabled",
    path: ["spotify", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "spotify.createPlaylistCovers",
    path: ["spotify", "createPlaylistCovers"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "spotify.curationGuidance",
    path: ["spotify", "curationGuidance"],
    normalize: (value) => String(value || "").trim().slice(0, SPOTIFY_CURATION_GUIDANCE_LIMIT),
  },
  {
    key: "audio.ttsEnabled",
    path: ["audio", "ttsEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "audio.elevenlabsVoiceId",
    path: ["audio", "elevenlabsVoiceId"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "audio.readAloudModel",
    path: ["audio", "readAloudModel"],
    normalize: (value) => String(value || "").trim() || "eleven_flash_v2_5",
  },
  {
    key: "audio.generatedAudioModel",
    path: ["audio", "generatedAudioModel"],
    normalize: (value) => String(value || "").trim() || "eleven_multilingual_v2",
  },
  {
    key: "audio.gallerySavedSourceSurfaces",
    path: ["audio", "gallerySavedSourceSurfaces"],
    normalize: (value) => normalizeAudioGallerySavedSourceSurfaces(value, { defaultToAll: true }),
  },
  {
    key: "audio.v3DeliveryTags",
    path: ["audio", "v3DeliveryTags"],
    normalize: (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 240),
  },
  {
    key: "audio.voiceSettingsEnabled",
    path: ["audio", "voiceSettingsEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "audio.voiceStability",
    path: ["audio", "voiceStability"],
    normalize: (value) => normalizeFloatSetting(value, 0.7, { min: 0, max: 1 }),
  },
  {
    key: "audio.voiceSimilarityBoost",
    path: ["audio", "voiceSimilarityBoost"],
    normalize: (value) => normalizeFloatSetting(value, 0.85, { min: 0, max: 1 }),
  },
  {
    key: "audio.voiceStyle",
    path: ["audio", "voiceStyle"],
    normalize: (value) => normalizeFloatSetting(value, 0, { min: 0, max: 1 }),
  },
  {
    key: "audio.voiceSpeed",
    path: ["audio", "voiceSpeed"],
    normalize: (value) => normalizeFloatSetting(value, 1, { min: 0.7, max: 1.2 }),
  },
  {
    key: "audio.voiceSpeakerBoost",
    path: ["audio", "voiceSpeakerBoost"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "llm.embedding.model",
    path: ["llm", "embedding", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "llm.transcription.model",
    path: ["llm", "transcription", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "llm.romance.model",
    path: ["llm", "romance", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.historyLimit",
    path: ["chat", "historyLimit"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value || "").trim(), 10);

      if (!Number.isFinite(parsed)) {
        return 20;
      }

      return Math.max(0, Math.min(parsed, 50));
    },
  },
  {
    key: "chat.defaultMode",
    path: ["chat", "defaultMode"],
    normalize: (value) => {
      const normalized = String(value || "").trim().toLowerCase();
      return !normalized ? "default" : normalized;
    },
  },
  {
    key: "chat.timezone",
    path: ["chat", "timezone"],
    normalize: (value) => normalizeIanaTimezone(value),
  },
  {
    key: "chat.userId",
    path: ["chat", "userId"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.includeTimeContext",
    path: ["chat", "includeTimeContext"],
    normalize: (value) => Boolean(value),
  },
  {
    key: "chat.customReactionEmojis",
    path: ["chat", "customReactionEmojis"],
    normalize: (value) => normalizeCustomReactionEmojis(value),
  },
  {
    key: "discord.externalSharedModeEnabled",
    path: ["discord", "externalSharedModeEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "discord.externalSharedModeKey",
    path: ["discord", "externalSharedModeKey"],
    normalize: (value) => String(value || "").trim().toLowerCase() || "shared_server",
  },
  {
    key: "chat.promptBlocks.personaName",
    path: ["chat", "promptBlocks", "personaName"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.promptBlocks.personaAvatarUrl",
    path: ["chat", "promptBlocks", "personaAvatarUrl"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.promptBlocks.userName",
    path: ["chat", "promptBlocks", "userName"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.promptBlocks.personaProfile",
    path: ["chat", "promptBlocks", "personaProfile"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.promptBlocks.toneGuidelines",
    path: ["chat", "promptBlocks", "toneGuidelines"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.promptBlocks.userProfile",
    path: ["chat", "promptBlocks", "userProfile"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.promptBlocks.companionPurpose",
    path: ["chat", "promptBlocks", "companionPurpose"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.promptBlocks.boundaryRules",
    path: ["chat", "promptBlocks", "boundaryRules"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "memory.timelineDailyWindowDays",
    path: ["memory", "timelineDailyWindowDays"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value || "").trim(), 10);

      if (!Number.isFinite(parsed)) {
        return 14;
      }

      return Math.max(0, Math.min(parsed, 365));
    },
  },
  {
    key: "memory.dailySummaryEnabled",
    path: ["memory", "dailySummaryEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "memory.dailySummaryTime",
    path: ["memory", "dailySummaryTime"],
    normalize: (value) => {
      const normalized = String(value || "").trim() || "04:00";

      if (!/^\d{2}:\d{2}$/.test(normalized)) {
        return "04:00";
      }

      const [hours, minutes] = normalized.split(":").map(Number);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return "04:00";
      }

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    },
  },
  {
    key: "memory.dailySummaryChannelIds",
    path: ["memory", "dailySummaryChannelIds"],
    normalize: (value) => {
      if (Array.isArray(value)) {
        return value
          .map((item) => String(item || "").trim())
          .filter(Boolean);
      }

      return String(value || "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    },
  },
  {
    key: "memory.dailySummaryLastRunAt",
    path: ["memory", "dailySummaryLastRunAt"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "memory.weeklySummaryEnabled",
    path: ["memory", "weeklySummaryEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "memory.weeklySummaryTime",
    path: ["memory", "weeklySummaryTime"],
    normalize: (value) => {
      const normalized = String(value || "").trim() || "04:00";

      if (!/^\d{2}:\d{2}$/.test(normalized)) {
        return "04:00";
      }

      const [hours, minutes] = normalized.split(":").map(Number);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return "04:00";
      }

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    },
  },
  {
    key: "memory.weeklySummaryDay",
    path: ["memory", "weeklySummaryDay"],
    normalize: (value) => {
      const normalized = String(value || "").trim().toLowerCase() || "monday";
      const allowed = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      return allowed.includes(normalized) ? normalized : "monday";
    },
  },
  {
    key: "memory.weeklySummaryLastRunAt",
    path: ["memory", "weeklySummaryLastRunAt"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "memoryLookup.enabled",
    path: ["memoryLookup", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "memoryCurator.enabled",
    path: ["memoryCurator", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "memoryCurator.stageTwoModelMode",
    path: ["memoryCurator", "stageTwoModelMode"],
    normalize: (value) => {
      const normalized = String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "_");

      if (["chat", "intelligent", "smart"].includes(normalized)) {
        return "chat";
      }

      return "summary";
    },
  },
  {
    key: "memoryCurator.attentionScanLastRunAt",
    path: ["memoryCurator", "attentionScanLastRunAt"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "memoryCurator.longScanLastRunAt",
    path: ["memoryCurator", "longScanLastRunAt"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "conversationRetrieval.enabled",
    path: ["conversationRetrieval", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "imageGeneration.enabled",
    path: ["imageGeneration", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "imageGeneration.allowedAspectRatios",
    path: ["imageGeneration", "allowedAspectRatios"],
    normalize: (value) => {
      const allowed = ["1:1", "9:16", "16:9"];
      const rawValues = Array.isArray(value)
        ? value
        : String(value || "")
          .split(/[,\n]/)
          .map((item) => item.trim());
      const selected = rawValues.filter((item) => allowed.includes(item));

      return Array.from(new Set([...selected, ...allowed.filter((item) => !selected.includes(item))]));
    },
  },
  {
    key: "heartbeat.enabled",
    path: ["heartbeat", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "heartbeat.activityMode",
    path: ["heartbeat", "activityMode"],
    normalize: (value) => {
      const normalized = String(value || "").trim().toLowerCase() || "normal";

      if (normalized === "low") {
        return "gentle";
      }

      if (normalized === "high") {
        return "feral";
      }

      return ["off", "gentle", "normal", "feral"].includes(normalized) ? normalized : "normal";
    },
  },
  {
    key: "heartbeat.globalCooldownMinutes",
    path: ["heartbeat", "globalCooldownMinutes"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value || "").trim(), 10);

      if (!Number.isFinite(parsed)) {
        return 60;
      }

      return Math.max(0, Math.min(parsed, 24 * 60));
    },
  },
  {
    key: "heartbeat.dailyCap",
    path: ["heartbeat", "dailyCap"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value || "").trim(), 10);

      if (!Number.isFinite(parsed)) {
        return 5;
      }

      return Math.max(0, Math.min(parsed, 100));
    },
  },
  {
    key: "heartbeat.quietHoursEnabled",
    path: ["heartbeat", "quietHoursEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "heartbeat.quietHoursStart",
    path: ["heartbeat", "quietHoursStart"],
    normalize: (value) => {
      const normalized = String(value || "").trim() || "22:00";
      return /^\d{2}:\d{2}$/.test(normalized) ? normalized : "22:00";
    },
  },
  {
    key: "heartbeat.quietHoursEnd",
    path: ["heartbeat", "quietHoursEnd"],
    normalize: (value) => {
      const normalized = String(value || "").trim() || "08:00";
      return /^\d{2}:\d{2}$/.test(normalized) ? normalized : "08:00";
    },
  },
  {
    key: "heartbeat.confidenceThreshold",
    path: ["heartbeat", "confidenceThreshold"],
    normalize: (value) => {
      const parsed = Number.parseFloat(String(value || "").trim());

      if (!Number.isFinite(parsed)) {
        return 0.6;
      }

      return Math.max(0, Math.min(parsed, 1));
    },
  },
  {
    key: "heartbeat.recentDecisionLimit",
    path: ["heartbeat", "recentDecisionLimit"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value || "").trim(), 10);

      if (!Number.isFinite(parsed)) {
        return 10;
      }

      return Math.max(1, Math.min(parsed, 50));
    },
  },
  {
    key: "heartbeat.maxIdleHours",
    path: ["heartbeat", "maxIdleHours"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value || "").trim(), 10);

      if (!Number.isFinite(parsed)) {
        return 0;
      }

      return Math.max(0, Math.min(parsed, 24 * 30));
    },
  },
  {
    key: "heartbeat.recentUserActivityDeferMinutes",
    path: ["heartbeat", "recentUserActivityDeferMinutes"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value || "").trim(), 10);

      if (!Number.isFinite(parsed)) {
        return 5;
      }

      return Math.max(0, Math.min(parsed, 60));
    },
  },
  {
    key: "heartbeat.userPresenceContextEnabled",
    path: ["heartbeat", "userPresenceContextEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "chat.adultPrivateMode.enabled",
    path: ["chat", "adultPrivateMode", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "chat.adultPrivateMode.channelId",
    path: ["chat", "adultPrivateMode", "channelId"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.model",
    path: ["chat", "adultPrivateMode", "model"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.systemPrompt",
    path: ["chat", "adultPrivateMode", "systemPrompt"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.safeword",
    path: ["chat", "adultPrivateMode", "safeword"],
    normalize: (value) => String(value || "red").trim() || "red",
  },
  {
    key: "chat.adultPrivateMode.aftercareEnabled",
    path: ["chat", "adultPrivateMode", "aftercareEnabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "chat.adultPrivateMode.aftercarePrompt",
    path: ["chat", "adultPrivateMode", "aftercarePrompt"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.userPreferences",
    path: ["chat", "adultPrivateMode", "userPreferences"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.userWants",
    path: ["chat", "adultPrivateMode", "userWants"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.userNeeds",
    path: ["chat", "adultPrivateMode", "userNeeds"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.softLimits",
    path: ["chat", "adultPrivateMode", "softLimits"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "chat.adultPrivateMode.hardLimits",
    path: ["chat", "adultPrivateMode", "hardLimits"],
    normalize: (value) => String(value || "").trim(),
  },
  {
    key: "secondLife.lifeEngine.enabled",
    path: ["secondLife", "lifeEngine", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "secondLife.lifeEngine.autonomyLevel",
    path: ["secondLife", "lifeEngine", "autonomyLevel"],
    normalize: (value) => {
      const normalized = String(value || "").trim().toLowerCase() || "medium";
      return ["low", "medium", "high"].includes(normalized) ? normalized : "medium";
    },
  },
  {
    key: "secondLife.lifeEngine.initiative.enabled",
    path: ["secondLife", "lifeEngine", "initiative", "enabled"],
    normalize: (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    },
  },
  {
    key: "secondLife.lifeEngine.initiative.maxPerDay",
    path: ["secondLife", "lifeEngine", "initiative", "maxPerDay"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value ?? "").trim(), 10);
      if (!Number.isFinite(parsed)) return 3;
      return Math.max(0, Math.min(parsed, 50));
    },
  },
  {
    key: "secondLife.lifeEngine.initiative.cooldownMinutes",
    path: ["secondLife", "lifeEngine", "initiative", "cooldownMinutes"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value ?? "").trim(), 10);
      if (!Number.isFinite(parsed)) return 120;
      return Math.max(0, Math.min(parsed, 24 * 60));
    },
  },
  {
    key: "secondLife.lifeEngine.initiative.quietHoursStart",
    path: ["secondLife", "lifeEngine", "initiative", "quietHoursStart"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value ?? "").trim(), 10);
      if (!Number.isFinite(parsed)) return 22;
      return Math.max(0, Math.min(parsed, 23));
    },
  },
  {
    key: "secondLife.lifeEngine.initiative.quietHoursEnd",
    path: ["secondLife", "lifeEngine", "initiative", "quietHoursEnd"],
    normalize: (value) => {
      const parsed = Number.parseInt(String(value ?? "").trim(), 10);
      if (!Number.isFinite(parsed)) return 7;
      return Math.max(0, Math.min(parsed, 23));
    },
  },
]);

function normalizeFloatSetting(value, defaultValue, { min = 0, max = 1 } = {}) {
  const parsed = Number.parseFloat(String(value || "").trim());

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(parsed, max));
}

function setNestedValue(target, path, value) {
  let current = target;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];

    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }

    current = current[key];
  }

  current[path[path.length - 1]] = value;
}

function getNestedValue(target, path) {
  let current = target;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return "";
    }

    current = current[key];
  }

  return current ?? "";
}

function normalizeRuntimeSettings(input = {}, { legacyTimezoneFallback = "" } = {}) {
  const normalized = {};

  for (const setting of EDITABLE_RUNTIME_SETTINGS) {
    if (!Object.prototype.hasOwnProperty.call(input, setting.key)) {
      continue;
    }

    if (setting.key === "chat.timezone" && legacyTimezoneFallback && isFixedOffsetTimezone(input[setting.key])) {
      normalized[setting.key] = normalizeIanaTimezone(legacyTimezoneFallback);
      continue;
    }

    normalized[setting.key] = setting.normalize(input[setting.key]);
  }

  return normalized;
}

function applyRuntimeSettings(config, settings = {}) {
  const normalized = normalizeRuntimeSettings(settings, {
    legacyTimezoneFallback: config.chat?.timezone || "UTC",
  });

  for (const setting of EDITABLE_RUNTIME_SETTINGS) {
    if (!Object.prototype.hasOwnProperty.call(normalized, setting.key)) {
      continue;
    }

    setNestedValue(config, setting.path, normalized[setting.key]);
  }

  config.llm = config.llm || {};
  config.openrouter = config.openrouter || {};
  config.openai = config.openai || {};

  config.llm.provider = "openrouter";

  for (const capability of ["chat", "summary", "image", "embedding", "transcription", "romance"]) {
    config.llm[capability] = config.llm[capability] || {};
    config.llm[capability].provider = "openrouter";
    config.llm[capability].apiKey = config.openrouter.apiKey || config.llm.apiKey || "";
    config.llm[capability].baseURL = config.openrouter.baseURL || config.llm.baseURL || "https://openrouter.ai/api/v1";
    config.llm[capability].httpReferer = config.llm.httpReferer || "";
    config.llm[capability].appTitle = config.llm.appTitle || "Ghostlight";
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "llm.chat.model")) {
    config.chat.placeholderModel = normalized["llm.chat.model"] || config.chat.placeholderModel;
    config.openai.chatModel = normalized["llm.chat.model"] || config.openai.chatModel;
    config.llm.chatModel = normalized["llm.chat.model"] || config.llm.chatModel;

    if (config.llm && typeof config.llm === "object") {
      config.llm.chat.model = normalized["llm.chat.model"] || config.llm.chat.model;
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "llm.summary.model")) {
    config.openai.summaryModel = normalized["llm.summary.model"] || config.openai.summaryModel;
    config.llm.summaryModel = normalized["llm.summary.model"] || config.llm.summaryModel;

    if (config.llm && typeof config.llm === "object") {
      config.llm.summary.model = normalized["llm.summary.model"] || config.llm.summary.model;
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "llm.image.model")) {
    config.openai.imageModel = normalized["llm.image.model"] || config.openai.imageModel;
    config.llm.imageModel = normalized["llm.image.model"] || config.llm.imageModel;

    if (config.llm && typeof config.llm === "object") {
      config.llm.image.model = normalized["llm.image.model"] || config.llm.image.model;
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "imageGeneration.model")) {
    config.imageGeneration = config.imageGeneration || {};
    config.imageGeneration.model = normalized["imageGeneration.model"] || config.imageGeneration.model;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "llm.embedding.model")) {
    config.openai.embeddingModel = normalized["llm.embedding.model"] || config.openai.embeddingModel;
    config.llm.embeddingModel = normalized["llm.embedding.model"] || config.llm.embeddingModel;

    if (config.llm && typeof config.llm === "object") {
      config.llm.embedding.model = normalized["llm.embedding.model"] || config.llm.embedding.model;
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "llm.transcription.model")) {
    config.openai.transcriptionModel = normalized["llm.transcription.model"] || config.openai.transcriptionModel;
    config.llm.transcriptionModel = normalized["llm.transcription.model"] || config.llm.transcriptionModel;

    if (config.llm && typeof config.llm === "object") {
      config.llm.transcription.model = normalized["llm.transcription.model"] || config.llm.transcription.model;
    }
  }

  return config;
}

function extractRuntimeSettings(config) {
  const result = {};

  for (const setting of EDITABLE_RUNTIME_SETTINGS) {
    result[setting.key] = getNestedValue(config, setting.path);
  }

  return result;
}

module.exports = {
  EDITABLE_RUNTIME_SETTINGS,
  SPOTIFY_CURATION_GUIDANCE_LIMIT,
  normalizeRuntimeSettings,
  applyRuntimeSettings,
  extractRuntimeSettings,
};
