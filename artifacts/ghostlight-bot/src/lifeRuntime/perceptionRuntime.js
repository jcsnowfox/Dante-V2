"use strict";

/**
 * perceptionRuntime
 *
 * Perception Runtime 1.0 — Dante's evidence-backed world state.
 *
 * Answers: What do I currently believe about Jenna, my own health,
 * the conversation, and the environment — and how confident am I?
 *
 * Hard rules:
 *   - Does NOT create a scheduler. Ticked by lifeRuntime.
 *   - Does NOT send Discord messages.
 *   - Does NOT replace any existing runtime.
 *   - Every perception must carry a source, confidence, timestamp, and evidence.
 *   - Unknown stays unknown — never fabricate world state.
 *   - Conflicting evidence lowers confidence.
 *   - Stale evidence decays confidence.
 *   - No raw private payloads or secrets in status.
 *
 * Integration:
 *   lifeRuntime → ticks this runtime with all available contexts
 *   alivePresenceStore → jenna availability signals
 *   consequenceContext → repair state, give_space
 *   selfInspectionRuntime → dante runtime health
 *   identityRuntime → dante self-confidence
 *   fulfillmentRuntime → current capabilities
 *   runtimeEventBus → "perception_world_state_updated" emitted on tick
 *   lifePreludeBuilder → getPerceptionContext() → preludeSignal injected
 */

const { createWorldStateStore }             = require("./worldStateStore");
const { interpretAlivePresence, interpretDiscordEvent, interpretExplicitStatement } = require("./presenceInterpreter");
const { buildWorldState }                   = require("./worldStateBuilder");
const { buildPerceptionSignal }             = require("./perceptionPreludeBuilder");

const MAX_PENDING_EVENTS = 100;

function createPerceptionRuntime({
  config          = {},
  logger          = null,
  worldStateStore = null,
  runtimeEventBus = null,
} = {}) {
  const _store = worldStateStore || createWorldStateStore({ config, logger });

  let _pendingEvents      = [];
  let _worldState         = null;
  let _perceptionContext  = null;
  let _lastTickAt         = null;
  let _capabilities       = {};

  async function init() {
    await _store.init?.();
  }

  // Queue a perception-relevant event for processing on next tick
  function recordEvent({
    eventType  = "",
    eventId    = "",
    payload    = {},
    summary    = "",
    confidence = 0.80,
    now        = new Date(),
  } = {}) {
    if (_pendingEvents.length >= MAX_PENDING_EVENTS) _pendingEvents.shift();
    _pendingEvents.push({
      id:         eventId || ("ev-" + Date.now()),
      event_type: eventType,
      payload:    payload || {},
      summary:    summary || "",
      confidence: Number.isFinite(confidence) ? confidence : 0.80,
      created_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    });
  }

  // Observe a runtime event bus event — extract perception-relevant signals
  function observeRuntimeEvent(event = {}) {
    if (!event?.event_type) return;
    if (_pendingEvents.length >= MAX_PENDING_EVENTS) _pendingEvents.shift();
    _pendingEvents.push({
      id:         event.id || ("bus-" + Date.now()),
      event_type: event.event_type,
      payload:    event.payload || {},
      summary:    event.summary || "",
      confidence: Number.isFinite(event.confidence) ? event.confidence : 0.80,
      created_at: event.created_at || new Date().toISOString(),
    });
  }

  // Observe a raw Discord event — interprets signals immediately into queue
  function observeDiscordEvent(event = {}) {
    if (!event) return;
    const signals = interpretDiscordEvent(event);
    if (_pendingEvents.length >= MAX_PENDING_EVENTS) _pendingEvents.shift();
    _pendingEvents.push({
      id:         event.id || ("discord-" + Date.now()),
      event_type: event.event_type || event.eventType || "discord_event",
      payload:    { _discordSignals: signals },
      summary:    "",
      confidence: 0.85,
      created_at: event.created_at || event.timestamp || new Date().toISOString(),
    });
  }

  // Process queued events and upsert signals into the store
  async function _drainEvents(companionId, customerId, now) {
    const events = _pendingEvents.splice(0);

    for (const ev of events) {
      const eventType = ev.event_type || "";

      // Discord signals pre-interpreted in observeDiscordEvent
      if (ev.payload?._discordSignals) {
        for (const sig of ev.payload._discordSignals) {
          await _store.upsertSignal({ companionId, customerId, ...sig, now }).catch(() => {});
        }
      }

      // Runtime event bus signals
      if (eventType === "repair_started") {
        await _store.upsertSignal({ companionId, customerId, key: "jenna.repair_state", value: "started", confidence: 0.85, source: "runtime_event", evidence_ids: [ev.id], now }).catch(() => {});
      }
      if (eventType === "repair_completed") {
        await _store.upsertSignal({ companionId, customerId, key: "jenna.repair_state", value: "healing", confidence: 0.85, source: "runtime_event", evidence_ids: [ev.id], now }).catch(() => {});
      }
      if (eventType === "self_confidence_low") {
        await _store.upsertSignal({ companionId, customerId, key: "dante.self_confidence", value: 0.30, confidence: 0.75, source: "runtime_event", evidence_ids: [ev.id], now }).catch(() => {});
      }
      if (eventType === "diagnostic_warning") {
        await _store.upsertSignal({ companionId, customerId, key: "dante.runtime_health", value: "degraded", confidence: 0.80, source: "runtime_event", evidence_ids: [ev.id], now }).catch(() => {});
      }
    }
  }

  async function tick({
    companionId          = "",
    customerId           = "",
    now                  = new Date(),
    alivePresence        = null,
    consequenceContext   = null,
    selfInspectionStatus = null,
    identityContext      = null,
    narrativeContext      = null,
    learningContext       = null,
    homeostasisContext    = null,
    fulfillmentContext    = null,
    userText             = "",
  } = {}) {
    if (!companionId) return;
    _lastTickAt = now;

    // Explicit user statements are highest authority — process first
    if (userText) {
      const explicitSignals = interpretExplicitStatement(userText);
      for (const sig of explicitSignals) {
        await _store.upsertSignal({ companionId, customerId, ...sig, now }).catch(() => {});
      }
    }

    // Alive presence signals
    if (alivePresence) {
      const presenceSignals = interpretAlivePresence(alivePresence, now);
      for (const sig of presenceSignals) {
        await _store.upsertSignal({ companionId, customerId, ...sig, now }).catch(() => {});
      }
    }

    // Consequence context → repair state, give_space
    if (consequenceContext?.suppression) {
      const { repairRequired, repairStarted, healing, giveSpace } = consequenceContext.suppression;
      const repairValue = giveSpace ? "give_space"
        : healing       ? "healing"
        : repairStarted ? "started"
        : repairRequired ? "needed"
        : "none";
      await _store.upsertSignal({ companionId, customerId, key: "jenna.repair_state", value: repairValue, confidence: 0.90, source: "consequence_context", evidence_ids: ["consequence_context"], now }).catch(() => {});
      if (giveSpace) {
        await _store.upsertSignal({ companionId, customerId, key: "jenna.give_space", value: true, confidence: 0.92, source: "consequence_context", evidence_ids: ["consequence_context:give_space"], now }).catch(() => {});
      }
    }

    // Self-inspection → dante runtime health
    if (selfInspectionStatus) {
      const health = selfInspectionStatus.overall === "degraded" ? "degraded"
        : selfInspectionStatus.overall === "healthy" ? "healthy"
        : "unknown";
      await _store.upsertSignal({ companionId, customerId, key: "dante.runtime_health", value: health, confidence: 0.85, source: "self_inspection", evidence_ids: ["self_inspection:overall"], now }).catch(() => {});

      const degraded = selfInspectionStatus.degradedSources || [];
      if (degraded.length) {
        await _store.upsertSignal({ companionId, customerId, key: "dante.degraded_sources", value: degraded, confidence: 0.85, source: "self_inspection", evidence_ids: ["self_inspection:degraded"], now }).catch(() => {});
      }
    }

    // Identity context → self-confidence
    if (identityContext?.selfConfidence != null) {
      await _store.upsertSignal({ companionId, customerId, key: "dante.self_confidence", value: identityContext.selfConfidence, confidence: 0.80, source: "identity_context", evidence_ids: ["identity_context:self_confidence"], now }).catch(() => {});
    } else if (identityContext?.topValue?.strength != null) {
      await _store.upsertSignal({ companionId, customerId, key: "dante.self_confidence", value: identityContext.topValue.strength, confidence: 0.65, source: "identity_context", evidence_ids: ["identity_context:top_value"], now }).catch(() => {});
    }

    // Fulfillment context → current capabilities
    if (fulfillmentContext) {
      _capabilities = {
        imageGenerationEnabled: Boolean(fulfillmentContext.imageGenerationEnabled ?? config?.imageGeneration?.enabled),
        voiceNoteEnabled:       Boolean(fulfillmentContext.voiceNoteEnabled ?? config?.audio?.enabled),
        secondLifeAvailable:    Boolean(fulfillmentContext.secondLifeAvailable ?? config?.secondLife?.enabled),
        webLearningEnabled:     Boolean(fulfillmentContext.webLearningEnabled),
        platform:               "discord",
      };
    }

    // Drain queued events
    await _drainEvents(companionId, customerId, now);

    // Assemble world state from all signals
    const signals  = await _store.getAll({ companionId, customerId }).catch(() => []);
    _worldState    = buildWorldState({
      signals,
      now,
      consequenceContext,
      selfInspectionStatus,
      identityContext,
      narrativeContext,
      learningContext,
      capabilities: _capabilities,
    });

    // Build perception context (consumed by lifePreludeBuilder and other runtimes)
    const preludeSignal = buildPerceptionSignal({
      worldState:  _worldState,
      uncertainty: _worldState.uncertainty,
    });
    _perceptionContext = {
      worldState:   _worldState,
      uncertainty:  _worldState.uncertainty,
      preludeSignal,
      lastTickAt:   (now instanceof Date ? now : new Date(now)).toISOString(),
    };

    // Notify event bus of updated world state
    if (runtimeEventBus?.emit) {
      runtimeEventBus.emit({
        companionId,
        customerId,
        event_type:     "perception_world_state_updated",
        source_runtime: "perceptionRuntime",
        summary:        "World state updated",
        confidence:     0.90,
        payload: {
          jenna_availability: _worldState?.jenna?.availability,
          quiet_hours:        _worldState?.environment?.quiet_hours,
          repair_state:       _worldState?.jenna?.repair_state,
        },
      }).catch(() => {});
    }
  }

  function getWorldState() {
    return _worldState;
  }

  function getPerceptionContext() {
    return _perceptionContext;
  }

  function getPreludeSignal() {
    return _perceptionContext?.preludeSignal ?? null;
  }

  // Safe status — no raw private text, no scores, no evidence payloads
  function getStatus() {
    const ws = _worldState;
    return {
      jenna_availability:    ws?.jenna?.availability         ?? "unknown",
      jenna_busy_confidence: ws?.jenna?.busy_confidence      ?? 0,
      quiet_hours:           ws?.environment?.quiet_hours    ?? false,
      repair_state:          ws?.jenna?.repair_state         ?? "none",
      runtime_health:        ws?.dante?.runtime_health       ?? "unknown",
      give_space:            ws?.jenna?.give_space           ?? false,
      uncertainty_count:     ws?.uncertainty?.length         ?? 0,
      last_tick_at:          _lastTickAt instanceof Date
        ? _lastTickAt.toISOString()
        : (_lastTickAt ?? null),
    };
  }

  async function pruneAll({ companionId, customerId } = {}) {
    const pruned = await _store.pruneStale({ companionId, customerId }).catch(() => 0);
    return { signalsPruned: pruned };
  }

  return {
    init,
    tick,
    recordEvent,
    observeRuntimeEvent,
    observeDiscordEvent,
    getWorldState,
    getPerceptionContext,
    getPreludeSignal,
    getStatus,
    pruneAll,
    // Exposed for testing
    _worldStateStore: _store,
  };
}

module.exports = { createPerceptionRuntime };
