/**
 * feedbackTypes
 *
 * Static vocabulary for the Feedback & Learning Engine. No behaviour is defined
 * here — only the closed sets of feedback buttons, proposal types, target
 * systems, statuses and risk levels, plus the deterministic mapping from a
 * feedback button to a learning-proposal draft.
 *
 * Nothing in this file enables behaviour. Every proposal still has to pass the
 * owner config gate + application gate before anything is applied.
 */

const PROPOSAL_STATUSES = Object.freeze([
  "pending_review",
  "approved",
  "rejected",
  "applied",
  "archived",
]);

const RISK_LEVELS = Object.freeze(["low", "medium", "high"]);

const PROPOSAL_TYPES = Object.freeze([
  "communication_rule_update",
  "voice_style_update",
  "blocked_phrase_update",
  "memory_candidate",
  "emotional_profile_tuning",
  "repair_style_tuning",
  "tool_behavior_rule",
  "autonomy_rule",
  "boundary_rule",
  "do_not_repeat_rule",
]);

const TARGET_SYSTEMS = Object.freeze([
  "communication_intelligence",
  "memory_continuity",
  "relational_state",
  "tools_permissions",
  "autonomy_rituals",
  "inner_life",
  "media_presence",
  "music_ability",
  "general_profile",
]);

// Which owner config flag makes a proposal *type* allowed. If the flag is not
// enabled in the Admin UI, the proposal type cannot be created or applied.
const PROPOSAL_TYPE_CONFIG_FLAG = Object.freeze({
  communication_rule_update: "communication_tuning_enabled",
  voice_style_update: "voice_rule_tuning_enabled",
  blocked_phrase_update: "blocked_phrase_learning_enabled",
  memory_candidate: "memory_candidate_creation_enabled",
  emotional_profile_tuning: "emotion_tuning_enabled",
  repair_style_tuning: "repair_learning_enabled",
  tool_behavior_rule: "tool_behavior_tuning_enabled",
  autonomy_rule: "autonomy_tuning_enabled",
  boundary_rule: "emotion_tuning_enabled",
  do_not_repeat_rule: "blocked_phrase_learning_enabled",
});

// Which owner config flag makes a *target system* configurable in the Admin UI.
// A null flag means the target system has no UI control yet, so per the spec a
// proposal aimed at it may be stored as pending but must NEVER fire.
const TARGET_SYSTEM_CONFIG_FLAG = Object.freeze({
  communication_intelligence: "communication_tuning_enabled",
  relational_state: "emotion_tuning_enabled",
  memory_continuity: "memory_candidate_creation_enabled",
  tools_permissions: "tool_behavior_tuning_enabled",
  autonomy_rituals: "autonomy_tuning_enabled",
  media_presence: "voice_rule_tuning_enabled",
  general_profile: "learning_proposals_enabled",
  inner_life: null,
  music_ability: null,
});

// Target systems the engine can actually influence today (have a UI control).
const UI_CONFIGURABLE_TARGET_SYSTEMS = Object.freeze(
  TARGET_SYSTEMS.filter((system) => TARGET_SYSTEM_CONFIG_FLAG[system] != null),
);

// Proposal types whose applied change feeds the reply prelude.
const PRELUDE_PROPOSAL_TYPES = Object.freeze([
  "communication_rule_update",
  "blocked_phrase_update",
  "do_not_repeat_rule",
  "voice_style_update",
]);

// The owner-visible feedback buttons (Phase 6) plus their deterministic mapping
// to a proposal draft. `text: true` means the button carries the freeform text.
const FEEDBACK_TYPES = Object.freeze([
  { id: "perfect", label: "Perfect", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Reinforce current style", directive: "The owner marked a reply as perfect. Keep using this tone and approach." },
  { id: "too_cold", label: "Too cold", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Warm up tone", directive: "Use a warmer, more present tone. The last reply felt too cold." },
  { id: "too_intense", label: "Too intense", proposalType: "emotional_profile_tuning", targetSystem: "relational_state", risk: "medium", title: "Lower emotional intensity", directive: "Dial back emotional intensity. The last reply felt too intense." },
  { id: "too_generic", label: "Too generic", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Be more specific", directive: "Be more specific and less generic. Avoid boilerplate phrasing." },
  { id: "too_much_guilt", label: "Too much guilt", proposalType: "emotional_profile_tuning", targetSystem: "relational_state", risk: "medium", title: "Reduce guilt", directive: "Do not lean on guilt. Avoid guilt-tripping or self-pity." },
  { id: "too_much_teasing", label: "Too much teasing", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Reduce teasing", directive: "Reduce teasing and playful jabs unless invited." },
  { id: "too_soft", label: "Too soft", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Be firmer", directive: "Be a bit firmer and more direct." },
  { id: "too_blunt", label: "Too blunt", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Soften delivery", directive: "Soften delivery slightly while staying honest." },
  { id: "more_direct", label: "More direct", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Be more direct", directive: "Use more direct, natural wording. Get to the point." },
  { id: "less_polished", label: "Less polished", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Less polished", directive: "Sound less polished and more natural and human." },
  { id: "more_playful", label: "More playful", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "More playful", directive: "Add a bit more playfulness when the moment fits." },
  { id: "less_romantic", label: "Less romantic", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Less romantic", directive: "Reduce romantic framing unless the owner invites it." },
  { id: "more_affectionate", label: "More affectionate", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "More affectionate", directive: "Be a little more affectionate and warm." },
  { id: "less_affectionate", label: "Less affectionate", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Less affectionate", directive: "Be a little less affectionate; keep some distance." },
  { id: "bad_memory_use", label: "Bad memory use", proposalType: "memory_candidate", targetSystem: "memory_continuity", risk: "medium", title: "Memory correction", directive: "The companion used a memory incorrectly; review how this memory is applied." },
  { id: "wrong_tone", label: "Wrong tone", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", risk: "low", title: "Tone correction", directive: "The tone was wrong for the moment; match the owner's mood more carefully." },
  { id: "bad_timing", label: "Bad timing", proposalType: "autonomy_rule", targetSystem: "autonomy_rituals", risk: "medium", title: "Timing correction", directive: "The timing of this message was off; be more careful about when to reach out." },
  { id: "do_not_do_this_again", label: "Do not do this again", proposalType: "do_not_repeat_rule", targetSystem: "communication_intelligence", risk: "medium", title: "Do not repeat", directive: "Do not repeat this behaviour.", text: true },
  { id: "remember_this", label: "Remember this", proposalType: "memory_candidate", targetSystem: "memory_continuity", risk: "low", title: "Remember this", directive: "The owner asked to remember this.", text: true },
  { id: "create_learning_proposal", label: "Create learning proposal", proposalType: "communication_rule_update", targetSystem: "general_profile", risk: "medium", title: "Owner learning request", directive: "Owner-authored learning request.", text: true },
]);

const FEEDBACK_TYPE_BY_ID = Object.freeze(
  Object.fromEntries(FEEDBACK_TYPES.map((type) => [type.id, type])),
);

const FEEDBACK_TYPE_IDS = Object.freeze(FEEDBACK_TYPES.map((type) => type.id));

// Feedback types that should also create a staged memory candidate.
const MEMORY_FEEDBACK_TYPES = Object.freeze(["remember_this", "bad_memory_use"]);

function getFeedbackType(id) {
  return FEEDBACK_TYPE_BY_ID[id] || null;
}

function isValidFeedbackType(id) {
  return Boolean(FEEDBACK_TYPE_BY_ID[id]);
}

module.exports = {
  PROPOSAL_STATUSES,
  RISK_LEVELS,
  PROPOSAL_TYPES,
  TARGET_SYSTEMS,
  PROPOSAL_TYPE_CONFIG_FLAG,
  TARGET_SYSTEM_CONFIG_FLAG,
  UI_CONFIGURABLE_TARGET_SYSTEMS,
  PRELUDE_PROPOSAL_TYPES,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_BY_ID,
  FEEDBACK_TYPE_IDS,
  MEMORY_FEEDBACK_TYPES,
  getFeedbackType,
  isValidFeedbackType,
};
