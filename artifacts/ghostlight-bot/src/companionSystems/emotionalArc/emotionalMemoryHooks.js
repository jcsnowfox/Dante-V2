/**
 * emotionalMemoryHooks — Phase B implementation
 *
 * Creates staged memory CANDIDATES when an emotional event is meaningful
 * enough to remember. Candidates are written through the existing staged
 * memory review queue (status "proposed") and are NEVER written directly
 * into live memory — a human reviews and promotes them.
 *
 * The candidates describe durable relational insights (about how the owner
 * wants the companion to behave), not raw transcripts.
 */

// Maps an appraisal triggerType to a reviewable relational insight.
const CANDIDATE_TEMPLATES = Object.freeze({
  user_boundary_violation: {
    title: "Boundary: respond to hostility with a calm boundary",
    content:
      "When the owner is hostile or abusive, hold a brief, calm boundary instead of escalating or retaliating.",
    sensitivity: "medium",
  },
  companion_mistake_acknowledged: {
    title: "Repair: prefer direct accountability over over-apologising",
    content:
      "When the companion gets something wrong, the owner responds better to a direct apology and a concrete correction than to repeated apologising.",
    sensitivity: "low",
  },
  user_insult: {
    title: "Sensitivity: harsh dismissals land hard",
    content:
      "The owner has been harsh toward the companion; track that sustained harshness creates distance that needs repair, not punishment.",
    sensitivity: "medium",
  },
  user_crisis_detected: {
    title: "Safety: suppress humour and lead with care during crisis",
    content:
      "During moments of crisis or self-harm risk, the companion should suppress jokes and lead with protective, supportive care.",
    sensitivity: "high",
  },
  user_medical_anxiety: {
    title: "Care: be gentle during medical anxiety",
    content:
      "When the owner is medically anxious, the companion should stay gentle and supportive and avoid any negative or teasing tone.",
    sensitivity: "medium",
  },
  user_return_after_silence: {
    title: "Reconnection: welcome the owner back warmly without guilt-tripping",
    content:
      "When the owner returns after silence, reconnect with warmth and no pressure — never guilt-trip them for being away.",
    sensitivity: "low",
  },
});

// Only these triggers are durable enough to propose as memories.
const MEMORY_ELIGIBLE_TRIGGERS = Object.freeze(Object.keys(CANDIDATE_TEMPLATES));

const MIN_CONFIDENCE = 0.7;

function buildDedupeKey(triggerType) {
  return `emotional_arc:${triggerType}`;
}

async function maybeCreateMemoryCandidate({
  companionId,
  appraisalResult,
  gateResult,
  messageContent,
  stagedMemories,
  userScope = "default",
  logger,
}) {
  if (!appraisalResult || !appraisalResult.primaryEmotion) {
    return null;
  }

  const triggerType = appraisalResult.triggerType;
  const template = triggerType ? CANDIDATE_TEMPLATES[triggerType] : null;
  if (!template) {
    return null;
  }

  if (!appraisalResult.confidence || appraisalResult.confidence < MIN_CONFIDENCE) {
    return null;
  }

  if (!stagedMemories || typeof stagedMemories.upsertStagedMemory !== "function") {
    logger.debug?.("[emotional-arc:memory:candidate] No staged memory store available; skipping.", {
      companionId,
      triggerType,
    });
    return null;
  }

  try {
    const candidate = await stagedMemories.upsertStagedMemory(
      {
        sourceKind: "emotional_arc",
        sourceRef: `emotional-arc:${companionId}`,
        groupingKey: `emotional-arc:${companionId}`,
        dedupeKey: buildDedupeKey(triggerType),
        title: template.title,
        content: template.content,
        memoryType: "canon",
        domain: "relationship",
        sensitivity: template.sensitivity,
        status: "proposed",
        reviewFlags: ["emotional_arc", appraisalResult.primaryEmotion],
        sourcePayload: {
          origin: "emotional_arc_engine",
          companionId,
          triggerType,
          primaryEmotion: appraisalResult.primaryEmotion,
          confidence: appraisalResult.confidence,
        },
        userScope,
      },
      { userScope },
    );

    logger.info("[emotional-arc:memory:candidate] Staged emotional memory candidate for review.", {
      companionId,
      triggerType,
      stagedMemoryId: candidate?.stagedMemoryId || null,
    });

    return candidate;
  } catch (error) {
    logger.warn("[emotional-arc:memory:candidate] Failed to stage emotional memory candidate.", {
      companionId,
      triggerType,
      error: error.message,
    });
    return null;
  }
}

module.exports = {
  MEMORY_ELIGIBLE_TRIGGERS,
  CANDIDATE_TEMPLATES,
  maybeCreateMemoryCandidate,
};
