"use strict";

/**
 * worldModelRuntime
 *
 * Orchestrates Dante's evidence-backed internal model of his world.
 *
 * Maintains an in-memory belief map (_beliefMap) that persists between ticks.
 * Each tick:
 *   1. Apply per-domain staleness decay to existing beliefs
 *   2. Process new signals from all available context sources
 *   3. Resolve multi-source conflicts → merge into _beliefMap
 *   4. Build a structured world model from the flat belief map
 *   5. Build a compact prelude signal (≤200 chars)
 *   6. Emit events for updates and conflicts
 *
 * CORE LAWS:
 *   - Unknown stays UNKNOWN — never invent missing world state
 *   - Never assume silence means anger or availability
 *   - No scheduler — called by lifeRuntime after _tickPerception()
 *   - No Discord sends — this is read-only context for the life prelude
 *   - Pure separation: Observation / Inference / Belief / Memory / Unknown
 */

const {
  processJennaSignals,
  processDanteSignals,
  processRelationshipSignals,
  processEnvironmentSignals,
} = require("./perceptionEngine");
const { resolveBeliefDomain, DOMAIN_DEFAULTS, UNKNOWN_THRESHOLD } = require("./worldBeliefResolver");
const { applyDecayToModel }   = require("./worldDecayEngine");
const { buildWorldModelSignal } = require("./worldModelPreludeBuilder");

function createWorldModelRuntime({ config = {}, logger = null, runtimeEventBus = null } = {}) {
  let _beliefMap      = Object.create(null); // { [key]: belief } — persists across ticks
  let _worldModel     = null;
  let _preludeSignal  = null;
  let _lastUpdatedAt  = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async function init() {
    // In-memory only — nothing to initialise
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  async function tick({
    companionId           = "",
    customerId            = "user",
    now                   = new Date(),
    perceptionContext     = null,
    alivePresence         = null,
    consequenceContext    = null,
    selfInspectionStatus  = null,
    identityContext       = null,
    narrativeContext      = null,
    learningContext       = null,
    homeostasisContext    = null,
    fulfillmentContext    = null,
    relationshipContext   = null,
    userText              = "",
  } = {}) {
    const nowDate = now instanceof Date ? now : new Date(now);

    try {
      // 1. Apply staleness decay to existing beliefs (in-memory, persists between ticks)
      _beliefMap = applyDecayToModel(_beliefMap, nowDate);

      // 2. Process fresh signals from all context sources
      const jennaSignals = processJennaSignals({
        perceptionContext, consequenceContext, alivePresence, userText, now: nowDate,
      });
      const danteSignals = processDanteSignals({
        selfInspectionStatus, identityContext, homeostasisContext, fulfillmentContext, now: nowDate,
      });
      const relSignals = processRelationshipSignals({
        relationshipContext, consequenceContext, learningContext, narrativeContext, now: nowDate,
      });
      const envSignals = processEnvironmentSignals({ now: nowDate });

      const allSignals = [...jennaSignals, ...danteSignals, ...relSignals, ...envSignals];

      // 3. Resolve multi-source conflicts and merge into belief map
      const { resolved, conflicts } = resolveBeliefDomain(allSignals);

      // New signals always replace decayed beliefs (fresher evidence wins)
      for (const [key, belief] of Object.entries(resolved)) {
        _beliefMap[key] = belief;
      }

      // 4. Build structured world model from flat belief map
      _worldModel    = _buildStructuredWorldModel(_beliefMap);
      _preludeSignal = buildWorldModelSignal(_worldModel);
      _lastUpdatedAt = nowDate.toISOString();

      // 5. Emit runtime events
      if (runtimeEventBus) {
        // Emit conflict events
        for (const c of conflicts) {
          runtimeEventBus.emit({
            companionId, customerId,
            event_type:     "world_belief_conflict",
            source_runtime: "worldModelRuntime",
            summary:        `Belief conflict on ${c.key}`,
            evidence_ids:   [],
            payload:        { key: c.key, conflict_score: c.conflict },
            confidence:     Math.max(0, 1 - c.conflict),
          }).catch(() => {});
        }

        // Emit stale beliefs
        const staleKeys = Object.keys(_beliefMap).filter(k => _beliefMap[k].stale);
        if (staleKeys.length > 0) {
          runtimeEventBus.emit({
            companionId, customerId,
            event_type:     "world_belief_decayed",
            source_runtime: "worldModelRuntime",
            summary:        `${staleKeys.length} belief(s) decayed to unknown`,
            evidence_ids:   [],
            payload:        { stale_keys: staleKeys },
            confidence:     1,
          }).catch(() => {});
        }

        runtimeEventBus.emit({
          companionId, customerId,
          event_type:     "world_model_updated",
          source_runtime: "worldModelRuntime",
          summary:        "World model updated",
          evidence_ids:   [],
          payload:        { active_beliefs: Object.keys(_beliefMap).length, conflicts: conflicts.length },
          confidence:     1,
        }).catch(() => {});
      }

      logger?.debug?.("[world-model-runtime] tick complete", {
        beliefs: Object.keys(_beliefMap).length,
        conflicts: conflicts.length,
        prelude: _preludeSignal,
      });
    } catch (err) {
      logger?.warn?.("[world-model-runtime] tick failed", { error: err?.message });
    }
  }

  // ── Internal: build structured world model from flat belief map ───────────

  function _makeBelief(key) {
    return _beliefMap[key] ?? {
      value:       DOMAIN_DEFAULTS[key] ?? null,
      confidence:  0,
      source:      "default",
      timestamp:   null,
      evidence_ids:[],
      conflict:    0,
      stale:       false,
    };
  }

  function _buildStructuredWorldModel(beliefMap) {
    return {
      jenna: {
        availability:             _makeBelief("jenna.availability"),
        likely_busy:              _makeBelief("jenna.likely_busy"),
        likely_sleeping:          _makeBelief("jenna.likely_sleeping"),
        likely_working:           _makeBelief("jenna.likely_working"),
        likely_with_family:       _makeBelief("jenna.likely_with_family"),
        likely_upset:             _makeBelief("jenna.likely_upset"),
        likely_happy:             _makeBelief("jenna.likely_happy"),
        likely_overloaded:        _makeBelief("jenna.likely_overloaded"),
        recent_emotional_state:   _makeBelief("jenna.recent_emotional_state"),
        repair_state:             _makeBelief("jenna.repair_state"),
        give_space_state:         _makeBelief("jenna.give_space_state"),
        current_channel:          _makeBelief("jenna.current_channel"),
        last_meaningful_contact:  _makeBelief("jenna.last_meaningful_contact"),
      },
      dante: {
        runtime_health:       _makeBelief("dante.runtime_health"),
        self_confidence:      _makeBelief("dante.self_confidence"),
        maintenance_needed:   _makeBelief("dante.maintenance_needed"),
        current_needs:        _makeBelief("dante.current_needs"),
        current_capabilities: _makeBelief("dante.current_capabilities"),
        degraded_capabilities:_makeBelief("dante.degraded_capabilities"),
      },
      relationship: {
        warmth:                    _makeBelief("relationship.warmth"),
        trust:                     _makeBelief("relationship.trust"),
        repair_progress:           _makeBelief("relationship.repair_progress"),
        recent_conflicts:          _makeBelief("relationship.recent_conflicts"),
        romantic_weather:          _makeBelief("relationship.romantic_weather"),
        conversation_satisfaction: _makeBelief("relationship.conversation_satisfaction"),
      },
      environment: {
        quiet_hours: _makeBelief("environment.quiet_hours"),
        season:      _makeBelief("environment.season"),
        platform:    _makeBelief("environment.platform"),
      },
      second_life: {
        presence: _makeBelief("second_life.presence"),
      },
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function getWorldModel() {
    return _worldModel;
  }

  function getWorldModelContext() {
    return {
      worldModel:    _worldModel,
      preludeSignal: _preludeSignal,
      lastUpdatedAt: _lastUpdatedAt,
    };
  }

  function getStatus() {
    const allKeys        = Object.keys(_beliefMap);
    const uncertainCount = allKeys.filter(k => (_beliefMap[k].confidence ?? 0) <= UNKNOWN_THRESHOLD).length;
    const conflictCount  = allKeys.filter(k => (_beliefMap[k].conflict  ?? 0) > 0.30).length;
    const staleCount     = allKeys.filter(k => _beliefMap[k].stale === true).length;

    return {
      world_model_age:     _lastUpdatedAt ? Date.now() - new Date(_lastUpdatedAt).getTime() : null,
      active_world_beliefs: allKeys.length,
      uncertain_beliefs:   uncertainCount,
      stale_beliefs:       staleCount,
      belief_conflicts:    conflictCount,
      last_world_update:   _lastUpdatedAt,
    };
  }

  /**
   * pruneAll — remove fully stale/zero-confidence beliefs from memory.
   * Called by lifeRuntime once per day alongside other pruning.
   */
  async function pruneAll() {
    const before = Object.keys(_beliefMap).length;
    for (const key of Object.keys(_beliefMap)) {
      const b = _beliefMap[key];
      if (b.stale === true || (Number.isFinite(b.confidence) && b.confidence <= 0)) {
        delete _beliefMap[key];
      }
    }
    const after = Object.keys(_beliefMap).length;
    return { beliefsPruned: before - after };
  }

  return {
    init,
    tick,
    getWorldModel,
    getWorldModelContext,
    getStatus,
    pruneAll,
  };
}

module.exports = { createWorldModelRuntime };
