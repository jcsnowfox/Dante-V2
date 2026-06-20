/**
 * relationalAuditLog
 *
 * Structured audit logging for every Relational State Engine decision. Every
 * blocked or skipped behaviour must log a reason (spec Phase 15). Mirrors
 * feedbackAuditLog.
 *
 * Log tags:
 *   [relational-state:settings:loaded]
 *   [relational-state:disabled]
 *   [relational-state:appraisal:start]
 *   [relational-state:appraisal:result]
 *   [relational-state:state:created]
 *   [relational-state:state:updated]
 *   [relational-state:expression:allowed]
 *   [relational-state:expression:blocked]
 *   [relational-state:repair:needed]
 *   [relational-state:repair:attempted]
 *   [relational-state:desire:created]
 *   [relational-state:desire:blocked]
 *   [relational-state:memory:candidate-created]
 *   [relational-state:prelude:built]
 *   [relational-state:decay:applied]
 *   [relational-state:error]
 */

function createRelationalAuditLog({ store, companionId, logger }) {
  async function append({ eventType, decision, reason = null, inputSummary = null, outputSummary = null }) {
    logger.info(`[relational-state:${eventType}] ${decision}`, {
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
      logger.warn("[relational-state:error] Failed to persist audit log entry.", {
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

module.exports = { createRelationalAuditLog };
