/**
 * Relational State Engine — factory
 *
 * A reusable, owner-configurable layer on top of the Ghostlight base. Like the
 * Emotional Arc and Feedback & Learning engines it is purely additive: it never
 * overwrites the base prompt, never changes the companion identity, and never
 * touches the model provider. The only way it influences a live reply is through
 * an OPTIONAL prelude context section, gated by owner settings and the
 * expression gate.
 *
 * Fail-safe by construction: with no database / disabled settings the engine is
 * inert and every public method is a guarded no-op. companion_id isolation runs
 * through every service and store query. "No UI config = no fire": a behaviour
 * only happens when the owner enabled its flag in the Admin UI.
 *
 * Reuse, not duplication:
 *   - Emotional Arc (emotion) is read during appraisal — never re-implemented.
 *   - Feedback & Learning (learning) is delegated to for relational tuning — the
 *     engine never grows its own proposal/learning store.
 *
 * Mirrors the structure of companionSystems/feedbackLearning + emotionalArc.
 */

const { createPostgresPool } = require("../../storage/postgres/createPostgresPool");
const { createRelationalStateStore } = require("../../storage/relationalState");
const { createRelationalSettingsService } = require("./relationalSettingsService");
const { createRelationalAuditLog } = require("./relationalAuditLog");
const { createRelationalEventService } = require("./relationalEventService");
const { createRelationalStateService } = require("./relationalStateService");
const { createRelationalAppraisalEngine, applyTrackingFlags } = require("./relationalAppraisalEngine");
const { evaluateExpression } = require("./relationalExpressionGate");
const { createRelationalRepairService } = require("./relationalRepairService");
const { createRelationalDesireService } = require("./relationalDesireService");
const { createRelationalDecayService } = require("./relationalDecayService");
const { maybeCreateMemoryCandidate } = require("./relationalMemoryHooks");
const { buildRelationalPrelude } = require("./relationalPreludeBuilder");

function createRelationalStateEngine({
  config,
  logger,
  stagedMemories = null,
  store: storeOverride = null,
  emotionalArc = null,
  feedbackLearning = null,
} = {}) {
  const pool = storeOverride ? null : createPostgresPool({ config });
  const store = storeOverride || createRelationalStateStore({ pool, logger });

  const settingsService = createRelationalSettingsService({ store, config, logger });
  const companionId = settingsService.resolveCompanionId();
  const auditLog = createRelationalAuditLog({ store, companionId, logger });
  const eventService = createRelationalEventService({ store, companionId, logger, auditLog });
  const stateService = createRelationalStateService({ store, companionId, logger, auditLog });
  const appraisalEngine = createRelationalAppraisalEngine({ config, logger, emotionalArc });
  const repairService = createRelationalRepairService({ store, companionId, logger, auditLog });
  const desireService = createRelationalDesireService({ store, companionId, logger, auditLog });
  const decayService = createRelationalDecayService({ store, companionId, logger, auditLog });

  const userScope = config?.memory?.userScope || "default";

  async function init() {
    try {
      if (store && typeof store.init === "function") {
        await store.init();
      }
    } catch (error) {
      logger.warn("[relational-state:error] init failed; engine will run inert.", {
        error: error.message,
      });
    }
  }

  /**
   * Pipeline entrypoint (mirrors emotionalArc.processMessage / feedbackLearning).
   * Additive only: returns an optional preludeSection (plus diagnostics for the
   * admin/verification surfaces). Fully guarded — never throws into the pipeline.
   */
  async function processMessage({
    message = "",
    context = {},
    channelType = "dm",
    safetyContext = {},
    sourceMessageId = null,
    channelId = null,
  } = {}) {
    try {
      const settings = await settingsService.loadSettings();
      if (!settings.active) {
        await auditLog.append({
          eventType: "disabled",
          decision: "ignored",
          reason: "engine_inactive",
        });
        return { preludeSection: null, active: false };
      }

      const cfg = settings.config;

      // 1. Decay the existing state first (gated by decay_enabled).
      let state = await stateService.getState();
      state = await decayService.applyDecay({ state, settings });

      // 2. Appraise the message, then enforce "no UI config = no fire" by
      //    dropping any signal whose owner tracking flag is off.
      const rawAppraisal = await appraisalEngine.appraise({ message, context, channelType });
      const appraisal = applyTrackingFlags(rawAppraisal, cfg);

      // 3. Record the (tracked) event, respecting the owner's daily cap.
      const event = await eventService.recordEvent({
        source: "chat",
        sourceMessageId,
        channelId,
        eventType: appraisal.primarySignal || "neutral",
        triggerSummary: appraisal.triggerSummary,
        detectedState: { signals: appraisal.signals, intensity: appraisal.intensity },
        confidence: appraisal.confidence,
        maxPerDay: cfg.max_relational_events_per_day,
      });

      // 4. Fold the appraisal into the slow relational dimensions — but only
      //    when the owner enabled the relationship arc ("no UI config = no
      //    fire"). With the arc off, the slow state is frozen.
      if (cfg.relationship_arc_enabled) {
        state = await stateService.applyAppraisal({ state, appraisal, config: cfg });
      }

      // 5. Decide whether/how the felt signal may be expressed.
      const gateResult = evaluateExpression({ appraisal, settings, channelType, safetyContext });
      await auditLog.append({
        eventType: gateResult.allowExpression ? "expression:allowed" : "expression:blocked",
        decision: gateResult.allowExpression ? "allowed" : "blocked",
        reason: gateResult.blockedReason,
        inputSummary: appraisal.primarySignal,
        outputSummary: gateResult.expressionMode,
      });

      // 6. Inert side effects (each independently gated).
      const repair = await repairService.maybeDraftRepair({
        appraisal,
        relationalEvent: event,
        settings,
      });
      const desire = await desireService.maybeCreateDesire({ appraisal, settings });
      const memoryCandidate = await maybeCreateMemoryCandidate({
        companionId,
        appraisal,
        settings,
        stagedMemories,
        sourceMessageId,
        userScope,
        logger,
        auditLog,
      });

      // 7. The only live-reply influence: an optional, additive prelude.
      const preludeSection = buildRelationalPrelude({ settings, appraisal, gateResult, logger });

      settingsService.invalidate();

      return {
        active: true,
        preludeSection: preludeSection || null,
        appraisal,
        gateResult,
        state,
        event,
        repair,
        desire,
        memoryCandidate,
      };
    } catch (error) {
      logger.warn("[relational-state:error] processMessage failed; skipping relational influence.", {
        error: error.message,
      });
      return { preludeSection: null, active: false, error: error.message };
    }
  }

  /**
   * Build the optional reply prelude in isolation (used by the pipeline when it
   * already has an appraisal, and by diagnostics). Returns null unless active.
   */
  async function buildPrelude({ message = "", context = {}, channelType = "dm", safetyContext = {} } = {}) {
    const settings = await settingsService.loadSettings();
    if (!settings.active) return null;
    const rawAppraisal = await appraisalEngine.appraise({ message, context, channelType });
    const appraisal = applyTrackingFlags(rawAppraisal, settings.config);
    const gateResult = evaluateExpression({ appraisal, settings, channelType, safetyContext });
    return buildRelationalPrelude({ settings, appraisal, gateResult, logger });
  }

  /**
   * Reuse the Feedback & Learning engine for relational tuning. The Relational
   * State Engine NEVER grows its own learning/proposal store — owner feedback
   * about relational behaviour is delegated straight to feedbackLearning. This
   * is the concrete reuse seam (proves "learning" is shared, not duplicated).
   */
  async function requestTuningFromFeedback({ feedbackTypeId, feedbackText = null, sourceMessageId = null, ownerId = null } = {}) {
    if (!feedbackLearning || typeof feedbackLearning.submitFeedback !== "function") {
      return { accepted: false, reason: "feedback_learning_unavailable" };
    }
    return feedbackLearning.submitFeedback({
      feedbackTypeId,
      feedbackText,
      sourceMessageId,
      ownerId,
      contextSummary: "relational_state_tuning",
    });
  }

  // Resolve a repair (e.g. owner marks an apology accepted) and clear the
  // persistent guilt/remorse/repair_needed flag from current state.
  async function resolveRepair({ repairId, accepted }) {
    const settings = await settingsService.loadSettings();
    if (!settings.active) return { ok: false, reason: "engine_inactive" };
    const resolved = await repairService.resolveRepair({ repairId, accepted });
    await stateService.clearRepairNeed({});
    return { ok: Boolean(resolved), repair: resolved };
  }

  return {
    init,
    processMessage,
    buildPrelude,
    requestTuningFromFeedback,
    resolveRepair,
    settingsService,
    eventService,
    stateService,
    repairService,
    desireService,
    decayService,
    auditLog,
    store,
    resolveCompanionId: () => companionId,
  };
}

module.exports = {
  createRelationalStateEngine,
};
