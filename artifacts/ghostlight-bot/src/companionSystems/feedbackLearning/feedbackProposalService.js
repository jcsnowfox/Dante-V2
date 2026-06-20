/**
 * feedbackProposalService
 *
 * CRUD over companion_learning_proposals + companion_learning_applications.
 * A proposal is an inert suggestion until it is both approved AND applied
 * through the application gate. Applied proposals of the prelude-eligible types
 * are what the prelude builder reads. All access is companion_id scoped.
 */

const { PRELUDE_PROPOSAL_TYPES } = require("./feedbackTypes");

function createFeedbackProposalService({ store, companionId, logger, auditLog }) {
  async function createProposal({
    feedbackEventId = null,
    proposalType,
    targetSystem,
    riskLevel = "low",
    summary,
    proposedChange,
    requiresReview = true,
  }) {
    if (!store) return null;

    try {
      const proposal = await store.insertProposal({
        companionId,
        feedbackEventId,
        proposalType,
        targetSystem,
        riskLevel,
        summary,
        proposedChange: proposedChange || {},
        status: "pending_review",
        requiresReview: Boolean(requiresReview),
      });

      await auditLog.append({
        eventType: "proposal:created",
        decision: "pending_review",
        inputSummary: `${proposalType} -> ${targetSystem}`,
        outputSummary: summary,
      });

      return proposal;
    } catch (error) {
      logger.warn("[feedback-learning:error] Failed to create proposal.", {
        companionId,
        proposalType,
        error: error.message,
      });
      return null;
    }
  }

  async function listProposals({ status = null, limit = 50 } = {}) {
    if (!store) return [];
    try {
      return await store.listProposals({ companionId, status, limit });
    } catch {
      return [];
    }
  }

  async function getProposal(proposalId) {
    if (!store) return null;
    try {
      return await store.getProposal({ companionId, proposalId });
    } catch {
      return null;
    }
  }

  async function updateStatus(proposalId, status) {
    if (!store) return null;
    try {
      return await store.updateProposalStatus({ companionId, proposalId, status });
    } catch (error) {
      logger.warn("[feedback-learning:error] Failed to update proposal status.", {
        companionId,
        proposalId,
        status,
        error: error.message,
      });
      return null;
    }
  }

  async function recordApplication({ proposalId, appliedChange, appliedBy = "owner" }) {
    if (!store) return null;
    try {
      return await store.insertApplication({
        companionId,
        proposalId,
        appliedChange: appliedChange || {},
        appliedBy,
      });
    } catch (error) {
      logger.warn("[feedback-learning:error] Failed to record application.", {
        companionId,
        proposalId,
        error: error.message,
      });
      return null;
    }
  }

  async function countProposalsToday() {
    if (!store) return 0;
    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      return await store.countProposalsSince({ companionId, since });
    } catch {
      return 0;
    }
  }

  // Applied prelude-eligible proposals, newest first.
  async function listAppliedPreludeRules({ limit = 25 } = {}) {
    if (!store) return [];
    try {
      return await store.listAppliedByTypes({
        companionId,
        types: PRELUDE_PROPOSAL_TYPES,
        limit,
      });
    } catch {
      return [];
    }
  }

  return {
    createProposal,
    listProposals,
    getProposal,
    updateStatus,
    recordApplication,
    countProposalsToday,
    listAppliedPreludeRules,
  };
}

module.exports = { createFeedbackProposalService };
