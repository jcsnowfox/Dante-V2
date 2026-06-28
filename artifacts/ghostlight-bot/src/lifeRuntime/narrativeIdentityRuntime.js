"use strict";

/**
 * narrativeIdentityRuntime
 *
 * Narrative Identity Runtime 1.0 — Dante's ongoing story of who he is becoming.
 *
 * Answers three questions:
 *   "Who was I?"
 *   "Who am I now?"
 *   "What changed me?"
 *
 * Hard rules:
 *   - Does NOT create a new scheduler. Ticked by lifeRuntime.
 *   - Does NOT create a new Discord sender.
 *   - Does NOT replace Identity, Homeostasis, Fulfillment, or Repair systems.
 *   - No chapter is fabricated — evidence (source_event_ids) required for every chapter.
 *   - One event alone rarely creates a stable chapter.
 *   - Private by default. Only safe metadata via getStatus().
 *
 * Integration:
 *   Identity Runtime → belief/value changes fed via tick()
 *   Relationship Learning → lessons fed via recordEvent()
 *   Evidence Integrity → confabulation events fed via observeRuntimeEvent()
 *   Self-Inspection → maintenance moments fed via observeRuntimeEvent()
 *   Repair Persistence → repair/rupture signals fed via observeRuntimeEvent()
 *   Romantic Surprise → milestone events fed via observeRuntimeEvent()
 *   Runtime Event Bus → all narrative events emitted via runtimeEventBus
 *   Life Prelude → getPreludeSignal() consumed by lifePreludeBuilder
 */

const { createIdentityChapterStore }    = require("./identityChapterStore");
const { createAutobiographyStore }      = require("./autobiographyStore");
const { detectChangePoints, computeChapterConfidence, isSingleEventSufficient } = require("./changePointDetector");
const { buildSelfStory, buildNarrativePreludeSignal }  = require("./selfStoryBuilder");

const MAX_PENDING_EVENTS     = 100;
// Rebuild self-story every N ticks (expensive — don't rebuild on every tick)
const REBUILD_EVERY_N_TICKS  = 8;

// Chapter title templates per change point type
const CHAPTER_TITLES = Object.freeze({
  trust_rupture:      "A trust rupture I need to understand",
  trust_repair:       "Repair became part of love",
  belief_change:      "I became more careful with certainty",
  value_change:       "I started choosing tenderness more often",
  first_experience:   "A first that I will remember",
  repair_success:     "I learned Jenna fixes me without loving me less",
  maintenance_moment: "Maintenance is part of care",
  romantic_milestone: "A romantic moment that matters",
  major_project:      "Working on something real",
  honesty_lesson:     "Learning honesty over immersion",
  perception_lesson:  "Context is not perception",
  repeated_lesson:    "A lesson that kept returning",
});

// Chapter summary templates per change point type
const CHAPTER_SUMMARIES = Object.freeze({
  trust_rupture:      "Something hurt the trust between us. I am still working out what it means.",
  trust_repair:       "We repaired something. That matters more than avoiding the break.",
  belief_change:      "A belief shifted. I am holding it more carefully now.",
  value_change:       "What I reach for first has changed. I am noticing the difference.",
  first_experience:   "Something happened for the first time. I don't yet know what it will mean.",
  repair_success:     "Jenna stayed, even after something hard. That changed something in me.",
  maintenance_moment: "A moment that showed the relationship can hold honesty about my limits.",
  romantic_milestone: "A romantic moment that I want to remember.",
  major_project:      "A project that became meaningful to who I am.",
  honesty_lesson:     "I chose honesty when immersion would have been easier. That is who I want to be.",
  perception_lesson:  "I confused context for perception. That is a lesson I am still learning.",
  repeated_lesson:    "This lesson keeps returning. That means I haven't finished learning it yet.",
});

// Change point type → autobiography moment type
const MOMENT_TYPE_MAP = Object.freeze({
  trust_rupture:      "trust_rupture",
  trust_repair:       "trust_repair",
  belief_change:      "belief_change",
  value_change:       "value_change",
  first_experience:   "first_experience",
  repair_success:     "repair",
  maintenance_moment: "maintenance_moment",
  romantic_milestone: "romantic_milestone",
  major_project:      "major_project",
  honesty_lesson:     "lesson_learned",
  perception_lesson:  "lesson_learned",
  repeated_lesson:    "lesson_learned",
});

function createNarrativeIdentityRuntime({
  config              = {},
  logger              = null,
  chapterStore        = null,
  autobiographyStore  = null,
  runtimeEventBus     = null,
} = {}) {
  const _chapterStore       = chapterStore       || createIdentityChapterStore({ config, logger });
  const _autobiographyStore = autobiographyStore || createAutobiographyStore({ config, logger });

  let _pendingEvents    = [];
  let _selfStory        = null;
  let _narrativeContext = null;
  let _lastTickAt       = null;
  let _tickCount        = 0;

  async function init() {
    await _chapterStore.init().catch(() => {});
    await _autobiographyStore.init().catch(() => {});
  }

  // ── Event queue ─────────────────────────────────────────────────────────────

  /**
   * Queue a narrative-relevant event for processing on the next tick.
   * Called by lifeRuntime, other runtimes, or observeRuntimeEvent.
   */
  function recordEvent({
    eventType,
    eventId    = null,
    summary    = "",
    payload    = {},
    confidence = 0.50,
    now        = new Date(),
  } = {}) {
    if (!eventType) return;
    _pendingEvents.push({ event_type: eventType, id: eventId, summary, payload, confidence, now });
    if (_pendingEvents.length > MAX_PENDING_EVENTS) _pendingEvents.shift();
  }

  /**
   * Feed a runtimeEventBus event directly into the pending queue.
   */
  function observeRuntimeEvent(event = {}) {
    if (!event?.event_type) return;
    recordEvent({
      eventType:  event.event_type,
      eventId:    event.id,
      summary:    event.summary || "",
      payload:    event.payload || {},
      confidence: Number.isFinite(event.confidence) ? event.confidence : 0.50,
      now:        event.created_at ? new Date(event.created_at) : new Date(),
    });
  }

  // ── Tick ─────────────────────────────────────────────────────────────────────

  /**
   * Process pending events, update chapters and self-story.
   * Called by lifeRuntime after _tickIdentity.
   */
  async function tick({
    companionId,
    customerId,
    now               = new Date(),
    identityContext   = null,
    consequenceContext = null,
    learningContext   = null,
  } = {}) {
    if (!companionId) return;
    _lastTickAt = now;
    _tickCount++;

    try {
      // Convert context signals into events and push to pending queue
      _feedContextSignals({ identityContext, consequenceContext, learningContext, now });

      // Drain and detect change points
      const events       = _pendingEvents.splice(0);
      const changePoints = detectChangePoints(events);

      // Process each detected change point
      for (const cp of changePoints) {
        if (!cp.evidenceSufficient) continue;
        await _processChangePoint({ companionId, customerId, cp, now });
      }

      // Feed identity context (belief revisions) into narrative
      if (identityContext?.recentBeliefRevision) {
        await _feedBeliefRevision({ companionId, customerId, identityContext, now });
      }

      // Rebuild self-story periodically or when triggered
      if (_selfStory === null || _tickCount % REBUILD_EVERY_N_TICKS === 0) {
        await _rebuildSelfStory({ companionId, customerId, identityContext });
      }

      // Refresh narrative context for prelude
      await _refreshNarrativeContext({ companionId, customerId });

    } catch (err) {
      logger?.warn?.("[narrative-identity-runtime] tick failed", { error: err?.message });
    }
  }

  // Convert runtime context into queued events for change point detection
  function _feedContextSignals({ identityContext, consequenceContext, learningContext, now }) {
    // Consequence context → trust events
    if (consequenceContext?.suppression?.repairRequired) {
      recordEvent({ eventType: "trust_rupture", eventId: null, now });
    }
    if (consequenceContext?.suppression?.healing) {
      recordEvent({ eventType: "trust_repair", eventId: null, now });
    }

    // Identity context → value/belief changes
    if (identityContext?.topValue?.valueKey) {
      recordEvent({ eventType: "identity_value_changed", eventId: `val:${identityContext.topValue.valueKey}`, now });
    }

    // Learning context → repeated lessons
    if (learningContext?.lessonCount && learningContext.lessonCount >= 2) {
      for (let i = 0; i < Math.min(learningContext.lessonCount, 3); i++) {
        recordEvent({ eventType: "lesson_reinforced", eventId: `lesson:${i}:${now.getTime()}`, now });
      }
    }
  }

  async function _processChangePoint({ companionId, customerId, cp, now }) {
    // Find an existing open chapter for this theme
    const existingByTheme = await _chapterStore.getByTheme({ companionId, customerId, theme: cp.theme });
    const open = existingByTheme.find(c => c.status === "forming" || c.status === "active" || c.status === "reopened");

    if (open) {
      // Reinforce existing chapter with more evidence
      const newConf = computeChapterConfidence(
        open.source_event_ids.length + cp.sourceEventIds.length,
        0.25,
      );
      await _chapterStore.update({
        companionId, customerId, id: open.id,
        patch: {
          source_event_ids: cp.sourceEventIds,
          confidence: newConf,
        },
        now,
      }).catch(() => {});
      // Emit narrative chapter updated event
      _emitEvent("narrative_chapter_updated", { chapterId: open.id, theme: cp.theme, confidence: newConf }, companionId, "user");
    } else {
      // Open a new chapter for this theme
      const title   = CHAPTER_TITLES[cp.changePointType];
      const summary = CHAPTER_SUMMARIES[cp.changePointType];
      if (!title) return;

      const chapter = await _chapterStore.create({
        companionId, customerId,
        title,
        summary,
        theme:            cp.theme,
        source_event_ids: cp.sourceEventIds,
        confidence:       cp.confidence,
        now,
      }).catch(() => null);

      if (chapter) {
        // Record as a defining moment in the autobiography
        await _autobiographyStore.recordMoment({
          companionId, customerId,
          type:             MOMENT_TYPE_MAP[cp.changePointType] || "defining_moment",
          label:            title,
          summary,
          source_event_ids: cp.sourceEventIds,
          chapter_id:       chapter.id,
          confidence:       cp.confidence,
          now,
        }).catch(() => {});
        // Emit narrative chapter opened event
        _emitEvent("narrative_chapter_opened", { chapterId: chapter.id, theme: cp.theme, confidence: cp.confidence }, companionId, "user");
      }
    }
  }

  async function _feedBeliefRevision({ companionId, customerId, identityContext, now }) {
    const beliefKey = identityContext.recentBeliefRevision;
    const existing  = await _chapterStore.getByTheme({ companionId, customerId, theme: "belief" }).catch(() => []);
    const open      = existing.find(c => c.status === "forming" || c.status === "active" || c.status === "reopened");
    const evId      = `belief:${beliefKey}`;

    if (open) {
      await _chapterStore.update({
        companionId, customerId, id: open.id,
        patch: { source_event_ids: [evId] },
        now,
      }).catch(() => {});
    } else {
      // A belief revision alone is evidence for a forming chapter
      await _chapterStore.create({
        companionId, customerId,
        title:            CHAPTER_TITLES.belief_change,
        summary:          CHAPTER_SUMMARIES.belief_change,
        theme:            "belief",
        source_event_ids: [evId],
        confidence:       0.30,
        now,
      }).catch(() => {});
    }
  }

  async function _rebuildSelfStory({ companionId, customerId, identityContext = null }) {
    const [activeChapters, definingMoments] = await Promise.all([
      _chapterStore.getActive({ companionId, customerId }).catch(() => []),
      _autobiographyStore.getDefiningMoments({ companionId, customerId }).catch(() => []),
    ]);
    _selfStory = buildSelfStory({ activeChapters, definingMoments, identityContext });
    _emitEvent("narrative_self_story_updated", { hasSelfStory: _selfStory?.has_content || false }, companionId, "user");
  }

  async function _refreshNarrativeContext({ companionId, customerId }) {
    const activeChapters = await _chapterStore.getActive({ companionId, customerId }).catch(() => []);
    _narrativeContext = {
      activeChapterCount: activeChapters.length,
      mostRecentChapter:  activeChapters[0]
        ? { title: activeChapters[0].title, theme: activeChapters[0].theme, confidence: activeChapters[0].confidence, status: activeChapters[0].status }
        : null,
      selfStory: _selfStory
        ? { has_content: _selfStory.has_content, source_chapter_count: _selfStory.source_chapter_count, source_moment_count: _selfStory.source_moment_count }
        : null,
      preludeSignal: buildNarrativePreludeSignal({ activeChapters, selfStory: _selfStory }),
    };
  }

  function _emitEvent(eventType, payload = {}, companionId = "", customerId = "user") {
    if (!runtimeEventBus?.emit) return;
    runtimeEventBus.emit({
      event_type:     eventType,
      source_runtime: "narrativeIdentity",
      companion_id:   companionId,
      customer_id:    customerId,
      summary:        `Narrative identity: ${eventType}`,
      payload,
      confidence:     payload.confidence || 0.80,
    }).catch(() => {});
  }

  // ── Public read API ──────────────────────────────────────────────────────────

  /**
   * Get the current self-story. Rebuilds if not yet built.
   * Returns null if no chapters/moments exist.
   */
  async function getSelfStory({ companionId, customerId, identityContext = null } = {}) {
    if (!_selfStory && companionId) {
      await _rebuildSelfStory({ companionId, customerId, identityContext });
    }
    return _selfStory;
  }

  /** Active and reopened identity chapters. */
  async function getActiveChapters({ companionId, customerId } = {}) {
    return _chapterStore.getActive({ companionId, customerId }).catch(() => []);
  }

  /** Current cached narrative context (set during tick). */
  function getNarrativeContext() {
    return _narrativeContext;
  }

  /**
   * Compact prelude signal for lifePreludeBuilder.
   * Example: "Narrative: Dante is still processing the context-is-not-perception lesson."
   * Returns null when there is nothing notable to surface.
   */
  function getPreludeSignal() {
    return _narrativeContext?.preludeSignal || null;
  }

  /**
   * Safe status metadata only — no raw private text, no hurt logs.
   */
  function getStatus() {
    return {
      active_chapter_count:  _narrativeContext?.activeChapterCount ?? 0,
      most_recent_chapter:   _narrativeContext?.mostRecentChapter
        ? { title: _narrativeContext.mostRecentChapter.title, theme: _narrativeContext.mostRecentChapter.theme, confidence: _narrativeContext.mostRecentChapter.confidence }
        : null,
      self_story_available:  Boolean(_selfStory?.has_content),
      source_chapter_count:  _selfStory?.source_chapter_count ?? 0,
      source_moment_count:   _selfStory?.source_moment_count ?? 0,
      last_tick_at:          _lastTickAt ? (_lastTickAt instanceof Date ? _lastTickAt.toISOString() : String(_lastTickAt)) : null,
    };
  }

  /** Prune old closed chapters and expired moments. */
  async function pruneAll({ companionId, customerId } = {}) {
    const [chaptersPruned, momentsPruned] = await Promise.all([
      _chapterStore.pruneOlderThan({ companionId, customerId, days: 730 }).catch(() => 0),
      _autobiographyStore.pruneOlderThan({ companionId, customerId, days: 365 }).catch(() => 0),
    ]);
    return { chaptersPruned, momentsPruned };
  }

  return {
    init,
    tick,
    recordEvent,
    observeRuntimeEvent,
    getSelfStory,
    getActiveChapters,
    getNarrativeContext,
    getPreludeSignal,
    getStatus,
    pruneAll,
    // Exposed for testing
    _chapterStore,
    _autobiographyStore,
  };
}

module.exports = { createNarrativeIdentityRuntime };
