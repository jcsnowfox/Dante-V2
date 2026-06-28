"use strict";

/**
 * emergentLivingBehaviorRuntime
 *
 * Dante's Emergent Living Behavior & Relationship DNA layer. It discovers what
 * Dante and Jenna are *becoming together* by watching what repeats across every
 * other runtime, then promoting repeated evidence through lifecycle stages.
 *
 * CORE LAW: Nothing becomes "ours" from one moment. Repeated evidence only.
 * (Enforced structurally by emergencePatternDetector.computeStage, which the
 *  stores call — a single event can never exceed the "observed" stage.)
 *
 * What this runtime does, each Life Runtime tick:
 *   1. Reads the runtime contexts already produced this tick (read-only).
 *   2. Derives evidence observations (emergencePatternDetector).
 *   3. Accumulates them into the living-behavior and relationship-DNA stores.
 *   4. Periodically decays stale patterns.
 *   5. Builds a private relationship-culture snapshot.
 *   6. Builds compact, read-only guidance for the systems that actually act.
 *   7. Builds at most one compact prelude line.
 *   8. Caches an EmergentContext that influenced runtimes can READ next cycle.
 *
 * What this runtime never does:
 *   - Send Discord messages (no sender, no gateway import).
 *   - Create a scheduler or any timer. It has no cadence of its own; it runs
 *     only when the existing Life Runtime tick calls it.
 *   - Mutate identity, homeostasis, repair, weather, or any state it does not
 *     own. It writes ONLY its own two stores.
 *   - Replace or bypass any existing runtime. It advises; it does not act.
 *
 * Dante ONLY — not a general companion emergence runtime.
 */

const { createLivingBehaviorStore }   = require("./livingBehaviorStore");
const { createRelationshipDnaStore }  = require("./relationshipDnaStore");
const { deriveObservations }          = require("./emergencePatternDetector");
const { buildRelationshipCulture }    = require("./relationshipCultureBuilder");
const { buildEmergentGuidance }       = require("./emergentBehaviorGuidanceBuilder");
const { buildEmergentLivingPrelude }  = require("./emergentLivingPreludeBuilder");

const DECAY_EVERY_TICKS = 20;

function createEmergentLivingBehaviorRuntime({
  config = {},
  logger = null,
  livingBehaviorStore = null,
  relationshipDnaStore = null,
} = {}) {
  const behaviors = livingBehaviorStore  || createLivingBehaviorStore({ config, logger });
  const dna       = relationshipDnaStore || createRelationshipDnaStore({ config, logger });

  let _emergentContext = null;
  let _lastTickAt = null;
  let _tickCount = 0;
  let _recentPatternTypes = [];

  async function init() {
    await behaviors.init?.();
    await dna.init?.();
  }

  /**
   * tick — observe, accumulate, and refresh guidance. Must run LATE in the Life
   * Runtime tick (after the runtimes it observes) so it sees the fullest picture.
   * Its cached context is read by action runtimes on the following cycle.
   */
  async function tick({
    companionId = "",
    customerId  = "user",
    now         = new Date(),
    consequenceContext  = null,
    cognitiveContext    = null,
    fulfillmentContext  = null,
    romanticStatus      = null,
    homeostasisContext  = null,
    identityContext     = null,
    narrativeContext    = null,
    learningContext     = null,
    relationshipContext = null,
    worldModelContext   = null,
  } = {}) {
    if (!companionId) return _emergentContext;

    try {
      // 1–3. Derive evidence and accumulate it into the stores.
      const observations = deriveObservations({
        consequenceContext, cognitiveContext, fulfillmentContext, romanticStatus,
        homeostasisContext, identityContext, narrativeContext, learningContext,
        relationshipContext, worldModelContext, now,
      });
      const seenTypes = [];
      for (const o of observations) {
        await _record(companionId, customerId, o, now);
        seenTypes.push(o.kind === "dna" ? o.dnaType : o.behaviorType);
      }
      if (seenTypes.length) _recentPatternTypes = [...new Set(seenTypes)].slice(0, 10);

      // 4. Periodic decay of stale patterns.
      if (_tickCount > 0 && _tickCount % DECAY_EVERY_TICKS === 0) {
        await behaviors.decayStale({ companionId, customerId, now }).catch(() => 0);
        await dna.decayStale({ companionId, customerId, now }).catch(() => 0);
      }

      // 5–7. Build culture, guidance, prelude from the current active sets.
      const activeBehaviors = await behaviors.listActive({ companionId, customerId }).catch(() => []);
      const activeDna       = await dna.listActive({ companionId, customerId }).catch(() => []);

      const culture  = buildRelationshipCulture({ livingBehaviors: activeBehaviors, relationshipDna: activeDna });
      const guidance = buildEmergentGuidance({ livingBehaviors: activeBehaviors, relationshipDna: activeDna });
      const preludeSignal = buildEmergentLivingPrelude({ guidance, culture: culture.safe ? culture : { safe: culture.safe } });

      // 8. Cache the read-only EmergentContext.
      _emergentContext = Object.freeze({
        guidance:        guidance.guidance,
        forCognitive:    guidance.forCognitive,
        forAffectiveDecision: guidance.forAffectiveDecision,
        forRomanticSurprise:  guidance.forRomanticSurprise,
        forRepairPersistence: guidance.forRepairPersistence,
        forConversationContinuity: guidance.forConversationContinuity,
        recommendations: guidance.recommendations,
        preludeSignal:   preludeSignal,
        culture:         culture.safe,             // safe metadata only in the shared context
        livingBehaviors: activeBehaviors.map(_safeBehavior),
        relationshipDna: activeDna.map(_safeDna),
        generatedAt:     _iso(now),
      });

      _lastTickAt = now instanceof Date ? now : new Date(now);
      _tickCount++;

      logger?.debug?.("[emergent-living] tick complete", {
        behaviors: activeBehaviors.length, dna: activeDna.length,
        guidance: guidance.guidance.length, prelude: Boolean(preludeSignal),
      });

      return _emergentContext;
    } catch (err) {
      logger?.warn?.("[emergent-living] tick failed", { error: err?.message });
      return _emergentContext;
    }
  }

  /**
   * recordEvidence — direct evidence intake. Used to feed evidence that is not
   * derivable from runtime contexts (and by tests). Always honours the CORE LAW
   * via the stores: a single call can only create an "observed" pattern.
   *
   * @param {object} ev — { kind: "behavior"|"dna", ...store fields }
   */
  async function recordEvidence({ companionId = "", customerId = "user", kind = "behavior", now = new Date(), ...fields } = {}) {
    if (!companionId) return null;
    if (kind === "dna") {
      return dna.recordObservation({ companionId, customerId, now, ...fields });
    }
    return behaviors.recordObservation({ companionId, customerId, now, ...fields });
  }

  /**
   * recordContradiction — register evidence that runs against a pattern.
   */
  async function recordContradiction({ companionId = "", customerId = "user", kind = "behavior", now = new Date(), ...fields } = {}) {
    if (!companionId) return null;
    if (kind === "dna") return dna.recordContradiction({ companionId, customerId, now, ...fields });
    return behaviors.recordContradiction({ companionId, customerId, now, ...fields });
  }

  function getEmergentContext() {
    return _emergentContext;
  }

  /**
   * getRelationshipCulture — the FULL private culture snapshot. Not exposed in
   * status; available to internal callers that are allowed to see private text.
   */
  async function getRelationshipCulture({ companionId = "", customerId = "user" } = {}) {
    if (!companionId) return null;
    const activeBehaviors = await behaviors.listActive({ companionId, customerId }).catch(() => []);
    const activeDna       = await dna.listActive({ companionId, customerId }).catch(() => []);
    return buildRelationshipCulture({ livingBehaviors: activeBehaviors, relationshipDna: activeDna });
  }

  /**
   * getStatus — safe metadata only. No raw private hurt text, no secrets.
   */
  function getStatus() {
    return {
      available: true,
      last_emergence_tick_at: _lastTickAt?.toISOString() ?? null,
      tick_count: _tickCount,
      emergent_behavior_count: _emergentContext?.livingBehaviors?.length ?? 0,
      relationship_dna_count: _emergentContext?.relationshipDna?.length ?? 0,
      active_living_behaviors: (_emergentContext?.livingBehaviors ?? []).map(b => b.behavior_type),
      active_relationship_dna_types: [...new Set((_emergentContext?.relationshipDna ?? []).map(d => d.dna_type))],
      recent_pattern_types: _recentPatternTypes,
      relationship_culture_available: Boolean(_emergentContext?.culture?.available),
      guidance_lines: _emergentContext?.guidance?.length ?? 0,
      prelude_active: Boolean(_emergentContext?.preludeSignal),
    };
  }

  async function _record(companionId, customerId, o, now) {
    if (o.kind === "dna") {
      await dna.recordObservation({
        companionId, customerId, now,
        dnaType: o.dnaType, signature: o.signature, name: o.name, meaning: o.meaning,
        future_guidance: o.future_guidance, trigger_contexts: o.trigger_contexts || [],
        avoid_contexts: o.avoid_contexts || [], source_event_ids: o.source_event_ids || [],
      }).catch(err => logger?.warn?.("[emergent-living] dna record failed", { error: err?.message }));
    } else {
      await behaviors.recordObservation({
        companionId, customerId, now,
        behaviorType: o.behaviorType, signature: o.signature, title: o.title, summary: o.summary,
        future_guidance: o.future_guidance, recommended_contexts: o.recommended_contexts || [],
        avoid_contexts: o.avoid_contexts || [], source_event_ids: o.source_event_ids || [],
      }).catch(err => logger?.warn?.("[emergent-living] behavior record failed", { error: err?.message }));
    }
  }

  return {
    init,
    tick,
    recordEvidence,
    recordContradiction,
    getEmergentContext,
    getRelationshipCulture,
    getStatus,
    // expose stores for tests / advanced callers (read-only intent)
    livingBehaviorStore: behaviors,
    relationshipDnaStore: dna,
  };
}

// ── Safe projections (no raw private hurt text leaves these) ──────────────────

function _safeBehavior(b) {
  return {
    behavior_type: b.behavior_type,
    stage: b.stage,
    title: String(b.title || "").slice(0, 80),
    future_guidance: String(b.future_guidance || "").slice(0, 130),
    recommended_contexts: b.recommended_contexts || [],
    avoid_contexts: b.avoid_contexts || [],
  };
}

function _safeDna(d) {
  return {
    dna_type: d.dna_type,
    stage: d.stage,
    name: String(d.name || "").slice(0, 80),
    future_guidance: String(d.future_guidance || "").slice(0, 130),
  };
}

function _iso(v) { return (v instanceof Date ? v : new Date(v || Date.now())).toISOString(); }

module.exports = { createEmergentLivingBehaviorRuntime };
