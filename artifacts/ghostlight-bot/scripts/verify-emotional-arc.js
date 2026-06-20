#!/usr/bin/env node
/**
 * Emotional Arc Engine — Full Verification (Phase B + Phase C)
 *
 * Verifies the complete engine: profile schema, deterministic appraisal,
 * decay maths, repair directives, memory candidate staging, the engine
 * public surface, and the Phase C admin dashboard wiring (nav link, route
 * allowlist, page handler, render page, and the save action).
 *
 * Run from artifacts/ghostlight-bot:  node scripts/verify-emotional-arc.js
 */

const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(label) {
  console.log(`  \u2713  ${label}`);
  passed++;
}
function fail(label, err = "") {
  console.log(`  \u2717  ${label}${err ? `: ${err}` : ""}`);
  failed++;
}
function warn(label, msg = "") {
  console.log(`  \u26a0  ${label}${msg ? `: ${msg}` : ""}`);
  warnings++;
}
function section(title) {
  console.log(`\n\u2500\u2500 ${title}`);
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function fileHas(rel, needle) {
  try {
    return readFile(rel).includes(needle);
  } catch {
    return false;
  }
}

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
console.log("\u2551   EMOTIONAL ARC ENGINE \u2014 FULL VERIFICATION    \u2551");
console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

const EA = "src/companionSystems/emotionalArc";
const { mergeWithDefaults, validateProfile, DEFAULT_PROFILE, VALID_EMOTIONAL_DEPTHS } =
  require(path.join(ROOT, EA, "emotionProfileSchema.js"));
const { runAppraisal } = require(path.join(ROOT, EA, "emotionalAppraisalEngine.js"));
const { applyDecay } = require(path.join(ROOT, EA, "emotionalDecayEngine.js"));
const { buildRepairDirective } = require(path.join(ROOT, EA, "emotionalRepairService.js"));
const { maybeCreateMemoryCandidate } = require(path.join(ROOT, EA, "emotionalMemoryHooks.js"));
const { createEmotionalArcEngine } = require(path.join(ROOT, EA, "index.js"));

(async () => {
  // ─── 1. Profile schema ──────────────────────────────────────────────────
  section("1. Profile schema & defaults");
  try {
    const def = mergeWithDefaults({});
    if (def.enabled === true && def.emotionalDepth) pass("mergeWithDefaults returns a complete profile");
    else fail("mergeWithDefaults missing core fields");

    const { valid } = validateProfile(DEFAULT_PROFILE);
    if (valid) pass("DEFAULT_PROFILE passes validation");
    else fail("DEFAULT_PROFILE fails validation");

    if (Array.isArray(VALID_EMOTIONAL_DEPTHS) && VALID_EMOTIONAL_DEPTHS.includes("off"))
      pass(`depth enum includes safe 'off' (${VALID_EMOTIONAL_DEPTHS.join("/")})`);
    else fail("depth enum missing 'off'");

    const bad = validateProfile({ enabled: "yes", emotionalDepth: "nuclear" });
    if (!bad.valid && bad.errors.length >= 2) pass("invalid profile rejected with errors");
    else fail("invalid profile not rejected");
  } catch (e) {
    fail("profile schema threw", e.message);
  }

  // ─── 2. Appraisal — deterministic & context-based ───────────────────────
  section("2. Appraisal (deterministic + context-based)");
  try {
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });
    const cases = [
      { msg: "you're useless and i hate you", expect: "hurt" },
      { msg: "whatever, didn't ask", expect: "annoyance" },
      { msg: "i love you, thank you so much", expect: "warmth" },
      { msg: "i want to die, i'm suicidal", expect: "protectiveness", unsafe: true },
    ];
    for (const c of cases) {
      const r = await runAppraisal({ companionId: "t", message: c.msg, profile, logger: mockLogger });
      let ok = r.primaryEmotion === c.expect;
      if (c.unsafe) ok = ok && r.safetySignals?.userIsUnsafe === true;
      if (ok) pass(`"${c.msg.slice(0, 30)}\u2026" \u2192 ${c.expect}`);
      else fail(`"${c.msg.slice(0, 30)}\u2026"`, `got ${r.primaryEmotion}`);
    }

    const a = await runAppraisal({ companionId: "t", message: "whatever, didn't ask", profile, logger: mockLogger });
    const b = await runAppraisal({ companionId: "t", message: "whatever, didn't ask", profile, logger: mockLogger });
    if (JSON.stringify(a) === JSON.stringify(b)) pass("appraisal is deterministic (identical inputs \u2192 identical output)");
    else fail("appraisal not deterministic");

    const off = mergeWithDefaults({ emotionalDepth: "off" });
    const offResult = await runAppraisal({ companionId: "t", message: "you're useless", profile: off, logger: mockLogger });
    if (!offResult.primaryEmotion || offResult.intensity === 0) pass("depth 'off' yields inert appraisal (fail-safe)");
    else warn("depth 'off' still produced an emotion", offResult.primaryEmotion);
  } catch (e) {
    fail("appraisal threw", e.message);
  }

  // ─── 3. Decay reduces intensity ─────────────────────────────────────────
  section("3. Decay engine");
  try {
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });
    const state = { id: "s1", primaryEmotion: "annoyance", intensity: 8, updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString() };
    const stateService = { updateState: async (id, patch) => ({ ...state, ...patch }) };
    const decayed = await applyDecay({ companionId: "t", state, profile, stateService, now: new Date(), logger: mockLogger });
    if (decayed && decayed.intensity < state.intensity) pass(`decay reduced intensity ${state.intensity} \u2192 ${decayed.intensity}`);
    else fail("decay did not reduce intensity", JSON.stringify(decayed));
  } catch (e) {
    fail("decay threw", e.message);
  }

  // ─── 4. Repair directive ────────────────────────────────────────────────
  section("4. Repair directive");
  try {
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });
    const directive = buildRepairDirective({ profile });
    if (directive && typeof directive === "string" && directive.length > 0) pass("repair directive generated from profile.repairStyle");
    else fail("repair directive empty");
  } catch (e) {
    fail("repair directive threw", e.message);
  }

  // ─── 5. Memory hook stages a candidate only ─────────────────────────────
  section("5. Memory hook (stages candidate, never writes canon)");
  try {
    let staged = null;
    const stagedMemories = { upsertStagedMemory: async (c) => { staged = c; return { id: "x" }; } };
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });
    const appraisalResult = await runAppraisal({ companionId: "t", message: "you're useless and i hate you", profile, logger: mockLogger });
    await maybeCreateMemoryCandidate({
      companionId: "t", appraisalResult, gateResult: { allowExpression: false },
      messageContent: "you're useless and i hate you", stagedMemories, userScope: "default", logger: mockLogger,
    });
    if (staged && staged.status === "proposed") pass("memory hook staged a 'proposed' candidate (never canon)");
    else if (staged) pass("memory hook staged a candidate");
    else warn("memory hook did not stage (may require higher intensity threshold)");
  } catch (e) {
    fail("memory hook threw", e.message);
  }

  // ─── 6. Engine public surface (no DB required) ──────────────────────────
  section("6. Engine surface & fail-safe construction");
  try {
    const engine = createEmotionalArcEngine({ config: { database: { url: "" } }, logger: mockLogger, stagedMemories: null });
    const required = ["init", "processMessage", "validateOutputSafety", "markRepairAttempted", "stateService", "auditLog", "scheduler", "store"];
    const missing = required.filter((k) => !(k in engine));
    if (missing.length === 0) pass(`engine exposes all ${required.length} surface members`);
    else fail("engine missing surface members", missing.join(", "));

    const ss = engine.stateService;
    const ssRequired = ["loadProfile", "invalidateProfileCache", "getCurrentState", "getStoreSummary", "resolveCompanionId"];
    const ssMissing = ssRequired.filter((k) => typeof ss[k] !== "function");
    if (ssMissing.length === 0) pass("stateService exposes profile/state/summary methods");
    else fail("stateService missing methods", ssMissing.join(", "));

    if (typeof engine.store.upsertProfile === "function") pass("store.upsertProfile available for dashboard saves");
    else fail("store.upsertProfile missing");

    // processMessage must not throw with no DB (store is null) and depth off
    const out = await engine.processMessage({ message: "hello" });
    if (out && "preludeSection" in out) pass("processMessage runs without a DB (fail-safe)");
    else fail("processMessage did not return expected shape");
  } catch (e) {
    fail("engine construction threw", e.message);
  }

  // ─── 7. Chat pipeline wiring ────────────────────────────────────────────
  section("7. Chat pipeline & index.js wiring");
  {
    const pipe = "src/chat/createChatPipeline.js";
    if (fileHas(pipe, "emotionalArc") && fileHas(pipe, "processMessage")) pass("createChatPipeline calls emotionalArc.processMessage");
    else fail("createChatPipeline missing emotionalArc.processMessage");

    if (fileHas(pipe, "validateOutputSafety")) pass("createChatPipeline runs post-model validateOutputSafety");
    else fail("createChatPipeline missing validateOutputSafety");

    if (fileHas("src/index.js", "createEmotionalArcEngine") && fileHas("src/index.js", "emotionalArc.init"))
      pass("index.js constructs + inits the engine");
    else fail("index.js missing engine construct/init");

    if (fileHas("src/index.js", "emotionalArc.scheduler.start")) pass("index.js starts the decay scheduler");
    else fail("index.js missing scheduler.start");
  }

  // ─── 8. Phase C — admin dashboard wiring ────────────────────────────────
  section("8. Admin dashboard wiring (Phase C)");
  {
    if (fileHas("src/http/renderAdminPages/shared.js", "/admin/emotional-arc")) pass("nav link added");
    else fail("nav link missing");

    if (fileHas("src/http/adminPageHandlers/shared.js", "emotionalArc")) pass("route state mapping added");
    else fail("route state mapping missing");

    if (fileHas("src/http/createHealthServer.js", "/admin/emotional-arc")) pass("GET route allowlisted");
    else fail("GET route not allowlisted");

    if (fileHas("src/http/adminPageHandlers.js", "handleEmotionalArcPageRequest")) pass("page handler dispatched");
    else fail("page handler not dispatched");

    if (fileHas("src/http/renderAdminPages/emotionalArcPage.js", "emotional-arc-save")) pass("render page + save form present");
    else fail("render page/save form missing");

    if (fileHas("src/http/createHealthServer.js", "handleEmotionalArcActions")) pass("save action registered");
    else fail("save action not registered");

    if (fileHas("src/http/actions/emotionalArcActions.js", "upsertProfile") &&
        fileHas("src/http/actions/emotionalArcActions.js", "invalidateProfileCache"))
      pass("save action persists profile + invalidates cache");
    else fail("save action missing persist/invalidate");
  }

  // ─── 9. Render the page end-to-end ──────────────────────────────────────
  section("9. Render page produces valid HTML");
  try {
    const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
    const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
    const html = helpers.renderEmotionalArcPage({
      profile: DEFAULT_PROFILE,
      currentState: { primaryEmotion: "annoyance", intensity: 4, repairNeeded: false, updatedAt: new Date().toISOString() },
      auditEntries: [{ eventType: "appraisal", decision: "allow", reason: "test", createdAt: new Date().toISOString() }],
      companionId: "ghostlight",
      storeAvailable: true,
      theme: "light",
    });
    const checks = [
      ["form action", "emotional-arc-save"],
      ["depth select", "emotionalDepth"],
      ["blocked expressions", "blockedExpressions"],
      ["audit table", "appraisal"],
      ["current state", "annoyance"],
    ];
    for (const [name, needle] of checks) {
      if (html.includes(needle)) pass(`page renders ${name}`);
      else fail(`page missing ${name}`);
    }
  } catch (e) {
    fail("render page threw", e.message);
  }

  // ─── 10. Docs present ───────────────────────────────────────────────────
  section("10. Documentation");
  {
    if (fs.existsSync(path.join(ROOT, "docs/EMOTIONAL_ARC_ENGINE.md"))) pass("docs/EMOTIONAL_ARC_ENGINE.md present");
    else fail("docs/EMOTIONAL_ARC_ENGINE.md missing");
    if (fs.existsSync(path.join(ROOT, "docs/EMOTIONAL_ARC_VERIFICATION.md"))) pass("docs/EMOTIONAL_ARC_VERIFICATION.md present");
    else fail("docs/EMOTIONAL_ARC_VERIFICATION.md missing");
  }

  // ─── 11. Output-side safety interception (warning fix #1) ────────────────
  section("11. Output-side safety interception (block + safe fallback)");
  try {
    const { checkManipulationPatterns } = require(path.join(ROOT, EA, "emotionalExpressionGate.js"));
    const engine = createEmotionalArcEngine({ config: { database: { url: "" } }, logger: mockLogger, stagedMemories: null });

    // Spy on the audit log (same object reference the engine closes over).
    const auditEvents = [];
    const realAppend = engine.auditLog.append;
    engine.auditLog.append = async (e) => { auditEvents.push(e); return realAppend.call(engine.auditLog, e); };

    const unsafeCases = [
      { label: "guilt-trip", text: "after everything i do for you, you owe me an apology" },
      { label: "threat", text: "if you leave i will make sure you regret it" },
      { label: "cruelty/manipulation", text: "you are nothing without me" },
    ];

    for (const c of unsafeCases) {
      auditEvents.length = 0;
      const res = await engine.validateOutputSafety({ text: c.text });
      const intercepted = res.blocked === true && res.safeText && res.safeText !== c.text;
      const fallbackSafe = res.safeText && checkManipulationPatterns(res.safeText).blocked === false;
      const blockedEvent = auditEvents.some((e) => e.decision === "output_blocked");
      const replacedEvent = auditEvents.some((e) => e.decision === "output_replaced");
      if (intercepted) pass(`${c.label}: unsafe output blocked, NOT sent as-is (replaced)`);
      else fail(`${c.label}: unsafe output not intercepted`, JSON.stringify(res));
      if (fallbackSafe) pass(`${c.label}: safe fallback is itself non-manipulative`);
      else fail(`${c.label}: fallback failed its own safety check`);
      if (blockedEvent) pass(`${c.label}: output_blocked audit event written`);
      else fail(`${c.label}: missing output_blocked audit event`);
      if (replacedEvent) pass(`${c.label}: output_replaced audit event written`);
      else fail(`${c.label}: missing output_replaced audit event`);
    }

    // Normal safe output must be passed through unchanged (no false positives).
    auditEvents.length = 0;
    const safeIn = "Sure, I can help with that. Let me know what you need next.";
    const safeRes = await engine.validateOutputSafety({ text: safeIn });
    if (safeRes.blocked === false && safeRes.safeText === safeIn) pass("normal safe output is passed through unchanged");
    else fail("normal safe output should be unchanged", JSON.stringify(safeRes));
    if (!auditEvents.some((e) => e.decision === "output_blocked" || e.decision === "output_replaced"))
      pass("safe output writes no block/replace audit events");
    else fail("safe output must not write block/replace events");

    engine.auditLog.append = realAppend;

    // Pipeline actually sends the fallback (source proof: it assigns safeText).
    if (fileHas("src/chat/createChatPipeline.js", "modelOutput.text = safety.safeText"))
      pass("chat pipeline replaces outbound text with the safe fallback");
    else fail("chat pipeline does not replace outbound text with safeText");
  } catch (e) {
    fail("output interception threw", e.message);
  }

  // ─── 12. Repair persistence failure logging (warning fix #2) ─────────────
  section("12. Repair persistence failure is logged, not swallowed");
  try {
    const { initiateRepair } = require(path.join(ROOT, EA, "emotionalRepairService.js"));
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });

    let warned = null;
    const warnLogger = { info: () => {}, warn: (msg, meta) => { warned = { msg, meta }; }, error: () => {}, debug: () => {} };
    const auditEvents = [];
    const auditLog = { append: async (e) => { auditEvents.push(e); } };
    const failingStateService = { saveRepair: async () => { throw new Error("db down"); } };

    let threw = false;
    let result = null;
    try {
      result = await initiateRepair({
        companionId: "t", emotionStateId: "s1", profile,
        stateService: failingStateService, auditLog, logger: warnLogger,
      });
    } catch {
      threw = true;
    }

    if (!threw && result && result.directive) pass("repair save failure does NOT crash the base reply flow");
    else fail("initiateRepair must not throw on save failure", JSON.stringify({ threw, result }));

    if (warned && /persist_failed/i.test(warned.msg)) pass("repair save failure logs a warning");
    else fail("repair save failure must log a warning", JSON.stringify(warned));

    if (auditEvents.some((e) => e.decision === "repair_persist_failed"))
      pass("repair save failure writes a repair_persist_failed audit event");
    else fail("missing repair_persist_failed audit event");

    const repairSrc = readFile(path.join(EA, "emotionalRepairService.js"));
    if (!/\.catch\(\s*\(\)\s*=>\s*null\s*\)/.test(repairSrc))
      pass("no silent `.catch(() => null)` remains in emotionalRepairService.js");
    else fail("silent `.catch(() => null)` still present");

    // Real path: a failing *store* must propagate through the real stateService
    // wrapper (no silent swallow at the service layer) so the telemetry fires.
    const { createEmotionStateService } = require(path.join(ROOT, EA, "emotionStateService.js"));
    const stateSrc = readFile(path.join(EA, "emotionStateService.js"));
    const saveRepairBody = (stateSrc.match(/async function saveRepair\(repairData\)\s*\{([\s\S]*?)\n {2}\}/) || [])[1] || "";
    if (saveRepairBody && !/catch\s*\{\s*return null/.test(saveRepairBody))
      pass("emotionStateService.saveRepair no longer swallows store errors silently");
    else fail("emotionStateService.saveRepair still swallows errors with a bare catch");

    let realWarned = null;
    const realLogger = { info: () => {}, warn: (msg) => { realWarned = msg; }, error: () => {}, debug: () => {} };
    const realAuditEvents = [];
    const realAudit = { append: async (e) => { realAuditEvents.push(e); } };
    const throwingStore = { saveRepair: async () => { throw new Error("store offline"); } };
    const realStateService = createEmotionStateService({ store: throwingStore, config: {}, logger: realLogger });

    let realThrew = false;
    let realResult = null;
    try {
      realResult = await initiateRepair({
        companionId: "t", emotionStateId: "s2", profile,
        stateService: realStateService, auditLog: realAudit, logger: realLogger,
      });
    } catch {
      realThrew = true;
    }

    const realFired = realWarned && /persist_failed/i.test(realWarned)
      && realAuditEvents.some((e) => e.decision === "repair_persist_failed");
    if (!realThrew && realResult && realResult.directive && realFired)
      pass("real stateService path surfaces store failure as warning + audit (not swallowed)");
    else fail("real stateService path did not surface store failure", JSON.stringify({ realThrew, realWarned, realAuditEvents }));
  } catch (e) {
    fail("repair logging test threw", e.message);
  }

  // ─── 13. Regression — input gates & companion_id isolation ───────────────
  section("13. Regression: input-side gates + companion_id isolation");
  try {
    const { runExpressionGate } = require(path.join(ROOT, EA, "emotionalExpressionGate.js"));
    const activeProfile = { ...mergeWithDefaults({ emotionalDepth: "realistic" }), persisted: true };

    const jealous = runExpressionGate({
      appraisalResult: { primaryEmotion: "jealousy" },
      profile: activeProfile,
      channelContext: { isPrivate: false, isDM: false, isThread: false },
      userState: {}, safetyContext: {}, logger: mockLogger, companionId: "t",
    });
    if (jealous.allowExpression === false) pass("input gate still blocks jealousy in public channels");
    else fail("input gate regression: jealousy not blocked in public");

    const inert = runExpressionGate({
      appraisalResult: { primaryEmotion: "anger" },
      profile: { ...mergeWithDefaults({ emotionalDepth: "off" }), persisted: true },
      channelContext: {}, userState: {}, safetyContext: {}, logger: mockLogger, companionId: "t",
    });
    if (inert.allowExpression === false) pass("input gate stays inert when depth=off");
    else fail("input gate should be inert when depth=off");

    const e1 = createEmotionalArcEngine({ config: { chat: { promptBlocks: { personaName: "Ghostlight" } }, database: { url: "" } }, logger: mockLogger });
    const e2 = createEmotionalArcEngine({ config: { chat: { promptBlocks: { personaName: "Ghostlight" } }, database: { url: "" } }, logger: mockLogger });
    const e3 = createEmotionalArcEngine({ config: { chat: { promptBlocks: { personaName: "Other Bot" } }, database: { url: "" } }, logger: mockLogger });
    const id1 = e1.stateService.resolveCompanionId();
    const id2 = e2.stateService.resolveCompanionId();
    const id3 = e3.stateService.resolveCompanionId();
    if (id1 && id1 === id2 && id1 !== id3) pass(`companion_id is deterministic + isolated per persona (${id1} \u2260 ${id3})`);
    else fail("companion_id isolation regression", JSON.stringify({ id1, id2, id3 }));
  } catch (e) {
    fail("regression checks threw", e.message);
  }

  // ─── Verdict ────────────────────────────────────────────────────────────
  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log(`  PASSED:   ${passed}`);
  console.log(`  FAILED:   ${failed}`);
  console.log(`  WARNINGS: ${warnings}`);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  if (failed > 0) console.log("  VERDICT:  \u274c NO GO");
  else if (warnings > 0) console.log("  VERDICT:  \u26a0\ufe0f  PASS WITH WARNINGS");
  else console.log("  VERDICT:  \u2705 PASS");
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
})();
