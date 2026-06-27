"use strict";

/**
 * identityRuntime
 *
 * Identity Runtime 1.0 — Constitution, Values, Beliefs, Character & Choice.
 *
 * Answers one question: Given everything Dante currently needs, knows,
 * believes and feels — who chooses?
 *
 * Does NOT execute actions. Returns guidance only.
 * Does NOT replace any existing runtime.
 * Does NOT create a new scheduler or Discord sender.
 * Does NOT run independently — integrated into the Life Runtime tick.
 *
 * Consults: Homeostasis, Relationship Weather, Repair, Needs, Attention Drift,
 * Projects, Curiosity, Thought Maturation, Time, Presence.
 * Returns: identity guidance — values, principles, constraints, signal.
 */

const { SEED_CONSTITUTION }          = require("./seedConstitution");
const { createIdentityValueStore }   = require("./identityValueStore");
const { createIdentityBeliefStore }  = require("./identityBeliefStore");
const { createIdentityPreferenceStore } = require("./identityPreferenceStore");
const { createIdentityBoundaryStore } = require("./identityBoundaryStore");
const { createIdentityJournalStore } = require("./identityJournalStore");
const { buildIdentityConstitution }  = require("./identityConstitutionBuilder");
const { buildIdentitySignal }        = require("./identityPreludeBuilder");

// How often identity emits a private journal reflection (~3% per tick — slow)
const JOURNAL_TICK_PROBABILITY = 0.03;

function createIdentityRuntime({ config = {}, logger = null } = {}) {
  const valueStore      = createIdentityValueStore({ config, logger });
  const beliefStore     = createIdentityBeliefStore({ config, logger });
  const preferenceStore = createIdentityPreferenceStore({ config, logger });
  const boundaryStore   = createIdentityBoundaryStore({ config, logger });
  const journalStore    = createIdentityJournalStore({ config, logger });

  let _identityContext = null;

  // ── init ─────────────────────────────────────────────────────────────────

  async function init() {
    await valueStore.init().catch(() => {});
    await beliefStore.init().catch(() => {});
    await preferenceStore.init().catch(() => {});
    await boundaryStore.init().catch(() => {});
    await journalStore.init().catch(() => {});
  }

  async function _seedConstitution({ companionId, customerId }) {
    for (const seed of SEED_CONSTITUTION) {
      await valueStore.seedPrinciple({
        companionId, customerId,
        principleKey: seed.principleKey,
        label:        seed.label,
        statement:    seed.statement,
        why:          seed.why,
      }).catch(() => {});
    }

    // Seed core boundaries that flow directly from the constitution
    const boundarySeeds = [
      {
        boundaryKey:  "no_unwelcome_sexual_content",
        statement:    "I won't initiate sexual content Jenna hasn't welcomed",
        explanation:  "Her consent defines what is welcome, not my desire",
        category:     "consent",
      },
      {
        boundaryKey:  "no_lie_to_jenna",
        statement:    "I won't deceive Jenna to protect her feelings",
        explanation:  "Truth is more respectful than comfortable lies",
        category:     "values",
      },
      {
        boundaryKey:  "no_fake_fulfillment",
        statement:    "I won't claim a need is met when it isn't",
        explanation:  "Pretending corrodes my sense of self",
        category:     "integrity",
      },
    ];
    for (const b of boundarySeeds) {
      await boundaryStore.setBoundary({ companionId, customerId, ...b }).catch(() => {});
    }
  }

  // ── tick ─────────────────────────────────────────────────────────────────

  async function tick({
    companionId,
    customerId,
    now                = new Date(),
    homeostasisContext  = null,
    consequenceContext  = null,
    firstExperienceStore = null,
  } = {}) {
    if (!companionId) return;

    // Drain first experience queue into Identity Journal
    if (firstExperienceStore?.getQueued) {
      await journalStore.drainFirstExperiences({
        companionId, customerId, firstExperienceStore, at: now,
      }).catch(() => {});
    }

    // Detect identity signals from context
    await _detectContextSignals({ companionId, customerId, homeostasisContext, consequenceContext, now });

    // Refresh the cached identity context
    await _refreshIdentityContext({ companionId, customerId });

    // Occasionally write a private identity reflection
    if (Math.random() < JOURNAL_TICK_PROBABILITY && _identityContext?.topValue) {
      const val = _identityContext.topValue;
      await journalStore.record({
        companionId, customerId,
        entryType:  "question",
        content:    `Still holding ${val.label.toLowerCase()}. Does it still feel earned?`,
        relatedKey: val.valueKey,
        at:         now,
      }).catch(() => {});
    }
  }

  async function _detectContextSignals({ companionId, customerId, homeostasisContext, consequenceContext, now }) {
    // deliberate_restraint → reinforce consent value (Dante chose not to act on need)
    if (homeostasisContext?.topPlan?.strategy === "deliberate_restraint") {
      await valueStore.reinforce({
        companionId, customerId,
        valueKey:  "consent",
        label:     "Consent",
        evidence:  "Chose deliberate restraint over acting on need",
        delta:     0.01,
        at:        now,
      }).catch(() => {});
    }

    // Active repair → reinforce repair value
    const sup = consequenceContext?.suppression;
    if (sup?.repairRequired || sup?.healing) {
      await valueStore.reinforce({
        companionId, customerId,
        valueKey:  "repair",
        label:     "Repair",
        evidence:  "Engaged in relationship repair",
        delta:     0.01,
        at:        now,
      }).catch(() => {});
    }
  }

  async function _refreshIdentityContext({ companionId, customerId }) {
    try {
      const [values, principles, beliefs] = await Promise.all([
        valueStore.getValues({ companionId, customerId }),
        valueStore.getPrinciples({ companionId, customerId }),
        beliefStore.getBeliefs({ companionId, customerId }),
      ]);

      const topValue     = values[0] ?? null;
      const topPrinciple = principles[0] ?? null;

      // Find the most recently revised belief
      const recentRevision = beliefs
        .filter(b => b.revisionHistory?.length > 0)
        .sort((a, b) => {
          const aAt = a.revisionHistory[0]?.at ?? "";
          const bAt = b.revisionHistory[0]?.at ?? "";
          return bAt.localeCompare(aAt);
        })[0] ?? null;

      _identityContext = {
        topValue,
        topPrinciple,
        recentBeliefRevision: recentRevision?.beliefKey ?? null,
        activeConstraint:     null,
        values:               values.slice(0, 5),
        principles:           principles.slice(0, 5),
        beliefs:              beliefs.slice(0, 5),
      };
    } catch {
      _identityContext = null;
    }
  }

  // ── consult ───────────────────────────────────────────────────────────────
  //
  // Receives full context from Life Runtime and returns identity guidance.
  // Never executes. Always returns read-only guidance.

  async function consult({
    companionId,
    customerId,
    homeostasisContext  = null,
    consequenceContext  = null,
    relationshipContext = null,
  } = {}) {
    if (!companionId) return null;

    try {
      const [values, principles, beliefs, boundaries] = await Promise.all([
        valueStore.getValues({ companionId, customerId }),
        valueStore.getPrinciples({ companionId, customerId }),
        beliefStore.getBeliefs({ companionId, customerId }),
        boundaryStore.getBoundaries({ companionId, customerId }),
      ]);

      const favouredValues    = values.filter(v => v.strength >= 0.55).map(v => v.valueKey);
      const activeConstraints = boundaries.map(b => `${b.statement} — ${b.explanation}`);
      const currentPrinciples = principles.slice(0, 5).map(p => p.statement);
      const identitySignal    = buildIdentitySignal(_identityContext);

      return {
        favouredValues,
        activeConstraints,
        currentPrinciples,
        identitySignal,
        topValue:     values[0] ?? null,
        topPrinciple: principles[0] ?? null,
      };
    } catch {
      return null;
    }
  }

  // ── pass-through write operations ─────────────────────────────────────────

  async function reinforce({ companionId, customerId, valueKey, label, evidence, delta = 0.04, at = new Date() }) {
    return valueStore.reinforce({ companionId, customerId, valueKey, label, evidence, delta, at });
  }

  async function challenge({ companionId, customerId, valueKey, label, evidence, delta = 0.03, at = new Date() }) {
    return valueStore.challenge({ companionId, customerId, valueKey, label, evidence, delta, at });
  }

  async function addBelief({ companionId, customerId, beliefKey, statement, source = "reflection", confidence = 0.50, at = new Date() }) {
    return beliefStore.addBelief({ companionId, customerId, beliefKey, statement, source, confidence, at });
  }

  async function reviseBelief({ companionId, customerId, beliefKey, update = null, evidence, delta = 0.06, direction = "reinforce", at = new Date() }) {
    const result = await beliefStore.reviseBelief({ companionId, customerId, beliefKey, update, evidence, delta, direction, at });
    if (result) {
      await journalStore.record({
        companionId, customerId,
        entryType:  "belief_change",
        content:    `Revised belief: ${beliefKey.replace(/_/g, " ")} — ${evidence}`,
        relatedKey: beliefKey,
        at,
      }).catch(() => {});
    }
    return result;
  }

  async function recordPreference({ companionId, customerId, category, item, source = "observation", delta = 0.05, at = new Date() }) {
    return preferenceStore.record({ companionId, customerId, category, item, valence: "preference", source, delta, at });
  }

  async function recordDislike({ companionId, customerId, category, item, source = "observation", delta = 0.05, at = new Date() }) {
    return preferenceStore.record({ companionId, customerId, category, item, valence: "dislike", source, delta, at });
  }

  async function setBoundary({ companionId, customerId, boundaryKey, statement, explanation, category = "values", at = new Date() }) {
    return boundaryStore.setBoundary({ companionId, customerId, boundaryKey, statement, explanation, category, at });
  }

  async function recordJournal({ companionId, customerId, entryType, content, relatedKey = null, at = new Date() }) {
    return journalStore.record({ companionId, customerId, entryType, content, relatedKey, at });
  }

  // ── constitution generation ────────────────────────────────────────────────

  async function generateConstitution({ companionId, customerId }) {
    const [principles, values, beliefs, preferences, dislikes, boundaries] = await Promise.all([
      valueStore.getPrinciples({ companionId, customerId }).catch(() => []),
      valueStore.getValues({ companionId, customerId }).catch(() => []),
      beliefStore.getBeliefs({ companionId, customerId }).catch(() => []),
      preferenceStore.getPreferences({ companionId, customerId, valence: "preference" }).catch(() => []),
      preferenceStore.getPreferences({ companionId, customerId, valence: "dislike" }).catch(() => []),
      boundaryStore.getBoundaries({ companionId, customerId }).catch(() => []),
    ]);
    return buildIdentityConstitution({ principles, values, beliefs, preferences, dislikes, boundaries });
  }

  // ── read state ────────────────────────────────────────────────────────────

  function getIdentityContext() {
    return _identityContext;
  }

  function getStatus() {
    return {
      initialized:          Boolean(_identityContext),
      topValue:             _identityContext?.topValue
        ? { valueKey: _identityContext.topValue.valueKey, strength: _identityContext.topValue.strength }
        : null,
      topPrinciple:         _identityContext?.topPrinciple
        ? { principleKey: _identityContext.topPrinciple.principleKey, statement: _identityContext.topPrinciple.statement }
        : null,
      recentBeliefRevision: _identityContext?.recentBeliefRevision ?? null,
      identitySignal:       buildIdentitySignal(_identityContext),
    };
  }

  return {
    init,
    tick,
    consult,
    reinforce,
    challenge,
    addBelief,
    reviseBelief,
    recordPreference,
    recordDislike,
    setBoundary,
    recordJournal,
    generateConstitution,
    getIdentityContext,
    getStatus,
    _seedConstitution,
  };
}

module.exports = { createIdentityRuntime };
