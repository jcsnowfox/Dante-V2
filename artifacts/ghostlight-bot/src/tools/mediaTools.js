const crypto = require("node:crypto");
const {
  DEFAULT_AUDIO_OUTPUT_FORMAT,
  isElevenV3AudioModel,
  normalizeV3DeliveryTags,
} = require("../audio/generateAudio");
const { shouldSaveAudioToGallery } = require("../audio/galleryPolicy");
const { truncateSpeechText } = require("../audio/text");
const {
  customReactionIdentifier,
  customReactionLabel,
  normalizeCustomReactionEmojis,
} = require("../reactions/customEmojiPalette");
const { safeJsonParse } = require("./toolUtils");
const { normalizeGiphyItem } = require("../media/gifUrlNormalizer");

const DEFAULT_GIF_RESULT_LIMIT = 3;
const MAX_GIF_RESULT_LIMIT = 5;
const GIF_SEARCH_POOL_SIZE = 50;
const IMAGE_PROMPT_LIMIT = 3000;
const AUDIO_TEXT_LIMIT = 4800;
const IMAGE_ALLOWED_ASPECT_RATIOS = Object.freeze(["1:1", "9:16", "16:9"]);
const ADD_REACTION_EMOJI_WHITELIST = Object.freeze([
  "👍",
  "👌",
  "🙌",
  "🫡",
  "👀",
  "❤️",
  "🥰",
  "😊",
  "😌",
  "🫂",
  "😔",
  "🥺",
  "💔",
  "🌙",
  "😂",
  "🤣",
  "😅",
  "😏",
  "🤭",
  "😬",
  "🫠",
  "✨",
  "🎉",
  "🔥",
  "😍",
  "🤔",
  "😈",
]);
const CHAT_MULTI_IMAGE_REQUEST_PATTERNS = Object.freeze([
  /\b(?:two|2|both|couple|pair|multiple|several|few)\b[\s\S]{0,40}\b(?:images|pics|pictures|portraits|photos|illustrations|versions|variations)\b/i,
  /\b(?:all the|set of|series of|collection of)\b[\s\S]{0,40}\b(?:images|pics|pictures|portraits|photos|illustrations)\b/i,
]);

function normalizeGifQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 50);
}

function createGiphySearchTool({ config, logger, fetchImpl = globalThis.fetch }) {
  const apiKey = String(config.giphy?.apiKey || "").trim();
  const gifsEnabled = config.gifs?.enabled !== false;
  const gifSendMode = String(config.gifs?.sendMode || "direct_url").trim().toLowerCase();

  if (!apiKey || typeof fetchImpl !== "function" || !gifsEnabled || gifSendMode === "disabled") {
    return null;
  }

  return {
    name: "search_gifs",
    definition: {
      type: "function",
      name: "search_gifs",
      description: [
        "Search GIPHY for a short reaction GIF when a GIF would add something to a light, playful, celebratory, or teasing moment.",
        "Use a 1-3 word search phrase. Choose by emotional fit, using the candidate titles and alt text.",
        "If you use a GIF, reply naturally first, then put the GIF URL on its own line. Do not invent GIF URLs.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Short GIPHY search phrase, ideally 1-3 words.",
          },
          limit: {
            type: "integer",
            description: "Number of GIF candidates to return.",
            minimum: 1,
            maximum: 5,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const query = normalizeGifQuery(args.query);
      const limit = Math.max(
        1,
        Math.min(
          Number.parseInt(String(args.limit || String(DEFAULT_GIF_RESULT_LIMIT)), 10) || DEFAULT_GIF_RESULT_LIMIT,
          MAX_GIF_RESULT_LIMIT,
        ),
      );

      if (!query) {
        return {
          ok: false,
          error: "A short search query is required.",
          results: [],
        };
      }

      const params = new URLSearchParams({
        api_key: apiKey,
        q: query,
        limit: String(GIF_SEARCH_POOL_SIZE),
      });
      const response = await fetchImpl(`https://api.giphy.com/v1/gifs/search?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        logger?.warn?.("[tools] GIPHY search failed", {
          status: response.status,
          query,
        });
        return {
          ok: false,
          error: `GIPHY search failed with status ${response.status}.`,
          details: errorText.slice(0, 500),
          results: [],
        };
      }

      const payload = await response.json();

      logger?.debug?.("[gif] provider result received", {
        provider: "giphy",
        query,
        rawCount: Array.isArray(payload?.data) ? payload.data.length : 0,
      });

      const candidates = Array.isArray(payload?.data)
        ? payload.data.map((item) => {
          const normalized = normalizeGiphyItem(item);

          if (!normalized.ok) {
            logger?.debug?.("[gif] item skipped — no valid direct URL", {
              provider: "giphy",
              id: String(item.id || "").trim(),
              reason: normalized.reason,
            });
            return null;
          }

          logger?.debug?.("[gif] normalized direct URL selected", {
            provider: "giphy",
            id: String(item.id || "").trim(),
            directGifUrl: normalized.directGifUrl,
          });

          return {
            id: String(item.id || "").trim(),
            title: normalized.title,
            altText: String(item.alt_text || item.altText || "").trim(),
            url: normalized.directGifUrl,
            previewUrl: normalized.previewUrl,
          };
        }).filter(Boolean)
        : [];

      const described = candidates.filter((item) => item.altText);
      const fallback = candidates.filter((item) => !item.altText);
      const results = described.concat(fallback).slice(0, limit);

      return {
        ok: true,
        attribution: "Powered by GIPHY",
        query,
        results,
      };
    },
  };
}

function normalizeImagePrompt(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, IMAGE_PROMPT_LIMIT);
}

function normalizeAudioText(value) {
  return truncateSpeechText(String(value || "").slice(0, AUDIO_TEXT_LIMIT + 1000), AUDIO_TEXT_LIMIT);
}

function normalizeAudioCaption(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function normalizeAudioTitle(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((item) => String(item || "").trim())
    .filter(Boolean)));
}

function shouldAllowAdditionalChatImageCall(context = {}) {
  const surface = String(context.surface || "").trim().toLowerCase();

  if (surface !== "chat") {
    return false;
  }

  const currentUserText = String(context.currentUserText || "").trim();

  if (!currentUserText) {
    return false;
  }

  return CHAT_MULTI_IMAGE_REQUEST_PATTERNS.some((pattern) => pattern.test(currentUserText));
}

function normalizePresetLookupValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveSelectedPresets(selectedValues = [], availablePresets = []) {
  const resolved = [];
  const unresolved = [];

  for (const rawValue of selectedValues) {
    const value = String(rawValue || "").trim();
    const normalizedValue = normalizePresetLookupValue(value);

    const exactIdMatch = availablePresets.find((preset) => String(preset?.presetId || "").trim() === value);

    if (exactIdMatch) {
      resolved.push(exactIdMatch);
      continue;
    }

    const exactNameMatch = availablePresets.find((preset) => normalizePresetLookupValue(preset?.name) === normalizedValue);

    if (exactNameMatch) {
      resolved.push(exactNameMatch);
      continue;
    }

    const partialMatches = availablePresets.filter((preset) => {
      const normalizedName = normalizePresetLookupValue(preset?.name);
      return normalizedName && normalizedValue
        && (normalizedName.includes(normalizedValue) || normalizedValue.includes(normalizedName));
    });

    if (partialMatches.length === 1) {
      resolved.push(partialMatches[0]);
      continue;
    }

    unresolved.push({
      value,
      candidateNames: partialMatches.map((preset) => String(preset?.name || "").trim()).filter(Boolean),
    });
  }

  return {
    presets: Array.from(new Map(resolved.map((preset) => [preset.presetId, preset])).values()),
    unresolved,
  };
}

function createImageGenerationTool({
  config,
  logger,
  imageGeneration,
  imageAnalysis,
  generatedImages,
  imageStylePresets,
  imageAppearancePresets,
}) {
  if (
    !imageGeneration?.canGenerate()
    || !generatedImages?.persistenceEnabled
    || !imageStylePresets?.persistenceEnabled
    || !imageAppearancePresets?.persistenceEnabled
  ) {
    return null;
  }

  return {
    name: "generate_image",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();

      return ["chat", "scheduled", "heartbeat"].includes(surface);
    },
    definition: {
      type: "function",
      name: "generate_image",
      description: [
        "Generate one image when the user asks for an image or clearly accepts your specific image offer.",
        "Use this tool when image intent is clear. Don't reply with prompt specs unless the user asks for prompt help.",
        "Don't use this for Spotify playlist cover art when the Spotify playlist tool is available; use that tool's coverPrompt/createCover fields instead.",
        "Use an allowed aspect ratio. Write a detailed and specific prompt: subject, active pose or action, expression and mood, clothing, setting, lighting, and framing.",
        "Use an appearance preset only when that named person or element is actually in the image.",
        "Use at most one style preset, and only when it fits.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Complete image prompt: subject, pose/action, expression, clothing, setting, lighting, framing, and mood.",
          },
          aspectRatio: {
            type: "string",
            enum: IMAGE_ALLOWED_ASPECT_RATIOS.slice(),
            description: "Allowed image aspect ratio.",
          },
          stylePresetIds: {
            type: "array",
            items: { type: "string" },
            maxItems: 1,
            description: "Optional style preset id. Use one at most.",
          },
          appearancePresetIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional appearance preset ids for named people or elements in the image.",
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const prompt = normalizeImagePrompt(args.prompt);
      const allowedAspectRatios = imageGeneration.getAllowedAspectRatios();
      const selectedAspectRatio = String(args.aspectRatio || "").trim();
      const aspectRatio = selectedAspectRatio && allowedAspectRatios.includes(selectedAspectRatio)
        ? selectedAspectRatio
        : "";

      if (!prompt) {
        return {
          ok: false,
          error: "A prompt is required to generate an image.",
        };
      }

      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const availableStylePresets = await imageStylePresets.listPresets({ userScope });
      const availableAppearancePresets = await imageAppearancePresets.listPresets({ userScope });
      const selectedStylePresetIds = normalizeIdList(args.stylePresetIds);
      const selectedAppearancePresetIds = normalizeIdList(args.appearancePresetIds);

      if (selectedStylePresetIds.length > 1) {
        logger.warn?.("[tools] Image generation style preset selection rejected", {
          selectedStylePresetIds,
          reason: "too_many_style_presets",
        });

        return {
          ok: false,
          error: "Choose at most one style preset for an image.",
        };
      }

      const resolvedStylePresets = resolveSelectedPresets(selectedStylePresetIds, availableStylePresets);
      const resolvedAppearancePresets = resolveSelectedPresets(selectedAppearancePresetIds, availableAppearancePresets);
      const stylePresets = resolvedStylePresets.presets;
      const appearancePresets = resolvedAppearancePresets.presets;

      logger.debug?.("[tools] generate_image requested", {
        surface: context.surface || "unknown",
        conversationId: context.conversationId || null,
        channelId: context.channelId || null,
        promptPreview: prompt.slice(0, 200),
        requestedAspectRatio: selectedAspectRatio || null,
        resolvedAspectRatio: aspectRatio,
        allowedAspectRatios,
        selectedStylePresetIds,
        selectedAppearancePresetIds,
        resolvedStylePresetNames: stylePresets.map((preset) => preset.name),
        resolvedAppearancePresetNames: appearancePresets.map((preset) => preset.name),
      });

      if (resolvedStylePresets.unresolved.length) {
        const errorMessage = resolvedStylePresets.unresolved.map((item) => {
          if (item.candidateNames.length > 1) {
            return `${item.value} (ambiguous: ${item.candidateNames.join(", ")})`;
          }

          return item.value;
        }).join(", ");

        logger.warn?.("[tools] Image generation preset resolution failed", {
          presetType: "style",
          selectedStylePresetIds,
          unresolved: resolvedStylePresets.unresolved,
          resolvedStylePresetNames: stylePresets.map((preset) => preset.name),
        });

        return {
          ok: false,
          error: `One or more selected style presets do not exist: ${errorMessage}.`,
        };
      }

      if (resolvedAppearancePresets.unresolved.length) {
        const errorMessage = resolvedAppearancePresets.unresolved.map((item) => {
          if (item.candidateNames.length > 1) {
            return `${item.value} (ambiguous: ${item.candidateNames.join(", ")})`;
          }

          return item.value;
        }).join(", ");

        logger.warn?.("[tools] Image generation preset resolution failed", {
          presetType: "appearance",
          selectedAppearancePresetIds,
          unresolved: resolvedAppearancePresets.unresolved,
          resolvedAppearancePresetNames: appearancePresets.map((preset) => preset.name),
        });

        return {
          ok: false,
          error: `One or more selected appearance presets do not exist: ${errorMessage}.`,
        };
      }

      const imageId = crypto.randomUUID();

      try {
        const result = await imageGeneration.generate({
          prompt,
          aspectRatio,
          stylePresets,
          appearancePresets,
          context: {
            imageId,
            userScope,
            sourceSurface: context.surface || "chat",
            conversationId: context.conversationId,
            channelId: context.channelId,
          },
        });
        let imageDescription = "";

        if (imageAnalysis?.canAnalyze?.()) {
          try {
            imageDescription = await imageAnalysis.analyze({
              imageBuffer: result.file.attachment,
              mimeType: result.image.mimeType,
              prompt,
              aspectRatio: result.record.aspectRatio,
              model: result.record.model,
            });
          } catch (analysisError) {
            logger.warn("[tools] Generated image analysis failed; continuing without description", {
              surface: context.surface || "unknown",
              scheduleName: context.actionName || "",
              actionType: context.actionType || "",
              target: context.target || context.channelId || context.conversationId || "",
              imageId: result.record.imageId,
              error: analysisError.message,
            });
          }
        }

        return {
          ok: true,
          imageId: result.record.imageId,
          model: result.record.model,
          aspectRatio: result.record.aspectRatio,
          imageDescription,
          selectedStylePresetNames: stylePresets.map((preset) => preset.name),
          selectedAppearancePresetNames: appearancePresets.map((preset) => preset.name),
          attachmentReady: true,
          replyAttachment: {
            imageIds: [result.record.imageId],
            files: [result.file],
          },
          warning: result.warning || "",
          skippedReferenceImages: Boolean(result.skippedReferenceImages),
          toolMessage: result.warning
            ? `The generated image is ready and will be attached automatically. Note: ${result.warning}`
            : "The generated image is ready and will be attached to the reply automatically.",
        };
      } catch (error) {
        logger.warn("[tools] Image generation failed", {
          surface: context.surface || "unknown",
          scheduleName: context.actionName || "",
          actionType: context.actionType || "",
          target: context.target || context.channelId || context.conversationId || "",
          model: config.imageGeneration?.model || "",
          error: error.message,
          aspectRatio,
          promptPreview: prompt.slice(0, 200),
        });

        if (generatedImages?.persistenceEnabled) {
          await generatedImages.recordImage({
            imageId,
            userScope,
            sourceSurface: context.surface || "chat",
            conversationId: context.conversationId || null,
            channelId: context.channelId || null,
            prompt,
            composedPrompt: prompt,
            stylePresetIds: selectedStylePresetIds,
            appearancePresetIds: selectedAppearancePresetIds,
            model: config.imageGeneration?.model || "",
            aspectRatio,
            mimeType: "image/png",
            fileSizeBytes: 0,
            storageKey: `failed/${imageId}.png`,
            status: "failed",
            errorMessage: error.message,
          }, {
            userScope,
          }).catch(() => {});
        }

        return {
          ok: false,
          error: error.message,
        };
      }
    },
  };
}

function createAudioGenerationTool({
  config,
  logger,
  audioGeneration,
  generatedAudio,
}) {
  if (!audioGeneration?.canGenerate()) {
    return null;
  }

  const generatedAudioUsesV3 = isElevenV3AudioModel(config.audio?.generatedAudioModel);
  const v3DeliveryTags = config.audio?.voiceSettingsEnabled
    ? normalizeV3DeliveryTags(config.audio?.v3DeliveryTags || "")
    : "";

  return {
    name: "generate_audio",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();

      return ["chat", "scheduled", "heartbeat"].includes(surface);
    },
    definition: {
      type: "function",
      name: "generate_audio",
      description: [
        "Generate an ElevenLabs audio clip when the user asks for audio, a voice note, a spoken version, or narration.",
        "Write only what should be spoken aloud. Do not include Markdown, code blocks, URLs, image prompts, emoji-only captions, or unspoken stage directions.",
        generatedAudioUsesV3
          ? "Eleven v3 delivery tags like [chuckles], [sighs], [whispers], [pause], or [softly] are allowed sparingly when they help the performance."
          : "",
        generatedAudioUsesV3 && v3DeliveryTags
          ? `Preferred Eleven v3 delivery tags: ${v3DeliveryTags}. Use them when they fit the spoken text.`
          : "",
        "The text field is spoken aloud. The caption is the short Discord message shown with the attachment.",
      ].filter(Boolean).join(" "),
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: generatedAudioUsesV3
              ? "Speech text to turn into audio. Eleven v3 delivery tags are allowed sparingly when useful."
              : "Plain speech text to turn into audio.",
          },
          caption: {
            type: "string",
            description: "Optional short Discord caption for the audio attachment.",
          },
          title: {
            type: "string",
            description: "Optional short title for the saved filename.",
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const spokenText = normalizeAudioText(args.text);
      const caption = normalizeAudioCaption(args.caption);
      const title = normalizeAudioTitle(args.title || caption || spokenText.slice(0, 60));

      if (!spokenText) {
        return {
          ok: false,
          error: "Plain text is required to generate audio.",
        };
      }

      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const audioId = crypto.randomUUID();
      const model = String(config.audio?.generatedAudioModel || "eleven_multilingual_v2").trim();

      logger.debug?.("[tools] generate_audio requested", {
        surface: context.surface || "unknown",
        conversationId: context.conversationId || null,
        channelId: context.channelId || null,
        textLength: spokenText.length,
        title,
      });

      try {
        const result = await audioGeneration.generate({
          text: spokenText,
          prompt: spokenText,
          caption,
          title,
          kind: "Audio",
          model,
          context: {
            audioId,
            userScope,
            sourceSurface: context.surface || "chat",
            conversationId: context.conversationId,
            channelId: context.channelId,
            sourceMessageId: context.sourceMessageId,
          },
        });

        return {
          ok: true,
          audioId: result.audio.audioId,
          model: result.audio.model,
          voiceId: result.audio.voiceId,
          gallerySaved: Boolean(result.record),
          attachmentReady: true,
          caption,
          replyAttachment: {
            audioIds: result.record?.audioId ? [result.record.audioId] : [],
            files: [result.file],
          },
          toolMessage: caption
            ? "The generated audio is ready and will be attached automatically with the caption."
            : "The generated audio is ready and will be attached automatically.",
        };
      } catch (error) {
        logger.warn("[tools] Audio generation failed", {
          surface: context.surface || "unknown",
          scheduleName: context.actionName || "",
          actionType: context.actionType || "",
          target: context.target || context.channelId || context.conversationId || "",
          model,
          error: error.message,
          textPreview: spokenText.slice(0, 200),
        });

        if (generatedAudio?.persistenceEnabled && shouldSaveAudioToGallery(config, context.surface || "chat")) {
          await generatedAudio.recordAudio({
            audioId,
            userScope,
            sourceSurface: context.surface || "chat",
            displayName: `Audio-failed-${audioId}.mp3`,
            conversationId: context.conversationId || null,
            channelId: context.channelId || null,
            sourceMessageId: context.sourceMessageId || null,
            prompt: spokenText,
            spokenText,
            caption,
            voiceId: config.audio?.elevenlabsVoiceId || "",
            model,
            outputFormat: DEFAULT_AUDIO_OUTPUT_FORMAT,
            mimeType: "audio/mpeg",
            fileSizeBytes: 0,
            storageKey: `failed/${audioId}.mp3`,
            status: "failed",
            errorMessage: error.message,
          }, {
            userScope,
          }).catch(() => {});
        }

        return {
          ok: false,
          error: error.message,
        };
      }
    },
  };
}

function buildAddReactionOptions(config = {}) {
  const customEmojis = normalizeCustomReactionEmojis(config.chat?.customReactionEmojis || []);
  const customByLabel = new Map(customEmojis.map((emoji) => [customReactionLabel(emoji), emoji]));

  return {
    allowed: [...ADD_REACTION_EMOJI_WHITELIST, ...customByLabel.keys()],
    customEmojis,
    customByLabel,
  };
}

function buildAddReactionDescription(config = {}) {
  const customEmojis = normalizeCustomReactionEmojis(config.chat?.customReactionEmojis || []);
  const customDescription = customEmojis.length
    ? ` Custom emoji options: ${customEmojis.map((emoji) => {
        const mood = String(emoji.mood || "").trim();
        return `${customReactionLabel(emoji)}${mood ? ` (${mood})` : ""}`;
      }).join("; ")}.`
    : "";

  return [
    "Use to react to the user's latest Discord message with one emoji from the allowed palette.",
    "Use this sparingly when a reaction genuinely fits.",
    "Let the written reply carry the useful response.",
    "In serious, tense, or safety-sensitive moments, react only if a gentle supportive signal clearly fits.",
    customDescription,
  ].join(" ").replace(/\s+/g, " ").trim();
}

function normalizeReactionEmoji(value) {
  return String(value || "").trim();
}

function createAddReactionTool({ config, logger } = {}) {
  return {
    name: "add_reaction",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      const currentMessage = context.currentMessage || context.message || null;

      return surface === "chat" && typeof currentMessage?.react === "function";
    },
    get definition() {
      const options = buildAddReactionOptions(config);

      return {
        type: "function",
        name: "add_reaction",
        description: buildAddReactionDescription(config),
        parameters: {
          type: "object",
          properties: {
            emoji: {
              type: "string",
              enum: options.allowed,
              description: "Allowed Unicode emoji or custom emoji label to add to the user's current message.",
            },
          },
          required: ["emoji"],
          additionalProperties: false,
        },
      };
    },
    async execute(rawArgs, context = {}) {
      const options = buildAddReactionOptions(config);
      const args = typeof rawArgs === "string" ? safeJsonParse(rawArgs) || {} : rawArgs || {};
      const emoji = normalizeReactionEmoji(args.emoji);
      const customEmoji = options.customByLabel.get(emoji);
      const reactionValue = customEmoji ? customReactionIdentifier(customEmoji) : emoji;

      if (!options.allowed.includes(emoji) || !reactionValue) {
        return {
          ok: false,
          error: "Choose one of the allowed reactions.",
          allowedEmojis: options.allowed,
        };
      }

      const currentMessage = context.currentMessage || context.message || null;

      if (typeof currentMessage?.react !== "function") {
        return {
          ok: false,
          emoji,
          error: "No current Discord message is available to react to.",
        };
      }

      try {
        await currentMessage.react(reactionValue);
        logger?.debug?.("[tools] add_reaction completed", {
          emoji,
          customEmojiId: customEmoji?.id || "",
          messageId: currentMessage.id || context.sourceMessageId || "",
          channelId: currentMessage.channelId || context.channelId || "",
          conversationId: context.conversationId || "",
        });

        return {
          ok: true,
          emoji,
          ...(customEmoji ? { customEmojiId: customEmoji.id } : {}),
          targetMessageId: currentMessage.id || context.sourceMessageId || "",
        };
      } catch (error) {
        logger?.warn?.("[tools] add_reaction failed", {
          emoji,
          customEmojiId: customEmoji?.id || "",
          messageId: currentMessage.id || context.sourceMessageId || "",
          channelId: currentMessage.channelId || context.channelId || "",
          conversationId: context.conversationId || "",
          error: error.message,
        });

        return {
          ok: false,
          emoji,
          error: "Discord rejected the reaction.",
        };
      }
    },
  };
}

module.exports = {
  createGiphySearchTool,
  createImageGenerationTool,
  createAudioGenerationTool,
  createAddReactionTool,
  shouldAllowAdditionalChatImageCall,
};
