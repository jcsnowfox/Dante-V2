/**
 * feedbackLearningEngine
 *
 * Deterministically turns a recorded feedback event into a learning-proposal
 * DRAFT (never an applied change). No randomness, no LLM call — the mapping is
 * defined in feedbackTypes. The draft is only created when:
 *   - the engine is active, AND
 *   - learning proposals are enabled, AND
 *   - the proposal type's owner config flag is enabled, AND
 *   - the daily proposal cap has not been reached.
 *
 * Returns { created, proposal } or { created:false, reason }.
 */

const { getFeedbackType, PROPOSAL_TYPE_CONFIG_FLAG } = require("./feedbackTypes");

function buildProposedChange(feedbackType, feedbackEvent) {
  const ownerText = String(feedbackEvent?.feedbackText || "").trim();
  const change = {
    directive: feedbackType.directive,
    feedbackTypeId: feedbackType.id,
  };

  // Text-bearing feedback (do-not-repeat, remember, owner request) carries the
  // owner's words into the directive / blocked phrase.
  if (feedbackType.text && ownerText) {
    if (feedbackType.id === "do_not_do_this_again") {
      change.blockedPhrase = ownerText;
      change.directive = `Do not repeat this: ${ownerText}`;
    } else {
      change.directive = ownerText;
    }
  }

  return change;
}

async function generateProposalFromFeedback({
  companionId,
  feedbackEvent,
  settings,
  proposalService,
  auditLog,
}) {
  const feedbackType = getFeedbackType(feedbackEvent?.feedbackTypeId);
  if (!feedbackType) {
    return { created: false, reason: "unknown_feedback_type" };
  }

  if (!settings || !settings.active) {
    return { created: false, reason: "engine_inactive" };
  }

  const config = settings.config || {};

  if (config.learning_proposals_enabled !== true) {
    await auditLog.append({
      eventType: "proposal:created",
      decision: "skipped",
      reason: "learning_proposals_disabled",
      inputSummary: feedbackType.id,
    });
    return { created: false, reason: "learning_proposals_disabled" };
  }

  const typeFlag = PROPOSAL_TYPE_CONFIG_FLAG[feedbackType.proposalType];
  if (!typeFlag || config[typeFlag] !== true) {
    await auditLog.append({
      eventType: "proposal:created",
      decision: "skipped",
      reason: "proposal_type_not_enabled",
      inputSummary: feedbackType.proposalType,
    });
    return { created: false, reason: "proposal_type_not_enabled" };
  }

  const todayCount = await proposalService.countProposalsToday();
  if (todayCount >= config.max_learning_proposals_per_day) {
    await auditLog.append({
      eventType: "proposal:created",
      decision: "skipped",
      reason: "daily_cap_reached",
      inputSummary: String(todayCount),
    });
    return { created: false, reason: "daily_cap_reached" };
  }

  const requiresReview = config.review_required === true
    || (feedbackType.risk !== "low")
    || config.requires_owner_approval_for_profile_changes === true;

  const proposal = await proposalService.createProposal({
    feedbackEventId: feedbackEvent?.feedbackEventId || feedbackEvent?.id || null,
    proposalType: feedbackType.proposalType,
    targetSystem: feedbackType.targetSystem,
    riskLevel: feedbackType.risk,
    summary: feedbackType.title,
    proposedChange: buildProposedChange(feedbackType, feedbackEvent),
    requiresReview,
  });

  if (!proposal) {
    return { created: false, reason: "proposal_persist_failed" };
  }

  return { created: true, proposal };
}

module.exports = {
  generateProposalFromFeedback,
  buildProposedChange,
};
