const UPDATE_NOTICE_DISMISSED_SETTING_KEY = "admin.dismissedUpdateNoticeId";

const LATEST_UPDATE_NOTICE = Object.freeze({
  id: "2026-06-12-forums-channel-modes-lookup",
  eyebrow: "Latest Update",
  title: "Ghostlight 1.3.1 is here",
  body: "This update adds forum-friendly channel handling, Channel Modes improvements, conversation lookup, and voice/audio setting refinements. Check the full release notes for the complete tour.",
  links: Object.freeze([
    { label: "Channel Modes", path: "/admin/admin/channel-modes" },
    { label: "Voice & Audio", path: "/admin/tools/audio" },
  ]),
});

function normalizeUpdateNoticeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getLatestUpdateNotice({ settings = {} } = {}) {
  const dismissedId = normalizeUpdateNoticeId(settings[UPDATE_NOTICE_DISMISSED_SETTING_KEY]);

  if (dismissedId && dismissedId === LATEST_UPDATE_NOTICE.id) {
    return null;
  }

  return LATEST_UPDATE_NOTICE;
}

function buildUpdateNoticeDismissalSettings(noticeId) {
  const normalizedId = normalizeUpdateNoticeId(noticeId);

  if (!normalizedId || normalizedId !== LATEST_UPDATE_NOTICE.id) {
    return null;
  }

  return {
    [UPDATE_NOTICE_DISMISSED_SETTING_KEY]: normalizedId,
  };
}

module.exports = {
  LATEST_UPDATE_NOTICE,
  UPDATE_NOTICE_DISMISSED_SETTING_KEY,
  buildUpdateNoticeDismissalSettings,
  getLatestUpdateNotice,
  normalizeUpdateNoticeId,
};
