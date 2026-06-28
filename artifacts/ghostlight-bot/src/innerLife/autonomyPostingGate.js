"use strict";

const crypto = require("crypto");

const RAW_CONTEXT_RE = /\bsource:\s*(?:inbound_message|channel_context|conversation_update)\b|\b(?:inbound_message|channel_context|conversation_update)\b|\{\s*"(?:source|type|room|privacy|conversation)|\broom:\s*public_guild\b/i;
const SIMPLE_TEST_RE = /^\s*(?:test|testing|ping|hello|hi|hey|ok|okay|yo|sup|say something normal please)\s*[.!?]*\s*$/i;
const PRIVATE_TYPES = new Set(["private_thought", "unsent_thought", "almost_said", "private_note", "quiet_private_note"]);
const lastPosts = new Map();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getAutonomyPostingConfig(config = {}) {
  const raw = config?.innerLife || {};
  return {
    enabled: bool(raw.autonomy_posting_enabled ?? process.env.AUTONOMY_POSTING_ENABLED, false),
    debug: bool(raw.autonomy_posting_debug ?? process.env.AUTONOMY_POSTING_DEBUG, false),
    cooldownMinutes: num(raw.autonomy_posting_cooldown_minutes ?? process.env.AUTONOMY_POSTING_COOLDOWN_MINUTES, 45, 1, 24 * 60),
    minScore: num(raw.autonomy_posting_min_score ?? process.env.AUTONOMY_POSTING_MIN_SCORE, 0.7, 0, 1),
    publicGuildMode: bool(raw.autonomy_posting_public_guild_mode ?? process.env.AUTONOMY_POSTING_PUBLIC_GUILD_MODE, true),
  };
}

function hashContext(value) {
  return crypto.createHash("sha1").update(String(value || "").trim().toLowerCase()).digest("hex").slice(0, 16);
}

function scoreAutonomyEvent(event = {}, context = {}) {
  const body = String(event.body || event.summary || event.content || "").trim();
  let score = Number(event.meaningfulnessScore ?? event.score ?? 0);
  if (!Number.isFinite(score) || score <= 0) {
    const words = body.match(/\b[\p{L}']{3,}\b/gu) || [];
    score = Math.min(0.65, words.length / 24);
    if (/\b(miss|love|hurt|afraid|sorry|remember|important|ache|hope|worried|proud|lonely|tender)\b/i.test(body)) score += 0.25;
    if (/Almost said/i.test(event.title || "") && words.length < 10) score -= 0.2;
  }
  if (event.sourceEventType === "inbound_message") score -= 0.3;
  if (context.roomType === "public_guild" || context.isPublicGuild) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

function shouldPostAutonomyEvent(event = {}, context = {}) {
  const cfg = getAutonomyPostingConfig(context.config || {});
  if (!cfg.enabled) return { allowed: false, reason: "disabled" };

  const source = String(event.sourceEventType || event.source || "").trim();
  const text = [event.title, event.body, event.summary, event.content].filter(Boolean).join("\n");
  const publicGuild = context.roomType === "public_guild" || context.isPublicGuild;
  const score = scoreAutonomyEvent(event, context);

  if (RAW_CONTEXT_RE.test(text)) return { allowed: false, reason: "raw_context_leak", score };
  if (/^[\s\S]*\{[\s\S]*"[a-zA-Z_]+"\s*:[\s\S]*\}[\s\S]*$/.test(text)) return { allowed: false, reason: "json_block", score };
  if (source === "inbound_message" && score < 0.9) return { allowed: false, reason: "ordinary_inbound", score };
  if (source === "conversation_update") return { allowed: false, reason: "conversation_update_internal", score };
  if ((event.private === true || PRIVATE_TYPES.has(String(event.type || ""))) && publicGuild) return { allowed: false, reason: "private_inner_life_public", score };
  if (cfg.publicGuildMode && publicGuild && (source === "channel_context" || score < Math.max(cfg.minScore, 0.85))) return { allowed: false, reason: "public_guild_quiet", score };
  if (SIMPLE_TEST_RE.test(context.userText || event.userText || "")) return { allowed: false, reason: "simple_test_message", score };
  if (score < cfg.minScore) return { allowed: false, reason: "low_meaningfulness", score };

  const companionId = String(context.companionId || context.config?.companion?.id || "default");
  const channelId = String(context.channelId || "autonomy");
  const key = `${companionId}:${channelId}:${source || "unknown"}`;
  const now = Number(context.now || Date.now());
  const last = lastPosts.get(key);
  if (last && now - last.at < cfg.cooldownMinutes * 60 * 1000) return { allowed: false, reason: "cooldown", score };
  const contextHash = hashContext(context.channelContext || event.channelContext || text);
  if (last && last.contextHash === contextHash) return { allowed: false, reason: "duplicate_context", score };
  return { allowed: true, reason: "allowed", score, key, contextHash };
}

function recordAutonomyPost(decision, now = Date.now()) {
  if (decision?.allowed && decision.key) lastPosts.set(decision.key, { at: now, contextHash: decision.contextHash });
}

function resetAutonomyPostingGateForTests() { lastPosts.clear(); }

function sanitizeAutonomyContent(entry = {}, { debug = false } = {}) {
  const title = String(entry.title || "Inner life note").replace(/\bsource:\s*\S+/gi, "").trim() || "Inner life note";
  const body = String(entry.body || entry.summary || entry.content || "")
    .replace(/\{[\s\S]*?\}/g, "")
    .replace(RAW_CONTEXT_RE, "")
    .replace(/\b(?:public_guild|private_dm|privacy|room|source|conversation_update|channel_context|inbound_message)\b/gi, "")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .trim() || "A quiet internal note was recorded.";
  const source = debug && entry.sourceEventType ? `\n\nsource: ${entry.sourceEventType}` : "";
  return [`**${title.slice(0, 160)}**`, body.slice(0, 1400), source].filter(Boolean).join("\n\n");
}

module.exports = { shouldPostAutonomyEvent, recordAutonomyPost, resetAutonomyPostingGateForTests, sanitizeAutonomyContent, getAutonomyPostingConfig, scoreAutonomyEvent, RAW_CONTEXT_RE };
