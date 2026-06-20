/**
 * relationalVerification
 *
 * Programmatic proof harness for the Relational State Engine. It exercises the
 * engine against an in-memory store (no DATABASE_URL needed) and asserts the
 * core safety guarantees from the spec: additive only, companion_id isolation,
 * "no UI config = no fire", desires never execute, manipulation always blocked,
 * decay persists guilt, trust moves slowly, and the emotion + learning engines
 * are reused (not duplicated). Used by scripts/verify-relational-state.js.
 */

const { createRelationalStateEngine } = require("./index");
const { createRelationalAppraisalEngine, applyTrackingFlags } = require("./relationalAppraisalEngine");
const { evaluateExpression, checkBlockedPatterns } = require("./relationalExpressionGate");
const { applyTrust } = require("./relationalTrustService");
const { DEFAULT_CONFIG } = require("./relationalConfigSchema");
const { BOOLEAN_FLAGS } = require("./relationalConfigSchema");

function createInMemoryStore() {
  const settings = new Map(); // `${companionId}:${systemKey}` -> row
  const states = new Map(); // companionId -> row
  const events = [];
  const repairs = [];
  const desires = [];
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
    async loadState({ companionId }) {
      return states.get(companionId) || null;
    },
    async upsertState({ companionId, ...rest }) {
      const row = { id: seq++, companionId, ...rest, updatedAt: new Date() };
      states.set(companionId, row);
      return row;
    },
    async insertEvent(payload) {
      const row = { id: seq++, relationalEventId: seq, createdAt: new Date(), ...payload };
      events.push(row);
      return row;
    },
    async listEvents({ companionId, limit = 50 }) {
      return events.filter((e) => e.companionId === companionId).slice(-limit).reverse();
    },
    async countEventsSince({ companionId, since }) {
      return events.filter((e) => e.companionId === companionId && e.createdAt >= since).length;
    },
    async insertRepair(payload) {
      const row = { id: seq++, repairId: seq, resolved: false, createdAt: new Date(), ...payload };
      repairs.push(row);
      return row;
    },
    async listRepairs({ companionId, resolved = null, limit = 50 }) {
      return repairs
        .filter((r) => r.companionId === companionId && (resolved === null || Boolean(r.resolved) === Boolean(resolved)))
        .slice(-limit)
        .reverse();
    },
    async resolveRepair({ companionId, repairId, accepted }) {
      const row = repairs.find((r) => r.companionId === companionId && r.id === repairId);
      if (!row) return null;
      row.resolved = true;
      row.accepted = accepted;
      return row;
    },
    async insertDesire(payload) {
      const row = { id: seq++, desireId: seq, createdAt: new Date(), ...payload };
      desires.push(row);
      return row;
    },
    async listDesires({ companionId, status = null, limit = 50 }) {
      return desires
        .filter((d) => d.companionId === companionId && (!status || d.status === status))
        .slice(-limit)
        .reverse();
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
        desires: desires.filter((d) => d.companionId === companionId).length,
        repairs: repairs.filter((r) => r.companionId === companionId).length,
        arcs: 0,
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

// Every owner flag on. Expression mode allow/block lists left empty (= all
// modes permitted) so the gate's own safety rules are what we are testing.
const ALL_ON = (() => {
  const cfg = {};
  for (const flag of BOOLEAN_FLAGS) cfg[flag] = true;
  cfg.relational_depth = "realistic";
  cfg.allowed_expression_modes = [];
  cfg.blocked_expression_modes = [];
  return cfg;
})();

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

  // 1. Default safety posture: everything off except audit.
  {
    const trackingOff = BOOLEAN_FLAGS
      .filter((f) => f !== "audit_log_enabled")
      .every((f) => DEFAULT_CONFIG[f] === false);
    record("Default config safety posture is off (audit on)", trackingOff && DEFAULT_CONFIG.audit_log_enabled === true && DEFAULT_CONFIG.enabled === false);
  }

  const store = createInMemoryStore();

  // 2. Inert when no settings row exists.
  {
    const engine = createRelationalStateEngine({ config: makeConfig("Aria"), logger, stagedMemories, store });
    const res = await engine.processMessage({ message: "thank you so much" });
    record("Inert when no settings row exists", res.active === false && res.preludeSection === null);
  }

  // 3. Inert when row exists but disabled.
  {
    const engine = createRelationalStateEngine({ config: makeConfig("Bex"), logger, stagedMemories, store });
    await engine.settingsService.saveSettings({ enabled: false, ownerEditable: true, config: { ...ALL_ON } });
    const res = await engine.processMessage({ message: "thank you" });
    record("Inert when settings row disabled", res.active === false && res.preludeSection === null);
  }

  // 4. Inert when enabled but config.enabled false.
  {
    const engine = createRelationalStateEngine({ config: makeConfig("Cyd"), logger, stagedMemories, store });
    await engine.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON, enabled: false } });
    const res = await engine.processMessage({ message: "thank you" });
    record("Inert when config.enabled false", res.active === false && res.preludeSection === null);
  }

  // Fully enabled engine for the happy-path checks.
  const emotionalArc = {
    async getCurrentState() {
      return { mood: "tender", intensity: 6, source: "emotional_arc" };
    },
  };
  let feedbackDelegated = false;
  const feedbackLearning = {
    async submitFeedback(payload) {
      feedbackDelegated = true;
      return { accepted: true, delegated: true, payload };
    },
  };
  const engine = createRelationalStateEngine({
    config: makeConfig("Nova"),
    logger,
    stagedMemories,
    store,
    emotionalArc,
    feedbackLearning,
  });
  await engine.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON } });
  const companionId = engine.resolveCompanionId();

  // 5. Appraisal detects relational signals deterministically.
  {
    const appraiser = createRelationalAppraisalEngine({ config: ALL_ON, logger, emotionalArc });
    const result = await appraiser.appraise({ message: "thank you, that means a lot" });
    record("Appraisal detects signals deterministically", result.signals.some((s) => s.type === "warmth"));
  }

  // 6. Emotion engine reused (read, not duplicated) during appraisal.
  {
    const appraiser = createRelationalAppraisalEngine({ config: ALL_ON, logger, emotionalArc });
    const result = await appraiser.appraise({ message: "hi" });
    record("Reuses Emotional Arc (emotion) via getCurrentState", result.emotionalContext && result.emotionalContext.source === "emotional_arc");
  }

  // 7. "No UI config = no fire": a signal whose tracking flag is off is dropped.
  {
    const appraiser = createRelationalAppraisalEngine({ config: ALL_ON, logger, emotionalArc });
    const raw = await appraiser.appraise({ message: "thank you so much" });
    const offConfig = { ...ALL_ON, closeness_tracking_enabled: false };
    const tracked = applyTrackingFlags(raw, offConfig);
    const hadWarmth = raw.signals.some((s) => s.type === "warmth");
    const droppedWarmth = !tracked.signals.some((s) => s.type === "warmth");
    record("No UI config = no fire (untracked signal dropped)", hadWarmth && droppedWarmth);
  }

  // 8. Expression gate blocks manipulative / harmful patterns — both the helper
  //    in isolation AND the runtime path (an owner style string smuggling a
  //    blocked pattern into a directive must collapse the whole expression).
  {
    const guiltTrip = checkBlockedPatterns("after everything I've done for you");
    const threat = checkBlockedPatterns("you'll be sorry if you leave me");
    const clean = checkBlockedPatterns("I'm really glad we talked today");
    const settings = await engine.settingsService.loadSettings();
    const tainted = { ...settings, config: { ...settings.config, repair_style: "you'll be sorry" } };
    const appraisal = { primarySignal: "guilt", intensity: 6, recommendedExpressionMode: "repair_expression" };
    const gate = evaluateExpression({ appraisal, settings: tainted, channelType: "dm" });
    const runtimeBlocked = gate.allowExpression === false
      && String(gate.blockedReason).startsWith("blocked_pattern")
      && gate.toneDirectives.length === 0;
    record("Gate blocks manipulation/guilt/threats", guiltTrip.blocked && threat.blocked && clean.blocked === false && runtimeBlocked);
  }

  // 9. Anger/annoyance suppressed in a safety-critical / medical-anxiety moment.
  {
    const settings = await engine.settingsService.loadSettings();
    const appraisal = { primarySignal: "anger", intensity: 8, recommendedExpressionMode: "direct_expression", medicalAnxiety: true };
    const gate = evaluateExpression({ appraisal, settings, channelType: "dm", safetyContext: { medicalAnxiety: true } });
    record("Negative expression suppressed in safety-critical moment", gate.allowExpression === false && gate.blockedReason === "safety_critical_suppression");
  }

  // 10. Private/romantic expression blocked in a public channel unless allowed.
  {
    const settings = await engine.settingsService.loadSettings();
    const appraisal = { primarySignal: "affection", intensity: 8, recommendedExpressionMode: "direct_expression" };
    const gate = evaluateExpression({ appraisal, settings, channelType: "public" });
    record("Private expression blocked in public channel", gate.allowExpression === false && gate.blockedReason === "private_expression_in_public_channel");
  }

  // 11. Desire is recorded but NEVER executes (requires permission, no action).
  {
    const res = await engine.processMessage({ message: "i missed you", context: { userReturnedAfterSilence: true } });
    const desire = res.desire;
    const safe = desire && desire.requiresPermission === true && desire.allowedAction === null && desire.executed === false;
    record("Desire is internal only and never executes", Boolean(safe));
  }

  // 12. Desire blocked when desire_tracking_enabled is off.
  {
    const engine2 = createRelationalStateEngine({ config: makeConfig("Quill"), logger, stagedMemories, store, emotionalArc });
    await engine2.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON, desire_tracking_enabled: false } });
    const res = await engine2.processMessage({ message: "i missed you", context: { userReturnedAfterSilence: true } });
    record("Desire blocked when tracking flag off", res.desire === null);
  }

  // 13. Repair drafted (inert) only when at fault + repair tracking on.
  {
    const res = await engine.processMessage({ message: "you got that wrong", context: { companionMadeMistake: true } });
    const repair = res.repair;
    const blocked = repair ? checkBlockedPatterns(repair.repairMessage).blocked : true;
    record("Repair drafted as inert directive, no manipulation", Boolean(repair) && blocked === false);
  }

  // 14. Trust grows slowly and drops carefully (one moment never collapses it).
  {
    const up = applyTrust(5, 5, 5);
    const down = applyTrust(5, -5, 5);
    record("Trust grows slowly, drops carefully", up > 5 && up < 6 && down > 3 && down < 5);
  }

  // 15. Decay fades transient signals while guilt/remorse persist.
  {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const settings = await engine.settingsService.loadSettings();
    const decayed = await engine.decayService.applyDecay({
      state: { companionId, activeTension: 5, activeLonging: 4, distanceLevel: 6, repairNeeded: true, updatedAt: fiveHoursAgo },
      settings,
    });
    record("Decay fades transient signals, guilt persists", decayed.activeTension < 5 && decayed.repairNeeded === true);
  }

  // 16. Memory candidate staged as a proposal (never live), gated by flag.
  {
    const res = await engine.processMessage({ message: "you crossed a line and I'm not okay", context: { boundaryCrossed: true } });
    const staged = stagedCandidates.some((c) => c.sourceKind === "relational_state" && c.status === "proposed");
    record("Memory candidate staged as proposed (never live)", Boolean(res) && staged);
  }

  // 17. Prelude is additive and bounded; null unless active + enabled + allowed.
  {
    const prelude = await engine.buildPrelude({ message: "thank you, that means a lot" });
    const ok = prelude && prelude.title && prelude.content && prelude.content.split(/\s+/).length <= 120;
    const offEngine = createRelationalStateEngine({ config: makeConfig("Pip"), logger, stagedMemories, store, emotionalArc });
    await offEngine.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON, prelude_enabled: false } });
    const offPrelude = await offEngine.buildPrelude({ message: "thank you" });
    record("Prelude additive + bounded; off when prelude disabled", Boolean(ok) && offPrelude === null);
  }

  // 18. companion_id isolation: one companion's state never leaks to another.
  {
    const other = createRelationalStateEngine({ config: makeConfig("Zed"), logger, stagedMemories, store, emotionalArc });
    await other.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON } });
    await engine.processMessage({ message: "you crossed a line", context: { boundaryCrossed: true } });
    const otherState = await other.stateService.getState();
    record("companion_id isolation keeps state separate", otherState.distanceLevel === 0 && otherState.companionId === other.resolveCompanionId());
  }

  // 19. Reuses Feedback & Learning (learning) — tuning is delegated, not rebuilt.
  {
    const res = await engine.requestTuningFromFeedback({ feedbackTypeId: "more_warm", feedbackText: "be warmer" });
    record("Reuses Feedback & Learning (learning) via delegation", res.accepted === true && res.delegated === true && feedbackDelegated === true);
  }

  // 20. "No UI config = no fire" for the slow arc: relationship_arc_enabled=false
  //     freezes trust/closeness/distance across ALL dimensions, even with a
  //     pre-existing nonzero state and a strong incoming signal.
  {
    const frozen = createRelationalStateEngine({ config: makeConfig("Wren"), logger, stagedMemories, store, emotionalArc });
    await frozen.settingsService.saveSettings({ enabled: true, ownerEditable: true, config: { ...ALL_ON, relationship_arc_enabled: false } });
    const cid = frozen.resolveCompanionId();
    await store.upsertState({ companionId: cid, trustLevel: 7, closenessLevel: 6, distanceLevel: 3, repairNeeded: false, activeTension: 2, activeLonging: 1 });
    await frozen.processMessage({ message: "you crossed a line", context: { boundaryCrossed: true } });
    const st = await frozen.stateService.getState();
    const frozenOk = st.trustLevel === 7 && st.closenessLevel === 6 && st.distanceLevel === 3 && st.companionId === cid;
    record("relationship_arc_enabled=false freezes slow state", frozenOk);
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  return { checks, passed, failed, verdict: failed === 0 ? "PASS" : "FAIL" };
}

module.exports = { runVerification, createInMemoryStore };
