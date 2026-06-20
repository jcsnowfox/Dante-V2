const crypto = require("node:crypto");
const {
  uploadBufferToBucket,
  hasStorageConfig,
} = require("../images/bucketStorage");
const { shouldSaveAudioToGallery } = require("./galleryPolicy");
const { truncateSpeechText } = require("./text");

const AUDIO_LABEL_MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
const DEFAULT_AUDIO_MIME_TYPE = "audio/mpeg";
const DEFAULT_AUDIO_OUTPUT_FORMAT = "mp3_44100_128";

function canGenerateAudio(config = {}) {
  return Boolean(
    config.audio?.ttsEnabled
    && String(config.elevenlabs?.apiKey || "").trim()
    && String(config.audio?.elevenlabsVoiceId || "").trim()
    && hasStorageConfig(config)
  );
}

function resolveElevenLabsBaseUrl(config = {}) {
  return String(config.elevenlabs?.baseURL || "https://api.elevenlabs.io").trim().replace(/\/+$/g, "");
}

function isElevenV3AudioModel(value = "") {
  return String(value || "").trim().toLowerCase() === "eleven_v3";
}

function normalizeV3DeliveryTags(value = "") {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 240);

  if (!normalized) {
    return "";
  }

  if (/^\[[^\]]+\](?:\s+\[[^\]]+\])*$/u.test(normalized)) {
    return normalized;
  }

  const bareTag = normalized.replace(/^\[+|\]+$/g, "").trim();

  return bareTag ? `[${bareTag}]` : "";
}

function applyV3DeliveryTags(text = "", { model = "", config = {} } = {}) {
  const normalizedText = String(text || "").trim();
  const tags = normalizeV3DeliveryTags(config.audio?.v3DeliveryTags || "");

  if (!normalizedText || !config.audio?.voiceSettingsEnabled || !tags || !isElevenV3AudioModel(model)) {
    return normalizedText;
  }

  if (normalizedText.toLowerCase().startsWith(tags.toLowerCase())) {
    return normalizedText;
  }

  return `${tags} ${normalizedText}`;
}

function clampNumber(value, fallback, { min = 0, max = 1 } = {}) {
  const parsed = Number.parseFloat(String(value ?? "").trim());

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(parsed, max));
}

function resolveElevenLabsVoiceSettings(config = {}) {
  if (!config.audio?.voiceSettingsEnabled) {
    return null;
  }

  return {
    stability: clampNumber(config.audio?.voiceStability, 0.7, { min: 0, max: 1 }),
    similarity_boost: clampNumber(config.audio?.voiceSimilarityBoost, 0.85, { min: 0, max: 1 }),
    style: clampNumber(config.audio?.voiceStyle, 0, { min: 0, max: 1 }),
    speed: clampNumber(config.audio?.voiceSpeed, 1, { min: 0.7, max: 1.2 }),
    use_speaker_boost: config.audio?.voiceSpeakerBoost !== false,
  };
}

function resolveAudioMimeType(outputFormat = "") {
  const normalized = String(outputFormat || "").trim().toLowerCase();

  if (normalized.startsWith("wav_")) {
    return "audio/wav";
  }

  if (normalized.startsWith("opus_")) {
    return "audio/ogg";
  }

  if (normalized.startsWith("pcm_")) {
    return "audio/L16";
  }

  if (normalized.startsWith("ulaw_")) {
    return "audio/basic";
  }

  return DEFAULT_AUDIO_MIME_TYPE;
}

function extensionForMimeType(mimeType = "") {
  const normalized = String(mimeType || "").trim().toLowerCase();

  if (normalized === "audio/wav") {
    return "wav";
  }

  if (normalized === "audio/ogg") {
    return "ogg";
  }

  return "mp3";
}

function slugifyFilenamePart(value = "", fallback = "clip") {
  const slug = String(value || "")
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || fallback;
}

function formatAudioDate(date = new Date()) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return [
    String(safeDate.getUTCDate()).padStart(2, "0"),
    AUDIO_LABEL_MONTHS[safeDate.getUTCMonth()] || "Jan",
  ].join("-");
}

function buildAudioDisplayName({
  kind = "Audio",
  title = "",
  messageId = "",
  mimeType = DEFAULT_AUDIO_MIME_TYPE,
  now = new Date(),
} = {}) {
  const prefix = String(kind || "Audio").trim() || "Audio";
  const dateLabel = formatAudioDate(now);
  const suffix = messageId
    ? slugifyFilenamePart(messageId, "message").slice(0, 28)
    : slugifyFilenamePart(title, "clip");

  return `${prefix}-${dateLabel}-${suffix}.${extensionForMimeType(mimeType)}`;
}

function buildAudioStorageKey({
  config = {},
  userScope = "user",
  displayName,
  audioId,
  now = new Date(),
} = {}) {
  const safeScope = String(userScope || "user").replace(/[^\w-]+/g, "-") || "user";
  const safeDisplayName = slugifyFilenamePart(String(displayName || "").replace(/\.[a-z0-9]+$/i, ""), audioId);
  const extension = String(displayName || "").match(/\.([a-z0-9]+)$/i)?.[1] || "mp3";
  const uniqueSuffix = String(audioId || crypto.randomUUID()).replace(/-/g, "").slice(0, 8);

  return [
    String(config.audio?.bucketPrefix || "generated-audio").replace(/^\/+|\/+$/g, ""),
    safeScope,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${safeDisplayName}-${uniqueSuffix}.${extension}`,
  ].join("/");
}

function formatElevenLabsRequestError({ status, errorText = "" }) {
  const statusLabel = Number(status || 0) ? `status ${status}` : "an unknown status";
  const raw = String(errorText || "").trim();

  if (!raw) {
    return `ElevenLabs request failed with ${statusLabel}.`;
  }

  try {
    const parsed = JSON.parse(raw);
    const message = String(parsed?.detail?.message || parsed?.detail || parsed?.message || parsed?.error || "").trim();

    if (message) {
      return `ElevenLabs request failed with ${statusLabel}: ${message}`;
    }
  } catch (_error) {
    // Fall through to raw text.
  }

  return `ElevenLabs request failed with ${statusLabel}: ${raw.slice(0, 300)}`;
}

function normalizeElevenLabsVoice(value = {}) {
  const voiceId = String(value.voice_id || value.voiceId || "").trim();
  const name = String(value.name || "").trim();

  if (!voiceId || !name) {
    return null;
  }

  return {
    voiceId,
    name,
    category: String(value.category || "").trim(),
    description: String(value.description || "").trim(),
    previewUrl: String(value.preview_url || value.previewUrl || "").trim(),
  };
}

async function listElevenLabsVoices({
  config = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  const apiKey = String(config.elevenlabs?.apiKey || "").trim();

  if (!apiKey || typeof fetchImpl !== "function") {
    return [];
  }

  const response = await fetchImpl(`${resolveElevenLabsBaseUrl(config)}/v2/voices`, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = typeof response.text === "function" ? await response.text() : "";
    throw new Error(formatElevenLabsRequestError({
      status: response.status,
      errorText,
    }));
  }

  const payload = await response.json();
  const voices = Array.isArray(payload?.voices) ? payload.voices : [];

  return voices
    .map(normalizeElevenLabsVoice)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createAudioGenerationService({
  config,
  logger,
  generatedAudio,
  fetchImpl = globalThis.fetch,
}) {
  return {
    canGenerate() {
      return canGenerateAudio(config);
    },

    async generate({
      text,
      prompt = "",
      caption = "",
      title = "",
      kind = "Audio",
      model = "",
      context = {},
    }) {
      if (!config.audio?.ttsEnabled) {
        throw new Error("TTS audio is disabled.");
      }

      if (typeof fetchImpl !== "function") {
        throw new Error("A fetch implementation is required for audio generation.");
      }

      const apiKey = String(config.elevenlabs?.apiKey || "").trim();
      const voiceId = String(config.audio?.elevenlabsVoiceId || "").trim();

      if (!apiKey) {
        throw new Error("ElevenLabs credentials are not configured.");
      }

      if (!voiceId) {
        throw new Error("No ElevenLabs voice ID is configured.");
      }

      const baseSpokenText = truncateSpeechText(text);

      if (!baseSpokenText) {
        throw new Error("Text is required to generate audio.");
      }

      const selectedModel = String(model || config.audio?.generatedAudioModel || "eleven_multilingual_v2").trim();
      const spokenText = truncateSpeechText(applyV3DeliveryTags(baseSpokenText, {
        model: selectedModel,
        config,
      }));
      const outputFormat = DEFAULT_AUDIO_OUTPUT_FORMAT;
      const mimeType = resolveAudioMimeType(outputFormat);
      const sourceSurface = context.sourceSurface || "chat";
      const shouldPersist = shouldSaveAudioToGallery(config, sourceSurface);
      const audioId = context.audioId || crypto.randomUUID();
      const now = context.now || new Date();
      const displayName = buildAudioDisplayName({
        kind,
        title,
        messageId: context.sourceMessageId || context.messageId || "",
        mimeType,
        now,
      });

      logger.debug?.("[audio] Generating audio", {
        model: selectedModel,
        voiceId,
        sourceSurface,
        gallerySaved: shouldPersist,
        textLength: spokenText.length,
        displayName,
      });

      const requestUrl = `${resolveElevenLabsBaseUrl(config)}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
      const voiceSettings = resolveElevenLabsVoiceSettings(config);
      const requestBody = {
        text: spokenText,
        model_id: selectedModel,
      };

      if (voiceSettings) {
        requestBody.voice_settings = voiceSettings;
      }

      const response = await fetchImpl(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(formatElevenLabsRequestError({
          status: response.status,
          errorText,
        }));
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      let storageKey = "";
      let record = null;

      if (shouldPersist) {
        if (!hasStorageConfig(config)) {
          throw new Error("Media storage is not configured.");
        }

        if (typeof generatedAudio?.recordAudio !== "function") {
          throw new Error("Generated audio persistence is not configured.");
        }

        storageKey = buildAudioStorageKey({
          config,
          userScope: context.userScope || config.memory?.userScope || "user",
          displayName,
          audioId,
          now,
        });

        await uploadBufferToBucket({
          config,
          key: storageKey,
          body: audioBuffer,
          contentType: mimeType,
          fetchImpl,
        });

        record = await generatedAudio.recordAudio({
          audioId,
          userScope: context.userScope,
          sourceSurface,
          displayName,
          conversationId: context.conversationId || null,
          channelId: context.channelId || null,
          sourceMessageId: context.sourceMessageId || null,
          prompt: prompt || spokenText,
          spokenText,
          caption,
          voiceId,
          model: selectedModel,
          outputFormat,
          mimeType,
          fileSizeBytes: audioBuffer.length,
          storageKey,
          status: "completed",
        }, {
          userScope: context.userScope,
        });
      }

      return {
        audio: {
          audioId: record?.audioId || audioId,
          mimeType,
          fileSizeBytes: audioBuffer.length,
          storageKey,
          model: selectedModel,
          voiceId,
          displayName,
          gallerySaved: Boolean(record),
        },
        file: {
          attachment: audioBuffer,
          name: displayName,
        },
        record,
      };
    },
  };
}

module.exports = {
  canGenerateAudio,
  createAudioGenerationService,
  buildAudioDisplayName,
  buildAudioStorageKey,
  formatElevenLabsRequestError,
  applyV3DeliveryTags,
  isElevenV3AudioModel,
  listElevenLabsVoices,
  normalizeV3DeliveryTags,
  normalizeElevenLabsVoice,
  resolveElevenLabsVoiceSettings,
  resolveAudioMimeType,
  slugifyFilenamePart,
  DEFAULT_AUDIO_OUTPUT_FORMAT,
};
