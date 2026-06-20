/**
 * relationalEventService
 *
 * Records raw relational events (the result of an appraisal) into
 * companion_relational_events. An event is just a record of what was detected —
 * it never changes companion behaviour on its own. All events are scoped to the
 * resolved companion id and respect the owner's max_relational_events_per_day.
 */

function createRelationalEventService({ store, companionId, logger, auditLog }) {
  async function recordEvent({
    source = "chat",
    sourceMessageId = null,
    channelId = null,
    eventType,
    triggerSummary = null,
    detectedState = {},
    confidence = null,
    maxPerDay = null,
  }) {
    if (!store) {
      return null;
    }

    try {
      if (maxPerDay != null && Number.isFinite(maxPerDay)) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const count = await store.countEventsSince({ companionId, since });
        if (count >= maxPerDay) {
          await auditLog.append({
            eventType: "appraisal:result",
            decision: "skipped",
            reason: "max_relational_events_per_day_reached",
            inputSummary: eventType,
          });
          return null;
        }
      }

      const event = await store.insertEvent({
        companionId,
        source,
        sourceMessageId,
        channelId,
        eventType,
        triggerSummary,
        detectedState,
        confidence,
      });

      await auditLog.append({
        eventType: "state:created",
        decision: "recorded",
        inputSummary: eventType,
        outputSummary: triggerSummary,
      });

      return event;
    } catch (error) {
      logger.warn("[relational-state:error] Failed to record relational event.", {
        companionId,
        eventType,
        error: error.message,
      });
      return null;
    }
  }

  async function listEvents({ limit = 50 } = {}) {
    if (!store) return [];
    try {
      return await store.listEvents({ companionId, limit });
    } catch {
      return [];
    }
  }

  return { recordEvent, listEvents };
}

module.exports = { createRelationalEventService };
