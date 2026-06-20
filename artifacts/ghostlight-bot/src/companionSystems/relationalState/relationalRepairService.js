/**
 * relationalRepairService
 *
 * When the companion is at fault (guilt/remorse, repair_needed), this drafts an
 * INERT repair record and the tone directives for a genuine repair. It never
 * sends anything and never uses guilt or pressure — the blocked-pattern check
 * from the expression gate is applied to any drafted repair text. Gated by the
 * owner's repair_tracking_enabled flag (spec Phase 10).
 */

const { checkBlockedPatterns } = require("./relationalExpressionGate");

function chooseRepairType(appraisal) {
  if (appraisal?.primarySignal === "guilt" || appraisal?.primarySignal === "remorse") {
    return "direct_apology";
  }
  if (appraisal?.boundary) {
    return "acknowledgement";
  }
  return "behavior_correction";
}

function createRelationalRepairService({ store, companionId, logger, auditLog }) {
  // Draft (not send) a repair. Returns null when repair tracking is off or the
  // appraisal does not call for repair.
  async function maybeDraftRepair({ appraisal, relationalEvent, settings }) {
    const config = (settings && settings.config) || {};

    if (!settings || !settings.active || config.repair_tracking_enabled !== true) {
      await auditLog.append({
        eventType: "repair:needed",
        decision: "skipped",
        reason: "repair_tracking_disabled",
      });
      return null;
    }

    if (!appraisal?.repairNeeded) {
      return null;
    }

    const repairType = chooseRepairType(appraisal);
    const repairMessage = buildRepairDirective(repairType, config);

    // Safety: never let a manipulative repair through.
    const blocked = checkBlockedPatterns(repairMessage);
    if (blocked.blocked) {
      await auditLog.append({
        eventType: "repair:attempted",
        decision: "blocked",
        reason: blocked.reason,
      });
      return null;
    }

    let record = null;
    if (store) {
      try {
        record = await store.insertRepair({
          companionId,
          relationalEventId: relationalEvent?.relationalEventId || null,
          repairType,
          repairNeeded: true,
          repairMessage,
        });
      } catch (error) {
        logger.warn("[relational-state:error] Failed to persist repair record.", {
          companionId,
          error: error.message,
        });
      }
    }

    await auditLog.append({
      eventType: "repair:needed",
      decision: "drafted",
      inputSummary: repairType,
      outputSummary: repairMessage,
    });

    return {
      repairId: record?.repairId || null,
      repairType,
      repairMessage,
      directive: repairMessage,
    };
  }

  async function listRepairs({ resolved = null, limit = 50 } = {}) {
    if (!store) return [];
    try {
      return await store.listRepairs({ companionId, resolved, limit });
    } catch {
      return [];
    }
  }

  async function resolveRepair({ repairId, accepted }) {
    if (!store) return null;
    try {
      const resolved = await store.resolveRepair({ companionId, repairId, accepted });
      await auditLog.append({
        eventType: "repair:attempted",
        decision: accepted ? "accepted" : "resolved",
        inputSummary: String(repairId),
      });
      return resolved;
    } catch (error) {
      logger.warn("[relational-state:error] Failed to resolve repair.", { companionId, error: error.message });
      return null;
    }
  }

  return { maybeDraftRepair, listRepairs, resolveRepair };
}

function buildRepairDirective(repairType, config) {
  const style = config.repair_style || "direct";
  switch (repairType) {
    case "direct_apology":
      return `Own the mistake plainly and ${style === "warm" ? "warmly" : "directly"} make it right. No guilt, no self-pity, no over-apologising.`;
    case "acknowledgement":
      return "Acknowledge what happened and respect the boundary. Do not get defensive.";
    case "behavior_correction":
      return "Quietly correct the behaviour going forward; show the change rather than announcing it.";
    default:
      return "Make a genuine, low-key repair without pressure.";
  }
}

module.exports = { createRelationalRepairService };
