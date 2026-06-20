const { buildPresignedBucketGetUrl } = require("../images/bucketStorage");

function isDiscordEntityTooLargeError(error) {
  return Number(error?.code) === 40005 || Number(error?.status) === 413;
}

async function buildGeneratedImageFallbackUrls({ generatedImageIds = [], generatedImages, config }) {
  if (!generatedImages?.getImageById || !Array.isArray(generatedImageIds) || !generatedImageIds.length) {
    return [];
  }

  const urls = [];

  for (const imageId of generatedImageIds) {
    try {
      const image = await generatedImages.getImageById(imageId, {
        userScope: config.memory?.userScope,
      });

      if (!image?.storageKey) {
        continue;
      }

      urls.push(buildPresignedBucketGetUrl({
        config,
        key: image.storageKey,
      }));
    } catch (_error) {
      continue;
    }
  }

  return Array.from(new Set(urls));
}

function buildOversizeFallbackContent({ content = "", urls = [], imageWarnings = [] }) {
  const parts = [];
  const normalizedContent = String(content || "").trim();

  if (normalizedContent) {
    parts.push(normalizedContent);
  }

  if (Array.isArray(imageWarnings) && imageWarnings.length) {
    parts.push(imageWarnings.join("\n"));
  }

  if (urls.length) {
    parts.push([
      "The image was too large to attach in Discord, so I've linked the saved version instead:",
      ...urls,
    ].join("\n"));
  } else {
    parts.push("The image was too large to attach in Discord, but it was still generated and saved in the gallery.");
  }

  return parts.filter(Boolean).join("\n\n");
}

module.exports = {
  isDiscordEntityTooLargeError,
  buildGeneratedImageFallbackUrls,
  buildOversizeFallbackContent,
};
