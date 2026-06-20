"use strict";

const DEFAULT_CONFIG = Object.freeze({
  continuity_enabled: true,
  open_loops_enabled: true,
  future_followups_enabled: true,
  promise_ledger_enabled: true,
  decision_ledger_enabled: true,
  project_state_enabled: true,
  repair_continuity_enabled: true,
  boundary_continuity_enabled: true,
  ritual_continuity_enabled: true,
  absence_reentry_enabled: true,
  media_job_continuity_enabled: true,
  trust_ledger_enabled: true,
  proactive_followups_enabled: false,
  sensitive_followups_allowed: false,
  public_channel_followups_allowed: false,
  max_active_prelude_items: 4,
  max_followups_per_day: 2,
  max_followups_per_thread: 2,
  quiet_hours_enabled: true,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
});

const BOOLEAN_FLAGS = Object.freeze([
  "continuity_enabled",
  "open_loops_enabled",
  "future_followups_enabled",
  "promise_ledger_enabled",
  "decision_ledger_enabled",
  "project_state_enabled",
  "repair_continuity_enabled",
  "boundary_continuity_enabled",
  "ritual_continuity_enabled",
  "absence_reentry_enabled",
  "media_job_continuity_enabled",
  "trust_ledger_enabled",
  "proactive_followups_enabled",
  "sensitive_followups_allowed",
  "public_channel_followups_allowed",
  "quiet_hours_enabled",
]);

const NUMERIC_FIELDS = Object.freeze({
  max_active_prelude_items: { min: 0, max: 12, default: 4 },
  max_followups_per_day: { min: 0, max: 20, default: 2 },
  max_followups_per_thread: { min: 0, max: 10, default: 2 },
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

function loadContinuityConfig(rawConfig = {}) {
  const out = { ...DEFAULT_CONFIG };

  for (const flag of BOOLEAN_FLAGS) {
    if (rawConfig[flag] !== undefined) {
      out[flag] = normalizeBoolean(rawConfig[flag], DEFAULT_CONFIG[flag]);
    }
  }

  for (const [field, spec] of Object.entries(NUMERIC_FIELDS)) {
    if (rawConfig[field] !== undefined) {
      const n = Number(rawConfig[field]);
      if (Number.isFinite(n)) {
        out[field] = Math.max(spec.min, Math.min(spec.max, n));
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
  if (start <= end) return currentTime >= start && currentTime < end;
  return currentTime >= start || currentTime < end;
}

module.exports = {
  DEFAULT_CONFIG,
  BOOLEAN_FLAGS,
  NUMERIC_FIELDS,
  STRING_FIELDS,
  loadContinuityConfig,
  isQuietHours,
};
