/**
 * feedbackAuditLog
 *
 * Structured audit logging for every Feedback & Learning Engine decision.
 * Every blocked or skipped behaviour must log a reason (Phase 13).
 *
 * Log tags:
 *   [feedback-learning:settings:loaded]
 *   [feedback-learning:disabled]
 *   [feedback-learning:event:created]
 *   [feedback-learning:proposal:created]
 *   [feedback-learning:proposal:approved]
 *   [feedback-learning:proposal:rejected]
 *   [feedback-learning:proposal:applied]
 *   [feedback-learning:proposal:blocked]
 *   [feedback-learning:memory:candidate-created]
 *   [feedback-learning:prelude:built]
 *   [feedback-learning:error]
 */

function createFeedbackAuditLog({ store, companionId, logger }) {
  async function append({ eventType, decision, reason = null, inputSummary = null, outputSummary = null }) {
    logger.info(`[feedback-learning:${eventType}] ${decision}`, {
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
      logger.warn("[feedback-learning:error] Failed to persist audit log entry.", {
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

module.exports = { createFeedbackAuditLog };
