const fs = require("node:fs/promises");
const http = require("http");
const path = require("node:path");
const { buildGeneratedWeeklyMemoryRecord, generateWeeklyArtifacts } = require("../memory/summaryIngestion");
const { stageDailySummaryArtifacts, stageImportedSummaryArtifacts } = require("../memory/stageSummaryArtifacts");
const { promoteApprovedGeneratedMemories } = require("../memory/promoteGeneratedMemories");
const { deleteMemoryEverywhere } = require("../memory/deleteMemories");
const { syncMemoriesToQdrant, syncMemoryToQdrant } = require("../memory/syncMemories");
const { deleteCollection, deletePoints } = require("../memory/qdrantClient");
const { applyRuntimeSettings } = require("../config/runtimeSettings");
const { downloadBufferFromBucket } = require("../images/bucketStorage");
const {
  SUPPORTED_HEARTBEAT_EXECUTOR_TYPES,
  SUPPORTED_HEARTBEAT_FREQUENCIES,
} = require("../storage");
const { registerDiscordCommands } = require("../bot/registerCommands");
const {
  handleAdminPageRequest,
  handleGeneratedDetailRequest,
  normalizeImageGalleryQueryState,
  buildGeneratedImageTags,
} = require("./adminPageHandlers");
const { handleMemoryActions } = require("./actions/memoryActions");
const { handleImageActions } = require("./actions/imageActions");
const { handleAudioActions } = require("./actions/audioActions");
const { handleMusicActions } = require("./actions/musicActions");
const { handleAutomationActions } = require("./actions/automationActions");
const { handleHeartbeatActions } = require("./actions/heartbeatActions");
const { handleChannelModeActions } = require("./actions/channelModeActions");
const { handleEmotionalArcActions } = require("./actions/emotionalArcActions");
const { handleFeedbackLearningActions } = require("./actions/feedbackLearningActions");
const { handleRelationalStateActions } = require("./actions/relationalStateActions");
const { handleInnerLifeActions } = require("./actions/innerLifeActions");
const { handleContinuityActions } = require("./actions/continuityActions");
const { handleCompanionAvatarActions } = require("./actions/companionAvatarActions");
const { handleAdminMaintenanceActions } = require("./actions/adminMaintenanceActions");
const { handleAdminExportActions } = require("./actions/adminExportActions");
const { handleSecondLifeApiRequest } = require("./secondLifeApi");
const { handleSecondLifeActions } = require("./actions/secondLifeActions");
const {
  buildMemoryExportPayload,
  buildMemoryImportRecords,
  buildAppStateExportPayload,
  buildAppStateImportRecords,
  buildProactiveActionPackPayload,
  buildProactiveActionPackFilename,
  buildProactiveActionPackImportRecords,
  buildProactiveActionImportSummary,
  normalizeSelectedActionIds,
  buildImageExportFilename,
  buildConversationEventsCsv,
  buildConversationLogFilename,
  buildConversationLogIndexCsv,
} = require("./adminDataExchange");
const {
  parseBasicAuthHeader,
  parseMultipartFormData,
  parseRequestForm,
  isAuthorized,
  sendAuthRequired,
  redirect,
  validateAdminCredentials,
  issueSessionCookie,
  clearSessionCookie,
  prefersHtml,
} = require("./adminRequestUtils");
const { renderLoginPage, sanitizeNext } = require("./renderAdminPages/loginPage");
const {
  normalizeTheme,
  buildThemeLinks,
  buildAdminLocation,
  buildReturnLocation,
  getMessage,
  getError,
  renderEntryPage,
  renderGeneratedMemoryDetailPage,
  renderAdminShell,
  renderMemoryLayout,
  buildAdminPageHelpers,
  renderAdminWorkspacePage,
} = require("./adminRenderHelpers");
const {
  buildImportRecordFromForm,
  buildWeeklyImportSourcesFromForm,
  parseMemoryForm,
  parseSettingsForm,
  parseDailyThreadSettingsForm,
  parseHeartbeatSettingsForm,
  sortMemories,
} = require("./adminFormParsers");
const ASSET_CONTENT_TYPES = Object.freeze({
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
});
const THEME_COOKIE_NAME = "ghostlight_theme";

function parseCookieHeader(headerValue) {
  const cookies = {};
  const raw = String(headerValue || "").trim();

  if (!raw) {
    return cookies;
  }

  for (const part of raw.split(";")) {
    const segment = part.trim();

    if (!segment) {
      continue;
    }

    const separatorIndex = segment.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function resolveRequestTheme({ url, req }) {
  const explicitTheme = url.searchParams.get("theme");

  if (explicitTheme) {
    return normalizeTheme(explicitTheme);
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  return normalizeTheme(cookies[THEME_COOKIE_NAME]);
}

function setThemeCookie(res, theme) {
  res.setHeader("Set-Cookie", `${THEME_COOKIE_NAME}=${encodeURIComponent(normalizeTheme(theme))}; Path=/; Max-Age=31536000; SameSite=Lax`);
}

function buildHealthPayload(context = {}) {
  const licenseRuntime = context.licenseRuntime || {};

  return {
    ok: true,
    ready: Boolean(context.ready),
    adminReady: Boolean(context.ready),
    service: "finnterface",
    transport: "discord",
    licensing: {
      status: String(licenseRuntime.status || "unknown").trim() || "unknown",
      valid: Boolean(licenseRuntime.canRunBot),
      usingGrace: Boolean(licenseRuntime.graceActive),
      cacheUsed: Boolean(licenseRuntime.cacheUsed),
    },
    botReady: Boolean(context.ready && context.config?.discord?.token && licenseRuntime.canRunBot),
  };
}

function getAssetPath(assetPathname) {
  const relativePath = String(assetPathname || "")
    .replace(/^\/+/, "")
    .replace(/^assets\/?/, "");
  const normalizedPath = path.normalize(relativePath);

  if (!normalizedPath || normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
    return null;
  }

  return path.join(process.cwd(), "assets", normalizedPath);
}

function withAdmin(handler) {
  return async (req, res, context) => {
    const hasLegacySecret = Boolean(String(context.config.admin?.secret || "").trim());
    const hasUsernamePassword = Boolean(
      String(context.config.admin?.username || "").trim()
      && String(context.config.admin?.password || ""),
    );

    if (!hasLegacySecret && !hasUsernamePassword) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("ADMIN_USERNAME and ADMIN_PASSWORD are required to use the admin interface. ADMIN_SECRET is still supported as a legacy fallback.");
      return;
    }

    if (!isAuthorized(req, context.config.admin || {})) {
      // Browser navigations get the cinematic login page; API/tooling keeps Basic Auth.
      if (prefersHtml(req)) {
        const requestUrl = new URL(req.url, "http://localhost");
        const next = sanitizeNext(requestUrl.pathname + requestUrl.search);
        redirect(res, `/admin/login?next=${encodeURIComponent(next)}`);
        return;
      }
      sendAuthRequired(res);
      return;
    }

    if (!context.ready) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Ghostlight is still starting up. Try again in a moment.");
      return;
    }

    try {
      await handler(req, res, context);
    } catch (error) {
      context.logger.error("[admin] Request failed", {
        message: error.message,
      });

      if (res.headersSent) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      const requestUrl = new URL(req.url, "http://localhost");
      const target = requestUrl.pathname.startsWith("/admin/generated/")
        ? requestUrl.pathname
        : "/admin";
      redirect(res, `${target}?error=${encodeURIComponent(error.message)}`);
    }
  };
}

function createHealthServer({
  port,
  logger,
  appContext,
}) {
  const context = appContext;

  const server = http.createServer((req, res) => {
    Promise.resolve().then(async () => {
      const url = new URL(req.url, "http://localhost");
      const resolvedTheme = resolveRequestTheme({ url, req });

      if (!url.searchParams.get("theme")) {
        url.searchParams.set("theme", resolvedTheme);
      }

      if (req.method === "GET" && url.pathname === "/") {
        const theme = normalizeTheme(url.searchParams.get("theme"));
        const body = renderEntryPage({
          ready: Boolean(context.ready),
          theme,
        });
        setThemeCookie(res, theme);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(body);
        return;
      }

      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(buildHealthPayload(context)));
        return;
      }

      if (url.pathname === "/admin/login") {
        const adminConfig = context.config.admin || {};
        const hasCreds = Boolean(
          (String(adminConfig.username || "").trim() && String(adminConfig.password || ""))
          || String(adminConfig.secret || "").trim(),
        );

        if (req.method === "GET") {
          if (hasCreds && isAuthorized(req, adminConfig)) {
            redirect(res, sanitizeNext(url.searchParams.get("next")));
            return;
          }
          const error = hasCreds ? getError(url.searchParams.get("error")) : "Admin credentials are not configured on the server yet.";
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage({ error, next: url.searchParams.get("next") || "/admin" }));
          return;
        }

        if (req.method === "POST") {
          const { fields } = await parseRequestForm(req);
          const next = sanitizeNext(fields.next);

          if (hasCreds && validateAdminCredentials(adminConfig, fields.username, fields.password)) {
            issueSessionCookie(res, adminConfig);
            redirect(res, next);
            return;
          }

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage({
            error: hasCreds ? "Incorrect username or password." : "Admin credentials are not configured on the server yet.",
            next,
            username: typeof fields.username === "string" ? fields.username : "",
          }));
          return;
        }
      }

      if (req.method === "GET" && url.pathname === "/admin/logout") {
        clearSessionCookie(res);
        redirect(res, "/admin/login");
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/admin/staged/")) {
        const generatedPath = url.pathname.replace("/admin/staged/", "/admin/generated/");
        redirect(res, buildAdminLocation({ path: generatedPath, theme: url.searchParams.get("theme") }));
        return;
      }

      {
        const handled = await handleAdminExportActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
        const assetRelativePath = url.pathname.slice("/assets/".length);
        const assetPath = getAssetPath(assetRelativePath);

        if (!assetPath) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Asset not found.");
          return;
        }

        try {
          const content = await fs.readFile(assetPath);
          const contentType = ASSET_CONTENT_TYPES[path.extname(assetRelativePath).toLowerCase()] || "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "no-store",
          });
          res.end(content);
        } catch (_error) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Asset not found.");
        }
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/admin/media/")) {
        return withAdmin(async (_req, innerRes, innerContext) => {
          const encodedKey = url.pathname.slice("/admin/media/".length);
          const key = encodedKey
            .split("/")
            .map((segment) => decodeURIComponent(segment))
            .join("/");
          try {
            const { buffer, mimeType } = await downloadBufferFromBucket({
              config: innerContext.config,
              key,
            });
            innerRes.writeHead(200, {
              "Content-Type": mimeType || "application/octet-stream",
              "Cache-Control": "no-store",
            });
            innerRes.end(buffer);
          } catch (_error) {
            innerRes.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            innerRes.end("Media not found.");
          }
        })(req, res, context);
      }

      if (req.method === "GET" && (
        url.pathname === "/admin" ||
        url.pathname === "/admin/home" ||
        url.pathname === "/admin/companion" ||
        url.pathname === "/admin/behaviour" ||
        url.pathname === "/admin/emotional-arc" ||
        url.pathname === "/admin/feedback-learning" ||
        url.pathname === "/admin/relational-state" ||
        url.pathname === "/admin/second-life" ||
        url.pathname === "/admin/gallery" ||
        url.pathname === "/admin/gallery/images" ||
        url.pathname.startsWith("/admin/gallery/images/detail/") ||
        url.pathname === "/admin/gallery/audio" ||
        url.pathname.startsWith("/admin/gallery/audio/detail/") ||
        url.pathname === "/admin/gallery/music" ||
        url.pathname === "/admin/gallery/music/tracks" ||
        url.pathname === "/admin/gallery/music/playlists" ||
        url.pathname === "/admin/tools" ||
        url.pathname === "/admin/tools/images" ||
        url.pathname === "/admin/tools/audio" ||
        url.pathname === "/admin/tools/gifs" ||
        url.pathname === "/admin/tools/music" ||
        url.pathname === "/admin/schedules" ||
        url.pathname === "/admin/schedules/actions" ||
        url.pathname === "/admin/schedules/daily-thread" ||
        url.pathname === "/admin/journals" ||
        url.pathname.startsWith("/admin/journals/") ||
        url.pathname === "/admin/admin" ||
        url.pathname === "/admin/admin/storage" ||
        url.pathname === "/admin/admin/commands" ||
        url.pathname === "/admin/admin/channel-modes" ||
        url.pathname === "/admin/memory" ||
        url.pathname === "/admin/memory/library" ||
        url.pathname === "/admin/memory/map" ||
        url.pathname === "/admin/memory/library/new" ||
        url.pathname === "/admin/memory/library/edit" ||
        url.pathname === "/admin/memory/imports" ||
        url.pathname === "/admin/memory/review" ||
        url.pathname === "/admin/memory/curator" ||
        url.pathname === "/admin/heartbeat" ||
        url.pathname.startsWith("/admin/heartbeat/") ||
        url.pathname === "/admin/inner-life" ||
        url.pathname.startsWith("/admin/inner-life/") ||
        url.pathname === "/admin/continuity" ||
        url.pathname.startsWith("/admin/continuity/")
      )) {
        return withAdmin(async (_req, innerRes, innerContext) => {
          setThemeCookie(innerRes, resolvedTheme);
          await handleAdminPageRequest({
            req: _req,
            url,
            innerRes,
            innerContext,
            currentTheme: resolvedTheme,
            helpers: buildAdminPageHelpers({
              sortMemories,
              config: innerContext.config,
            }),
          });
        })(req, res, context);
      }

      if (req.method === "GET" && url.pathname.startsWith("/admin/generated/")) {
        return withAdmin(async (_req, innerRes, innerContext) => {
          setThemeCookie(innerRes, resolvedTheme);
          await handleGeneratedDetailRequest({
            url,
            innerRes,
            innerContext,
            currentTheme: resolvedTheme,
            helpers: {
              getMessage,
              getError,
              normalizeTheme,
              buildThemeLinks,
              renderAdminShell: (params) => renderAdminShell({
                config: innerContext.config,
                ...params,
              }),
              renderMemoryLayout,
              renderGeneratedMemoryDetailPage,
            },
          });
        })(req, res, context);
      }

      {
        const handled = await handleMemoryActions({
          req,
          res,
          url,
          context,
          withAdmin,
          buildMemoryImportRecords,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleMusicActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleImageActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleAudioActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleAutomationActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleHeartbeatActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleChannelModeActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleEmotionalArcActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleFeedbackLearningActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleRelationalStateActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleSecondLifeActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleCompanionAvatarActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleInnerLifeActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleContinuityActions({
          req,
          res,
          url,
          context,
          withAdmin,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        const handled = await handleAdminMaintenanceActions({
          req,
          res,
          url,
          context,
          withAdmin,
          buildAppStateImportRecords,
        });
        if (handled !== false) {
          return handled;
        }
      }

      {
        // Machine-to-machine Second Life bridge API — guarded by the shared
        // secret, not admin basic-auth. Must run before the 404 fall-through.
        const handled = await handleSecondLifeApiRequest({ req, res, url, context });
        if (handled !== false) {
          return handled;
        }
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found.");
    }).catch((error) => {
      logger.error("[http] Request failed", {
        message: error.message,
      });
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error.");
    });
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`[health] HTTP server listening on 0.0.0.0:${port}`);
  });

  return server;
}

module.exports = {
  createHealthServer,
  parseMultipartFormData,
  parseBasicAuthHeader,
  buildImportRecordFromForm,
  buildWeeklyImportSourcesFromForm,
  buildMemoryExportPayload,
  buildMemoryImportRecords,
  buildAppStateExportPayload,
  buildAppStateImportRecords,
  buildProactiveActionPackPayload,
  buildProactiveActionPackFilename,
  buildProactiveActionPackImportRecords,
  buildProactiveActionImportSummary,
  normalizeSelectedActionIds,
  buildConversationEventsCsv,
  buildConversationLogFilename,
  buildConversationLogIndexCsv,
  normalizeTheme,
  buildAdminLocation,
  buildReturnLocation,
  buildHealthPayload,
  renderGeneratedMemoryDetailPage,
  renderAdminWorkspacePage,
};
