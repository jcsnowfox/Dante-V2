"use strict";

const DEFAULT_CONFIG = Object.freeze({
  inner_life_enabled: true,
  private_thoughts_enabled: true,
  unsent_thoughts_enabled: true,
  between_messages_enabled: true,
  journal_enabled: true,
  dreams_enabled: true,
  little_rituals_enabled: true,
  mood_carryover_enabled: true,
  alive_texture_enabled: true,
  private_lexicon_enabled: true,
  room_sense_enabled: true,
  micro_repair_enabled: true,
  proactive_inner_life_enabled: false,
  journal_delivery_enabled: false,
  dream_delivery_enabled: false,
  max_inner_life_prelude_items: 3,
  private_entries_visible_in_admin: true,
  private_entries_require_review: false,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  autonomy_posting_enabled: false,
  autonomy_posting_debug: false,
  autonomy_posting_cooldown_minutes: 45,
  autonomy_posting_min_score: 0.7,
  autonomy_posting_public_guild_mode: true,
});

const BOOLEAN_FLAGS = Object.freeze([
  "inner_life_enabled",
  "private_thoughts_enabled",
  "unsent_thoughts_enabled",
  "between_messages_enabled",
  "journal_enabled",
  "dreams_enabled",
  "little_rituals_enabled",
  "mood_carryover_enabled",
  "alive_texture_enabled",
  "private_lexicon_enabled",
  "room_sense_enabled",
  "micro_repair_enabled",
  "proactive_inner_life_enabled",
  "journal_delivery_enabled",
  "dream_delivery_enabled",
  "private_entries_visible_in_admin",
  "private_entries_require_review",
  "quiet_hours_enabled",
  "autonomy_posting_enabled",
  "autonomy_posting_debug",
  "autonomy_posting_public_guild_mode",
]);

const NUMERIC_FIELDS = Object.freeze({
  max_inner_life_prelude_items: { min: 0, max: 10, default: 3 },
  autonomy_posting_cooldown_minutes: { min: 1, max: 1440, default: 45 },
  autonomy_posting_min_score: { min: 0, max: 1, default: 0.7 },
});

const STRING_FIELDS = Object.freeze([
  "quiet_hours_start",
  "quiet_hours_end",
]);

function normalizeBoolean(val, fallback = false) {
  if (typeof val === "boolean") return val;
  if (val === undefined || val === null || val === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(val).trim().toLowerCase());
}

function loadInnerLifeConfig(rawConfig = {}) {
  const out = { ...DEFAULT_CONFIG };

  for (const flag of BOOLEAN_FLAGS) {
    if (rawConfig[flag] !== undefined) {
      out[flag] = normalizeBoolean(rawConfig[flag], DEFAULT_CONFIG[flag]);
    }
  }

  for (const [field, spec] of Object.entries(NUMERIC_FIELDS)) {
    if (rawConfig[field] !== undefined) {
      const n = Number(rawConfig[field]);
      if (Number.isFinite(n) && n >= spec.min && n <= spec.max) {
        out[field] = n;
      }
    }
  }

  for (const field of STRING_FIELDS) {
    if (rawConfig[field] !== undefined && String(rawConfig[field]).trim()) {
      out[field] = String(rawConfig[field]).trim();
    }
  }

  return out;
}

function isQuietHours(config, now = new Date()) {
  if (!config.quiet_hours_enabled) return false;

  const pad = (n) => String(n).padStart(2, "0");
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const start = config.quiet_hours_start || "22:00";
  const end = config.quiet_hours_end || "08:00";

  if (start <= end) {
    return currentTime >= start && currentTime < end;
  }
  // Wraps midnight
  return currentTime >= start || currentTime < end;
}

module.exports = {
  DEFAULT_CONFIG,
  BOOLEAN_FLAGS,
  NUMERIC_FIELDS,
  STRING_FIELDS,
  loadInnerLifeConfig,
  isQuietHours,
};
