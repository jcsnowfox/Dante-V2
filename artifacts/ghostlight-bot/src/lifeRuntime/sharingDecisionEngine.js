"use strict";

/**
 * sharingDecisionEngine
 *
 * Pure logic — no DB table of its own.
 * Decides whether a piece of Dante's personal growth (hobby, project,
 * collection item, or interest) should surface in the LLM prelude.
 *
 * Most growth stays private. The default threshold for sharing is high.
 * Uses the existing decisionEngine to record each evaluation.
 */

// How shareable each context type is by default
const BASE_SCORE = {
  hobby:      0.25,
  project:    0.30,
  collection: 0.20,
  interest:   0.20,
  skill:      0.15,
};

// Score needed before something is considered shareable
const SHARE_THRESHOLD = 0.55;

function createSharingDecisionEngine({ decisionEngine = null, logger = null } = {}) {

  /**
   * shouldShare(opts) → { shouldShare: bool, score: number, reason: string }
   *
   * opts:
   *   companionId, customerId — for recording the decision
   *   context      — "hobby" | "project" | "collection" | "interest" | "skill"
   *   item         — the object to evaluate (must have .name or .title)
   *   enthusiasm   — 0-1 (for hobby/project/interest)
   *   isPrivate    — whether item is flagged private
   *   isShareable  — explicit shareable flag (e.g. project.moment.shareable)
   *   relevance    — 0-1 how relevant to current conversation (caller provides)
   *   hour         — current hour 0-23 (defaults to now)
   *   recentShareCount — how many growth items were shared recently
   */
  async function shouldShare({
    companionId = "",
    customerId  = "",
    context     = "hobby",
    item        = {},
    enthusiasm  = 0.5,
    isPrivate   = true,
    isShareable = false,
    relevance   = 0,
    hour        = new Date().getHours(),
    recentShareCount = 0,
    consequenceSuppressed = false,
  } = {}) {
    let score = BASE_SCORE[context] ?? 0.2;

    // Hard block: an unresolved relational consequence holds back casual
    // sharing (Life Runtime 5.0). Affection/repair flow elsewhere; growth
    // chatter stays private until things are okay.
    if (consequenceSuppressed) {
      return _record({ companionId, customerId, context, item, score: 0, reason: "consequence_suppressed" });
    }

    // Hard block: explicitly private stays private
    if (isPrivate && !isShareable) {
      return _record({ companionId, customerId, context, item, score: 0, reason: "private" });
    }

    // Explicit shareable flag is a strong signal
    if (isShareable) score += 0.20;

    // Enthusiasm/strength of the item
    score += enthusiasm * 0.20;

    // Conversation relevance (caller-provided)
    score += relevance * 0.25;

    // Timing: late night / early morning reduces share likelihood
    const goodHour = hour >= 8 && hour <= 21;
    if (!goodHour) score -= 0.15;

    // Sharing fatigue: avoid overwhelming with growth info
    if (recentShareCount >= 2) score -= 0.20;

    const share = score >= SHARE_THRESHOLD;
    return _record({ companionId, customerId, context, item, score, reason: share ? "above_threshold" : "below_threshold" });
  }

  async function _record({ companionId, customerId, context, item, score, reason }) {
    const share = score >= SHARE_THRESHOLD;
    const label = item?.name || item?.title || context;

    if (decisionEngine?.decide && companionId) {
      await decisionEngine.decide({
        companionId, customerId,
        decisionType:   share ? "act" : "remain_silent",
        considered:     ["share", "keep_private"],
        chosen:         share ? "share" : "keep_private",
        rejected:       [share ? "keep_private" : "share"],
        confidence:     Math.min(1, Math.abs(score - SHARE_THRESHOLD) / 0.4 + 0.1),
        reason:         `sharing eval: ${context}/${label}`,
        contextSummary: `score=${score.toFixed(2)} reason=${reason}`,
      }).catch(() => null);
    }

    return { shouldShare: share, score, reason };
  }

  // Quick check with no recording — for prelude builder to use synchronously
  function quickCheck({ enthusiasm = 0.5, isPrivate = true, isShareable = false, context = "hobby", consequenceSuppressed = false }) {
    if (consequenceSuppressed) return false;
    if (isPrivate && !isShareable) return false;
    let score = BASE_SCORE[context] ?? 0.2;
    if (isShareable) score += 0.20;
    score += enthusiasm * 0.20;
    return score >= SHARE_THRESHOLD;
  }

  return { shouldShare, quickCheck, SHARE_THRESHOLD };
}

module.exports = { createSharingDecisionEngine, SHARE_THRESHOLD: 0.55 };
