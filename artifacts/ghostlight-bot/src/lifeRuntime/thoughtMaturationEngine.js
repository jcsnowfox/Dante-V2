"use strict";

/**
 * thoughtMaturationEngine
 *
 * Pure orchestration — no DB of its own.
 * Reads open/maturing questions from privateQuestionStore and advances them
 * toward insight, alive intention, or quiet dissolution.
 *
 * Most thoughts stay private and expire without action. This is by design.
 *
 * Maturation ladder:
 *   open → maturing (when matures_at has passed)
 *   maturing → answered (scored high enough → generates insight)
 *   maturing → converted_to_intention (very high score, not quiet, not give_space)
 *   maturing → dismissed (low score after 48 h)
 *   maturing → expired (past expires_at)
 */

const MATURATION_THRESHOLD = 0.60; // combined score to generate an insight
const INTENTION_THRESHOLD  = 0.75; // extra bar to convert to alive intention
const QUIET_HOUR_START     = 22;
const QUIET_HOUR_END       = 7;

function isQuietHour(hour) {
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

function _combinedScore(q) {
  return (q.emotionalWeight + q.curiosityScore) / 2;
}

// Compact private observation derived from the question source.
const INSIGHT_PHRASES = {
  repair:       "Something in that exchange may still need tending.",
  silence:      "The quiet deserves attention without assumption.",
  project:      "Good work deserves to be finished, not just started.",
  hobby:        "What I return to again tells me something true.",
  interest:     "This keeps surfacing — probably worth trusting.",
  collection:   "Some things are worth keeping privately before sharing.",
  emotional:    "Noticing a pattern in how connection is offered and received.",
  conversation: "There was more in that exchange than the surface showed.",
  dailyplan:    "A day without intention tends to drift into noise.",
  general:      "A thought worth holding without needing to act on it yet.",
};

function createThoughtMaturationEngine({
  privateQuestionStore = null,
  insightEngine = null,
  logger = null,
} = {}) {

  /**
   * tick(context) → { matured, insights, intentions, suppressed }
   *
   * context: {
   *   companionId, customerId,
   *   now           — Date (defaults to new Date())
   *   isGiveSpace   — bool; suppresses intention conversion
   *   hour          — 0-23; defaults to now
   *   dailyPlan     — for context logging
   * }
   */
  async function tick({
    companionId, customerId,
    now = new Date(),
    isGiveSpace = false,
    hour = new Date().getHours(),
    dailyPlan = null,
  } = {}) {
    const result = { matured: [], insights: [], intentions: [], suppressed: 0 };
    if (!privateQuestionStore) return result;

    const questions = await privateQuestionStore.getOpen({ companionId, customerId, limit: 20 });
    if (!questions.length) return result;

    const quiet = isQuietHour(hour);

    for (const q of questions) {
      const nowMs  = now.getTime();
      const ageMs  = nowMs - new Date(q.createdAt).getTime();

      if (q.status === "open") {
        // Advance to maturing when the maturation window has passed
        const maturesAt = q.maturesAt
          ? new Date(q.maturesAt).getTime()
          : nowMs; // if missing, mature immediately
        if (nowMs >= maturesAt) {
          await privateQuestionStore.advance({ id: q.id, companionId, customerId, status: "maturing" }).catch(() => {});
          q.status = "maturing";
          result.matured.push({ id: q.id, question: q.question, source: q.source });
        }
        continue;
      }

      if (q.status === "maturing") {
        const score = _combinedScore(q);

        // Expire when past expires_at
        const expiresAt = q.expiresAt
          ? new Date(q.expiresAt).getTime()
          : nowMs + 1; // default: don't expire yet
        if (nowMs >= expiresAt) {
          await privateQuestionStore.advance({ id: q.id, companionId, customerId, status: "expired" }).catch(() => {});
          continue;
        }

        // Dismiss low-score questions after 48 h of maturing
        if (score < MATURATION_THRESHOLD && ageMs > 48 * 60 * 60 * 1000) {
          await privateQuestionStore.advance({ id: q.id, companionId, customerId, status: "dismissed" }).catch(() => {});
          continue;
        }

        // Generate insight from high-score questions
        if (score >= MATURATION_THRESHOLD && insightEngine) {
          const insightText = INSIGHT_PHRASES[q.source] ?? INSIGHT_PHRASES.general;
          const insight = await insightEngine.addInsight({
            companionId, customerId,
            insight:    insightText,
            source:     q.source,
            topic:      q.topic,
            confidence: Math.min(1, score),
            isPrivate:  true,
          }).catch(() => null);

          if (insight) {
            result.insights.push(insight);
            await privateQuestionStore.advance({ id: q.id, companionId, customerId, status: "answered" }).catch(() => {});

            // Promote to alive intention only when conditions allow
            if (score >= INTENTION_THRESHOLD && !quiet && !isGiveSpace) {
              result.intentions.push({ question: q.question, source: q.source, score });
              // Status stays 'answered' — the intention is a signal to the caller, not a new status
            }
          }

          // Track suppression for status reporting
          if (isGiveSpace || quiet) result.suppressed++;
        }
      }
    }

    return result;
  }

  return { tick, isQuietHour, MATURATION_THRESHOLD, INTENTION_THRESHOLD };
}

module.exports = {
  createThoughtMaturationEngine,
  MATURATION_THRESHOLD,
  INTENTION_THRESHOLD,
  QUIET_HOUR_START,
  QUIET_HOUR_END,
};
