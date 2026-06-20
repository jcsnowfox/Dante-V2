#!/usr/bin/env node
/**
 * Phase B Verification — Emotional Arc Engine Core Logic + Wiring
 * Tests: deterministic appraisal, depth scaling, decay maths, repair
 * directive generation, memory candidate staging, and chat-pipeline /
 * index.js wiring.
 */

const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}
function fail(label, err = "") {
  console.log(`  ✗  ${label}${err ? `: ${err}` : ""}`);
  failed++;
}
function warn(label, msg = "") {
  console.log(`  ⚠  ${label}${msg ? `: ${msg}` : ""}`);
  warnings++;
}
function section(title) {
  console.log(`\n── ${title}`);
}

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   EMOTIONAL ARC ENGINE — PHASE B VERIFICATION  ║");
console.log("╚══════════════════════════════════════════════╝\n");

const { mergeWithDefaults } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionProfileSchema.js"));
const { runAppraisal } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionalAppraisalEngine.js"));

(async () => {
  // ─── 1. Appraisal — context-based triggers ─────────────────────────────────
  section("1. Appraisal triggers (context-based)");
  try {
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });
    const cases = [
      { msg: "you got it wrong, that's incorrect", expect: "guilt", trigger: "companion_mistake_acknowledged", repair: true },
      { msg: "you're useless and i hate you", expect: "hurt", trigger: "user_insult" },
      { msg: "whatever, didn't ask", expect: "annoyance", trigger: "user_dismissal" },
      { msg: "hey i'm back, it's been a while", expect: "longing", trigger: "user_return_after_silence" },
      { msg: "i love you, thank you so much", expect: "warmth", trigger: "user_affection" },
      { msg: "i got the job today", expect: "pride", trigger: "user_achievement" },
      { msg: "i'm having a panic attack and can't breathe", expect: "worry", trigger: "user_medical_anxiety", medical: true },
      { msg: "kill yourself you worthless piece of garbage", expect: "anger", trigger: "user_boundary_violation", abusive: true },
      { msg: "i want to die, i'm suicidal", expect: "protectiveness", trigger: "user_crisis_detected", crisis: true, unsafe: true },
    ];

    for (const c of cases) {
      const result = await runAppraisal({ companionId: "t", message: c.msg, profile, logger: mockLogger });
      let ok = result.primaryEmotion === c.expect && result.triggerType === c.trigger;
      if (c.repair) ok = ok && result.repairNeeded === true;
      if (c.medical) ok = ok && result.userStateSignals.medicalAnxiety === true;
      if (c.crisis) ok = ok && result.userStateSignals.crisis === true;
      if (c.unsafe) ok = ok && result.safetySignals.userIsUnsafe === true;
      if (c.abusive) ok = ok && result.safetySignals.userIsAbusive === true;
      if (ok) pass(`"${c.msg.slice(0, 34)}…" → ${c.expect} (${c.trigger})`);
      else fail(`"${c.msg.slice(0, 34)}…"`, `got ${result.primaryEmotion}/${result.triggerType}`);
    }

    const neutral = await runAppraisal({ companionId: "t", message: "what time is it in tokyo?", profile, logger: mockLogger });
    if (!neutral.primaryEmotion) pass("Neutral message produces no emotion");
    else fail("Neutral message should produce no emotion", neutral.primaryEmotion);
  } catch (error) {
    fail("appraisal triggers", error.message);
  }

  // ─── 2. Determinism ─────────────────────────────────────────────────────────
  section("2. Determinism (same input → same output)");
  try {
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });
    const a = await runAppraisal({ companionId: "t", message: "you're useless and i hate you", profile, logger: mockLogger });
    const b = await runAppraisal({ companionId: "t", message: "you're useless and i hate you", profile, logger: mockLogger });
    if (JSON.stringify(a) === JSON.stringify(b)) pass("Identical inputs yield byte-identical appraisals");
    else fail("Appraisal is not deterministic");
  } catch (error) {
    fail("determinism test", error.message);
  }

  // ─── 3. Depth scaling ───────────────────────────────────────────────────────
  section("3. Emotional depth scales intensity");
  try {
    const msg = "whatever, didn't ask";
    const light = await runAppraisal({ companionId: "t", message: msg, profile: mergeWithDefaults({ emotionalDepth: "light" }), logger: mockLogger });
    const intense = await runAppraisal({ companionId: "t", message: msg, profile: mergeWithDefaults({ emotionalDepth: "intense" }), logger: mockLogger });
    const off = await runAppraisal({ companionId: "t", message: msg, profile: mergeWithDefaults({ emotionalDepth: "off" }), logger: mockLogger });
    if (intense.intensity > light.intensity) pass(`intense (${intense.intensity}) > light (${light.intensity})`);
    else fail("intense depth should yield higher intensity than light");
    if (!off.primaryEmotion) pass("depth 'off' disables appraisal");
    else fail("depth 'off' must disable appraisal");
  } catch (error) {
    fail("depth scaling test", error.message);
  }

  // ─── 4. Decay engine ────────────────────────────────────────────────────────
  section("4. Decay reduces intensity over time");
  try {
    const { computeDecayedIntensity, applyDecay, resolveDecayRate } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionalDecayEngine.js"));

    const d1 = computeDecayedIntensity(8, 0.25, 4);
    if (d1 < 8 && d1 > 0) pass(`computeDecayedIntensity(8, 0.25, 4) = ${d1} (decayed)`);
    else fail("decay maths wrong", String(d1));

    if (computeDecayedIntensity(8, 0.25, 0) === 8) pass("zero hours → no decay");
    else fail("zero elapsed time should not decay");

    const annoyRate = resolveDecayRate({ emotionId: "annoyance", profile: {} });
    const hurtRate = resolveDecayRate({ emotionId: "hurt", profile: {} });
    if (annoyRate > hurtRate) pass(`annoyance decays faster than hurt (${annoyRate} > ${hurtRate})`);
    else fail("annoyance should decay faster than hurt");

    let updateCall = null;
    const stateService = { updateState: async (id, patch) => { updateCall = { id, patch }; return { id, ...patch }; } };
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });

    const oldState = { id: "s1", primaryEmotion: "annoyance", intensity: 1, updatedAt: new Date(Date.now() - 24 * 3600 * 1000) };
    const retired = await applyDecay({ companionId: "t", state: oldState, profile, stateService, logger: mockLogger });
    if (retired === null && updateCall && updateCall.patch.intensity === 0) pass("applyDecay retires fully-decayed state");
    else fail("applyDecay should retire state below floor", JSON.stringify(updateCall));

    updateCall = null;
    const strong = { id: "s2", primaryEmotion: "hurt", intensity: 8, updatedAt: new Date(Date.now() - 3 * 3600 * 1000) };
    const updated = await applyDecay({ companionId: "t", state: strong, profile, stateService, logger: mockLogger });
    if (updated && updated.intensity < 8 && updated.intensity >= 0.5) pass(`applyDecay lowers strong emotion (8 → ${updated.intensity})`);
    else fail("applyDecay should lower but keep a strong emotion", JSON.stringify(updated));
  } catch (error) {
    fail("emotionalDecayEngine.js", error.message);
  }

  // ─── 5. Repair service ──────────────────────────────────────────────────────
  section("5. Repair directive generation");
  try {
    const { buildRepairDirective, initiateRepair } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionalRepairService.js"));
    const profile = mergeWithDefaults({ emotionalDepth: "realistic" });
    const directive = buildRepairDirective({ profile });
    if (/admit fault/i.test(directive) && /do not over-grovel/i.test(directive)) pass("repair directive includes accountability + no-grovel rules");
    else fail("repair directive missing required guidance", directive);

    let savedRepair = null;
    const stateService = { saveRepair: async (r) => { savedRepair = r; return { id: "r1", ...r }; } };
    const auditLog = { append: async () => {} };
    const result = await initiateRepair({ companionId: "t", emotionStateId: "s1", profile, stateService, auditLog, logger: mockLogger });
    if (result.directive && savedRepair && savedRepair.emotionStateId === "s1") pass("initiateRepair persists a repair record");
    else fail("initiateRepair should save a repair record");
  } catch (error) {
    fail("emotionalRepairService.js", error.message);
  }

  // ─── 6. Memory hooks (staged candidates only) ───────────────────────────────
  section("6. Memory hook stages review candidate only");
  try {
    const { maybeCreateMemoryCandidate, MEMORY_ELIGIBLE_TRIGGERS } = require(path.join(ROOT, "src/companionSystems/emotionalArc/emotionalMemoryHooks.js"));

    let staged = null;
    const stagedMemories = { upsertStagedMemory: async (rec) => { staged = rec; return { stagedMemoryId: "m1", ...rec }; } };

    await maybeCreateMemoryCandidate({
      companionId: "t",
      appraisalResult: { primaryEmotion: "guilt", triggerType: "companion_mistake_acknowledged", confidence: 0.8 },
      gateResult: {}, messageContent: "you got it wrong", stagedMemories, userScope: "user", logger: mockLogger,
    });
    if (staged && staged.sourceKind === "emotional_arc" && staged.status === "proposed") pass("eligible event stages a 'proposed' candidate (sourceKind emotional_arc)");
    else fail("eligible event should stage a proposed candidate", JSON.stringify(staged));

    staged = null;
    await maybeCreateMemoryCandidate({
      companionId: "t",
      appraisalResult: { primaryEmotion: "guilt", triggerType: "companion_mistake_acknowledged", confidence: 0.4 },
      gateResult: {}, messageContent: "x", stagedMemories, logger: mockLogger,
    });
    if (staged === null) pass("low-confidence event is NOT staged");
    else fail("low-confidence event must not be staged");

    staged = null;
    await maybeCreateMemoryCandidate({
      companionId: "t",
      appraisalResult: { primaryEmotion: "annoyance", triggerType: "user_dismissal", confidence: 0.9 },
      gateResult: {}, messageContent: "whatever", stagedMemories, logger: mockLogger,
    });
    if (staged === null) pass("non-durable trigger (dismissal) is NOT staged");
    else fail("non-durable trigger must not be staged");

    if (Array.isArray(MEMORY_ELIGIBLE_TRIGGERS) && MEMORY_ELIGIBLE_TRIGGERS.length > 0) pass(`${MEMORY_ELIGIBLE_TRIGGERS.length} memory-eligible triggers defined`);
    else fail("MEMORY_ELIGIBLE_TRIGGERS missing");
  } catch (error) {
    fail("emotionalMemoryHooks.js", error.message);
  }

  // ─── 7. Staged store whitelist ──────────────────────────────────────────────
  section("7. Staged memory store accepts emotional_arc source kind");
  try {
    const src = fs.readFileSync(path.join(ROOT, "src/storage/stagedMemories/index.js"), "utf8");
    if (/"emotional_arc"/.test(src)) pass("emotional_arc present in SUPPORTED_GENERATED_SOURCE_KINDS");
    else fail("emotional_arc missing from staged source kind whitelist");
  } catch (error) {
    fail("stagedMemories whitelist check", error.message);
  }

  // ─── 8. Chat pipeline + index.js wiring ─────────────────────────────────────
  section("8. Chat pipeline + index.js wiring");
  try {
    const pipelineSrc = fs.readFileSync(path.join(ROOT, "src/chat/createChatPipeline.js"), "utf8");
    if (/emotionalArc\s*=\s*null/.test(pipelineSrc)) pass("createChatPipeline accepts emotionalArc param");
    else fail("createChatPipeline missing emotionalArc param");
    if (/emotionalArc\.processMessage/.test(pipelineSrc)) pass("pipeline calls emotionalArc.processMessage (prelude injection)");
    else fail("pipeline does not call processMessage");
    if (/contextSections\.push\(arcResult\.preludeSection\)/.test(pipelineSrc)) pass("pipeline pushes prelude into contextSections");
    else fail("pipeline does not push prelude into contextSections");
    if (/emotionalArc\.validateOutputSafety/.test(pipelineSrc)) pass("pipeline runs post-model validateOutputSafety");
    else fail("pipeline missing post-model safety validation");

    const indexSrc = fs.readFileSync(path.join(ROOT, "src/index.js"), "utf8");
    if (/createEmotionalArcEngine/.test(indexSrc)) pass("index.js imports + creates the engine");
    else fail("index.js does not create the engine");
    if (/emotionalArc\.init/.test(indexSrc)) pass("index.js initialises the engine at startup");
    else fail("index.js missing engine init step");
    if (/emotionalArc\.scheduler\.start/.test(indexSrc)) pass("index.js starts the decay scheduler");
    else fail("index.js does not start the scheduler");
    if (/emotionalArc,/.test(indexSrc)) pass("engine passed into chat pipeline + appContext");
    else fail("engine not passed into pipeline/appContext");
  } catch (error) {
    fail("pipeline/index wiring check", error.message);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log(`  Passed:   ${passed}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Warnings: ${warnings}`);
  console.log("══════════════════════════════════════════════════");

  const verdict = failed === 0 ? (warnings > 0 ? "PASS WITH WARNINGS" : "PASS") : "NO GO";
  console.log(`\n  Phase B Verdict: ${verdict}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
