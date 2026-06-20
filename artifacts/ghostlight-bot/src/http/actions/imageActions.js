const crypto = require("node:crypto");
const sharp = require("sharp");
const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const {
  uploadBufferToBucket,
  deleteObjectFromBucket,
  hasStorageConfig,
} = require("../../images/bucketStorage");

const SUPPORTED_REFERENCE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_DIMENSION = 1536;

function buildPresetReferenceStorageKey({ userScope, presetId, mimeType }) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  return [
    "image-preset-references",
    String(userScope || "user").replace(/[^\w-]+/g, "-") || "user",
    `${presetId}.${extension}`,
  ].join("/");
}

async function normalizeUploadedReferenceImage(file) {
  if (!file?.filename) {
    return null;
  }

  const mimeType = String(file.mimeType || "").trim().toLowerCase();

  if (!SUPPORTED_REFERENCE_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Reference images must be PNG, JPEG, or WebP.");
  }

  const contentBuffer = Buffer.isBuffer(file.contentBuffer)
    ? file.contentBuffer
    : Buffer.from(String(file.content || ""), "binary");

  if (!contentBuffer.length) {
    return null;
  }

  if (contentBuffer.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("Reference image is too large. Keep it under 8MB.");
  }

  const pipeline = sharp(contentBuffer, { failOn: "none" })
    .rotate()
    .resize(MAX_REFERENCE_IMAGE_DIMENSION, MAX_REFERENCE_IMAGE_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    });

  const metadata = await pipeline.metadata();
  const hasAlpha = Boolean(metadata?.hasAlpha);
  const normalizedMimeType = hasAlpha ? "image/png" : "image/jpeg";
  const normalizedBuffer = hasAlpha
    ? await pipeline.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    }).toBuffer()
    : await pipeline.jpeg({
      quality: 88,
      mozjpeg: true,
    }).toBuffer();

  const originalBaseName = String(file.filename || "").trim().replace(/\.[a-z0-9]+$/i, "") || "reference-image";
  const normalizedFilename = `${originalBaseName}.${normalizedMimeType === "image/png" ? "png" : "jpg"}`;

  return {
    filename: normalizedFilename,
    mimeType: normalizedMimeType,
    contentBuffer: normalizedBuffer,
  };
}

function getPresetStore(innerContext, kind) {
  if (kind === "style") {
    return innerContext.imageStylePresets;
  }

  if (kind === "appearance") {
    return innerContext.imageAppearancePresets;
  }

  throw new Error("Unknown image preset kind.");
}

function normalizeCustomTags(value) {
  return Array.from(new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)));
}

function normalizeImageIds(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  return Array.from(new Set(rawValues
    .flatMap((item) => String(item || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean)));
}

async function deleteGeneratedImage({ image, innerContext }) {
  if (image.storageKey && hasStorageConfig(innerContext.config)) {
    await deleteObjectFromBucket({
      config: innerContext.config,
      key: image.storageKey,
    });

    innerContext.logger.info("[images] Deleted image from bucket", {
      imageId: image.imageId,
      storageKey: image.storageKey,
    });
  }

  if (image.thumbnailStorageKey && hasStorageConfig(innerContext.config)) {
    await deleteObjectFromBucket({
      config: innerContext.config,
      key: image.thumbnailStorageKey,
    });

    innerContext.logger.info("[images] Deleted thumbnail from bucket", {
      imageId: image.imageId,
      thumbnailStorageKey: image.thumbnailStorageKey,
    });
  }

  await innerContext.generatedImages.updateImageRecord(image.imageId, {
    status: "deleted",
    deleted_at: new Date().toISOString(),
    thumbnail_storage_key: null,
  }, {
    userScope: innerContext.config.memory.userScope,
  });
}

async function handleImageActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/image-preset-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const kind = String(fields.kind || "").trim().toLowerCase();
      const store = getPresetStore(innerContext, kind);
      const presetId = String(fields.presetId || "").trim() || crypto.randomUUID();
      const existingPreset = presetId
        ? await store.getPresetById(presetId, {
          userScope: innerContext.config.memory.userScope,
        })
        : null;
      const shouldRemoveReferenceImage = fields.removeReferenceImage === "on";
      let referenceImageData = null;

      if (kind === "appearance") {
        const uploadedFile = files.referenceImage || null;
        const normalizedUpload = await normalizeUploadedReferenceImage(uploadedFile);

        if (normalizedUpload) {
          if (!hasStorageConfig(innerContext.config)) {
            throw new Error("Media storage is required before appearance reference images can be uploaded.");
          }

          const storageKey = buildPresetReferenceStorageKey({
            userScope: innerContext.config.memory.userScope,
            presetId,
            mimeType: normalizedUpload.mimeType,
          });

          await uploadBufferToBucket({
            config: innerContext.config,
            key: storageKey,
            body: normalizedUpload.contentBuffer,
            contentType: normalizedUpload.mimeType,
          });

          referenceImageData = {
            reference_image_storage_key: storageKey,
            reference_image_mime_type: normalizedUpload.mimeType,
            reference_image_file_size_bytes: normalizedUpload.contentBuffer.length,
            reference_image_original_filename: normalizedUpload.filename,
            reference_image_updated_at: new Date().toISOString(),
          };
        } else if (shouldRemoveReferenceImage) {
          referenceImageData = {
            reference_image_storage_key: null,
            reference_image_mime_type: null,
            reference_image_file_size_bytes: null,
            reference_image_original_filename: null,
            reference_image_updated_at: null,
          };
        } else if (existingPreset) {
          referenceImageData = {
            reference_image_storage_key: existingPreset.referenceImageStorageKey,
            reference_image_mime_type: existingPreset.referenceImageMimeType,
            reference_image_file_size_bytes: existingPreset.referenceImageFileSizeBytes,
            reference_image_original_filename: existingPreset.referenceImageOriginalFilename,
            reference_image_updated_at: existingPreset.referenceImageUpdatedAt,
          };
        }
      }

      const saved = await store.upsertPreset({
        preset_id: presetId,
        name: String(fields.name || "").trim(),
        prompt_text: String(fields.promptText || "").trim(),
        ...referenceImageData,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/tools/images",
          theme,
          message: `Saved ${kind} preset "${saved.name}".`,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/image-preset-archive") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const kind = String(fields.kind || "").trim().toLowerCase();
      const store = getPresetStore(innerContext, kind);
      const archived = fields.archived === "true";
      const saved = await store.archivePreset(String(fields.presetId || "").trim(), {
        userScope: innerContext.config.memory.userScope,
        archived,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/tools/images",
          theme,
          message: saved
            ? `${archived ? "Archived" : "Restored"} ${kind} preset "${saved.name}".`
            : "Nothing was updated.",
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/image-preset-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const kind = String(fields.kind || "").trim().toLowerCase();
      const store = getPresetStore(innerContext, kind);
      const deleted = await store.deletePreset(String(fields.presetId || "").trim(), {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/tools/images",
          theme,
          message: deleted
            ? `Deleted ${kind} preset "${deleted.name}".`
            : "Nothing was deleted.",
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/image-tags-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const imageId = String(fields.imageId || "").trim();
      const customTags = normalizeCustomTags(fields.customTags);
      const updated = await innerContext.generatedImages.updateImageRecord(imageId, {
        custom_tags: customTags,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      innerContext.logger.info("[images] Updated custom tags", {
        imageId,
        customTagCount: customTags.length,
        customTags,
        updated: Boolean(updated),
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/images",
          fallbackPath: "/admin/gallery/images",
          theme,
          message: updated ? "Saved image tags." : "Image not found.",
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/image-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const imageId = String(fields.imageId || "").trim();
      const image = await innerContext.generatedImages.getImageById(imageId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!image) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/gallery/images",
            fallbackPath: "/admin/gallery/images",
            theme,
            error: "That image could not be found.",
          }),
        }).end();
      }

      await deleteGeneratedImage({ image, innerContext });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/images",
          fallbackPath: "/admin/gallery/images",
          theme,
          message: "Deleted image from gallery and bucket storage.",
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/image-bulk-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const imageIds = normalizeImageIds(fields.imageId || fields.imageIds);
      const wantsJson = String(innerReq.headers.accept || "").toLowerCase().includes("application/json");

      if (!imageIds.length) {
        if (wantsJson) {
          return innerRes.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
          }).end(JSON.stringify({
            ok: false,
            error: "Select at least one image to delete.",
          }));
        }

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/gallery/images",
            fallbackPath: "/admin/gallery/images",
            theme,
            error: "Select at least one image to delete.",
          }),
        }).end();
      }

      const deletedImageIds = [];
      const missingImageIds = [];

      for (const imageId of imageIds) {
        const image = await innerContext.generatedImages.getImageById(imageId, {
          userScope: innerContext.config.memory.userScope,
        });

        if (!image) {
          missingImageIds.push(imageId);
          continue;
        }

        await deleteGeneratedImage({ image, innerContext });
        deletedImageIds.push(image.imageId);
      }

      innerContext.logger.info("[images] Bulk deleted images", {
        requestedCount: imageIds.length,
        deletedCount: deletedImageIds.length,
        missingCount: missingImageIds.length,
      });

      if (wantsJson) {
        return innerRes.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        }).end(JSON.stringify({
          ok: true,
          deletedImageIds,
          deletedCount: deletedImageIds.length,
          missingCount: missingImageIds.length,
          message: deletedImageIds.length === 1
            ? "Deleted 1 image."
            : `Deleted ${deletedImageIds.length} images.`,
        }));
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/images",
          fallbackPath: "/admin/gallery/images",
          theme,
          message: deletedImageIds.length === 1
            ? "Deleted 1 image."
            : `Deleted ${deletedImageIds.length} images.`,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/image-favorite-toggle") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const imageId = String(fields.imageId || "").trim();
      const wantsJson = String(innerReq.headers.accept || "").toLowerCase().includes("application/json");
      const image = await innerContext.generatedImages.getImageById(imageId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!image) {
        if (wantsJson) {
          return innerRes.writeHead(404, {
            "Content-Type": "application/json; charset=utf-8",
          }).end(JSON.stringify({
            ok: false,
            error: "That image could not be found.",
          }));
        }

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/gallery/images",
            fallbackPath: "/admin/gallery/images",
            theme,
            error: "That image could not be found.",
          }),
        }).end();
      }

      const updated = await innerContext.generatedImages.updateImageRecord(image.imageId, {
        is_favorite: !image.isFavorite,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      innerContext.logger.info("[images] Toggled favorite", {
        imageId: image.imageId,
        isFavorite: Boolean(updated?.isFavorite),
      });

      if (wantsJson) {
        return innerRes.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        }).end(JSON.stringify({
          ok: true,
          imageId: image.imageId,
          isFavorite: Boolean(updated?.isFavorite),
          message: updated?.isFavorite ? "Added to favourites." : "Removed from favourites.",
        }));
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/images",
          fallbackPath: "/admin/gallery/images",
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleImageActions,
};
