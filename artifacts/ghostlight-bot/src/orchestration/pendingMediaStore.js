"use strict";
const crypto = require("node:crypto");
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const media = new Map();
function iso(value) { return value ? new Date(value).toISOString() : null; }
function clone(record) { return record ? { ...record } : null; }
function createPendingMedia({ userId, companionId = "default", channelId, mediaType, prompt, provider = null, model = null, status = "queued", failureReason = null, resultMessageId = null, expiresAt = null } = {}) {
  const created = new Date();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = { id, userId: String(userId || ""), companionId: String(companionId || "default"), channelId: String(channelId || ""), mediaType: String(mediaType || "media"), prompt: String(prompt || ""), provider: provider ? String(provider) : null, model: model ? String(model) : null, status: String(status || "queued"), failureReason: failureReason ? String(failureReason) : null, resultMessageId: resultMessageId ? String(resultMessageId) : null, createdAt: created.toISOString(), expiresAt: iso(expiresAt || new Date(created.getTime() + DEFAULT_TTL_MS)), updatedAt: created.toISOString() };
  media.set(id, record);
  return clone(record);
}
function updatePendingMedia(id, patch = {}) { const existing = media.get(id); if (!existing) return null; const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }; media.set(id, updated); return clone(updated); }
function listPendingMedia({ includeExpired = false, status = null } = {}) { const now = Date.now(); return Array.from(media.values()).filter((item) => includeExpired || !item.expiresAt || Date.parse(item.expiresAt) > now).filter((item) => !status || item.status === status).map(clone); }
function clearPendingMedia() { media.clear(); }
module.exports = { createPendingMedia, updatePendingMedia, listPendingMedia, clearPendingMedia };
