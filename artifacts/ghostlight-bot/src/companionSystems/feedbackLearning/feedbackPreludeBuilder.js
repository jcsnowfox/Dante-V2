/**
 * feedbackPreludeBuilder
 *
 * Builds an OPTIONAL internal prelude context section from applied learning
 * rules. This is the only way the engine influences a live reply, and it is
 * purely additive — it appends a context section and never mutates the base
 * prompt, the companion identity, or the model provider.
 *
 * Returns null unless the engine is active, communication tuning is enabled,
 * and at least one applied prelude-eligible rule exists.
 */

const { PROPOSAL_TYPE_CONFIG_FLAG } = require("./feedbackTypes");

const MAX_RULES = 8;

function buildFeedbackPrelude({ settings, appliedRules = [], logger }) {
  if (!settings || !settings.active) {
    return null;
  }
  if (settings.config.communication_tuning_enabled !== true) {
    return null;
  }
  if (!Array.isArray(appliedRules) || appliedRules.length === 0) {
    return null;
  }

  const config = settings.config || {};

  // Per-domain runtime gating: a rule of a given proposal type only influences
  // the reply while that type's toggle is currently enabled. Turning a toggle
  // off immediately stops previously-applied rules of that type from firing.
  const liveRules = appliedRules.filter((rule) => {
    const flag = PROPOSAL_TYPE_CONFIG_FLAG[rule?.proposalType];
    return flag ? config[flag] === true : false;
  });

  if (liveRules.length === 0) {
    return null;
  }

  const directives = [];
  const blockedPhrases = [];

  for (const rule of liveRules.slice(0, MAX_RULES)) {
    const change = rule?.appliedChange || rule?.proposedChange || {};
    const directive = String(change.directive || rule?.summary || "").trim();
    if (directive) {
      directives.push(directive);
    }
    const blocked = String(change.blockedPhrase || "").trim();
    if (blocked) {
      blockedPhrases.push(blocked);
    }
  }

  if (directives.length === 0 && blockedPhrases.length === 0) {
    return null;
  }

  const lines = [];
  if (directives.length > 0) {
    lines.push("Owner-approved communication adjustments:");
    for (const directive of directives) {
      lines.push(`- ${directive}`);
    }
  }
  if (blockedPhrases.length > 0) {
    lines.push("Avoid the following (owner asked you not to repeat these):");
    for (const phrase of blockedPhrases) {
      lines.push(`- ${phrase}`);
    }
  }

  logger?.debug?.("[feedback-learning:prelude:built] Prelude assembled.", {
    directives: directives.length,
    blockedPhrases: blockedPhrases.length,
  });

  return {
    title: "Learned Communication Preferences",
    content: lines.join("\n"),
  };
}

module.exports = { buildFeedbackPrelude };
