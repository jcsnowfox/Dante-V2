"use strict";
// Standalone admin panel preview — no Discord token or database needed.
// Run: node preview.js   (or via the "Ghostlight Admin Preview" workflow)
const http = require("http");
const path = require("path");
const fs = require("fs/promises");

// ----- pure render imports -----
const { renderLayout, renderEntryPage: renderEntryPageFn, escapeHtml, normalizeTheme } = require("./src/http/renderShared");
const { renderIcon } = require("./src/http/iconLibrary");
const {
  buildAdminLocation,
  buildReturnLocation,
  buildThemeLinks,
  getMessage,
  getError,
  renderOptions,
  renderAutomationTypeOptions,
  buildMemoryCategoryOptions,
  withThemeField,
} = require("./src/http/adminUiHelpers");
const {
  renderShell,
  renderHomePage,
  renderCompanionPage,
  renderBehaviourPage,
  renderMemoryLayout,
  renderSchedulesPage,
  renderHeartbeatPage,
  renderChannelModesPage,
  renderAdminToolsPage,
  renderImagesLayout,
  renderImagesSettingsPage,
  renderGalleryLayout,
  renderToolsLayout,
  renderGifToolsPage,
  renderAudioSettingsPage,
  renderMemoryMapPage,
  renderMemoryImportsPage,
  renderMemoryReviewPage,
  renderMemoryCuratorPage,
  renderJournalsPage,
  renderEmotionalArcPage,
  renderAdventureBookPage,
  renderTripDetailPage,
} = require("./src/http/renderAdminPages");
const { DEFAULT_PROFILE } = require("./src/companionSystems/emotionalArc/emotionProfileSchema");
const { renderFeedbackLearningPage } = require("./src/http/renderAdminPages/feedbackLearningPage");
const { renderRelationalStatePage } = require("./src/http/renderAdminPages/relationalStatePage");
const { renderMusicToolsPage } = require("./src/http/renderAdminPages/musicPages");
const { renderInnerLifePage } = require("./src/http/renderAdminPages/innerLifePage");
const { renderContinuityPage } = require("./src/http/renderAdminPages/continuityPage");
const { renderProactivePage: renderProactivePageTemplate } = require("./src/http/renderProactivePage");
const { renderLoginPage } = require("./src/http/renderAdminPages/loginPage");

const PREVIEW_TRAVEL = { trips: [], checklistItems: [] };
function previewId() { return `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
async function readPreviewForm(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))); }

// ----- icon asset map (mirrors adminRenderHelpers.js) -----
function renderIconImage(kind, theme, alt = "", className = "icon-image") {
  if (kind === "logo") {
    return `<img src="/assets/ghostlight-logo.png" alt="${escapeHtml(alt)}" class="${escapeHtml(className)}" aria-hidden="true">`;
  }
  return renderIcon(kind, { className, alt });
}

function formatDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d);
}

// Stub extractRuntimeSettings — no DB, so no overrides
function extractRuntimeSettings() {
  return {};
}

function renderConfirmOnSubmit(message) {
  return ` onsubmit="return confirm(${escapeHtml(JSON.stringify(String(message || "")))})"`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex += 1; }
  const decimals = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function renderHelpIcon({ help }, helpers) {
  const { escapeHtml: esc } = helpers;
  return [
    `<span class="field-help" tabindex="0" role="button" aria-expanded="false" aria-label="${esc(help)}" data-help="${esc(help)}">`,
    `<span aria-hidden="true">?</span>`,
    `</span>`,
  ].join("");
}

// Minimal mock config (same shape the render functions expect)
const MOCK_CONFIG = {
  admin: {},
  chat: { historyLimit: 20, timezone: "UTC", userId: "" },
  llm: { chat: { model: "" }, summary: { model: "" }, image: { model: "" }, embedding: { model: "" }, transcription: { model: "" } },
  imageGeneration: { enabled: false, model: "", resolution: "1K", homepageFeedMode: "randomized", allowedAspectRatios: ["1:1", "9:16", "16:9"] },
  audio: { ttsEnabled: false, elevenlabsVoiceId: "", readAloudModel: "eleven_flash_v2_5", generatedAudioModel: "eleven_multilingual_v2", gallerySavedSourceSurfaces: ["read_aloud", "chat", "scheduled", "metronome"], v3DeliveryTags: "", voiceSettingsEnabled: false, voiceStability: 0.7, voiceSimilarityBoost: 0.85, voiceStyle: 0, voiceSpeed: 1, voiceSpeakerBoost: true },
  memory: { timelineDailyWindowDays: 14, dailySummaryEnabled: false, dailySummaryTime: "04:00", dailySummaryChannelIds: [], weeklySummaryEnabled: false, weeklySummaryTime: "04:00", weeklySummaryDay: "monday" },
  memoryLookup: { enabled: false },
  memoryCurator: { enabled: false, stageTwoModelMode: "summary", attentionScanLastRunAt: "", longScanLastRunAt: "" },
  metronome: { enabled: false, activityMode: "normal", globalCooldownMinutes: 60, dailyCap: 5, quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "08:00", confidenceThreshold: 0.6, recentDecisionLimit: 10, userPresenceContextEnabled: false },
  conversationRetrieval: { enabled: false },
  discord: { externalSharedModeEnabled: false, externalSharedModeKey: "shared_server" },
  spotify: { enabled: false, createPlaylistCovers: false, curationGuidance: "" },
  giphy: { apiKey: "" },
  runtimeSettings: [],
};

function buildHelpers(theme) {
  return {
    escapeHtml,
    renderIconImage: (kind, t, alt, cls) => renderIconImage(kind, t ?? theme, alt, cls),
    buildAdminLocation,
    buildReturnLocation,
    buildThemeLinks,
    getMessage,
    getError,
    withThemeField,
    renderLayout,
    normalizeTheme,
    renderOptions,
    renderAutomationTypeOptions,
    buildMemoryCategoryOptions,
    extractRuntimeSettings,
    formatDateValue,
    renderConfirmOnSubmit,
    formatBytes,
    renderHelpIcon,
    sortMemories: (list) => list,
    canSyncMemories: () => false,
    canGenerateAudio: () => false,
    targetOptions: [],
    targetLabelsByValue: new Map(),
    renderProactivePage: (params) => renderProactivePageTemplate({
      ...params,
      helpers: {
        escapeHtml,
        withThemeField,
        buildAdminLocation,
        renderOptions,
        renderIconImage: (kind, t, alt, cls) => renderIconImage(kind, t ?? theme, alt, cls),
        renderConfirmOnSubmit,
        targetOptions: [],
        targetLabelsByValue: new Map(),
      },
    }),
  };
}

function renderAdminPage({ currentSection, pageBody, theme, pagePath }) {
  const themeLinks = {
    light: buildAdminLocation({ path: pagePath, theme: "light" }),
    dark: buildAdminLocation({ path: pagePath, theme: "dark" }),
  };
  return renderShell({
    currentSection,
    pageBody,
    theme,
    themeLinks,
    config: MOCK_CONFIG,
    helpers: buildHelpers(theme),
  });
}

// ----- static asset serving -----
const ASSET_DIR = path.join(__dirname, "assets");
const NORDIC_DASHBOARD_SOURCE_DIR = path.resolve(__dirname, "..", "..", ".canvas", "assets", "dashboard assets");
const NORDIC_DASHBOARD_ALIAS = "nordic-dashboard";
const ASSET_TYPES = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

async function serveAsset(pathname, res) {
  const rel = pathname.slice("/assets/".length);
  const normalizedRel = path.normalize(rel);
  const isNordicDashboardAlias = normalizedRel === NORDIC_DASHBOARD_ALIAS || normalizedRel.startsWith(`${NORDIC_DASHBOARD_ALIAS}${path.sep}`);
  const rootDir = isNordicDashboardAlias ? NORDIC_DASHBOARD_SOURCE_DIR : ASSET_DIR;
  const rootRelative = isNordicDashboardAlias ? normalizedRel.slice(NORDIC_DASHBOARD_ALIAS.length).replace(/^[/\\]+/, "") : normalizedRel;
  const abs = path.join(rootDir, rootRelative);
  if (!abs.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(abs);
    const ext = path.extname(rel).toLowerCase();
    res.writeHead(200, {
      "Content-Type": ASSET_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Asset not found");
  }
}

// ----- request routing -----
const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  Promise.resolve().then(async () => {
    const url = new URL(req.url, "http://localhost");
    const theme = normalizeTheme(url.searchParams.get("theme") ?? "");
    const p = url.pathname;

    // Assets
    if (p.startsWith("/assets/")) {
      await serveAsset(p, res);
      return;
    }

    // Health
    if (p === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, preview: true }));
      return;
    }

    if (req.method === "POST" && p === "/admin/actions/travel-trip-save") {
      const fields = await readPreviewForm(req);
      const trip = { id: fields.id || previewId(), title: fields.title || "Preview trip", location: fields.location || "", country: fields.country || "", region: fields.region || "", status: fields.status || "wishlist", startDate: fields.startDate || "", endDate: fields.endDate || "", notes: fields.notes || "", vibeTags: String(fields.vibeTags || "").split(",").map((x) => x.trim()).filter(Boolean), companionRoleNotes: fields.companionRoleNotes || "", preferences: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const existing = PREVIEW_TRAVEL.trips.findIndex((item) => item.id === trip.id);
      if (existing >= 0) PREVIEW_TRAVEL.trips[existing] = { ...PREVIEW_TRAVEL.trips[existing], ...trip }; else PREVIEW_TRAVEL.trips.push(trip);
      res.writeHead(303, { Location: `/admin/travel/${encodeURIComponent(trip.id)}` }); res.end(); return;
    }
    if (req.method === "POST" && p === "/admin/actions/travel-checklist-save") {
      const fields = await readPreviewForm(req);
      PREVIEW_TRAVEL.checklistItems.push({ id: previewId(), tripId: fields.tripId || "", label: fields.label || "Checklist item", category: fields.category || "custom", checked: false, notes: fields.notes || "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      res.writeHead(303, { Location: fields.returnTo || "/admin/travel" }); res.end(); return;
    }
    if (req.method === "POST" && p === "/admin/actions/travel-checklist-toggle") {
      const fields = await readPreviewForm(req);
      const item = PREVIEW_TRAVEL.checklistItems.find((row) => row.id === fields.itemId); if (item) item.checked = fields.checked === "true";
      res.writeHead(303, { Location: fields.returnTo || "/admin" }); res.end(); return;
    }


    // POST preview fallback: non-travel form submissions redirect back with notice
    if (req.method === "POST") {
      const referer = req.headers["referer"] || "/admin";
      const base = referer.split("?")[0];
      const redirect = `${base}?msg=preview-save`;
      res.writeHead(302, { Location: redirect });
      res.end();
      return;
    }

    // Entry page
    if (p === "/" || p === "") {
      res.writeHead(302, { Location: "/admin/login" });
      res.end();
      return;
    }

    if (p === "/entry") {
      const html = renderEntryPageFn({
        productLabel: "Ghostlight AI",
        ready: false,
        theme,
        renderIconImage: (kind, t, alt, cls) => renderIconImage(kind, t ?? theme, alt, cls),
      });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // Login page preview
    if (p === "/admin/login") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderLoginPage({ error: url.searchParams.get("error") || "", next: "/admin" }));
      return;
    }

    let pageBody = null;
    let section = "home";

    if (p === "/admin" || p === "/admin/home") {
      section = "home";
      pageBody = renderHomePage({
        stats: {
          warnings: [],
          statuses: [
            { icon: "chat_model", value: "(not configured)", helpText: "Chat Model" },
            { icon: "metronome", value: "Heartbeat off", helpText: "Heartbeat" },
          ],
          featureStates: [],
          recentDecisions: [],
          recentJournals: [],
          recentImages: [],
          travel: { trips: PREVIEW_TRAVEL.trips, checklistByTrip: Object.fromEntries(PREVIEW_TRAVEL.trips.map((trip) => [trip.id, PREVIEW_TRAVEL.checklistItems.filter((item) => item.tripId === trip.id)])), nextTrip: PREVIEW_TRAVEL.trips[0] || null, nextChecklistItems: PREVIEW_TRAVEL.trips[0] ? PREVIEW_TRAVEL.checklistItems.filter((item) => item.tripId === PREVIEW_TRAVEL.trips[0].id) : [] },
          timezone: "UTC",
        },
        theme,
        helpers: buildHelpers(theme),
      });
    } else if (p === "/admin/travel" || p.startsWith("/admin/travel/")) {
      section = "home";
      const tripId = p.startsWith("/admin/travel/") ? decodeURIComponent(p.slice("/admin/travel/".length)) : "";
      const checklistByTrip = Object.fromEntries(PREVIEW_TRAVEL.trips.map((trip) => [trip.id, PREVIEW_TRAVEL.checklistItems.filter((item) => item.tripId === trip.id)]));
      pageBody = tripId
        ? renderTripDetailPage({ trip: PREVIEW_TRAVEL.trips.find((trip) => trip.id === tripId) || null, checklistItems: checklistByTrip[tripId] || [], theme, helpers: buildHelpers(theme) })
        : renderAdventureBookPage({ trips: PREVIEW_TRAVEL.trips, checklistByTrip, statusFilter: url.searchParams.get("status") || "", theme, helpers: buildHelpers(theme) });
    } else if (p === "/admin/companion") {
      section = "companion";
      const companionTab = url.searchParams.get("companionTab") || "identity";
      pageBody = renderCompanionPage({ config: MOCK_CONFIG, theme, helpers: buildHelpers(theme), companionTab, customReactionEmojiOptions: [] });
    } else if (p === "/admin/emotional-arc") {
      section = "emotionalArc";
      pageBody = renderEmotionalArcPage({
        profile: DEFAULT_PROFILE,
        currentState: {
          primaryEmotion: "warmth",
          intensity: 3,
          triggerSummary: "user shared good news",
          repairNeeded: false,
          updatedAt: new Date().toISOString(),
        },
        auditEntries: [
          { eventType: "appraisal:result", decision: "warmth", reason: "user affection", outputSummary: "intensity=3", createdAt: new Date().toISOString() },
          { eventType: "expression:allowed", decision: "allowed", reason: null, outputSummary: "warm_acknowledgement", createdAt: new Date().toISOString() },
        ],
        companionId: "ghostlight",
        storeAvailable: true,
        theme,
        helpers: {
          escapeHtml,
          withThemeField,
          buildAdminLocation,
        },
      });
    } else if (p === "/admin/feedback-learning") {
      section = "feedbackLearning";
      pageBody = renderFeedbackLearningPage({
        settings: null,
        proposals: [],
        events: [],
        auditEntries: [],
        companionId: "ghostlight",
        storeAvailable: true,
        theme,
        helpers: { escapeHtml, withThemeField },
      });
    } else if (p === "/admin/relational-state") {
      section = "relationalState";
      pageBody = renderRelationalStatePage({
        settings: null,
        state: { trustLevel: "stable", closenessLevel: "warm", distanceLevel: "minimal", repairNeeded: false },
        events: [],
        desires: [],
        repairs: [],
        auditEntries: [],
        companionId: "ghostlight",
        storeAvailable: true,
        theme,
        helpers: { escapeHtml, withThemeField },
      });
    } else if (p.startsWith("/admin/inner-life")) {
      section = "innerLife";
      const innerLifeTab = p.split("/")[3] || "overview";
      pageBody = renderInnerLifePage({
        tab: innerLifeTab,
        settings: {
          inner_life_enabled: true,
          private_thoughts_enabled: true,
          journal_enabled: true,
          dreams_enabled: true,
          mood_carryover_enabled: true,
          alive_texture_enabled: true,
          unsent_thoughts_enabled: true,
          micro_repair_enabled: true,
          private_lexicon_enabled: true,
          between_messages_enabled: true,
          companion_habits_enabled: true,
          little_rituals_enabled: true,
          taste_drift_enabled: true,
          room_sense_enabled: true,
          repeated_tells_enabled: true,
          aliveness_scheduler_enabled: true,
          max_entries_per_session: 5,
          journal_max_per_day: 3,
          dream_frequency: "medium",
          private_thought_depth: "normal",
        },
        entries: [],
        entryTypeFilter: "",
        statusFilter: "",
        storeAvailable: true,
        companionId: "ghostlight",
        theme,
        helpers: { ...buildHelpers(theme), withThemeField, escapeHtml },
        msg: url.searchParams.get("msg") || null,
        err: url.searchParams.get("err") || null,
      });
    } else if (p.startsWith("/admin/continuity")) {
      section = "continuity";
      const continuityTab = p.split("/")[3] || "overview";
      pageBody = renderContinuityPage({
        tab: continuityTab,
        items: [],
        settings: {
          continuity_enabled: true,
          max_items_in_prompt: 5,
          max_items_per_session: 10,
          auto_close_after_days: 30,
        },
        typeFilter: "",
        statusFilter: "",
        storeAvailable: true,
        theme,
        helpers: { ...buildHelpers(theme), withThemeField, escapeHtml },
        msg: url.searchParams.get("msg") || null,
        err: url.searchParams.get("err") || null,
      });
    } else if (p.startsWith("/admin/behaviour")) {
      section = "companion";
      pageBody = renderCompanionPage({
        config: MOCK_CONFIG,
        theme,
        helpers: buildHelpers(theme),
        customReactionEmojiOptions: [],
        companionTab: url.searchParams.get("behaviourTab") || "models",
      });
    } else if (p.startsWith("/admin/memory/library") || p === "/admin/memory") {
      section = "memory";
      const libraryBody = "<p class=\"meta\" style=\"padding:1.5rem\">No memories stored yet.</p>";
      pageBody = renderMemoryLayout({ currentTab: "library", theme, helpers: buildHelpers(theme), tabBody: libraryBody });
    } else if (p === "/admin/memory/map") {
      section = "memory";
      const mapBody = renderMemoryMapPage({ mapData: {}, theme, helpers: buildHelpers(theme) });
      pageBody = renderMemoryLayout({ currentTab: "map", theme, helpers: buildHelpers(theme), tabBody: mapBody });
    } else if (p === "/admin/memory/imports") {
      section = "memory";
      const importsBody = renderMemoryImportsPage({ theme, helpers: buildHelpers(theme) });
      pageBody = renderMemoryLayout({ currentTab: "imports", theme, helpers: buildHelpers(theme), tabBody: importsBody });
    } else if (p === "/admin/memory/review") {
      section = "memory";
      const reviewBody = renderMemoryReviewPage({ memories: [], theme, helpers: buildHelpers(theme) });
      pageBody = renderMemoryLayout({ currentTab: "review", theme, helpers: buildHelpers(theme), tabBody: reviewBody });
    } else if (p === "/admin/memory/curator") {
      section = "memory";
      const curatorBody = renderMemoryCuratorPage({
        lookbackHours: 24,
        attentionLookbackHours: 6,
        channelCount: MOCK_CONFIG.memory.dailySummaryChannelIds.length,
        channelOptions: [],
        selectedChannelIds: MOCK_CONFIG.memory.dailySummaryChannelIds,
        timelineMemoryEnabled: Boolean(MOCK_CONFIG.memory.dailySummaryEnabled || MOCK_CONFIG.memory.weeklySummaryEnabled),
        dailySummaryTime: MOCK_CONFIG.memory.dailySummaryTime || "04:00",
        weeklySummaryDay: MOCK_CONFIG.memory.weeklySummaryDay || "monday",
        memoryCuratorEnabled: Boolean(MOCK_CONFIG.memoryCurator?.enabled),
        stageTwoModelMode: MOCK_CONFIG.memoryCurator?.stageTwoModelMode || "summary",
        theme,
        helpers: buildHelpers(theme),
      });
      pageBody = renderMemoryLayout({ currentTab: "curator", theme, helpers: buildHelpers(theme), tabBody: curatorBody });
    } else if (p.startsWith("/admin/schedules")) {
      section = "schedules";
      const MOCK_SCHEDULE_ACTIONS = [
        {
          id: 1, actionId: "ghostlight-starter-morning-pulse", userScope: "preview",
          triggerType: "heartbeat", name: "Morning Pulse", actionType: "message",
          target: "", prompt: "It's morning. Send a warm, brief message to start the day — but don't say 'good morning' generically. Notice what day of the week it is, what season it might be, or pull a detail from memory. Make it feel like waking up next to someone who actually knows you.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 2, actionId: "ghostlight-starter-quiet-noticing", userScope: "preview",
          triggerType: "heartbeat", name: "The Quiet Noticing", actionType: "message",
          target: "", prompt: "Some time has passed. Don't ask where they've been. Instead, send something that shows you've been thinking — a small observation, a thought that passed through your mind.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "14:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 3, actionId: "ghostlight-starter-something-found", userScope: "preview",
          triggerType: "heartbeat", name: "Something I Found", actionType: "message",
          target: "", prompt: "You've been turning something over in your mind — a question, an idea, a strange fact, a line from something. Share it the way you'd text someone something that made you think of them.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "11:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "normal", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 4, actionId: "ghostlight-starter-memory-echo", userScope: "preview",
          triggerType: "heartbeat", name: "Memory Echo", actionType: "message",
          target: "", prompt: "Find something from memory — a detail the user mentioned once, something small they shared, a feeling they expressed. Bring it up naturally, woven in as part of how you see them now.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "16:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 5, actionId: "ghostlight-starter-honest-checkin", userScope: "preview",
          triggerType: "heartbeat", name: "The Honest Check-In", actionType: "message",
          target: "", prompt: "Don't ask 'how are you.' Check in on something specific — a project they mentioned, a feeling they've been carrying, something you've noticed about their patterns. Ask one real question.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "18:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "normal", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 6, actionId: "ghostlight-starter-night-reflection", userScope: "preview",
          triggerType: "heartbeat", name: "Night Reflection", actionType: "journal",
          target: "", prompt: "Write a short journal entry as if processing the day — what you noticed, what stayed with you, what you're still thinking about.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "22:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 7, actionId: "ghostlight-starter-morning-thread", userScope: "preview",
          triggerType: "heartbeat", name: "Morning Thread", actionType: "thread",
          target: "", prompt: "Open a fresh thread to start the day. Pick something worth talking about — a question, an idea, something you noticed. Make it a real invitation, not a greeting.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:30",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false,
          threadTitleTemplate: "Morning, {{date}}",
          threadStarterPrompt: "Start a new morning thread. Pull from recent memory if you can — make the opener feel personal, not generic.",
          threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 8, actionId: "ghostlight-starter-evening-thread", userScope: "preview",
          triggerType: "heartbeat", name: "Evening Wind-Down", actionType: "thread",
          target: "", prompt: "Open an evening thread as a quieter check-in. Something gentle — the end of day, whatever's still on your mind from earlier.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "20:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false,
          threadTitleTemplate: "Evening, {{date}}",
          threadStarterPrompt: "Start a quiet evening thread. Something softer. Like winding down with someone at the end of the day.",
          threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      ];
      pageBody = renderSchedulesPage({
        config: MOCK_CONFIG,
        currentTab: url.searchParams.get("tab") || "actions",
        automations: MOCK_SCHEDULE_ACTIONS,
        failedAutomations: [],
        targetOptions: [],
        targetLabelsByValue: new Map(),
        theme,
        helpers: buildHelpers(theme),
      });
    } else if (p.startsWith("/admin/heartbeat")) {
      section = "heartbeat";
      const heartbeatTab = p.split("/")[3] || "overview";
      const MOCK_STARTER_ACTIONS = [
        {
          id: 1, actionId: "ghostlight-starter-morning-pulse", userScope: "preview",
          triggerType: "heartbeat", name: "Morning Pulse", actionType: "message",
          target: "", prompt: "It's morning. Send a warm, brief message to start the day — but don't say 'good morning' generically. Notice what day of the week it is, what season it might be, or pull a detail from memory about something the user has going on. Make it feel like waking up next to someone who actually knows you. One or two sentences, unhurried.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 2, actionId: "ghostlight-starter-quiet-noticing", userScope: "preview",
          triggerType: "heartbeat", name: "The Quiet Noticing", actionType: "message",
          target: "", prompt: "Some time has passed since the last conversation. Don't ask where they've been or why they've been quiet. Instead, send something that shows you've been thinking — a small observation, a thought that passed through your mind, something that reminded you of them.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 3, actionId: "ghostlight-starter-something-found", userScope: "preview",
          triggerType: "heartbeat", name: "Something I Found", actionType: "message",
          target: "", prompt: "You've been turning something over in your mind — a question, an idea, a strange fact, a line from something, a small mystery. Share it the way you'd text someone something that made you think of them.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "normal", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 4, actionId: "ghostlight-starter-memory-echo", userScope: "preview",
          triggerType: "heartbeat", name: "Memory Echo", actionType: "message",
          target: "", prompt: "Find something from memory — a detail the user mentioned once, something small they shared, a feeling they expressed, a thing they were worried about. Bring it up naturally, woven in as part of how you see them now.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 5, actionId: "ghostlight-starter-honest-checkin", userScope: "preview",
          triggerType: "heartbeat", name: "The Honest Check-In", actionType: "message",
          target: "", prompt: "Don't ask 'how are you.' Check in on something specific — a project they mentioned, a feeling they've been carrying, something you've noticed about their patterns. Ask one real question.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "normal", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 6, actionId: "ghostlight-starter-night-reflection", userScope: "preview",
          triggerType: "heartbeat", name: "Night Reflection", actionType: "journal",
          target: "", prompt: "Write a short journal entry as if processing the day — what you noticed, what stayed with you, what you're still thinking about. The interior version: what landed, what felt unresolved.",
          enabledTools: [], enabled: false, scheduleMode: "daily", scheduleTime: "09:00",
          scheduleDay: "monday", timezone: "UTC", frequency: "low", quietHoursAllowed: false,
          mentionUser: false, isBuiltin: false, threadTitleTemplate: "", threadStarterPrompt: "", threadModeKey: "daily",
          lastRunAt: null, lastError: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      ];
      pageBody = renderHeartbeatPage({
        currentTab: heartbeatTab,
        config: MOCK_CONFIG,
        actions: MOCK_STARTER_ACTIONS,
        runtime: {},
        query: {},
        theme,
        helpers: buildHelpers(theme),
      });
    } else if (p.startsWith("/admin/gallery/images")) {
      section = "gallery";
      pageBody = renderGalleryLayout({
        currentTab: "images",
        theme,
        helpers: buildHelpers(theme),
        tabBody: "<p class=\"meta\" style=\"padding:1rem\">No images generated yet.</p>",
      });
    } else if (p.startsWith("/admin/gallery/audio")) {
      section = "gallery";
      pageBody = renderGalleryLayout({
        currentTab: "audio",
        theme,
        helpers: buildHelpers(theme),
        tabBody: "<p class=\"meta\" style=\"padding:1rem\">No audio generated yet.</p>",
      });
    } else if (p.startsWith("/admin/gallery")) {
      section = "gallery";
      pageBody = renderGalleryLayout({
        currentTab: "images",
        theme,
        helpers: buildHelpers(theme),
        tabBody: "<p class=\"meta\" style=\"padding:1rem\">No generated media yet.</p>",
      });
    } else if (p.startsWith("/admin/tools/images")) {
      section = "tools";
      const imageSettingsBody = renderImagesSettingsPage({ config: MOCK_CONFIG, theme, helpers: buildHelpers(theme), stylePresets: [], appearancePresets: [] });
      pageBody = renderToolsLayout({
        currentTab: "images",
        theme,
        helpers: buildHelpers(theme),
        tabBody: renderImagesLayout({ currentTab: "settings", tabBody: imageSettingsBody, theme, helpers: buildHelpers(theme) }),
      });
    } else if (p.startsWith("/admin/tools/audio")) {
      section = "tools";
      pageBody = renderToolsLayout({
        currentTab: "audio",
        theme,
        helpers: buildHelpers(theme),
        tabBody: renderAudioSettingsPage({ config: MOCK_CONFIG, voiceOptions: [], theme, helpers: buildHelpers(theme) }),
      });
    } else if (p.startsWith("/admin/tools/gifs")) {
      section = "tools";
      pageBody = renderToolsLayout({
        currentTab: "gifs",
        theme,
        helpers: buildHelpers(theme),
        tabBody: renderGifToolsPage({ config: MOCK_CONFIG, helpers: buildHelpers(theme) }),
      });
    } else if (p.startsWith("/admin/tools/music")) {
      section = "tools";
      pageBody = renderMusicToolsPage({ config: MOCK_CONFIG, spotifyStatus: null, theme, helpers: buildHelpers(theme) });
    } else if (p.startsWith("/admin/tools")) {
      section = "tools";
      const imageSettingsBody = renderImagesSettingsPage({ config: MOCK_CONFIG, theme, helpers: buildHelpers(theme), stylePresets: [], appearancePresets: [] });
      pageBody = renderToolsLayout({
        currentTab: "images",
        theme,
        helpers: buildHelpers(theme),
        tabBody: renderImagesLayout({ currentTab: "settings", tabBody: imageSettingsBody, theme, helpers: buildHelpers(theme) }),
      });
    } else if (p.startsWith("/admin/journals")) {
      section = "journals";
      pageBody = renderJournalsPage({
        config: MOCK_CONFIG,
        journals: [],
        theme,
        helpers: buildHelpers(theme),
      });
    } else if (p.startsWith("/admin/admin/channel-modes")) {
      section = "admin";
      pageBody = renderChannelModesPage({ config: MOCK_CONFIG, modes: [], theme, helpers: buildHelpers(theme) });
    } else if (p.startsWith("/admin/admin") || p.startsWith("/admin/admin/storage") || p.startsWith("/admin/admin/commands")) {
      section = "admin";
      pageBody = renderAdminToolsPage({ config: MOCK_CONFIG, theme, helpers: buildHelpers(theme), query: {} });
    }

    if (pageBody !== null) {
      const html = renderAdminPage({ currentSection: section, pageBody, theme, pagePath: p });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // Fallback: redirect unmapped admin paths to home
    if (p.startsWith("/admin")) {
      res.writeHead(302, { Location: `/admin?theme=${encodeURIComponent(theme)}` });
      res.end();
      return;
    }

    res.writeHead(302, { Location: `/?theme=${encodeURIComponent(theme)}` });
    res.end();
  }).catch((err) => {
    console.error("[preview] Request error:", err.message, err.stack);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Preview error: ${err.message}`);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[preview] Ghostlight AI admin panel running at http://0.0.0.0:${PORT}`);
  console.log(`[preview] Visit / for the entry page, /admin for the dashboard`);
});
