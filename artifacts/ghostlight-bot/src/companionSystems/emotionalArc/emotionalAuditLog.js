/**
 * emotionalAuditLog
 *
 * Structured audit logging for emotional arc decisions.
 * Every blocked expression must log a safe reason.
 *
 * Log tags:
 *   [emotional-arc:profile:loaded]
 *   [emotional-arc:appraisal:start]
 *   [emotional-arc:appraisal:result]
 *   [emotional-arc:state:updated]
 *   [emotional-arc:expression:allowed]
 *   [emotional-arc:expression:blocked]
 *   [emotional-arc:prelude:built]
 *   [emotional-arc:repair:needed]
 *   [emotional-arc:repair:attempted]
 *   [emotional-arc:memory:candidate]
 *   [emotional-arc:decay:applied]
 *   [emotional-arc:error]
 */

function createEmotionalAuditLog({ store, companionId, logger }) {
  async function append({ eventType, decision, reason = null, inputSummary = null, outputSummary = null }) {
    logger.info(`[emotional-arc:${eventType}] ${decision}`, {
      companionId,
      reason,
      inputSummary,
      outputSummary,
    });

    try {
      if (store) {
        await store.appendAuditLog({
          companionId,
          eventType,
          decision,
          reason,
          inputSummary,
          outputSummary,
        });
      }
    } catch (error) {
      logger.warn("[emotional-arc:error] Failed to persist audit log entry.", {
        companionId,
        eventType,
        error: error.message,
      });
    }
  }

  async function list({ limit = 50 } = {}) {
    try {
      return store ? await store.listAuditLog({ companionId, limit }) : [];
    } catch {
      return [];
    }
  }

  return { append, list };
}

module.exports = { createEmotionalAuditLog };
