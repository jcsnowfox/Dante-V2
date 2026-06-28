"use strict";

const fs = require("node:fs");
const path = require("node:path");

const NORDIC_DASHBOARD_ASSET_BASE = "/assets/nordic-dashboard";
const NORDIC_DASHBOARD_SOURCE_RELATIVE_PATH = path.join(".canvas", "assets", "dashboard assets");
const NORDIC_DASHBOARD_ICON_BASE = `${NORDIC_DASHBOARD_ASSET_BASE}/01-icons/transparent-128`;

const NORDIC_DASHBOARD_ASSETS = Object.freeze({
  manifest: `${NORDIC_DASHBOARD_ASSET_BASE}/asset_manifest.json`,
  iconMap: `${NORDIC_DASHBOARD_ASSET_BASE}/01-icons/icon-map.json`,
});

const NORDIC_ICON_FILENAMES = Object.freeze({
  mentionUser: "mention-user.png",
  spotifySong: "spotify-song.png",
  gif: "gifs.png",
  spotifyPlaylist: "spotify-playlist.png",
  voiceNote: "voice-notes.png",
  webSearch: "websearch.png",
  journal: "journals.png",
  library: "library.png",
  schedules: "schedules.png",
  tools: "tools.png",
  emotionalArc: "emotional-arc.png",
  feedbackLearning: "feedback-learning.png",
  heartbeat: "heartbeat.png",
  memory: "memory.png",
  relationalState: "relational-state.png",
  companion: "companion.png",
  favicon: "favicon.png",
});

const NORDIC_ICON_FALLBACKS = Object.freeze({
  mentionUser: "mention_user",
  spotifySong: "music",
  gif: "gif",
  spotifyPlaylist: "playlist",
  voiceNote: "audio",
  webSearch: "web_search",
  journal: "journals",
  library: "memories",
  schedules: "automation",
  tools: "tools",
  emotionalArc: "emotionalArc",
  feedbackLearning: "feedbackLearning",
  heartbeat: "heartbeat",
  memory: "memories",
  relationalState: "relationalState",
  companion: "companion",
  favicon: "dashboard",
  gallery: "gallery",
  chat: "chat_model",
  settings: "behaviour",
  sync: "automation",
  search: "web_search",
});

function findRepoRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".git")) || fs.existsSync(path.join(current, NORDIC_DASHBOARD_SOURCE_RELATIVE_PATH))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

function getNordicDashboardSourceDir(startDir = process.cwd()) {
  return path.join(findRepoRoot(startDir), NORDIC_DASHBOARD_SOURCE_RELATIVE_PATH);
}

function hasNordicDashboardSourceDir(startDir = process.cwd()) {
  try { return fs.statSync(getNordicDashboardSourceDir(startDir)).isDirectory(); } catch { return false; }
}

function getNordicDashboardAssetPath(assetPathname, startDir = process.cwd()) {
  const basePrefix = `${NORDIC_DASHBOARD_ASSET_BASE}/`;
  const pathname = String(assetPathname || "");
  const relativePath = pathname.startsWith(basePrefix) ? pathname.slice(basePrefix.length) : pathname.replace(/^\/+/, "");
  const normalizedPath = path.normalize(relativePath);
  if (!normalizedPath || normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) return null;
  const sourceDir = getNordicDashboardSourceDir(startDir);
  const assetPath = path.join(sourceDir, normalizedPath);
  const relativeFromSource = path.relative(sourceDir, assetPath);
  return relativeFromSource && !relativeFromSource.startsWith("..") && !path.isAbsolute(relativeFromSource) ? assetPath : null;
}

function isNordicDashboardEnabled(env = process.env) {
  const value = String(env.NEXT_PUBLIC_NORDIC_DASHBOARD || env.NORDIC_DASHBOARD_ENABLED || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function buildUploadedIconAssets() {
  return Object.fromEntries(Object.entries(NORDIC_ICON_FILENAMES).map(([key, filename]) => [key, `${NORDIC_DASHBOARD_ICON_BASE}/${filename}`]));
}

const NORDIC_UPLOADED_ICON_ASSETS = Object.freeze(buildUploadedIconAssets());

function resolveNordicIcon(name, options = {}) {
  const key = String(name || "").trim();
  const sourceAvailable = options.sourceAvailable ?? hasNordicDashboardSourceDir(options.startDir);
  const src = sourceAvailable ? NORDIC_UPLOADED_ICON_ASSETS[key] || "" : "";
  return { key, src, fallbackKind: NORDIC_ICON_FALLBACKS[key] || NORDIC_ICON_FALLBACKS.settings, uploaded: Boolean(src) };
}

module.exports = {
  NORDIC_DASHBOARD_ASSET_BASE,
  NORDIC_DASHBOARD_SOURCE_RELATIVE_PATH,
  NORDIC_DASHBOARD_ICON_BASE,
  NORDIC_DASHBOARD_ASSETS,
  NORDIC_ICON_FILENAMES,
  NORDIC_ICON_FALLBACKS,
  NORDIC_UPLOADED_ICON_ASSETS,
  findRepoRoot,
  getNordicDashboardSourceDir,
  hasNordicDashboardSourceDir,
  getNordicDashboardAssetPath,
  isNordicDashboardEnabled,
  resolveNordicIcon,
};
