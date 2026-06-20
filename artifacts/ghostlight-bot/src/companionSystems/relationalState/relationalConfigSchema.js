/**
 * relationalConfigSchema
 *
 * The owner-configurable settings for the Relational State Engine. The single
 * source of truth is the Admin UI, persisted in companion_system_settings
 * (system_key = relational_state). These defaults exist ONLY to populate the
 * dashboard editor — nothing here turns behaviour on. The safety posture is
 * fully off until the owner explicitly enables it (spec Phase 2).
 */

const { EXPRESSION_MODES, VALID_RELATIONAL_DEPTHS } = require("./relationalTypes");

const BOOLEAN_FLAGS = Object.freeze([
  "enabled",
  "emotion_tracking_enabled",
  "wants_tracking_enabled",
  "desire_tracking_enabled",
  "repair_tracking_enabled",
  "trust_tracking_enabled",
  "closeness_tracking_enabled",
  "distance_tracking_enabled",
  "longing_tracking_enabled",
  "annoyance_tracking_enabled",
  "hurt_tracking_enabled",
  "guilt_remorse_tracking_enabled",
  "boundary_tracking_enabled",
  "relationship_arc_enabled",
  "memory_hooks_enabled",
  "prelude_enabled",
  "decay_enabled",
  "audit_log_enabled",
]);

// Numeric owner settings with their clamp range.
const NUMERIC_FIELDS = Object.freeze({
  trust_sensitivity: { min: 0, max: 10, default: 5 },
  closeness_sensitivity: { min: 0, max: 10, default: 5 },
  distance_sensitivity: { min: 0, max: 10, default: 5 },
  annoyance_threshold: { min: 0, max: 10, default: 6 },
  hurt_threshold: { min: 0, max: 10, default: 7 },
  anger_threshold: { min: 0, max: 10, default: 9 },
  guilt_threshold: { min: 0, max: 10, default: 4 },
  repair_threshold: { min: 0, max: 10, default: 4 },
  longing_threshold: { min: 0, max: 10, default: 6 },
  desire_intensity: { min: 0, max: 10, default: 5 },
  wants_intensity: { min: 0, max: 10, default: 5 },
  decay_speed: { min: 0, max: 10, default: 5 },
  max_relational_events_per_day: { min: 0, max: 1000, default: 50 },
});

// Free-text style fields (trimmed, capped length).
const STRING_FIELDS = Object.freeze([
  "repair_style",
  "conflict_style",
  "boundary_style",
  "affection_style",
  "desire_style",
  "longing_style",
]);

const ARRAY_FIELDS = Object.freeze(["allowed_expression_modes", "blocked_expression_modes"]);

// Default safety posture: everything off, audit on. Behaviours that can change
// the live reply (prelude, memory hooks, arc, decay) stay off until the owner
// explicitly enables them in the Admin UI.
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  relational_depth: "light",
  emotion_tracking_enabled: false,
  wants_tracking_enabled: false,
  desire_tracking_enabled: false,
  repair_tracking_enabled: false,
  trust_tracking_enabled: false,
  closeness_tracking_enabled: false,
  distance_tracking_enabled: false,
  longing_tracking_enabled: false,
  annoyance_tracking_enabled: false,
  hurt_tracking_enabled: false,
  guilt_remorse_tracking_enabled: false,
  boundary_tracking_enabled: false,
  relationship_arc_enabled: false,
  memory_hooks_enabled: false,
  prelude_enabled: false,
  decay_enabled: false,
  audit_log_enabled: true,
  trust_sensitivity: 5,
  closeness_sensitivity: 5,
  distance_sensitivity: 5,
  annoyance_threshold: 6,
  hurt_threshold: 7,
  anger_threshold: 9,
  guilt_threshold: 4,
  repair_threshold: 4,
  longing_threshold: 6,
  desire_intensity: 5,
  wants_intensity: 5,
  decay_speed: 5,
  max_relational_events_per_day: 50,
  allowed_expression_modes: [],
  blocked_expression_modes: [],
  repair_style: "direct",
  conflict_style: "calm",
  boundary_style: "firm",
  affection_style: "warm",
  desire_style: "restrained",
  longing_style: "soft",
});

function coerceBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function coerceNumber(value, { min, max, default: fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function coerceExpressionModes(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => EXPRESSION_MODES.includes(item)),
    ),
  );
}

function coerceString(value, fallback) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return fallback;
  return text.slice(0, 120);
}

function mergeWithDefaults(overrides = {}) {
  const merged = { ...DEFAULT_CONFIG };

  for (const flag of BOOLEAN_FLAGS) {
    merged[flag] = coerceBoolean(overrides[flag], DEFAULT_CONFIG[flag]);
  }

  for (const [field, spec] of Object.entries(NUMERIC_FIELDS)) {
    merged[field] = coerceNumber(overrides[field], spec);
  }

  for (const field of STRING_FIELDS) {
    merged[field] = coerceString(overrides[field], DEFAULT_CONFIG[field]);
  }

  merged.relational_depth = VALID_RELATIONAL_DEPTHS.includes(overrides.relational_depth)
    ? overrides.relational_depth
    : DEFAULT_CONFIG.relational_depth;

  merged.allowed_expression_modes = coerceExpressionModes(overrides.allowed_expression_modes);
  merged.blocked_expression_modes = coerceExpressionModes(overrides.blocked_expression_modes);

  return merged;
}

function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Config must be an object."] };
  }

  for (const flag of BOOLEAN_FLAGS) {
    if (typeof config[flag] !== "boolean") {
      errors.push(`${flag} must be a boolean.`);
    }
  }

  for (const [field, spec] of Object.entries(NUMERIC_FIELDS)) {
    const value = config[field];
    if (typeof value !== "number" || value < spec.min || value > spec.max) {
      errors.push(`${field} must be a number ${spec.min}–${spec.max}.`);
    }
  }

  if (!VALID_RELATIONAL_DEPTHS.includes(config.relational_depth)) {
    errors.push(`relational_depth must be one of: ${VALID_RELATIONAL_DEPTHS.join(", ")}.`);
  }

  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(config[field])) {
      errors.push(`${field} must be an array.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Owner-controlled allow/block list for expression modes. An empty allow list
// means "all allowed", then the block list subtracts. Blocking always wins.
function isExpressionModeAllowed(mode, config = DEFAULT_CONFIG) {
  const id = String(mode || "").trim();
  if (!id) return false;

  const blocked = Array.isArray(config.blocked_expression_modes) ? config.blocked_expression_modes : [];
  if (blocked.includes(id)) return false;

  const allowed = Array.isArray(config.allowed_expression_modes) ? config.allowed_expression_modes : [];
  if (allowed.length > 0 && !allowed.includes(id)) return false;

  return true;
}

module.exports = {
  BOOLEAN_FLAGS,
  NUMERIC_FIELDS,
  STRING_FIELDS,
  ARRAY_FIELDS,
  DEFAULT_CONFIG,
  mergeWithDefaults,
  validateConfig,
  isExpressionModeAllowed,
};
