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
  includeField(raw, fields, "chat.historyLimit", "historyLimit");
  includeField(raw, fields, "chat.defaultMode", "defaultMode");
  includeField(raw, fields, "chat.timezone", "chatTimezone");

  return raw;
}

function parseAudioSettingsFields(fields) {
  const raw = {};

  if (Object.prototype.hasOwnProperty.call(fields, "audioTtsProvider")) {
    const providerValue = String(fields.audioTtsProvider || "").trim().toLowerCase();
    if (providerValue === "disabled") {
      raw["audio.ttsEnabled"] = false;
    } else if (providerValue === "fish") {
      raw["audio.ttsEnabled"] = true;
      raw["audio.ttsProvider"] = "fish";
    } else {
      raw["audio.ttsEnabled"] = true;
      raw["audio.ttsProvider"] = "elevenlabs";
    }
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

function parseRuntimeSettingsForm(fields) {
  return normalizeRuntimeSettings({
    ...parseGeneralSettingsFields(fields),
    ...parseAudioSettingsFields(fields),
    ...parseHeartbeatSettingsFields(fields),
  });
}

function parseHeartbeatRuntimeSettingsForm(fields) {
  return normalizeRuntimeSettings(parseHeartbeatSettingsFields(fields));
}

module.exports = {
  parseGeneralSettingsFields,
  parseAudioSettingsFields,
  parseHeartbeatSettingsFields,
  parseRuntimeSettingsForm,
  parseHeartbeatRuntimeSettingsForm,
};