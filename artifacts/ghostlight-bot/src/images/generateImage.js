const crypto = require("node:crypto");
const sharp = require("sharp");
const {
  buildStorageKey,
  uploadBufferToBucket,
  buildPresignedBucketGetUrl,
  hasBucketConfig,
  hasStorageConfig,
} = require("./bucketStorage");

const DEFAULT_ALLOWED_ASPECT_RATIOS = Object.freeze(["1:1", "9:16", "16:9"]);
const GETIMG_DEFAULT_OUTPUT_FORMAT = "png";
const GETIMG_DEFAULT_NUMBER_OF_IMAGES = 1;
const MAX_REFERENCE_IMAGES = 8;
const THUMBNAIL_MIME_TYPE = "image/webp";
const THUMBNAIL_MAX_SIZE = 640;
const MODEL_RESOLUTION_SUPPORT = Object.freeze({
  "gemini-3-1-flash-image": ["1K", "2K", "4K"],
  "seedream-5-lite": ["2K", "3K"],
  "z-image-turbo": ["1K"],
  "seedream-4-5": ["2K", "4K"],
  "seedream-4": ["1K", "2K", "4K"],
});
// Models that do not support reference images via getimg.ai.
// When reference images are present and the primary model is in this list,
// the generation switches to config.imageGeneration.referenceModel if set.
const MODELS_WITHOUT_REFERENCE_SUPPORT = Object.freeze(new Set([
  "gemini-3-1-flash-image",
  "z-image-turbo",
]));

function getAllowedAspectRatios(config = {}) {
  const configured = Array.isArray(config.imageGeneration?.allowedAspectRatios)
    ? config.imageGeneration.allowedAspectRatios
    : [];
  const allowed = configured.filter((item) => DEFAULT_ALLOWED_ASPECT_RATIOS.includes(item));
  return allowed.length ? allowed : DEFAULT_ALLOWED_ASPECT_RATIOS.slice();
}

function buildComposedPrompt({
  prompt,
  stylePresets = [],
  appearancePresets = [],
}) {
  const parts = [];

  if (stylePresets.length) {
    parts.push(
      `Visual Style Direction:\n${stylePresets.map((preset) => `${preset.name}: ${preset.promptText}`).join("\n")}`,
    );
  }

  parts.push(String(prompt || "").trim());

  if (appearancePresets.length) {
    parts.push(
      `Appearance Details:\n${appearancePresets.map((preset) => `${preset.name}: ${preset.promptText}`).join("\n")}`,
    );
  }

  return parts.filter(Boolean).join("\n\n");
}

function inferAspectRatioFromPrompt(prompt, allowedAspectRatios = DEFAULT_ALLOWED_ASPECT_RATIOS) {
  const normalized = String(prompt || "").trim().toLowerCase();

  if (!normalized) {
    return allowedAspectRatios[0] || "1:1";
  }

  if (
    allowedAspectRatios.includes("9:16")
    && /\b(portrait|vertical|phone wallpaper|story format|full body portrait|tall)\b/i.test(normalized)
  ) {
    return "9:16";
  }

  if (
    allowedAspectRatios.includes("16:9")
    && /\b(landscape|horizontal|cinematic wide|wide shot|widescreen|banner)\b/i.test(normalized)
  ) {
    return "16:9";
  }

  return allowedAspectRatios[0] || "1:1";
}

function buildImageRequest({ model, prompt, aspectRatio }) {
  return buildImageRequestWithReferences({
    model,
    prompt,
    aspectRatio,
    resolution: "1K",
    referenceImages: [],
  });
}

function buildImageRequestWithReferences({ model, prompt, aspectRatio, resolution = "1K", referenceImages = [] }) {
  const request = {
    model,
    prompt,
    resolution,
    output_format: GETIMG_DEFAULT_OUTPUT_FORMAT,
    number_of_images: GETIMG_DEFAULT_NUMBER_OF_IMAGES,
  };

  if (aspectRatio) {
    request.aspect_ratio = aspectRatio;
  }

  if (referenceImages.length) {
    request.images = referenceImages.slice();
  }

  return request;
}

function shouldRetryWithoutReferenceImages({ status, errorText = "", requestPayload = {} }) {
  const normalizedStatus = Number(status || 0);

  if (!normalizedStatus) {
    return false;
  }

  if (!Array.isArray(requestPayload.images) || !requestPayload.images.length) {
    return false;
  }

  const normalizedErrorText = String(errorText || "");

  if (normalizedStatus === 400) {
    return /reference role ['"]reference_image['"] is not supported for this model/i.test(normalizedErrorText);
  }

  if (normalizedStatus >= 500 && normalizedStatus < 600) {
    return /something went wrong on our end|server_error/i.test(normalizedErrorText);
  }

  return false;
}

function safeParseGetimgErrorPayload(errorText = "") {
  const trimmed = String(errorText || "").trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

function formatGetimgRequestError({ status, errorText = "" }) {
  const payload = safeParseGetimgErrorPayload(errorText);
  const message = String(payload?.error?.message || payload?.message || "").trim();
  const code = String(payload?.error?.code || payload?.code || "").trim();
  const docsUrl = String(payload?.error?.doc_url || payload?.doc_url || "").trim();
  const statusLabel = Number(status || 0) ? `status ${status}` : "an unknown status";

  if (message) {
    const suffixParts = [
      code ? `code: ${code}` : "",
      docsUrl ? `docs: ${docsUrl}` : "",
    ].filter(Boolean);
    const suffix = suffixParts.length ? ` (${suffixParts.join("; ")})` : "";

    return `getimg.ai request failed with ${statusLabel}: ${message}${suffix}`;
  }

  return `getimg.ai request failed with ${statusLabel}: ${String(errorText || "").slice(0, 300)}`;
}

function summarizeImageResponse(response) {
  const candidates = [
    ...(Array.isArray(response?.data) ? response.data : []),
    ...(Array.isArray(response?.images) ? response.images : []),
  ];

  return {
    imageCount: candidates.length,
    hasDownloadUrl: Boolean(candidates.find((item) => typeof item?.url === "string" && item.url)),
  };
}

function canGenerateImages(config = {}) {
  return Boolean(
    config.imageGeneration?.enabled
    && String(config.getimg?.apiKey || "").trim()
    && hasStorageConfig(config)
    && String(config.imageGeneration?.model || "").trim(),
  );
}

function resolveImageGenerationModel(config = {}) {
  return String(config.imageGeneration?.model || "").trim();
}

function resolveEffectiveModel(config = {}, { hasReferenceImages = false } = {}) {
  const primaryModel = resolveImageGenerationModel(config);
  if (!hasReferenceImages) return primaryModel;
  if (!MODELS_WITHOUT_REFERENCE_SUPPORT.has(primaryModel)) return primaryModel;
  const referenceModel = String(config.imageGeneration?.referenceModel || "").trim();
  return referenceModel || primaryModel;
}

function primaryModelSupportsReferences(config = {}) {
  const model = resolveImageGenerationModel(config);
  return !MODELS_WITHOUT_REFERENCE_SUPPORT.has(model);
}

function resolveSupportedResolution({ model, requestedResolution = "1K" }) {
  const normalizedModel = String(model || "").trim();
  const normalizedRequestedResolution = String(requestedResolution || "1K").trim().toUpperCase() || "1K";
  const supportedResolutions = MODEL_RESOLUTION_SUPPORT[normalizedModel];

  if (!Array.isArray(supportedResolutions) || !supportedResolutions.length) {
    return normalizedRequestedResolution;
  }

  if (supportedResolutions.includes(normalizedRequestedResolution)) {
    return normalizedRequestedResolution;
  }

  return supportedResolutions[0];
}

function resolveGetimgBaseUrl(config = {}) {
  return String(config.getimg?.baseURL || "https://api.getimg.ai").trim().replace(/\/+$/g, "");
}

function extractGeneratedImageUrl(response) {
  const candidates = [
    ...(Array.isArray(response?.data) ? response.data : []),
    ...(Array.isArray(response?.images) ? response.images : []),
  ];

  if (typeof response?.url === "string" && response.url.trim()) {
    return response.url.trim();
  }

  if (typeof response?.image?.url === "string" && response.image.url.trim()) {
    return response.image.url.trim();
  }

  for (const candidate of candidates) {
    if (typeof candidate?.url === "string" && candidate.url.trim()) {
      return candidate.url.trim();
    }
  }

  throw new Error("Image generation response did not include a downloadable image URL.");
}

function resolveMimeTypeFromResponse(response, downloadResponse) {
  const candidates = [
    response?.mime_type,
    response?.mimeType,
    response?.image?.mime_type,
    response?.image?.mimeType,
    ...(Array.isArray(response?.data) ? response.data.flatMap((item) => [item?.mime_type, item?.mimeType]) : []),
    ...(Array.isArray(response?.images) ? response.images.flatMap((item) => [item?.mime_type, item?.mimeType]) : []),
    downloadResponse?.headers?.get?.("content-type"),
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim());
  return String(found || "image/png").split(";")[0].trim().toLowerCase() || "image/png";
}

async function createThumbnailBuffer(imageBuffer) {
  return sharp(imageBuffer)
    .rotate()
    .resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 4,
    })
    .toBuffer();
}

async function loadReferenceImagesFromAppearancePresets({
  appearancePresets = [],
  config,
  logger,
}) {
  const presetsWithReferences = appearancePresets.filter((preset) => preset?.referenceImageStorageKey && preset?.referenceImageMimeType);

  if (!presetsWithReferences.length) {
    return [];
  }

  // Reference images are passed to the getimg API as publicly-fetchable URLs.
  // Local filesystem storage can only serve auth-protected relative URLs, so
  // skip reference images when no bucket is configured (generation still runs).
  if (!hasBucketConfig(config)) {
    logger?.debug?.("[images] Skipping appearance reference images: no bucket configured (local storage cannot serve public URLs to getimg)");
    return [];
  }

  const selectedPresets = presetsWithReferences.slice(0, MAX_REFERENCE_IMAGES);

  if (presetsWithReferences.length > MAX_REFERENCE_IMAGES) {
    logger.debug?.("[images] Appearance preset reference image count exceeded limit; truncating", {
      totalPresetIds: presetsWithReferences.map((preset) => preset.presetId),
      usedPresetIds: selectedPresets.map((preset) => preset.presetId),
      maxReferenceImages: MAX_REFERENCE_IMAGES,
    });
  }

  return selectedPresets.map((preset) => ({
    url: buildPresignedBucketGetUrl({
      config,
      key: preset.referenceImageStorageKey,
    }),
    role: "reference_image",
  }));
}

function createImageGenerationService({
  config,
  logger,
  generatedImages,
  fetchImpl = globalThis.fetch,
  createThumbnail = createThumbnailBuffer,
}) {
  return {
    canGenerate() {
      return canGenerateImages(config);
    },

    getAllowedAspectRatios() {
      return getAllowedAspectRatios(config);
    },

    async generate({
      prompt,
      aspectRatio,
      stylePresets = [],
      appearancePresets = [],
      context = {},
    }) {
      if (!config.imageGeneration?.enabled) {
        throw new Error("Image generation is disabled.");
      }

      const primaryModel = resolveImageGenerationModel(config);

      if (!primaryModel) {
        throw new Error("No image generation model is configured.");
      }

      if (!hasStorageConfig(config)) {
        throw new Error("Media storage is not configured.");
      }

      const allowedAspectRatios = getAllowedAspectRatios(config);
      const inferredAspectRatio = inferAspectRatioFromPrompt(prompt, allowedAspectRatios);
      const selectedAspectRatio = aspectRatio && allowedAspectRatios.includes(aspectRatio)
        ? aspectRatio
        : inferredAspectRatio;
      const composedPrompt = buildComposedPrompt({
        prompt,
        stylePresets,
        appearancePresets,
      });
      if (typeof fetchImpl !== "function") {
        throw new Error("A fetch implementation is required for image generation.");
      }

      const apiKey = String(config.getimg?.apiKey || "").trim();

      if (!apiKey) {
        throw new Error("getimg.ai credentials are not configured.");
      }

      // Load reference images from appearance presets early so we can pick the
      // correct model before building the request payload.
      const referenceImages = await loadReferenceImagesFromAppearancePresets({
        appearancePresets,
        config,
        logger,
      });

      // If the primary model doesn't support reference images and a reference
      // model is configured, switch to it for this generation.
      const model = resolveEffectiveModel(config, { hasReferenceImages: referenceImages.length > 0 });
      if (model !== primaryModel && referenceImages.length > 0) {
        logger.info?.("[images] Switching to reference-capable model for appearance presets", {
          primaryModel,
          referenceModel: model,
          referenceImageCount: referenceImages.length,
          appearancePresetNames: appearancePresets.map((preset) => preset.name),
        });
      } else if (MODELS_WITHOUT_REFERENCE_SUPPORT.has(primaryModel) && referenceImages.length > 0 && model === primaryModel) {
        // Primary model doesn't support references and no reference model configured — skip refs.
        logger.warn?.("[images] Primary model does not support reference images and no referenceModel configured; generating without references. Set IMAGE_GENERATION_REFERENCE_MODEL (e.g. seedream-4-5) to enable identity photos.", {
          model: primaryModel,
          appearancePresetNames: appearancePresets.map((preset) => preset.name),
        });
        referenceImages.length = 0;
      }

      // Only warn users when references were unexpectedly dropped (API rejection retry).
      // Proactive skips for models that don't support references are expected and silent.
      let skippedReferenceImages = false;

      logger.debug?.("[images] Generating image", {
        model,
        primaryModel,
        requestedAspectRatio: aspectRatio || null,
        inferredAspectRatio,
        aspectRatio: selectedAspectRatio,
        allowedAspectRatios,
        sourceSurface: context.sourceSurface || "chat",
        promptLength: prompt.length,
        composedPromptLength: composedPrompt.length,
        stylePresetNames: stylePresets.map((preset) => preset.name),
        appearancePresetNames: appearancePresets.map((preset) => preset.name),
        referenceImageCount: referenceImages.length,
      });

      const requestPayload = buildImageRequestWithReferences({
        model,
        prompt: composedPrompt,
        aspectRatio: selectedAspectRatio,
        resolution: resolveSupportedResolution({
          model,
          requestedResolution: String(config.imageGeneration?.resolution || "1K").trim().toUpperCase(),
        }),
        referenceImages,
      });

      logger.debug?.("[images] Image request payload", {
        model: requestPayload.model,
        aspectRatio: requestPayload.aspect_ratio || null,
        resolution: requestPayload.resolution || null,
        numberOfImages: requestPayload.number_of_images,
        outputFormat: requestPayload.output_format,
        referenceImageCount: Array.isArray(requestPayload.images) ? requestPayload.images.length : 0,
      });
      const requestHeaders = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      const requestUrl = `${resolveGetimgBaseUrl(config)}/v2/images/generations`;
      let effectiveRequestPayload = requestPayload;
      let response = await fetchImpl(requestUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(effectiveRequestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (shouldRetryWithoutReferenceImages({
          status: response.status,
          errorText,
          requestPayload: effectiveRequestPayload,
        })) {
          logger.warn?.("[images] Model rejected reference images; retrying without them", {
            model,
            status: response.status,
            referenceImageCount: Array.isArray(effectiveRequestPayload.images) ? effectiveRequestPayload.images.length : 0,
          });

          effectiveRequestPayload = buildImageRequestWithReferences({
            model,
            prompt: composedPrompt,
            aspectRatio: selectedAspectRatio,
            resolution: requestPayload.resolution,
            referenceImages: [],
          });
          skippedReferenceImages = true;

          logger.debug?.("[images] Image request payload retry", {
            model: effectiveRequestPayload.model,
            aspectRatio: effectiveRequestPayload.aspect_ratio || null,
            resolution: effectiveRequestPayload.resolution || null,
            numberOfImages: effectiveRequestPayload.number_of_images,
            outputFormat: effectiveRequestPayload.output_format,
            referenceImageCount: 0,
          });

          response = await fetchImpl(requestUrl, {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(effectiveRequestPayload),
          });

          if (!response.ok) {
            const retryErrorText = await response.text();
            throw new Error(formatGetimgRequestError({
              status: response.status,
              errorText: retryErrorText,
            }));
          }
        } else {
          throw new Error(formatGetimgRequestError({
            status: response.status,
            errorText,
          }));
        }
      }

      const responsePayload = await response.json();

      logger.debug?.("[images] Image generation response received", {
        model,
        ...summarizeImageResponse(responsePayload),
      });

      const generatedImageUrl = extractGeneratedImageUrl(responsePayload);
      const downloadResponse = await fetchImpl(generatedImageUrl);

      if (!downloadResponse.ok) {
        throw new Error(`Generated image download failed with status ${downloadResponse.status}.`);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const imagePayload = {
        buffer: Buffer.from(arrayBuffer),
        mimeType: resolveMimeTypeFromResponse(responsePayload, downloadResponse),
      };
      const imageId = context.imageId || crypto.randomUUID();
      const storageKey = buildStorageKey({
        prefix: config.imageGeneration?.bucketPrefix,
        userScope: context.userScope || config.memory?.userScope || "user",
        imageId,
        mimeType: imagePayload.mimeType,
      });
      const thumbnailStorageKey = buildStorageKey({
        prefix: `${config.imageGeneration?.bucketPrefix || "generated-images"}-thumbnails`,
        userScope: context.userScope || config.memory?.userScope || "user",
        imageId,
        mimeType: THUMBNAIL_MIME_TYPE,
      });

      await uploadBufferToBucket({
        config,
        key: storageKey,
        body: imagePayload.buffer,
        contentType: imagePayload.mimeType,
        fetchImpl,
      });

      let savedThumbnailStorageKey = null;
      try {
        const thumbnailBuffer = await createThumbnail(imagePayload.buffer);
        await uploadBufferToBucket({
          config,
          key: thumbnailStorageKey,
          body: thumbnailBuffer,
          contentType: THUMBNAIL_MIME_TYPE,
          fetchImpl,
        });
        savedThumbnailStorageKey = thumbnailStorageKey;
      } catch (error) {
        logger.warn?.("[images] Thumbnail generation failed; falling back to original image previews", {
          imageId,
          error: error?.message || String(error),
        });
      }

      const record = await generatedImages.recordImage({
        imageId,
        userScope: context.userScope,
        sourceSurface: context.sourceSurface || "chat",
        conversationId: context.conversationId || null,
        channelId: context.channelId || null,
        prompt,
        composedPrompt,
        stylePresetIds: stylePresets.map((preset) => preset.presetId),
        appearancePresetIds: appearancePresets.map((preset) => preset.presetId),
        model,
        aspectRatio: selectedAspectRatio,
        mimeType: imagePayload.mimeType,
        fileSizeBytes: imagePayload.buffer.length,
        storageKey,
        thumbnailStorageKey: savedThumbnailStorageKey,
        status: "completed",
      }, {
        userScope: context.userScope,
      });

      return {
        image: {
          imageId: record.imageId,
          mimeType: imagePayload.mimeType,
          fileSizeBytes: imagePayload.buffer.length,
          storageKey,
          aspectRatio: selectedAspectRatio,
          model,
        },
        file: {
          attachment: imagePayload.buffer,
          name: storageKey.split("/").pop() || `${record.imageId}.png`,
        },
        record,
        composedPrompt,
        warning: skippedReferenceImages
          ? "Identity reference photos were available but could not be used — the image was generated using appearance text description only. To enable reference-photo identity locking, set IMAGE_GENERATION_REFERENCE_MODEL (e.g. seedream-4-5) in the bot's environment."
          : "",
        skippedReferenceImages,
      };
    },
  };
}

module.exports = {
  DEFAULT_ALLOWED_ASPECT_RATIOS,
  getAllowedAspectRatios,
  buildImageRequest,
  buildImageRequestWithReferences,
  buildComposedPrompt,
  inferAspectRatioFromPrompt,
  summarizeImageResponse,
  canGenerateImages,
  formatGetimgRequestError,
  createThumbnailBuffer,
  createImageGenerationService,
  extractGeneratedImageUrl,
  resolveImageGenerationModel,
  resolveEffectiveModel,
  primaryModelSupportsReferences,
  MODELS_WITHOUT_REFERENCE_SUPPORT,
  resolveSupportedResolution,
  loadReferenceImagesFromAppearancePresets,
  MAX_REFERENCE_IMAGES,
};
