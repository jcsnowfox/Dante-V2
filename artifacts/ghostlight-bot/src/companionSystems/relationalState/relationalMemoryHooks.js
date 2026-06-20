/**
 * relationalMemoryHooks
 *
 * When a relational moment is significant enough, the engine may create a staged
 * memory CANDIDATE through the existing review queue (status "proposed"). It
 * NEVER writes live memory — a human reviews and promotes it. Mirrors
 * feedbackMemoryHooks / emotionalMemoryHooks exactly. Gated by
 * memory_hooks_enabled (spec Phase 13).
 */

function buildDedupeKey(companionId, primarySignal, sourceMessageId) {
  return `relational_state:${companionId}:${primarySignal}:${sourceMessageId || "manual"}`;
}

async function maybeCreateMemoryCandidate({
  companionId,
  appraisal,
  settings,
  stagedMemories,
  sourceMessageId = null,
  userScope = "default",
  logger,
  auditLog,
}) {
  const config = (settings && settings.config) || {};

  if (!settings || !settings.active || config.memory_hooks_enabled !== true) {
    await auditLog.append({
      eventType: "memory:candidate-created",
      decision: "skipped",
      reason: "memory_hooks_disabled",
    });
    return null;
  }

  if (!appraisal?.memoryEligible || !appraisal.primarySignal) {
    return null;
  }

  if (!stagedMemories || typeof stagedMemories.upsertStagedMemory !== "function") {
    logger.debug?.("[relational-state:memory:candidate-created] No staged memory store; skipping.", {
      companionId,
    });
    return null;
  }

  const content = `Relational moment (${appraisal.primarySignal}, intensity ${appraisal.intensity}): ${appraisal.triggerSummary || ""}`.trim();

  try {
    const candidate = await stagedMemories.upsertStagedMemory(
      {
        sourceKind: "relational_state",
        sourceRef: `relational-state:${companionId}`,
        groupingKey: `relational-state:${companionId}`,
        dedupeKey: buildDedupeKey(companionId, appraisal.primarySignal, sourceMessageId),
        title: `Relational: ${appraisal.primarySignal}`,
        content,
        memoryType: "canon",
        domain: "relationship",
        sensitivity: "low",
        status: "proposed",
        reviewFlags: ["relational_state", appraisal.primarySignal],
        sourcePayload: {
          origin: "relational_state_engine",
          companionId,
          primarySignal: appraisal.primarySignal,
          intensity: appraisal.intensity,
          sourceMessageId: sourceMessageId || null,
        },
        userScope,
      },
      { userScope },
    );

    await auditLog.append({
      eventType: "memory:candidate-created",
      decision: "staged",
      inputSummary: appraisal.primarySignal,
      outputSummary: candidate?.stagedMemoryId || null,
    });

    return candidate;
  } catch (error) {
    logger.warn("[relational-state:error] Failed to stage relational memory candidate.", {
      companionId,
      error: error.message,
    });
    return null;
  }
}

module.exports = { maybeCreateMemoryCandidate };
