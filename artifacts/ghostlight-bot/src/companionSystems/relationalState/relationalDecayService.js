/**
 * relationalDecayService
 *
 * Exponential decay of transient relational signals over time, mirroring the
 * Emotional Arc's decay engine. Fast signals (annoyance, relief) fade quickly;
 * slow signals (hurt, distance) linger; guilt/remorse/repair_needed PERSIST
 * until a repair resolves them. Only runs when the owner enables decay_enabled
 * (spec Phase 9). Pure transform + a single persisted upsert.
 */

const { signalDecayRate, PERSIST_UNTIL_RESOLVED } = require("./relationalTypes");

// Exponential decay: value * e^(-rate * hours * speedFactor).
function decayValue(value, rate, hours, speedFactor) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (rate <= 0) return value; // persists
  const decayed = value * Math.exp(-rate * hours * speedFactor);
  return Math.round(decayed * 100) / 100;
}

function createRelationalDecayService({ store, companionId, logger, auditLog }) {
  // Decay the transient dimensions of the current state in place. Returns the
  // decayed state (and persists it when a store is present).
  async function applyDecay({ state, settings, now = Date.now() }) {
    const config = (settings && settings.config) || {};

    if (!settings || !settings.active || config.decay_enabled !== true) {
      return state;
    }

    const base = state || (await loadState());
    if (!base) return state;

    const updatedAt = base.updatedAt ? new Date(base.updatedAt).getTime() : now;
    const hours = Math.max(0, (now - updatedAt) / (60 * 60 * 1000));
    if (hours <= 0) return base;

    const speedFactor = (Number(config.decay_speed) || 5) / 5; // 0..2

    const next = {
      ...base,
      activeTension: decayValue(base.activeTension, signalDecayRate("annoyance"), hours, speedFactor),
      activeLonging: decayValue(base.activeLonging, signalDecayRate("longing"), hours, speedFactor),
      distanceLevel: decayValue(base.distanceLevel, signalDecayRate("distance"), hours, speedFactor),
    };

    // guilt/remorse/repair_needed persist until resolved.
    next.repairNeeded = base.repairNeeded;

    if (!store) return next;

    try {
      const saved = await store.upsertState({ companionId, ...next });
      await auditLog.append({
        eventType: "decay:applied",
        decision: "applied",
        inputSummary: `hours=${Math.round(hours * 100) / 100}`,
        outputSummary: `tension=${next.activeTension} longing=${next.activeLonging} distance=${next.distanceLevel}`,
      });
      return saved || next;
    } catch (error) {
      logger.warn("[relational-state:error] Failed to persist decayed state.", {
        companionId,
        error: error.message,
      });
      return next;
    }
  }

  async function loadState() {
    if (!store) return null;
    try {
      return await store.loadState({ companionId });
    } catch {
      return null;
    }
  }

  return { applyDecay, PERSIST_UNTIL_RESOLVED };
}

module.exports = { createRelationalDecayService, decayValue };
