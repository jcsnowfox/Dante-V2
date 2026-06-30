"use strict";
const crypto = require("node:crypto");
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const actions = new Map();
function iso(value) { return value ? new Date(value).toISOString() : null; }
function clone(record) { return record ? { ...record, payload: { ...(record.payload || {}) } } : null; }
function createPendingAction({ userId, companionId = "default", channelId, sourceMessageId, actionType, payload = {}, dueAt = new Date(), expiresAt = null } = {}) {
  const created = new Date();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = { id, userId: String(userId || ""), companionId: String(companionId || "default"), channelId: String(channelId || ""), sourceMessageId: String(sourceMessageId || ""), actionType: String(actionType || "follow_through"), payload: payload && typeof payload === "object" ? { ...payload } : {}, status: "queued", dueAt: iso(dueAt || created), attempts: 0, failureReason: null, resultMessageId: null, expiresAt: iso(expiresAt || new Date(created.getTime() + DEFAULT_TTL_MS)), createdAt: created.toISOString(), updatedAt: created.toISOString() };
  actions.set(id, record);
  return clone(record);
}
function listPendingActions({ includeExpired = false, status = null } = {}) {
  const current = Date.now();
  return Array.from(actions.values()).filter((a) => includeExpired || !a.expiresAt || Date.parse(a.expiresAt) > current).filter((a) => !status || a.status === status).map(clone).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
function updatePendingAction(id, patch = {}) { const existing = actions.get(id); if (!existing) return null; const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }; actions.set(id, updated); return clone(updated); }
async function executePendingAction(id, executor) {
  const existing = actions.get(id);
  if (!existing) return null;
  updatePendingAction(id, { status: "running", attempts: Number(existing.attempts || 0) + 1, failureReason: null });
  try {
    const result = typeof executor === "function" ? await executor(clone(actions.get(id))) : null;
    return updatePendingAction(id, { status: "succeeded", resultMessageId: result?.messageId || result?.resultMessageId || null, failureReason: null });
  } catch (error) {
    return updatePendingAction(id, { status: "failed", failureReason: String(error?.message || error || "execution_failed") });
  }
}
function cancelPendingAction(id, reason = "cancelled") { return updatePendingAction(id, { status: "cancelled", failureReason: reason }); }
function clearPendingActions() { actions.clear(); }
module.exports = { createPendingAction, listPendingActions, updatePendingAction, executePendingAction, cancelPendingAction, clearPendingActions };
