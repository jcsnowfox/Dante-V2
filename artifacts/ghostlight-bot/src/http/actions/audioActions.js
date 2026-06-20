const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const { deleteObjectFromBucket, hasStorageConfig } = require("../../images/bucketStorage");

function normalizeCustomTags(value) {
  return Array.from(new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)));
}

function normalizeAudioIds(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  return Array.from(new Set(rawValues
    .flatMap((item) => String(item || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean)));
}

async function deleteGeneratedAudio({ audio, innerContext }) {
  if (audio.storageKey && audio.status === "completed" && hasStorageConfig(innerContext.config)) {
    await deleteObjectFromBucket({
      config: innerContext.config,
      key: audio.storageKey,
    });
  }

  await innerContext.generatedAudio.updateAudioRecord(audio.audioId, {
    status: "deleted",
    deleted_at: new Date().toISOString(),
  }, {
    userScope: innerContext.config.memory.userScope,
  });
}

async function handleAudioActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/audio-tags-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const audioId = String(fields.audioId || "").trim();
      const customTags = normalizeCustomTags(fields.customTags);
      const updated = await innerContext.generatedAudio.updateAudioRecord(audioId, {
        custom_tags: customTags,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/audio",
          fallbackPath: "/admin/gallery/audio",
          theme,
          message: updated ? "Saved audio tags." : "Audio clip not found.",
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/audio-favorite-toggle") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const audioId = String(fields.audioId || "").trim();
      const wantsJson = String(innerReq.headers.accept || "").toLowerCase().includes("application/json");
      const audio = await innerContext.generatedAudio.getAudioById(audioId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!audio) {
        if (wantsJson) {
          return innerRes.writeHead(404, {
            "Content-Type": "application/json; charset=utf-8",
          }).end(JSON.stringify({
            ok: false,
            error: "That audio clip could not be found.",
          }));
        }

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/gallery/audio",
            fallbackPath: "/admin/gallery/audio",
            theme,
            error: "That audio clip could not be found.",
          }),
        }).end();
      }

      const updated = await innerContext.generatedAudio.updateAudioRecord(audio.audioId, {
        is_favorite: !audio.isFavorite,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      if (wantsJson) {
        return innerRes.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        }).end(JSON.stringify({
          ok: true,
          audioId: audio.audioId,
          isFavorite: Boolean(updated?.isFavorite),
          message: updated?.isFavorite ? "Added to favourites." : "Removed from favourites.",
        }));
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/audio",
          fallbackPath: "/admin/gallery/audio",
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/audio-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const audioId = String(fields.audioId || "").trim();
      const audio = await innerContext.generatedAudio.getAudioById(audioId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!audio) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/gallery/audio",
            fallbackPath: "/admin/gallery/audio",
            theme,
            error: "That audio clip could not be found.",
          }),
        }).end();
      }

      await deleteGeneratedAudio({ audio, innerContext });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/audio",
          fallbackPath: "/admin/gallery/audio",
          theme,
          message: "Deleted audio from gallery and bucket storage.",
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/audio-bulk-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const audioIds = normalizeAudioIds(fields.audioId || fields.audioIds);
      const wantsJson = String(innerReq.headers.accept || "").toLowerCase().includes("application/json");

      if (!audioIds.length) {
        if (wantsJson) {
          return innerRes.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
          }).end(JSON.stringify({
            ok: false,
            error: "Select at least one audio clip to delete.",
          }));
        }

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/gallery/audio",
            fallbackPath: "/admin/gallery/audio",
            theme,
            error: "Select at least one audio clip to delete.",
          }),
        }).end();
      }

      const deletedAudioIds = [];
      const missingAudioIds = [];

      for (const audioId of audioIds) {
        const audio = await innerContext.generatedAudio.getAudioById(audioId, {
          userScope: innerContext.config.memory.userScope,
        });

        if (!audio) {
          missingAudioIds.push(audioId);
          continue;
        }

        await deleteGeneratedAudio({ audio, innerContext });
        deletedAudioIds.push(audio.audioId);
      }

      innerContext.logger.info("[audio] Bulk deleted audio clips", {
        requestedCount: audioIds.length,
        deletedCount: deletedAudioIds.length,
        missingCount: missingAudioIds.length,
      });

      if (wantsJson) {
        return innerRes.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        }).end(JSON.stringify({
          ok: true,
          deletedAudioIds,
          deletedCount: deletedAudioIds.length,
          missingCount: missingAudioIds.length,
          message: deletedAudioIds.length === 1
            ? "Deleted 1 audio clip."
            : `Deleted ${deletedAudioIds.length} audio clips.`,
        }));
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/gallery/audio",
          fallbackPath: "/admin/gallery/audio",
          theme,
          message: deletedAudioIds.length === 1
            ? "Deleted 1 audio clip."
            : `Deleted ${deletedAudioIds.length} audio clips.`,
        }),
      }).end();
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleAudioActions,
  normalizeAudioIds,
};
