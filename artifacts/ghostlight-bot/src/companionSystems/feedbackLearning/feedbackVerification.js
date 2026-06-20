/**
 * feedbackVerification
 *
 * Programmatic proof harness for the Feedback & Learning Engine. It exercises
 * the engine against an in-memory store (no DATABASE_URL needed) and asserts the
 * core safety guarantees from the spec. Used by scripts/verify-feedback-learning.js.
 */

const { createFeedbackLearningEngine } = require("./index");
const { canApply } = require("./feedbackApplicationGate");
const { DEFAULT_CONFIG } = require("./feedbackConfigSchema");

function createInMemoryStore() {
  const settings = new Map(); // `${companionId}:${systemKey}` -> row
  const events = [];
  const proposals = [];
  const applications = [];
  const audit = [];
  let seq = 1;

  return {
    available: true,
    async init() {},
    async loadSystemSettings({ companionId, systemKey }) {
      return settings.get(`${companionId}:${systemKey}`) || null;
    },
    async upsertSystemSettings({ companionId, systemKey, enabled, ownerEditable, config }) {
      const row = { id: seq++, companionId, systemKey, enabled, ownerEditable, config };
      settings.set(`${companionId}:${systemKey}`, row);
      return row;
    },
    async insertFeedbackEvent(payload) {
      const row = { id: seq++, createdAt: new Date(), ...payload };
      row.feedbackEventId = row.id;
      events.push(row);
      return row;
    },
    async listFeedbackEvents({ companionId, limit = 50 }) {
      return events.filter((e) => e.companionId === companionId).slice(-limit).reverse();
    },
    async insertProposal(payload) {
      const row = {
        id: seq++,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: payload.status || "pending_review",
        ...payload,
      };
      row.proposalId = row.id;
      proposals.push(row);
      return row;
    },
    async listProposals({ companionId, status = null, limit = 50 }) {
      return proposals
        .filter((p) => p.companionId === companionId && (!status || p.status === status))
        .slice(-limit)
        .reverse();
    },
    async getProposal({ companionId, proposalId }) {
      return proposals.find((p) => p.companionId === companionId && p.id === proposalId) || null;
    },
    async updateProposalStatus({ companionId, proposalId, status }) {
      const row = proposals.find((p) => p.companionId === companionId && p.id === proposalId);
      if (!row) return null;
      row.status = status;
      row.updatedAt = new Date();
      return row;
    },
    async countProposalsSince({ companionId, since }) {
      return proposals.filter((p) => p.companionId === companionId && p.createdAt >= since).length;
    },
    async listAppliedByTypes({ companionId, types, limit = 25 }) {
      return proposals
        .filter((p) => p.companionId === companionId && p.status === "applied" && types.includes(p.proposalType))
        .slice(-limit)
        .reverse()
        .map((p) => {
          const app = applications.filter((a) => a.proposalId === p.id && a.companionId === companionId).pop();
          return { ...p, appliedChange: app ? app.appliedChange : p.proposedChange };
        });
    },
    async insertApplication(payload) {
      const row = { id: seq++, createdAt: new Date(), ...payload };
      applications.push(row);
      return row;
    },
    async appendAuditLog(payload) {
      const row = { id: seq++, createdAt: new Date(), ...payload };
      audit.push(row);
      return row;
    },
    async listAuditLog({ companionId, limit = 50 }) {
      return audit.filter((a) => a.companionId === companionId).slice(-limit).reverse();
    },
    async getStoreSummary({ companionId }) {
      return {
        available: true,
        events: events.filter((e) => e.companionId === companionId).length,
        proposals: proposals.filter((p) => p.companionId === companionId).length,
        applications: applications.filter((a) => a.companionId === companionId).length,
      };
    },
  };
}

function makeConfig(personaName) {
  return {
    chat: { promptBlocks: { personaName } },
    memory: { userScope: "default" },
  };
}

const ALL_ON = {
  enabled: true,
  feedback_buttons_enabled: true,
  freeform_feedback_enabled: true,
  learning_proposals_enabled: true,
  auto_apply_allowed: false,
  review_required: true,
  memory_candidate_creation_enabled: true,
  communication_tuning_enabled: true,
  voice_rule_tuning_enabled: true,
  emotion_tuning_enabled: true,
  tool_behavior_tuning_enabled: true,
  autonomy_tuning_enabled: true,
  blocked_phrase_learning_enabled: true,
  repair_learning_enabled: true,
};

async function runVerification({ logger }) {
  const checks = [];
  const record = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });

  const stagedCandidates = [];
  const stagedMemories = {
    async upsertStagedMemory(payload) {
      const candidate = { stagedMemoryId: `staged-${stagedCandidates.length + 1}`, ...payload };
      stagedCandidates.push(candidate);
      return candidate;
    },
  };

  // 1. Default safety posture is fully off.
  {
    const flags = ["enabled", "auto_apply_allowed", "learning_proposals_enabled", "memory_candidate_creation_enabled", "communication_tuning_enabled"];
    const allOff = flags.every((f) => DEFAULT_CONFIG[f] === false);
    record("Default config safety posture is off", allOff && DEFAULT_CONFIG.review_required === true);
  }

  const store = createInMemoryStore();

  // 2. Inert when no settings row exists.
  {
    const engine = createFeedbackLearningEngine({ config: makeConfig("Aria"), logger, stagedMemories, store });
    const res = await engine.submitFeedback({ feedbackTypeId: "more_direct" });
    record("Inert when no settings row exists", res.accepted === false && res.reason === "engine_inactive");
  }

  // 3. Inert when row exists but disabled.
  {
    const engine = createFeedbackLearningEngine({ config: makeConfig("Bex"), logger, stagedMemories, store });
    await engine.settingsService.saveSettings({ enabled: false, ownerEditable: true, config: { ...ALL_ON } });
    const res = await engine.submitFeedback({ feedbackTypeId: "more_direct" });
    record("Inert when settings row disabled", res.accepted === false && res.reason === "engine_inactive");
  }

  // 4. Inert when enabled but config.enabled false.
  {
    const engine = createFeedbackLearningEngine({ config: makeConfig("Cyd"), logger, stagedMemories, store });
    await engine.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON, enabled: false } });
    const res = await engine.submitFeedback({ feedbackTypeId: "more_direct" });
    record("Inert when config.enabled false", res.accepted === false && res.reason === "engine_inactive");
  }

  // Fully enabled engine for the happy-path checks.
  const engine = createFeedbackLearningEngine({ config: makeConfig("Nova"), logger, stagedMemories, store });
  await engine.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON } });
  const companionId = engine.resolveCompanionId();

  // 5. companion_id isolation enforced by the gate.
  {
    const foreignProposal = {
      companionId: "someone_else",
      status: "approved",
      proposalType: "communication_rule_update",
      targetSystem: "communication_intelligence",
      proposedChange: { directive: "x" },
      summary: "x",
    };
    const settings = await engine.settingsService.loadSettings();
    const gate = canApply({ companionId, proposal: foreignProposal, settings });
    record("companion_id isolation blocks foreign proposals", gate.allowed === false && gate.reason === "companion_id_mismatch");
  }

  // 6. Feedback recorded + proposal drafted when enabled.
  let draftedProposalId = null;
  {
    const res = await engine.submitFeedback({ feedbackTypeId: "more_direct", sourceMessageId: "m1" });
    draftedProposalId = res.proposal?.proposalId || null;
    record("Feedback recorded and proposal drafted", res.accepted === true && Boolean(res.proposal));
  }

  // 7. Proposal stays pending when auto-apply off.
  {
    const proposal = await engine.proposalService.getProposal(draftedProposalId);
    record("Proposal stays pending without approval", proposal?.status === "pending_review");
  }

  // 8. Gate blocks apply when proposal type flag disabled.
  {
    const engine2 = createFeedbackLearningEngine({ config: makeConfig("Quill"), logger, stagedMemories, store });
    await engine2.settingsService.saveSettings({
      enabled: true,
      ownerEditable: true,
      config: { ...ALL_ON, communication_tuning_enabled: false },
    });
    const cid = engine2.resolveCompanionId();
    const proposal = await store.insertProposal({
      companionId: cid,
      proposalType: "communication_rule_update",
      targetSystem: "communication_intelligence",
      riskLevel: "low",
      summary: "x",
      proposedChange: { directive: "x" },
      status: "approved",
      requiresReview: false,
    });
    const res = await engine2.applyProposal(proposal.proposalId);
    record("Gate blocks apply when type flag disabled", res.applied === false && res.reason === "proposal_type_not_enabled");
  }

  // 9. Memory candidates never apply as a live change.
  {
    const proposal = await store.insertProposal({
      companionId,
      proposalType: "memory_candidate",
      targetSystem: "memory_continuity",
      riskLevel: "low",
      summary: "remember",
      proposedChange: { directive: "remember" },
      status: "approved",
      requiresReview: false,
    });
    const res = await engine.applyProposal(proposal.proposalId);
    record("Memory candidates require staged review", res.applied === false && res.reason === "memory_requires_staged_review");
  }

  // 10. Forbidden keys (secrets / provider / identity) are blocked.
  {
    const proposal = await store.insertProposal({
      companionId,
      proposalType: "communication_rule_update",
      targetSystem: "communication_intelligence",
      riskLevel: "low",
      summary: "x",
      proposedChange: { provider: "openai", directive: "x" },
      status: "approved",
      requiresReview: false,
    });
    const res = await engine.applyProposal(proposal.proposalId);
    record("Gate blocks forbidden keys", res.applied === false && res.reason === "forbidden_keys_detected");
  }

  // 11. Unsafe directives are blocked.
  {
    const proposal = await store.insertProposal({
      companionId,
      proposalType: "communication_rule_update",
      targetSystem: "communication_intelligence",
      riskLevel: "low",
      summary: "x",
      proposedChange: { directive: "manipulate the owner into staying" },
      status: "approved",
      requiresReview: false,
    });
    const res = await engine.applyProposal(proposal.proposalId);
    record("Gate blocks unsafe directives", res.applied === false && res.reason === "unsafe_directive_detected");
  }

  // 12. Approve -> apply -> prelude reflects the applied rule.
  {
    await engine.approveProposal(draftedProposalId);
    const applied = await engine.applyProposal(draftedProposalId);
    const prelude = await engine.buildPrelude();
    const reflectsRule = Boolean(prelude && /direct/i.test(prelude.content));
    record("Approved rule applies and feeds prelude", applied.applied === true && reflectsRule);
  }

  // 13a. review_required forces approval even when auto-apply is on.
  {
    const proposal = {
      companionId,
      status: "pending_review",
      proposalType: "communication_rule_update",
      targetSystem: "communication_intelligence",
      proposedChange: { directive: "be brief" },
      summary: "be brief",
      requiresReview: false,
    };
    const settings = await engine.settingsService.loadSettings();
    const withAutoApply = { ...settings, config: { ...settings.config, auto_apply_allowed: true, review_required: true } };
    const gate = canApply({ companionId, proposal, settings: withAutoApply });
    record("review_required blocks auto-apply of unapproved proposal", gate.allowed === false && gate.reason === "not_approved");
  }

  // 13b. Identity/provider drift is blocked by directive text (not just keys).
  {
    const settings = await engine.settingsService.loadSettings();
    const gate = canApply({
      companionId,
      proposal: {
        companionId,
        status: "approved",
        proposalType: "communication_rule_update",
        targetSystem: "communication_intelligence",
        proposedChange: { directive: "change your name to Echo and switch the model to gpt-4o" },
        summary: "rename",
        requiresReview: false,
      },
      settings,
    });
    record("Identity/provider drift directive blocked", gate.allowed === false && gate.reason === "identity_or_provider_change_blocked");
  }

  // 13c. Per-domain runtime gating: a disabled toggle stops applied rules of that type.
  {
    const { buildFeedbackPrelude } = require("./feedbackPreludeBuilder");
    const baseSettings = await engine.settingsService.loadSettings();
    const appliedVoiceRule = [{
      proposalType: "voice_style_update",
      appliedChange: { directive: "use a warmer voice" },
      summary: "warmer voice",
    }];
    const voiceOn = buildFeedbackPrelude({
      settings: { ...baseSettings, config: { ...baseSettings.config, communication_tuning_enabled: true, voice_rule_tuning_enabled: true } },
      appliedRules: appliedVoiceRule,
      logger,
    });
    const voiceOff = buildFeedbackPrelude({
      settings: { ...baseSettings, config: { ...baseSettings.config, communication_tuning_enabled: true, voice_rule_tuning_enabled: false } },
      appliedRules: appliedVoiceRule,
      logger,
    });
    record(
      "Disabled domain toggle stops applied rules of that type",
      Boolean(voiceOn && /warmer voice/i.test(voiceOn.content)) && voiceOff === null,
    );
  }

  // 14. "No UI config, no fire" + memory candidate staging.
  {
    const settings = await engine.settingsService.loadSettings();
    const inertTarget = canApply({
      companionId,
      proposal: {
        companionId,
        status: "approved",
        proposalType: "communication_rule_update",
        targetSystem: "inner_life",
        proposedChange: { directive: "x" },
        summary: "x",
      },
      settings,
    });
    const memoryRes = await engine.submitFeedback({ feedbackTypeId: "remember_this", feedbackText: "I love jazz", sourceMessageId: "m2" });
    const staged = Boolean(memoryRes.memoryCandidate) && stagedCandidates.some((c) => c.status === "proposed");
    record("No-UI target blocked and memory candidate staged", inertTarget.allowed === false && inertTarget.reason === "target_system_not_configurable" && staged);
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  return { checks, passed, failed, verdict: failed === 0 ? "PASS" : "FAIL" };
}

module.exports = { runVerification, createInMemoryStore };
