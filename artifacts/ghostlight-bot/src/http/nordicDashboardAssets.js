"use strict";

const NORDIC_DASHBOARD_ASSET_BASE = "/assets/nordic-dashboard";
const NORDIC_DASHBOARD_ICON_BASE = `${NORDIC_DASHBOARD_ASSET_BASE}/icons`;

const NORDIC_DASHBOARD_ASSETS = Object.freeze({
  manifest: `${NORDIC_DASHBOARD_ASSET_BASE}/manifest.json`,
});

const NORDIC_PENDING_MANUAL_ASSETS = Object.freeze({
  auroraVikingDashboardReference: `${NORDIC_DASHBOARD_ASSET_BASE}/reference/aurora-viking-dashboard-reference.png`,
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

const NORDIC_UPLOADED_ICON_ASSETS = Object.freeze({});

function isNordicDashboardEnabled(env = process.env) {
  const value = String(env.NEXT_PUBLIC_NORDIC_DASHBOARD || env.NORDIC_DASHBOARD_ENABLED || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function resolveNordicIcon(name) {
  const key = String(name || "").trim();
  return {
    key,
    src: NORDIC_UPLOADED_ICON_ASSETS[key] || "",
    fallbackKind: NORDIC_ICON_FALLBACKS[key] || NORDIC_ICON_FALLBACKS.settings,
    uploaded: Boolean(NORDIC_UPLOADED_ICON_ASSETS[key]),
  };
}

module.exports = {
  NORDIC_DASHBOARD_ASSET_BASE,
  NORDIC_DASHBOARD_ICON_BASE,
  NORDIC_DASHBOARD_ASSETS,
  NORDIC_PENDING_MANUAL_ASSETS,
  NORDIC_ICON_FALLBACKS,
  NORDIC_UPLOADED_ICON_ASSETS,
  isNordicDashboardEnabled,
  resolveNordicIcon,
};
