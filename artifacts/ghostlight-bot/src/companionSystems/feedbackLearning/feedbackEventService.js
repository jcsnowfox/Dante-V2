/**
 * feedbackEventService
 *
 * Records raw feedback events (a button press or freeform note from the owner)
 * into companion_feedback_events. An event is just a record of what the owner
 * said — it never changes companion behaviour on its own. All events are scoped
 * to the resolved companion id.
 */

function createFeedbackEventService({ store, companionId, logger, auditLog }) {
  async function recordEvent({
    feedbackTypeId,
    feedbackLabel = null,
    feedbackText = null,
    sourceMessageId = null,
    channelId = null,
    ownerId = null,
    targetExcerpt = null,
    contextSummary = null,
  }) {
    if (!store) {
      return null;
    }

    try {
      const event = await store.insertFeedbackEvent({
        companionId,
        feedbackTypeId,
        feedbackLabel,
        feedbackText,
        sourceMessageId,
        channelId,
        ownerId,
        targetExcerpt,
        contextSummary,
      });

      await auditLog.append({
        eventType: "event:created",
        decision: "recorded",
        inputSummary: feedbackTypeId,
      });

      return event;
    } catch (error) {
      logger.warn("[feedback-learning:error] Failed to record feedback event.", {
        companionId,
        feedbackTypeId,
        error: error.message,
      });
      return null;
    }
  }

  async function listEvents({ limit = 50 } = {}) {
    if (!store) return [];
    try {
      return await store.listFeedbackEvents({ companionId, limit });
    } catch {
      return [];
    }
  }

  return { recordEvent, listEvents };
}

module.exports = { createFeedbackEventService };
