/**
 * feedbackMemoryHooks
 *
 * When the owner gives memory-related feedback (e.g. "Remember this" or a bad
 * memory correction), the engine may create a staged memory CANDIDATE through
 * the existing review queue (status "proposed"). It NEVER writes live memory —
 * a human reviews and promotes it. Mirrors emotionalMemoryHooks exactly.
 */

const { MEMORY_FEEDBACK_TYPES } = require("./feedbackTypes");

function buildDedupeKey(companionId, feedbackTypeId, sourceMessageId) {
  return `feedback_learning:${companionId}:${feedbackTypeId}:${sourceMessageId || "manual"}`;
}

async function maybeCreateMemoryCandidate({
  companionId,
  feedbackType,
  feedbackEvent,
  settings,
  stagedMemories,
  userScope = "default",
  logger,
  auditLog,
}) {
  if (!feedbackType || !MEMORY_FEEDBACK_TYPES.includes(feedbackType.id)) {
    return null;
  }

  if (!settings || !settings.active || settings.config.memory_candidate_creation_enabled !== true) {
    await auditLog.append({
      eventType: "memory:candidate-created",
      decision: "skipped",
      reason: "memory_candidate_creation_disabled",
    });
    return null;
  }

  if (!stagedMemories || typeof stagedMemories.upsertStagedMemory !== "function") {
    logger.debug?.("[feedback-learning:memory:candidate-created] No staged memory store available; skipping.", {
      companionId,
      feedbackTypeId: feedbackType.id,
    });
    return null;
  }

  const ownerText = String(feedbackEvent?.feedbackText || "").trim();
  const content = ownerText
    ? `Owner feedback (${feedbackType.label}): ${ownerText}`
    : `${feedbackType.directive}`;

  try {
    const candidate = await stagedMemories.upsertStagedMemory(
      {
        sourceKind: "feedback_learning",
        sourceRef: `feedback-learning:${companionId}`,
        groupingKey: `feedback-learning:${companionId}`,
        dedupeKey: buildDedupeKey(companionId, feedbackType.id, feedbackEvent?.sourceMessageId),
        title: feedbackType.title,
        content,
        memoryType: "canon",
        domain: "relationship",
        sensitivity: "low",
        status: "proposed",
        reviewFlags: ["feedback_learning", feedbackType.id],
        sourcePayload: {
          origin: "feedback_learning_engine",
          companionId,
          feedbackTypeId: feedbackType.id,
          sourceMessageId: feedbackEvent?.sourceMessageId || null,
        },
        userScope,
      },
      { userScope },
    );

    await auditLog.append({
      eventType: "memory:candidate-created",
      decision: "staged",
      inputSummary: feedbackType.id,
      outputSummary: candidate?.stagedMemoryId || null,
    });

    return candidate;
  } catch (error) {
    logger.warn("[feedback-learning:error] Failed to stage feedback memory candidate.", {
      companionId,
      feedbackTypeId: feedbackType.id,
      error: error.message,
    });
    return null;
  }
}

module.exports = {
  maybeCreateMemoryCandidate,
};
