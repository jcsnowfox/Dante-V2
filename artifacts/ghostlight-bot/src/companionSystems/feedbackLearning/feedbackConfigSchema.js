/**
 * feedbackConfigSchema
 *
 * The owner-configurable settings for the Feedback & Learning Engine. The
 * single source of truth is the Admin UI, persisted in companion_system_settings
 * (system_key = feedback_learning). These defaults exist ONLY to populate the
 * dashboard editor — nothing here turns behaviour on. The safety posture is
 * fully off until the owner explicitly enables it.
 */

const BOOLEAN_FLAGS = Object.freeze([
  "enabled",
  "feedback_buttons_enabled",
  "freeform_feedback_enabled",
  "learning_proposals_enabled",
  "auto_apply_allowed",
  "review_required",
  "memory_candidate_creation_enabled",
  "communication_tuning_enabled",
  "voice_rule_tuning_enabled",
  "emotion_tuning_enabled",
  "tool_behavior_tuning_enabled",
  "autonomy_tuning_enabled",
  "blocked_phrase_learning_enabled",
  "repair_learning_enabled",
  "requires_owner_approval_for_profile_changes",
  "requires_owner_approval_for_memory_candidates",
  "private_notes_enabled",
  "audit_log_enabled",
]);

// Default safety posture (Phase 3): everything off / review required.
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  feedback_buttons_enabled: false,
  freeform_feedback_enabled: false,
  learning_proposals_enabled: false,
  auto_apply_allowed: false,
  review_required: true,
  memory_candidate_creation_enabled: false,
  communication_tuning_enabled: false,
  voice_rule_tuning_enabled: false,
  emotion_tuning_enabled: false,
  tool_behavior_tuning_enabled: false,
  autonomy_tuning_enabled: false,
  blocked_phrase_learning_enabled: false,
  repair_learning_enabled: false,
  max_learning_proposals_per_day: 20,
  requires_owner_approval_for_profile_changes: true,
  requires_owner_approval_for_memory_candidates: true,
  allowed_feedback_types: [],
  blocked_feedback_types: [],
  private_notes_enabled: false,
  audit_log_enabled: true,
});

function coerceBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function coerceStringArray(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
  }
  return [];
}

function mergeWithDefaults(overrides = {}) {
  const merged = { ...DEFAULT_CONFIG };

  for (const flag of BOOLEAN_FLAGS) {
    merged[flag] = coerceBoolean(overrides[flag], DEFAULT_CONFIG[flag]);
  }

  const maxPerDay = Number(overrides.max_learning_proposals_per_day);
  merged.max_learning_proposals_per_day = Number.isFinite(maxPerDay) && maxPerDay >= 0
    ? Math.min(1000, Math.round(maxPerDay))
    : DEFAULT_CONFIG.max_learning_proposals_per_day;

  merged.allowed_feedback_types = coerceStringArray(overrides.allowed_feedback_types);
  merged.blocked_feedback_types = coerceStringArray(overrides.blocked_feedback_types);

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

  if (
    typeof config.max_learning_proposals_per_day !== "number"
    || config.max_learning_proposals_per_day < 0
  ) {
    errors.push("max_learning_proposals_per_day must be a non-negative number.");
  }

  if (!Array.isArray(config.allowed_feedback_types)) {
    errors.push("allowed_feedback_types must be an array.");
  }

  if (!Array.isArray(config.blocked_feedback_types)) {
    errors.push("blocked_feedback_types must be an array.");
  }

  return { valid: errors.length === 0, errors };
}

// Owner-controlled allow/block list. An empty allow list means "all allowed",
// then the block list subtracts. Blocking always wins.
function isFeedbackTypeAllowed(feedbackTypeId, config = DEFAULT_CONFIG) {
  const id = String(feedbackTypeId || "").trim();
  if (!id) return false;

  const blocked = Array.isArray(config.blocked_feedback_types) ? config.blocked_feedback_types : [];
  if (blocked.includes(id)) return false;

  const allowed = Array.isArray(config.allowed_feedback_types) ? config.allowed_feedback_types : [];
  if (allowed.length > 0 && !allowed.includes(id)) return false;

  return true;
}

module.exports = {
  BOOLEAN_FLAGS,
  DEFAULT_CONFIG,
  mergeWithDefaults,
  validateConfig,
  isFeedbackTypeAllowed,
};
