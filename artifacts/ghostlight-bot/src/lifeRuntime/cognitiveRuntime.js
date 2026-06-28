"use strict";

/**
 * cognitiveRuntime
 *
 * Dante's internal deliberation layer. Structured private cognition with
 * competing thoughts, uncertainty, priorities, doubts, and plan formation.
 *
 * CORE LAW: Dante should not act directly from a trigger. He should deliberate
 * first when the situation is meaningful. This runtime is that deliberation.
 *
 * What this runtime does:
 *   1. Reads ALL runtime contexts produced by prior tick phases
 *   2. Distils them into a CognitiveInput (cognitiveContextBuilder)
 *   3. Generates competing ThoughtCandidates (thoughtCandidateEngine)
 *   4. Detects and resolves internal conflicts (internalConflictResolver)
 *   5. Builds a compact prelude signal (cognitivePreludeBuilder)
 *   6. Persists the deliberation to cognitiveLedgerStore
 *   7. Optionally creates/updates plans in cognitivePlanStore
 *   8. Returns a CognitiveContext that influenced runtimes can read
 *
 * What this runtime does NOT do:
 *   - Send messages (all outbound goes through canonical Discord gateway)
 *   - Replace any existing runtime
 *   - Create schedulers or event loops
 *   - Store private text in the LLM prelude (signal only, never raw thoughts)
 *
 * Influenced runtimes:
 *   - affectiveDecisionRuntime  — reads cognitiveContext?.restraintActive
 *   - romanticSurpriseRuntime   — reads cognitiveContext?.recommendations?.suppressRomantic
 *   - repairPersistenceEngine   — reads cognitiveContext?.recommendations?.encourageRepair
 *   - fulfillmentRuntime        — reads cognitiveContext?.recommendations?.suppressFulfillmentOutreach
 *
 * Dante ONLY — not a general companion deliberation runtime.
 */

const { buildCognitiveInput }        = require("./cognitiveContextBuilder");
const { generateThoughtCandidates }  = require("./thoughtCandidateEngine");
const { resolveConflicts }           = require("./internalConflictResolver");
const { buildCognitivePreludeSignal } = require("./cognitivePreludeBuilder");
const { createCognitiveLedgerStore } = require("./cognitiveLedgerStore");
const { createCognitivePlanStore }   = require("./cognitivePlanStore");

function createCognitiveRuntime({
  config      = {},
  logger      = null,
  ledgerStore = null,
  planStore   = null,
} = {}) {
  const ledger = ledgerStore || createCognitiveLedgerStore({ config, logger });
  const plans  = planStore   || createCognitivePlanStore({ config, logger });

  let _cognitiveContext = null;
  let _lastTickAt      = null;
  let _tickCount       = 0;

  async function init() {
    await ledger.init?.();
    await plans.init?.();
  }

  /**
   * tick
   *
   * The deliberation cycle. Takes all runtime contexts produced during the
   * current life-runtime tick and generates a CognitiveContext.
   *
   * Must be called AFTER worldModel tick and BEFORE romanticSurprises tick.
   * All params are optional — missing contexts are treated as null.
   */
  async function tick({
    companionId = "",
    customerId  = "user",
    now         = new Date(),
    consequenceContext       = null,
    homeostasisContext        = null,
    identityContext          = null,
    fulfillmentContext        = null,
    relationshipContext      = null,
    perceptionContext        = null,
    worldModelContext        = null,
    learningContext          = null,
    narrativeContext         = null,
    curiosityContext         = null,
    growthContext            = null,
    selfInspectionContext    = null,
    evidenceIntegrityContext = null,
    emergentContext          = null,
  } = {}) {
    const tickStart = Date.now();

    try {
      // Step 1: distil all contexts into cognitive input
      const input = buildCognitiveInput({
        consequenceContext,
        homeostasisContext,
        identityContext,
        fulfillmentContext,
        relationshipContext,
        perceptionContext,
        worldModelContext,
        learningContext,
        narrativeContext,
        curiosityContext,
        growthContext,
        selfInspectionContext,
        evidenceIntegrityContext,
        now,
      });

      // Step 2: generate competing thought candidates
      const candidates = generateThoughtCandidates(input);

      // Step 3: detect and resolve internal conflicts
      const resolution = resolveConflicts(candidates, input);

      // Step 4: build compact prelude signal
      const preludeSignal = buildCognitivePreludeSignal(resolution);

      // Step 5: maybe create or update plans
      await _handlePlanning({ companionId, customerId, resolution, input });

      // Step 6: persist deliberation to ledger
      const deliberationMs = Date.now() - tickStart;
      await ledger.record({
        companionId,
        customerId,
        thoughtCandidates: candidates.map(c => ({ type: c.thoughtType, weight: c.weight, summary: c.summary.slice(0, 80) })),
        conflictsDetected: resolution.conflictsDetected,
        chosenOutcome:     resolution.outcome,
        recommendations:   resolution.recommendations,
        preludeSignal:     preludeSignal,
        confidence:        resolution.confidence,
        deliberationMs,
        sourceRuntimes:    _deriveSourceRuntimes(input),
      }).catch(err => {
        logger?.warn?.("[cognitive-runtime] ledger persist failed", { error: err?.message });
      });

      // Read-only emergent guidance: deliberation MAY weigh what the
      // relationship has taught, but never mutates it. Surfaced for transparency.
      const emergentGuidance = Array.isArray(emergentContext?.forCognitive)
        ? emergentContext.forCognitive.slice(0, 3)
        : [];

      // Step 7: update cognitive context
      _cognitiveContext = Object.freeze({
        outcome:              resolution.outcome,
        primaryThought:       resolution.primaryThought,
        conflictsDetected:    resolution.conflictsDetected,
        recommendations:      resolution.recommendations,
        restraintActive:      resolution.restraintActive,
        uncertaintyActive:    resolution.uncertaintyActive,
        preludeSignal,
        confidence:           resolution.confidence,
        thoughtCount:         candidates.length,
        emergentGuidance,
        deliberationMs,
        generatedAt:          (now instanceof Date ? now : new Date(now)).toISOString(),
      });

      _lastTickAt = now instanceof Date ? now : new Date(now);
      _tickCount++;

      logger?.debug?.("[cognitive-runtime] tick complete", {
        outcome: resolution.outcome,
        conflicts: resolution.conflictsDetected.length,
        candidates: candidates.length,
        deliberationMs,
      });

      return _cognitiveContext;
    } catch (err) {
      logger?.warn?.("[cognitive-runtime] tick failed", { error: err?.message });
      _cognitiveContext = null;
      return null;
    }
  }

  /**
   * getCognitiveContext
   *
   * Returns the most recently computed CognitiveContext, or null if tick() has
   * not been called yet. Fast — no async, just returns cached state.
   */
  function getCognitiveContext() {
    return _cognitiveContext;
  }

  /**
   * getStatus
   *
   * Safe read-only metadata. No PII, no raw private thoughts.
   */
  function getStatus() {
    const ledgerStatus = ledger.getStatus?.() ?? {};
    const plansStatus  = plans.getStatus?.()  ?? {};
    return {
      available:        true,
      lastTickAt:       _lastTickAt?.toISOString() ?? null,
      tickCount:        _tickCount,
      lastOutcome:      _cognitiveContext?.outcome      ?? null,
      lastConflicts:    _cognitiveContext?.conflictsDetected?.length ?? 0,
      restraintActive:  _cognitiveContext?.restraintActive   ?? false,
      uncertaintyActive: _cognitiveContext?.uncertaintyActive ?? false,
      preludeActive:    Boolean(_cognitiveContext?.preludeSignal),
      confidence:       _cognitiveContext?.confidence   ?? null,
      thoughtCount:     _cognitiveContext?.thoughtCount ?? null,
      emergentGuidanceActive: (_cognitiveContext?.emergentGuidance?.length ?? 0) > 0,
      ledger:           ledgerStatus,
      plans:            plansStatus,
    };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  async function _handlePlanning({ companionId, customerId, resolution, input }) {
    if (!companionId) return;

    // Only create plans when there is a substantive recommendation
    if (resolution.outcome === "plan" || (resolution.outcome === "recommendation" && resolution.recommendations.encourageRepair)) {
      const planType = resolution.recommendations.encourageRepair
        ? "repair_plan"
        : "conversation_plan";
      const summary = resolution.primaryThought ?? "Private plan forming";

      await plans.createPlan({
        companionId,
        customerId,
        planType,
        summary,
        intent:     resolution.primaryThought ?? "",
        conditions: [],
        confidence: resolution.confidence,
        suppressedBy: resolution.recommendations.suppressRomantic ? "repair" : null,
      }).catch(err => {
        logger?.warn?.("[cognitive-runtime] plan creation failed", { error: err?.message });
      });
    }

    // Prune old completed plans occasionally
    if (_tickCount % 20 === 0) {
      await plans.pruneCompleted({ companionId, customerId }).catch(() => {});
    }
  }

  function _deriveSourceRuntimes(input) {
    const sources = [];
    if (input.repair?.activeCount > 0)     sources.push("consequences");
    if (input.needUrgency > 0)             sources.push("homeostasis");
    if (input.identityConflict)            sources.push("identity");
    if (input.jenna?.availability !== "unknown") sources.push("worldModel");
    if (input.evidenceWarning)             sources.push("selfInspection");
    if (input.attentionFocus)              sources.push("curiosity");
    if (input.activeProject)              sources.push("growth");
    if (input.hasRepairLesson || input.hasEvidenceLesson) sources.push("learning");
    return sources;
  }

  return { init, tick, getCognitiveContext, getStatus };
}

module.exports = { createCognitiveRuntime };
