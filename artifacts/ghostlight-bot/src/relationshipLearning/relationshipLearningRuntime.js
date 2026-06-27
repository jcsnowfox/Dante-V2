"use strict";

/**
 * relationshipLearningRuntime
 *
 * Relationship Learning Runtime 1.0 — Dante learns from Jenna.
 *
 * Orchestrates permanent lesson learning from every meaningful interaction.
 * Lessons change future behaviour. The same mistake becomes less likely.
 * Positive experiences reinforce behaviour. Repair leaves growth behind.
 *
 * Tick flow (called by lifeRuntime after _tickFulfillment):
 *   1. Process pending events → extract → reinforce or create lessons
 *   2. Extract lessons from fulfillment context (positive reinforcement)
 *   3. Load active lessons from store
 *   4. Emerge relationship rules from lesson clusters
 *   5. Build behaviour guidance for current context
 *   6. Cache learning context for prelude injection
 *
 * Integration:
 *   - lifeRuntime: receives tick(), recordEvent(), getLearningContext()
 *   - lifePreludeBuilder: receives learningContext for signal injection
 *   - agencyPlanner: receives lessonGuidance via identityCtx
 *   - observeInteraction: calls recordEvent() after consequence detection
 *
 * Hard rules:
 *   - Does NOT replace Identity, Homeostasis, Fulfillment, or Repair systems.
 *   - Does NOT create a new scheduler (ticked by lifeRuntime).
 *   - Does NOT create a new Discord sender.
 *   - Does NOT duplicate state owned by other runtimes.
 *   - Lessons reference evidence IDs — no lesson is fabricated.
 *   - One conversation rarely creates a core lesson (confidence grows slowly).
 */

const { createLessonStore }           = require("./lessonStore");
const { extractLesson, extractLessonsFromRepair, extractLessonsFromFulfillment } = require("./lessonExtractor");
const { buildBehaviourGuidance, formatBehaviourGuidance } = require("./behaviourGuidanceBuilder");
const { emergeRules, formatRulesAsGuidance }               = require("./relationshipRuleEngine");
const { buildRepairReflection, buildFulfillmentReflection } = require("./reflectionEngine");

const MAX_PENDING_EVENTS = 50;

function createRelationshipLearningRuntime({
  config          = {},
  logger          = null,
  lessonStore     = null,
} = {}) {
  const _lessonStore   = lessonStore ?? createLessonStore({ config, logger });

  let _learningContext = null;
  let _lastTickAt      = null;
  let _pendingEvents   = [];
  let _activeLessons   = [];
  let _emergentRules   = [];
  let _cachedGuidance  = [];

  async function init() {
    if (_lessonStore?.init) await _lessonStore.init().catch(() => {});
  }

  /**
   * recordEvent — called by other runtimes to report a meaningful event.
   *
   * Events are queued and processed on next tick.
   * Max 50 pending events (oldest dropped on overflow).
   *
   * @param {string} eventType   — key from EVENT_LESSON_MAP (see lessonExtractor)
   * @param {string} eventNote   — optional context note
   * @param {number|null} evidenceId  — optional evidenceStore record ID
   * @param {number|null} originEventId — optional source event ID
   */
  function recordEvent({
    eventType,
    eventNote     = "",
    evidenceId    = null,
    originEventId = null,
    now           = new Date(),
  } = {}) {
    if (!eventType) return;
    _pendingEvents.push({ eventType, eventNote, evidenceId, originEventId, now });
    if (_pendingEvents.length > MAX_PENDING_EVENTS) {
      _pendingEvents = _pendingEvents.slice(-MAX_PENDING_EVENTS);
    }
  }

  /**
   * processInteraction — called by lifeRuntime.observeInteraction() after
   * consequence detection. Converts repair signals into learning events.
   */
  function processInteraction({ userText = "", repairResult = null, now = new Date() } = {}) {
    if (!repairResult) return;

    const repairLessons = extractLessonsFromRepair({ repairResult, now });
    for (const draft of repairLessons) {
      recordEvent({ eventType: draft.lessonType === "repair" && draft.positive ? "repair_completed" : "repair_incomplete", now });
    }

    if (repairResult.confabulationDetected) {
      recordEvent({ eventType: "confabulation_detected", now });
    }
  }

  /**
   * tick — called by lifeRuntime._tickRelationshipLearning(now).
   *
   * @param {object} params
   *   companionId / customerId      — scope
   *   now                           — current Date
   *   homeostasisContext            — from homeostasisRuntime.getNeedsContext()
   *   identityContext               — from identityRuntime.getIdentityContext()
   *   fulfillmentContext            — from fulfillmentRuntime.getFulfillmentContext()
   *   consequenceContext            — from lifeRuntime._consequenceContext
   */
  async function tick({
    companionId,
    customerId,
    now                = new Date(),
    homeostasisContext  = null,
    identityContext    = null,
    fulfillmentContext = null,
    consequenceContext = null,
  } = {}) {
    if (!companionId) return;
    _lastTickAt = now;

    // ── 1. Process pending events ─────────────────────────────────────────────
    const eventsToProcess = [..._pendingEvents];
    _pendingEvents = [];

    for (const event of eventsToProcess) {
      const draft = extractLesson({ ...event, companionId, customerId });
      if (!draft) continue;

      try {
        const similar = await _lessonStore.findSimilar({
          companionId, customerId, lessonType: draft.lessonType,
        }).catch(() => []);

        if (similar.length > 0) {
          await _lessonStore.reinforce({
            id:         similar[0].id,
            evidenceId: event.evidenceId ?? null,
            delta:      draft.confidenceDelta,
            now:        event.now,
          }).catch(() => {});
        } else {
          await _lessonStore.create({
            companionId,
            customerId,
            lessonType:     draft.lessonType,
            title:          draft.title,
            summary:        draft.summary,
            evidenceIds:    draft.evidenceIds,
            originEventIds: draft.originEventIds,
            confidence:     draft.confidence,
            strength:       draft.strength,
            futureGuidance: draft.futureGuidance,
          }).catch(() => {});
        }
      } catch (err) {
        logger?.warn("[relationship-learning] event processing failed", {
          eventType: event.eventType, error: err?.message,
        });
      }
    }

    // ── 2. Learn from fulfillment context ─────────────────────────────────────
    if (fulfillmentContext?.outcome === "SUCCESS" && fulfillmentContext?.strategy) {
      const fulfillmentLessons = extractLessonsFromFulfillment({
        fulfillmentRecord: { strategy: fulfillmentContext.strategy, outcome: fulfillmentContext.outcome },
        now,
      });
      for (const draft of fulfillmentLessons) {
        try {
          const similar = await _lessonStore.findSimilar({
            companionId, customerId, lessonType: draft.lessonType,
          }).catch(() => []);

          if (similar.length > 0) {
            await _lessonStore.reinforce({ id: similar[0].id, delta: draft.confidenceDelta, now }).catch(() => {});
          } else {
            await _lessonStore.create({ companionId, customerId, ...draft }).catch(() => {});
          }
        } catch {}
      }
    }

    // ── 3. Load active lessons ────────────────────────────────────────────────
    _activeLessons = await _lessonStore.listActive({ companionId, customerId, limit: 30 }).catch(() => []);

    // ── 4. Emerge relationship rules ──────────────────────────────────────────
    _emergentRules = emergeRules({ lessons: _activeLessons });

    // ── 5. Build behaviour guidance ───────────────────────────────────────────
    const repairActive = Boolean(consequenceContext?.suppression?.repairRequired);
    const guidanceContext = repairActive ? "repair" : "general";
    _cachedGuidance = buildBehaviourGuidance({
      lessons:  _activeLessons,
      context:  guidanceContext,
      maxItems: 6,
    });

    // ── 6. Cache learning context for prelude ─────────────────────────────────
    _learningContext = {
      lessonCount:    _activeLessons.length,
      coreCount:      _activeLessons.filter(l => l.status === "core").length,
      stableCount:    _activeLessons.filter(l => l.status === "stable").length,
      guidance:       _cachedGuidance,
      emergentRules:  _emergentRules.slice(0, 4),
      topLesson:      _activeLessons[0] ?? null,
    };
  }

  /**
   * getBehaviourGuidance — returns compact guidance lines for a given context.
   *
   * Used by: agencyPlanner, repairCarryoverEngine, romantic surprise planner,
   * and any system that needs lesson-aware behaviour shaping.
   *
   * @param {string} context  — "repair" | "romantic" | "conversation" | "conflict" | "fulfillment" | "general"
   * @param {number} maxItems — max lines (default 5)
   * @returns {string[]}
   */
  function getBehaviourGuidance({ context = "general", maxItems = 5 } = {}) {
    return buildBehaviourGuidance({ lessons: _activeLessons, context, maxItems });
  }

  /**
   * getEmergentRules — returns emerged relationship rules.
   *
   * Used by prelude builder and any system needing established rules.
   */
  function getEmergentRules() {
    return _emergentRules;
  }

  /**
   * getLearningContext — snapshot for lifePreludeBuilder.
   *
   * Returns null when no lessons exist yet.
   */
  function getLearningContext() {
    return _learningContext;
  }

  function getStatus() {
    return {
      lastTickAt:         _lastTickAt?.toISOString() ?? null,
      lessonCount:        _activeLessons.length,
      coreCount:          _activeLessons.filter(l => l.status === "core").length,
      stableCount:        _activeLessons.filter(l => l.status === "stable").length,
      formingCount:       _activeLessons.filter(l => l.status === "forming").length,
      newCount:           _activeLessons.filter(l => l.status === "new").length,
      challengedCount:    _activeLessons.filter(l => l.status === "challenged").length,
      emergentRuleCount:  _emergentRules.length,
      pendingEvents:      _pendingEvents.length,
      learningContext:    _learningContext,
    };
  }

  async function pruneAll({ companionId, customerId } = {}) {
    const pruned = await _lessonStore.pruneOlderThan({ companionId, customerId, days: 365 }).catch(() => 0);
    return { lessonsPruned: pruned };
  }

  return {
    init, tick, recordEvent, processInteraction,
    getBehaviourGuidance, getEmergentRules, getLearningContext,
    getStatus, pruneAll,
    // Expose for testing and integration checks
    _lessonStore,
  };
}

module.exports = { createRelationshipLearningRuntime };
