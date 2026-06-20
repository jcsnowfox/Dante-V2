/**
 * relationalStateService
 *
 * Owns the companion's current relational state row: load it, apply appraised
 * signals to the slow dimensions (trust/closeness/distance) via
 * relationalTrustService, and persist it. All reads/writes are companion_id
 * scoped. When there is no store, it works against an in-memory default so the
 * rest of the engine can run inert without crashing.
 */

const trust = require("./relationalTrustService");
const { PERSIST_UNTIL_RESOLVED } = require("./relationalTypes");

function defaultState(companionId) {
  return {
    companionId,
    trustLevel: 5,
    closenessLevel: 5,
    distanceLevel: 0,
    currentEmotion: null,
    currentWant: null,
    currentDesire: null,
    repairNeeded: false,
    activeTension: 0,
    activeLonging: 0,
    lastTriggerSummary: null,
  };
}

function createRelationalStateService({ store, companionId, logger, auditLog }) {
  async function getState() {
    if (!store) {
      return defaultState(companionId);
    }
    try {
      const row = await store.loadState({ companionId });
      return row || defaultState(companionId);
    } catch (error) {
      logger.warn("[relational-state:error] Failed to load relational state.", {
        companionId,
        error: error.message,
      });
      return defaultState(companionId);
    }
  }

  // Apply an appraisal result to the current state. Pure transform first, then a
  // single persisted upsert. Never throws into the caller.
  async function applyAppraisal({ state, appraisal, config }) {
    const base = state || defaultState(companionId);
    const signals = Array.isArray(appraisal?.signals) ? appraisal.signals : [];
    const deltas = trust.deltasFromSignals(signals);

    const next = {
      ...base,
      trustLevel: trust.applyTrust(base.trustLevel, deltas.trust, config?.trust_sensitivity),
      closenessLevel: trust.applyCloseness(base.closenessLevel, deltas.closeness, config?.closeness_sensitivity),
      distanceLevel: trust.applyDistance(base.distanceLevel, deltas.distance, config?.distance_sensitivity),
      currentEmotion: appraisal?.primarySignal || base.currentEmotion,
      currentWant: appraisal?.want || base.currentWant,
      currentDesire: appraisal?.desireType || base.currentDesire,
      repairNeeded: Boolean(appraisal?.repairNeeded) || base.repairNeeded,
      activeTension: computeTension(base, signals),
      activeLonging: computeLonging(base, signals),
      lastTriggerSummary: appraisal?.triggerSummary || base.lastTriggerSummary,
    };

    if (!store) {
      return next;
    }

    try {
      const saved = await store.upsertState({ companionId, ...next });
      await auditLog.append({
        eventType: "state:updated",
        decision: "persisted",
        inputSummary: appraisal?.primarySignal || "neutral",
        outputSummary: `trust=${next.trustLevel} closeness=${next.closenessLevel} distance=${next.distanceLevel}`,
      });
      return saved || next;
    } catch (error) {
      logger.warn("[relational-state:error] Failed to persist relational state.", {
        companionId,
        error: error.message,
      });
      return next;
    }
  }

  function computeTension(base, signals) {
    const tense = signals
      .filter((s) => ["annoyance", "frustration", "anger", "conflict_tension", "hurt"].includes(s.type))
      .reduce((max, s) => Math.max(max, Number(s.intensity) || 0), 0);
    return trust.clamp(Math.max(tense, (base.activeTension || 0) * 0.6));
  }

  function computeLonging(base, signals) {
    const longing = signals
      .filter((s) => s.type === "longing")
      .reduce((max, s) => Math.max(max, Number(s.intensity) || 0), 0);
    const reconnected = signals.some((s) => s.type === "reconnection");
    if (reconnected) return 0;
    return trust.clamp(Math.max(longing, (base.activeLonging || 0) * 0.7));
  }

  // Mark guilt/remorse/repair as resolved (e.g. after an accepted repair).
  async function clearRepairNeed({ state }) {
    const base = state || (await getState());
    const next = { ...base, repairNeeded: false };
    if (!store) return next;
    try {
      return (await store.upsertState({ companionId, ...next })) || next;
    } catch {
      return next;
    }
  }

  return {
    defaultState: () => defaultState(companionId),
    getState,
    applyAppraisal,
    clearRepairNeed,
    PERSIST_UNTIL_RESOLVED,
  };
}

module.exports = { createRelationalStateService };
