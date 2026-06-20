const { createEmotionalArcStore } = require("../../storage/emotionalArc");
const { createEmotionStateService } = require("./emotionStateService");
const { createEmotionalAuditLog } = require("./emotionalAuditLog");
const { createEmotionalArcScheduler } = require("./emotionalArcScheduler");
const { runAppraisal } = require("./emotionalAppraisalEngine");
const { applyDecay, runDecayCycle } = require("./emotionalDecayEngine");
const { runExpressionGate, checkManipulationPatterns } = require("./emotionalExpressionGate");
const { buildEmotionalPrelude } = require("./emotionalPreludeBuilder");
const { initiateRepair, validateRepairOutput, buildRepairDirective } = require("./emotionalRepairService");
const { maybeCreateMemoryCandidate } = require("./emotionalMemoryHooks");
const { EMOTION_REGISTRY, EMOTION_IDS, EXPRESSION_MODES, getEmotion, isValidEmotionId } = require("./emotionTypes");
const { validateProfile, mergeWithDefaults, DEFAULT_PROFILE, VALID_EMOTIONAL_DEPTHS } = require("./emotionProfileSchema");

// Neutral, non-manipulative, companion-neutral replacement used when the
// post-model safety check hard-blocks an outbound reply. Kept short and free of
// pressure, threats, guilt, or escalation.
const SAFE_FALLBACK_RESPONSE =
  "I need to reset that response. I'm going to answer without pressure, threats, guilt, or escalation.";

function createEmotionalArcEngine({ config, logger, stagedMemories = null }) {
  const store = createEmotionalArcStore({ config, logger });

  const userScope = config?.memory?.userScope || "default";

  const stateService = createEmotionStateService({ store, config, logger });

  const companionId = stateService.resolveCompanionId();

  const auditLog = createEmotionalAuditLog({ store, companionId, logger });

  const scheduler = createEmotionalArcScheduler({
    stateService,
    profile: null,
    logger,
    companionId,
  });

  async function init() {
    await store.init();
    logger.info("[emotional-arc] Emotional Arc Engine initialised.", { companionId });
  }

  async function processMessage({
    message,
    recentHistory = [],
    channelContext = {},
    memoryContext = [],
    relationshipState = null,
    userState = {},
    safetyContext = {},
  }) {
    const profile = await stateService.loadProfile();

    if (!profile.persisted || !profile.enabled || profile.emotionalDepth === "off") {
      return {
        profile,
        appraisalResult: null,
        emotionState: null,
        gateResult: null,
        preludeSection: null,
        repairDirective: null,
      };
    }

    const existingState = await stateService.getCurrentState();

    await auditLog.append({
      eventType: "appraisal:start",
      decision: "appraisal_started",
      inputSummary: String(message || "").slice(0, 200),
    });

    const appraisalResult = await runAppraisal({
      companionId,
      message,
      recentHistory,
      channelContext,
      memoryContext,
      relationshipState,
      existingState,
      profile,
      logger,
    });

    await auditLog.append({
      eventType: "appraisal:result",
      decision: appraisalResult.primaryEmotion || "neutral",
      reason: appraisalResult.triggerSummary || null,
      outputSummary: JSON.stringify({
        emotion: appraisalResult.primaryEmotion,
        intensity: appraisalResult.intensity,
        confidence: appraisalResult.confidence,
      }),
    });

    let emotionState = null;
    if (appraisalResult.primaryEmotion && appraisalResult.intensity > 0) {
      const event = await stateService.recordEvent({
        source: "message",
        sourceMessageId: null,
        eventType: "appraisal",
        contextSummary: appraisalResult.triggerSummary || null,
        detectedEmotions: appraisalResult.detectedEmotions,
        confidence: appraisalResult.confidence,
      });

      emotionState = await stateService.saveState({
        primaryEmotion: appraisalResult.primaryEmotion,
        secondaryEmotion: appraisalResult.secondaryEmotion || null,
        intensity: appraisalResult.intensity,
        triggerSummary: appraisalResult.triggerSummary,
        sourceEventId: event ? String(event.id) : null,
        expressionAllowed: false,
        expressionMode: "internal_only",
        actionAllowed: appraisalResult.actionAllowed,
        repairNeeded: appraisalResult.repairNeeded,
      });

      await auditLog.append({
        eventType: "state:updated",
        decision: appraisalResult.primaryEmotion,
        outputSummary: `intensity=${appraisalResult.intensity}`,
      });
    }

    const gateResult = runExpressionGate({
      appraisalResult,
      profile,
      userState,
      channelContext,
      safetyContext,
      logger,
      companionId,
    });

    const gateDecision = gateResult.allowExpression ? "allowed" : "blocked";
    await auditLog.append({
      eventType: `expression:${gateDecision}`,
      decision: gateDecision,
      reason: gateResult.blockedReason || null,
      outputSummary: gateResult.expressionMode,
    });

    const preludeSection = buildEmotionalPrelude({
      appraisalResult,
      gateResult,
      profile,
      logger,
      companionId,
    });

    if (preludeSection) {
      await auditLog.append({
        eventType: "prelude:built",
        decision: "prelude_generated",
        outputSummary: preludeSection.content?.slice(0, 200),
      });
    }

    let repairDirective = null;
    if (appraisalResult.repairNeeded) {
      await auditLog.append({
        eventType: "repair:needed",
        decision: "repair_required",
        reason: appraisalResult.triggerSummary || null,
      });

      const repairResult = await initiateRepair({
        companionId,
        emotionStateId: emotionState?.id || null,
        profile,
        stateService,
        auditLog,
        logger,
      });
      repairDirective = repairResult.directive;
    }

    await maybeCreateMemoryCandidate({
      companionId,
      appraisalResult,
      gateResult,
      messageContent: message,
      stagedMemories,
      userScope,
      logger,
    });

    return {
      profile,
      appraisalResult,
      emotionState,
      gateResult,
      preludeSection,
      repairDirective,
    };
  }

  async function validateOutputSafety({ text }) {
    const { blocked, reason } = checkManipulationPatterns(text);

    // Safe output passes through unchanged.
    if (!blocked) {
      return { blocked: false, reason: null, safeText: text };
    }

    // Real interception: the unsafe reply must NOT be sent as-is. Substitute a
    // neutral safe fallback and record the block + replacement. Auditing is
    // wrapped so that even an audit failure cannot fail-open the interception —
    // `safeText` is always returned for a blocked reply.
    const safeText = SAFE_FALLBACK_RESPONSE;

    try {
      await auditLog.append({
        eventType: "expression:blocked",
        decision: "output_blocked",
        reason,
        inputSummary: text?.slice(0, 200),
      });
      await auditLog.append({
        eventType: "expression:replaced",
        decision: "output_replaced",
        reason,
        outputSummary: safeText,
      });
    } catch {
      // Auditing must never prevent the unsafe reply from being intercepted.
    }

    return { blocked: true, reason, safeText };
  }

  async function markRepairAttempted({ stateId, accepted }) {
    await stateService.resolveRepair(stateId, accepted);
    await auditLog.append({
      eventType: "repair:attempted",
      decision: accepted ? "repair_accepted" : "repair_not_yet_accepted",
    });
  }

  return {
    init,
    processMessage,
    validateOutputSafety,
    markRepairAttempted,
    stateService,
    auditLog,
    scheduler,
    store,
  };
}

module.exports = {
  createEmotionalArcEngine,
  EMOTION_REGISTRY,
  EMOTION_IDS,
  EXPRESSION_MODES,
  getEmotion,
  isValidEmotionId,
  validateProfile,
  mergeWithDefaults,
  DEFAULT_PROFILE,
  VALID_EMOTIONAL_DEPTHS,
};
