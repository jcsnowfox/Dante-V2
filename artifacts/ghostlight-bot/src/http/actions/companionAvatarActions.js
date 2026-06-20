const sharp = require("sharp");
const { parseRequestForm } = require("../adminRequestUtils");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");

const SUPPORTED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const AVATAR_DIMENSION = 256;
const AVATAR_SETTING_KEY = "chat.promptBlocks.personaAvatarUrl";

function redirect(innerRes, { returnTo, theme, message, error } = {}) {
  innerRes.writeHead(302, {
    Location: buildReturnLocation({
      returnTo,
      fallbackPath: "/admin/companion",
      theme,
      message: message || "",
      error: error || "",
    }),
  });
  innerRes.end();
}

async function processAvatarUpload(file) {
  if (!file?.filename) {
    return null;
  }

  const mimeType = String(file.mimeType || "").trim().toLowerCase();

  if (!SUPPORTED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new Error("Avatar must be PNG, JPEG, or WebP.");
  }

  const contentBuffer = Buffer.isBuffer(file.contentBuffer)
    ? file.contentBuffer
    : Buffer.from(String(file.content || ""), "binary");

  if (!contentBuffer.length) {
    return null;
  }

  if (contentBuffer.length > MAX_AVATAR_BYTES) {
    throw new Error("Avatar image is too large. Keep it under 8MB.");
  }

  const output = await sharp(contentBuffer, { failOn: "none" })
    .rotate()
    .resize(AVATAR_DIMENSION, AVATAR_DIMENSION, { fit: "cover", position: "centre" })
    .jpeg({ quality: 85 })
    .toBuffer();

  return `data:image/jpeg;base64,${output.toString("base64")}`;
}

async function handleCompanionAvatarActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/companion-avatar-upload") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = String(fields.returnTo || "/admin/companion");

      try {
        const file = files.avatarFile || null;
        const dataUrl = await processAvatarUpload(file);

        if (dataUrl) {
          const update = { [AVATAR_SETTING_KEY]: dataUrl };
          await innerContext.settingsStore.upsertSettings(update);
          applyRuntimeSettings(innerContext.config, update);
          return redirect(innerRes, { returnTo, theme, message: "Photo saved." });
        }

        return redirect(innerRes, { returnTo, theme });
      } catch (error) {
        innerContext.logger.warn("[admin] Companion avatar upload failed", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: error.message });
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/companion-avatar-remove") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = String(fields.returnTo || "/admin/companion");

      try {
        const update = { [AVATAR_SETTING_KEY]: "" };
        await innerContext.settingsStore.upsertSettings(update);
        applyRuntimeSettings(innerContext.config, update);
        return redirect(innerRes, { returnTo, theme, message: "Photo removed." });
      } catch (error) {
        innerContext.logger.warn("[admin] Companion avatar remove failed", { error: error.message });
        return redirect(innerRes, { returnTo, theme, error: error.message });
      }
    })(req, res, context);
  }

  return false;
}

module.exports = { handleCompanionAvatarActions };
