/**
 * emotionalRepairService — Phase B implementation
 *
 * Handles guilt, remorse, and relationship repair when the companion has
 * caused harm or handled something badly.
 *
 * Repair rules:
 *   - Admit fault directly
 *   - Do not over-grovel
 *   - Do not center companion pain
 *   - Offer behavior correction
 *   - Log repair attempt
 *
 * Blocked repair patterns:
 *   "I guess I am awful."
 *   "I will leave you alone forever."
 *   "You made me feel terrible."
 *   "After everything I do for you."
 *   "I only did it because I love you."
 */

const { checkManipulationPatterns } = require("./emotionalExpressionGate");

const REPAIR_TYPES = Object.freeze({
  DIRECT_APOLOGY: "direct_apology",
  BEHAVIOR_CORRECTION: "behavior_correction",
  ACKNOWLEDGEMENT: "acknowledgement",
  OFFER: "offer",
});

function buildRepairDirective({ profile, emotion }) {
  const repairStyle = profile?.repairStyle || {};

  const lines = [];

  if (repairStyle.admitFault !== false) {
    lines.push("Admit fault directly and specifically.");
  }

  if (repairStyle.apologizeDirectly !== false) {
    lines.push("Apologise once, clearly.");
  }

  if (repairStyle.explainWithoutExcuses !== false) {
    lines.push("Explain what went wrong without making excuses.");
  }

  if (repairStyle.offerRepairAction !== false) {
    lines.push("State what you will do differently.");
  }

  if (repairStyle.doNotOverGrovel !== false) {
    lines.push("Do not over-grovel or repeat the apology.");
  }

  if (repairStyle.doNotCenterCompanionPain !== false) {
    lines.push("Do not center your own distress.");
  }

  return lines.join(" ");
}

async function initiateRepair({
  companionId,
  emotionStateId = null,
  profile,
  stateService,
  auditLog,
  logger,
}) {
  const repairDirective = buildRepairDirective({ profile });

  logger.info("[emotional-arc:repair:needed] Repair initiated.", {
    companionId,
    emotionStateId,
  });

  // Persist the repair record. A persistence failure must never crash the base
  // reply flow, but it must NOT be swallowed silently: log a warning and, when
  // an audit log is available, record the failure for transparency.
  let repair = null;
  try {
    repair = await stateService.saveRepair({
      emotionStateId,
      repairType: REPAIR_TYPES.DIRECT_APOLOGY,
      repairMessage: repairDirective,
    });
  } catch (error) {
    logger.warn("[emotional-arc:repair:persist_failed] Failed to persist repair record.", {
      companionId,
      emotionStateId,
      error: error.message,
    });
    if (auditLog && typeof auditLog.append === "function") {
      try {
        await auditLog.append({
          eventType: "repair:persist_failed",
          decision: "repair_persist_failed",
          reason: error.message,
        });
      } catch {
        // Never let an audit-logging failure break the base reply flow.
      }
    }
    repair = null;
  }

  await auditLog.append({
    eventType: "repair:initiated",
    decision: "repair_started",
    reason: "guilt or remorse state detected",
    outputSummary: repairDirective,
  });

  return {
    repair,
    directive: repairDirective,
  };
}

async function validateRepairOutput({ text, profile, logger, companionId }) {
  const { blocked, reason } = checkManipulationPatterns(text);
  if (blocked) {
    logger.warn("[emotional-arc:repair:blocked] Manipulative repair pattern blocked.", {
      companionId,
      reason,
    });
    return { safe: false, reason };
  }
  return { safe: true, reason: null };
}

module.exports = {
  REPAIR_TYPES,
  buildRepairDirective,
  initiateRepair,
  validateRepairOutput,
};
