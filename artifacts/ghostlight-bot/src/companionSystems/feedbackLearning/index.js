/**
 * Feedback & Learning Engine — factory
 *
 * A reusable, owner-configurable layer on top of the Ghostlight base. It is purely
 * additive: it never overwrites the base, never changes companion identity or
 * the model provider, and only influences a live reply through an optional
 * prelude context section built from owner-approved + applied rules.
 *
 * Fail-safe by construction: with no database / disabled settings the engine is
 * inert and every public method is a guarded no-op. companion_id isolation runs
 * through every service and store query.
 *
 * Mirrors the structure of companionSystems/emotionalArc.
 */

const { createPostgresPool } = require("../../storage/postgres/createPostgresPool");
const { createFeedbackLearningStore } = require("../../storage/feedbackLearning");
const { createFeedbackSettingsService } = require("./feedbackSettingsService");
const { createFeedbackEventService } = require("./feedbackEventService");
const { createFeedbackProposalService } = require("./feedbackProposalService");
const { createFeedbackAuditLog } = require("./feedbackAuditLog");
const { generateProposalFromFeedback } = require("./feedbackLearningEngine");
const { maybeCreateMemoryCandidate } = require("./feedbackMemoryHooks");
const { buildFeedbackPrelude } = require("./feedbackPreludeBuilder");
const { canApply } = require("./feedbackApplicationGate");
const { getFeedbackType, isValidFeedbackType } = require("./feedbackTypes");
const { isFeedbackTypeAllowed } = require("./feedbackConfigSchema");

function createFeedbackLearningEngine({ config, logger, stagedMemories = null, store: storeOverride = null }) {
  const pool = storeOverride ? null : createPostgresPool({ config });
  const store = storeOverride || createFeedbackLearningStore({ pool, logger });

  const settingsService = createFeedbackSettingsService({ store, config, logger });
  const companionId = settingsService.resolveCompanionId();
  const auditLog = createFeedbackAuditLog({ store, companionId, logger });
  const eventService = createFeedbackEventService({ store, companionId, logger, auditLog });
  const proposalService = createFeedbackProposalService({ store, companionId, logger, auditLog });

  const userScope = config?.memory?.userScope || "default";

  async function init() {
    try {
      if (store && typeof store.init === "function") {
        await store.init();
      }
    } catch (error) {
      logger.warn("[feedback-learning:error] init failed; engine will run inert.", {
        error: error.message,
      });
    }
  }

  /**
   * Record an owner feedback signal, optionally drafting a learning proposal and
   * staging a memory candidate. Never applies anything unless the owner has
   * explicitly enabled auto-apply (which still passes the application gate).
   */
  async function submitFeedback({
    feedbackTypeId,
    feedbackText = null,
    sourceMessageId = null,
    channelId = null,
    ownerId = null,
    targetExcerpt = null,
    contextSummary = null,
  } = {}) {
    if (!isValidFeedbackType(feedbackTypeId)) {
      return { accepted: false, reason: "unknown_feedback_type" };
    }

    const settings = await settingsService.loadSettings();
    if (!settings.active) {
      await auditLog.append({
        eventType: "disabled",
        decision: "ignored",
        reason: "engine_inactive",
        inputSummary: feedbackTypeId,
      });
      return { accepted: false, reason: "engine_inactive" };
    }

    const feedbackType = getFeedbackType(feedbackTypeId);
    const config_ = settings.config;
    const hasFreeformNote = Boolean(feedbackText && String(feedbackText).trim());

    // Channel gating: a freeform note requires freeform feedback; otherwise the
    // button channel must be enabled. Either way the owner has to opt in.
    if (hasFreeformNote) {
      if (config_.freeform_feedback_enabled !== true) {
        await auditLog.append({ eventType: "disabled", decision: "ignored", reason: "freeform_feedback_disabled", inputSummary: feedbackTypeId });
        return { accepted: false, reason: "freeform_feedback_disabled" };
      }
    } else if (config_.feedback_buttons_enabled !== true) {
      await auditLog.append({ eventType: "disabled", decision: "ignored", reason: "feedback_buttons_disabled", inputSummary: feedbackTypeId });
      return { accepted: false, reason: "feedback_buttons_disabled" };
    }

    if (!isFeedbackTypeAllowed(feedbackTypeId, config_)) {
      await auditLog.append({ eventType: "disabled", decision: "ignored", reason: "feedback_type_not_allowed", inputSummary: feedbackTypeId });
      return { accepted: false, reason: "feedback_type_not_allowed" };
    }

    const event = await eventService.recordEvent({
      feedbackTypeId,
      feedbackLabel: feedbackType.label,
      feedbackText,
      sourceMessageId,
      channelId,
      ownerId,
      targetExcerpt,
      contextSummary,
    });

    const result = { accepted: true, event, proposal: null, memoryCandidate: null, applied: false };

    // Draft a learning proposal (inert).
    const proposalResult = await generateProposalFromFeedback({
      companionId,
      feedbackEvent: event || { feedbackTypeId, feedbackText, sourceMessageId },
      settings,
      proposalService,
      auditLog,
    });
    if (proposalResult.created) {
      result.proposal = proposalResult.proposal;

      // Auto-apply ONLY if the owner explicitly enabled it; still gated.
      if (config_.auto_apply_allowed === true) {
        const applied = await applyProposal(proposalResult.proposal.proposalId, { settings });
        result.applied = Boolean(applied?.applied);
      }
    }

    // Stage a memory candidate for memory-type feedback (never live).
    const memoryCandidate = await maybeCreateMemoryCandidate({
      companionId,
      feedbackType,
      feedbackEvent: event || { feedbackTypeId, feedbackText, sourceMessageId },
      settings,
      stagedMemories,
      userScope,
      logger,
      auditLog,
    });
    result.memoryCandidate = memoryCandidate;

    settingsService.invalidate();
    return result;
  }

  async function approveProposal(proposalId) {
    const settings = await settingsService.loadSettings();
    if (!settings.active) return { ok: false, reason: "engine_inactive" };
    const updated = await proposalService.updateStatus(proposalId, "approved");
    if (updated) {
      await auditLog.append({ eventType: "proposal:approved", decision: "approved", inputSummary: String(proposalId) });
    }
    return { ok: Boolean(updated), proposal: updated };
  }

  async function rejectProposal(proposalId) {
    const settings = await settingsService.loadSettings();
    if (!settings.active) return { ok: false, reason: "engine_inactive" };
    const updated = await proposalService.updateStatus(proposalId, "rejected");
    if (updated) {
      await auditLog.append({ eventType: "proposal:rejected", decision: "rejected", inputSummary: String(proposalId) });
    }
    return { ok: Boolean(updated), proposal: updated };
  }

  async function applyProposal(proposalId, { settings: providedSettings = null } = {}) {
    const settings = providedSettings || await settingsService.loadSettings();
    const proposal = await proposalService.getProposal(proposalId);

    if (!proposal) {
      return { applied: false, reason: "proposal_not_found" };
    }

    const gate = canApply({ companionId, proposal, settings });
    if (!gate.allowed) {
      await auditLog.append({
        eventType: "proposal:blocked",
        decision: "blocked",
        reason: gate.reason,
        inputSummary: String(proposalId),
      });
      return { applied: false, reason: gate.reason };
    }

    await proposalService.recordApplication({
      proposalId,
      appliedChange: proposal.proposedChange,
      appliedBy: "owner",
    });
    const updated = await proposalService.updateStatus(proposalId, "applied");

    await auditLog.append({
      eventType: "proposal:applied",
      decision: "applied",
      inputSummary: String(proposalId),
      outputSummary: proposal.summary,
    });

    return { applied: true, proposal: updated };
  }

  /**
   * Build the optional reply prelude from applied communication rules.
   * Returns null unless the engine is active and rules exist.
   */
  async function buildPrelude() {
    const settings = await settingsService.loadSettings();
    if (!settings.active) return null;
    if (settings.config.communication_tuning_enabled !== true) return null;

    const appliedRules = await proposalService.listAppliedPreludeRules({ limit: 25 });
    return buildFeedbackPrelude({ settings, appliedRules, logger });
  }

  /**
   * Pipeline entrypoint (mirrors emotionalArc.processMessage). Additive only:
   * returns an optional preludeSection and nothing else. Fully guarded.
   */
  async function processMessage() {
    try {
      const preludeSection = await buildPrelude();
      return { preludeSection: preludeSection || null };
    } catch (error) {
      logger.warn("[feedback-learning:error] processMessage failed; skipping prelude.", {
        error: error.message,
      });
      return { preludeSection: null };
    }
  }

  return {
    init,
    submitFeedback,
    approveProposal,
    rejectProposal,
    applyProposal,
    buildPrelude,
    processMessage,
    settingsService,
    eventService,
    proposalService,
    auditLog,
    store,
    resolveCompanionId: () => companionId,
  };
}

module.exports = {
  createFeedbackLearningEngine,
};
