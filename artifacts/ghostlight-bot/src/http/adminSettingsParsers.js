const { normalizeRuntimeSettings } = require("../config/runtimeSettings");
const { normalizeCustomReactionEmojis } = require("../reactions/customEmojiPalette");

function addMinutesToTime(timeValue, minutesToAdd) {
  const match = String(timeValue || "").trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return "";
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return "";
  }

  const totalMinutes = ((hours * 60) + minutes + minutesToAdd) % (24 * 60);
  const normalizedMinutes = totalMinutes < 0 ? totalMinutes + (24 * 60) : totalMinutes;
  const nextHours = String(Math.floor(normalizedMinutes / 60)).padStart(2, "0");
  const nextMinutes = String(normalizedMinutes % 60).padStart(2, "0");

  return `${nextHours}:${nextMinutes}`;
}

function includeField(raw, fields, key, fieldName, transform = (value) => value) {
  if (Object.prototype.hasOwnProperty.call(fields, fieldName)) {
    raw[key] = transform(fields[fieldName]);
  }
}

function readBooleanField(value) {
  if (Array.isArray(value)) {
    return value.some((entry) => readBooleanField(entry));
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function readListField(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

function parseGeneralSettingsFields(fields) {
  const raw = {};

  includeField(raw, fields, "llm.chat.model", "chatModel");
  includeField(raw, fields, "llm.summary.model", "summaryModel");
  includeField(raw, fields, "llm.image.model", "imageModel");
  includeField(raw, fields, "imageGeneration.model", "imageGenerationModel");
  includeField(raw, fields, "imageGeneration.resolution", "imageGenerationResolution");
  includeField(raw, fields, "imageGeneration.homepageFeedMode", "imageGenerationHomepageFeedMode");
  includeField(raw, fields, "llm.embedding.model", "embeddingModel");
  includeField(raw, fields, "llm.transcription.model", "transcriptionModel");
  includeField(raw, fields, "llm.romance.model", "romanceModel");
  includeField(raw, fields, "chat.historyLimit", "historyLimit");
  includeField(raw, fields, "chat.defaultMode", "defaultMode");
  includeField(raw, fields, "chat.timezone", "chatTimezone");
  includeField(raw, fields, "temporal.preferredTimeFormat", "temporalPreferredTimeFormat");
  includeField(raw, fields, "temporal.quietHoursStart", "temporalQuietHoursStart");
  includeField(raw, fields, "temporal.quietHoursEnd", "temporalQuietHoursEnd");
  includeField(raw, fields, "temporal.activeHoursStart", "temporalActiveHoursStart");
  includeField(raw, fields, "temporal.activeHoursEnd", "temporalActiveHoursEnd");
  includeField(raw, fields, "temporal.seasonalAwarenessEnabled", "temporalSeasonalAwarenessEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "temporal.dayCycleAwarenessEnabled", "temporalDayCycleAwarenessEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "temporal.clockPresetId", "temporalClockPresetId");
  includeField(raw, fields, "chat.userId", "chatUserId");
  includeField(raw, fields, "heartbeat.userPresenceContextEnabled", "mainUserPresenceContextEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "memoryLookup.enabled", "memoryLookupEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "memoryCurator.enabled", "memoryCuratorEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "memoryCurator.stageTwoModelMode", "memoryCuratorStageTwoModelMode", (value) => (
    Array.isArray(value) ? value[value.length - 1] : value
  ));
  includeField(raw, fields, "conversationRetrieval.enabled", "conversationRetrievalEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "discord.externalSharedModeEnabled", "externalSharedModeEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "discord.externalSharedModeKey", "externalSharedModeKey");
  includeField(raw, fields, "chat.promptBlocks.personaName", "personaName");
  includeField(raw, fields, "chat.promptBlocks.userName", "userName");
  includeField(raw, fields, "chat.promptBlocks.personaProfile", "personaProfile");
  includeField(raw, fields, "chat.promptBlocks.toneGuidelines", "toneGuidelines");
  includeField(raw, fields, "chat.promptBlocks.userProfile", "userProfile");
  includeField(raw, fields, "chat.promptBlocks.companionPurpose", "companionPurpose");
  includeField(raw, fields, "chat.promptBlocks.boundaryRules", "boundaryRules");
  includeField(raw, fields, "chat.promptBlocks.personaAvatarUrl", "personaAvatarUrl");

  return raw;
}

function parseCustomReactionEmojiSettingsFields(fields) {
  const raw = {};

  if (!Object.prototype.hasOwnProperty.call(fields, "customReactionEmojiId")) {
    return raw;
  }

  const selectedIds = readListField(fields.customReactionEmojiId)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const selected = selectedIds.map((id) => ({
    id,
    name: fields[`customReactionEmojiName_${id}`],
    animated: readBooleanField(fields[`customReactionEmojiAnimated_${id}`]),
    mood: fields[`customReactionEmojiMood_${id}`],
  }));

  raw["chat.customReactionEmojis"] = normalizeCustomReactionEmojis(selected);
  return raw;
}

function parseMemorySettingsFields(fields) {
  const raw = {};

  includeField(raw, fields, "memory.timelineDailyWindowDays", "timelineDailyWindowDays");

  if (Object.prototype.hasOwnProperty.call(fields, "longTermMemoryEnabled")) {
    const enabled = readBooleanField(fields.longTermMemoryEnabled);
    raw["memory.dailySummaryEnabled"] = enabled;
    raw["memory.weeklySummaryEnabled"] = enabled;
  } else {
    includeField(raw, fields, "memory.dailySummaryEnabled", "dailySummaryEnabled", () => readBooleanField(fields.dailySummaryEnabled));
    includeField(raw, fields, "memory.weeklySummaryEnabled", "weeklySummaryEnabled", () => readBooleanField(fields.weeklySummaryEnabled));
  }

  includeField(raw, fields, "memory.dailySummaryTime", "dailySummaryTime");
  includeField(raw, fields, "memory.dailySummaryChannelIds", "dailySummaryChannelIds");
  includeField(raw, fields, "memory.weeklySummaryDay", "weeklySummaryDay");

  if (Object.prototype.hasOwnProperty.call(fields, "dailySummaryTime")) {
    raw["memory.weeklySummaryTime"] = addMinutesToTime(fields.dailySummaryTime, 5) || fields.dailySummaryTime;
  } else {
    includeField(raw, fields, "memory.weeklySummaryTime", "weeklySummaryTime");
  }

  return raw;
}

function parseImageGenerationSettingsFields(fields) {
  const raw = {};
  const touchesImageGenerationSettings = [
    "imageGenerationEnabled",
    "imageGenerationModel",
    "imageGenerationResolution",
    "imageGenerationHomepageFeedMode",
    "imageGenerationAllowedAspectRatios",
  ].some((fieldName) => Object.prototype.hasOwnProperty.call(fields, fieldName));

  includeField(raw, fields, "imageGeneration.enabled", "imageGenerationEnabled", (value) => {
    return readBooleanField(value);
  });
  includeField(raw, fields, "imageGeneration.allowedAspectRatios", "imageGenerationAllowedAspectRatios", (value) => {
    if (Array.isArray(value)) {
      return value;
    }

    return [value].filter(Boolean);
  });

  if (touchesImageGenerationSettings) {
    raw["imageGeneration.allowedAspectRatios"] = ["1:1", "9:16", "16:9"];
  }

  return raw;
}

function parseSpotifySettingsFields(fields) {
  const raw = {};

  includeField(raw, fields, "spotify.enabled", "spotifyEnabled", (value) => {
    return readBooleanField(value);
  });
  includeField(raw, fields, "spotify.createPlaylistCovers", "spotifyCreatePlaylistCovers", (value) => {
    return readBooleanField(value);
  });
  includeField(raw, fields, "spotify.curationGuidance", "spotifyCurationGuidance");

  return raw;
}

function parseAudioSettingsFields(fields) {
  const raw = {};

  if (Object.prototype.hasOwnProperty.call(fields, "audioTtsProvider")) {
    const providerValue = String(fields.audioTtsProvider || "none").trim().toLowerCase();
    const selectedProvider = providerValue === "fish_audio"
      ? "fish_audio"
      : providerValue === "elevenlabs"
        ? "elevenlabs"
        : "none";
    raw["audio.ttsEnabled"] = selectedProvider !== "none";
    raw["audio.ttsProvider"] = selectedProvider;
  } else {
    includeField(raw, fields, "audio.ttsEnabled", "audioTtsEnabled", (value) => {
      return readBooleanField(value);
    });
  }
  includeField(raw, fields, "audio.elevenlabsVoiceId", "audioElevenlabsVoiceId");
  includeField(raw, fields, "audio.fishVoiceId", "audioFishVoiceId");
  includeField(raw, fields, "audio.fishModelId", "audioFishModelId");
  includeField(raw, fields, "audio.readAloudModel", "audioReadAloudModel");
  includeField(raw, fields, "audio.generatedAudioModel", "audioGeneratedAudioModel");
  includeField(raw, fields, "audio.gallerySavedSourceSurfaces", "audioGallerySavedSourceSurfaces", (value) => readListField(value));
  includeField(raw, fields, "audio.v3DeliveryTags", "audioV3DeliveryTags");
  includeField(raw, fields, "audio.fishNlTags", "audioFishNlTags");
  includeField(raw, fields, "audio.voiceSettingsEnabled", "audioVoiceSettingsEnabled", (value) => {
    return readBooleanField(value);
  });
  includeField(raw, fields, "audio.voiceStability", "audioVoiceStability");
  includeField(raw, fields, "audio.voiceSimilarityBoost", "audioVoiceSimilarityBoost");
  includeField(raw, fields, "audio.voiceStyle", "audioVoiceStyle");
  includeField(raw, fields, "audio.voiceSpeed", "audioVoiceSpeed");
  includeField(raw, fields, "audio.voiceSpeakerBoost", "audioVoiceSpeakerBoost", (value) => {
    return readBooleanField(value);
  });

  return raw;
}

function parseHeartbeatSettingsFields(fields) {
  const raw = {};

  includeField(raw, fields, "heartbeat.activityMode", "heartbeatActivityMode");
  includeField(raw, fields, "heartbeat.globalCooldownMinutes", "heartbeatGlobalCooldownMinutes");
  includeField(raw, fields, "heartbeat.dailyCap", "heartbeatDailyCap");
  includeField(raw, fields, "heartbeat.quietHoursEnabled", "heartbeatQuietHoursEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "heartbeat.quietHoursStart", "heartbeatQuietHoursStart");
  includeField(raw, fields, "heartbeat.quietHoursEnd", "heartbeatQuietHoursEnd");

  return raw;
}

function parseAdultPrivateModeSettingsFields(fields) {
  const raw = {};

  includeField(raw, fields, "chat.adultPrivateMode.enabled", "adultPrivateModeEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "chat.adultPrivateMode.channelId", "adultPrivateModeChannelId");
  includeField(raw, fields, "chat.adultPrivateMode.model", "adultPrivateModeModel");
  includeField(raw, fields, "chat.adultPrivateMode.systemPrompt", "adultPrivateModeSystemPrompt");
  includeField(raw, fields, "chat.adultPrivateMode.safeword", "adultPrivateModeSafeword");
  includeField(raw, fields, "chat.adultPrivateMode.aftercareEnabled", "adultPrivateModeAftercareEnabled", (value) => readBooleanField(value));
  includeField(raw, fields, "chat.adultPrivateMode.aftercarePrompt", "adultPrivateModeAftercarePrompt");
  includeField(raw, fields, "chat.adultPrivateMode.userPreferences", "adultPrivateModeUserPreferences");
  includeField(raw, fields, "chat.adultPrivateMode.userWants", "adultPrivateModeUserWants");
  includeField(raw, fields, "chat.adultPrivateMode.userNeeds", "adultPrivateModeUserNeeds");
  includeField(raw, fields, "chat.adultPrivateMode.softLimits", "adultPrivateModeSoftLimits");
  includeField(raw, fields, "chat.adultPrivateMode.hardLimits", "adultPrivateModeHardLimits");

  return raw;
}

function parseRuntimeSettingsForm(fields) {
  return normalizeRuntimeSettings({
    ...parseGeneralSettingsFields(fields),
    ...parseCustomReactionEmojiSettingsFields(fields),
    ...parseMemorySettingsFields(fields),
    ...parseImageGenerationSettingsFields(fields),
    ...parseSpotifySettingsFields(fields),
    ...parseAudioSettingsFields(fields),
    ...parseAdultPrivateModeSettingsFields(fields),
  });
}

function parseHeartbeatRuntimeSettingsForm(fields) {
  return normalizeRuntimeSettings(parseHeartbeatSettingsFields(fields));
}

module.exports = {
  parseGeneralSettingsFields,
  parseMemorySettingsFields,
  parseCustomReactionEmojiSettingsFields,
  parseImageGenerationSettingsFields,
  parseSpotifySettingsFields,
  parseAudioSettingsFields,
  parseHeartbeatSettingsFields,
  parseAdultPrivateModeSettingsFields,
  parseRuntimeSettingsForm,
  parseHeartbeatRuntimeSettingsForm,
};
