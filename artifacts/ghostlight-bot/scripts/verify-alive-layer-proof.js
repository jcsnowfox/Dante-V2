"use strict";
/**
 * verify-alive-layer-proof.js
 * Audits the Alive Layer for completeness, safety, and correct wiring.
 * Uses only mocks / in-process checks — no real Discord/Postgres/provider calls.
 * Prints ALIVE_PROOF_START … ALIVE_PROOF_PASS or ALIVE_PROOF_FAIL.
 */

const path = require("node:path");
const fs = require("node:fs");

const SRC = path.resolve(__dirname, "../src");
const ALIVE = path.join(SRC, "alive");

const results = {};

function check(key, value, expected = true, note = "") {
  const pass = value === expected;
  results[key] = { pass, value, expected, note };
  return pass;
}

function fileExists(rel) {
  return fs.existsSync(path.join(ALIVE, rel));
}

function srcContains(rel, pattern) {
  try {
    const content = fs.readFileSync(path.join(SRC, rel), "utf8");
    return typeof pattern === "string" ? content.includes(pattern) : pattern.test(content);
  } catch { return false; }
}

// ── VERIFY 1: REQUIRED ALIVE FILES ──────────────────────────────────────────
const requiredFiles = {
  aliveEngine:        fileExists("aliveEngine.js"),
  aliveEventsStore:   fileExists("aliveEventsStore.js"),
  intentionQueueStore: fileExists("intentionQueueStore.js"),
  alivePresenceStore: fileExists("alivePresenceStore.js"),
  alivePostUpdate:    fileExists("alivePostUpdate.js"),
  aliveExecutor:      fileExists("aliveExecutor.js"),
  aliveContextBuilder: fileExists("aliveContextBuilder.js"),
  backbonePolicy:     fileExists("backbonePolicy.js"),
};

// ── VERIFY 2: TEST COVERAGE ──────────────────────────────────────────────────
const testDir = path.join(ALIVE, "__tests__");
const testFiles = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter(f => f.endsWith(".test.js")) : [];
const hasTests = testFiles.length >= 3;

// ── VERIFY 3: DISABLED-BY-DEFAULT SAFETY ────────────────────────────────────
const aliveEngineContent = fs.readFileSync(path.join(ALIVE, "aliveEngine.js"), "utf8");
const disabledByDefault = aliveEngineContent.includes('=== true') && !aliveEngineContent.includes('!== false');

// ── VERIFY 4: RUNTIME WIRING ─────────────────────────────────────────────────
const pipelineInjectsAlive = srcContains("chat/createChatPipeline.js", "buildAliveContextPrelude")
  && srcContains("chat/createChatPipeline.js", "checkBackbone");
const pipelineFiresPostUpdate = srcContains("chat/createChatPipeline.js", "alivePostUpdate");
const indexWiresPresenceStore = srcContains("index.js", "alivePresenceStore")
  && srcContains("index.js", "alivePresenceStore.init");
const indexPassesStoresToPipeline = srcContains("index.js", "alivePresenceStore, aliveEventsStore, intentionQueue")
  || (srcContains("index.js", "alivePresenceStore") && srcContains("index.js", "intentionQueue"));
const executorReachesDiscord = srcContains("alive/aliveExecutor.js", "runCheckInAutomation");

// ── VERIFY 5: ENV VAR COVERAGE ───────────────────────────────────────────────
const envVars = {
  ALIVE_ENABLED: srcContains("alive/aliveEngine.js", "ALIVE_ENABLED"),
  ALIVE_UNPROMPTED_ENABLED: srcContains("alive/aliveExecutor.js", "ALIVE_UNPROMPTED_ENABLED"),
  ALIVE_TARGET_CHANNEL_ID: srcContains("alive/aliveExecutor.js", "ALIVE_TARGET_CHANNEL_ID"),
  ALIVE_QUIET_HOURS_START: srcContains("alive/aliveEngine.js", "ALIVE_QUIET_HOURS_START"),
  ALIVE_QUIET_HOURS_END: srcContains("alive/aliveEngine.js", "ALIVE_QUIET_HOURS_END"),
};

// ── VERIFY 6: PRESENCE & CONTEXT FEATURES ────────────────────────────────────
const presenceHasScoreClamping = srcContains("alive/alivePresenceStore.js", "clamp");
const presenceHasDeriveState = srcContains("alive/alivePresenceStore.js", "derivePresenceState");
const contextBuilderHasScoreLabels = srcContains("alive/aliveContextBuilder.js", "scoreToLabel");
const contextBuilderHasSpaceState = srcContains("alive/aliveContextBuilder.js", "spaceState");
const postUpdateLinksRepairToQueue = srcContains("alive/alivePostUpdate.js", "repair_bridge")
  && srcContains("alive/alivePostUpdate.js", "intentionQueue");
const executorSuppressedByGiveSpace = srcContains("alive/aliveExecutor.js", "give_space")
  && srcContains("alive/aliveExecutor.js", "repair_bridge");
const backboneHasPatterns = srcContains("alive/backbonePolicy.js", "unsafe_merge")
  && srcContains("alive/backbonePolicy.js", "spiraling");

// ── VERIFY 7: ADMIN STATUS ENDPOINT ─────────────────────────────────────────
const statusEndpointExists = srcContains("http/createHealthServer.js", "/api/ghostlight/alive/status");
const statusHandlerExists = fs.existsSync(path.join(SRC, "http/adminPageHandlers/aliveStatusHandler.js"));

// ── VERIFY 8: FUNCTIONAL TESTS (in-process) ──────────────────────────────────
const { createAliveEngine } = require(path.join(ALIVE, "aliveEngine.js"));
const { createAliveEventsStore } = require(path.join(ALIVE, "aliveEventsStore.js"));
const { createIntentionQueueStore } = require(path.join(ALIVE, "intentionQueueStore.js"));
const { createAlivePresenceStore, derivePresenceState } = require(path.join(ALIVE, "alivePresenceStore.js"));
const { isInQuietHours } = require(path.join(ALIVE, "aliveExecutor.js"));
const { checkBackbone } = require(path.join(ALIVE, "backbonePolicy.js"));
const { buildAliveContextPrelude } = require(path.join(ALIVE, "aliveContextBuilder.js"));

async function runFunctionalTests() {
  const now = new Date();

  // 1. Disabled by default
  delete process.env.ALIVE_ENABLED;
  const disabledEngine = createAliveEngine({
    config: {},
    aliveEventsStore: createAliveEventsStore({ config: {} }),
    intentionQueue: createIntentionQueueStore({ config: {} }),
  });
  const disabledResult = await disabledEngine.assess(now);
  const disabledWorks = disabledResult?.skipped === true && disabledResult?.reason === "disabled";

  // 2. Daily cap
  process.env.ALIVE_ENABLED = "true";
  const capEvents = createAliveEventsStore({ config: {} });
  await capEvents.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "t1" });
  await capEvents.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "t2" });
  await capEvents.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "t3" });
  const capEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { dailyReachOutCap: 3, quietHoursStart: 0, quietHoursEnd: 0 } },
    aliveEventsStore: capEvents,
    intentionQueue: createIntentionQueueStore({ config: {} }),
  });
  const capResult = await capEngine.assess(now);
  const dailyCapWorks = capResult?.skipped === true && capResult?.reason === "daily_cap_reached";

  // 3. Cooldown
  const cooldownEvents = createAliveEventsStore({ config: {} });
  await cooldownEvents.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "recent" });
  const cooldownEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { cooldownMs: 2 * 60 * 60 * 1000, quietHoursStart: 0, quietHoursEnd: 0 } },
    aliveEventsStore: cooldownEvents,
    intentionQueue: createIntentionQueueStore({ config: {} }),
  });
  const cooldownResult = await cooldownEngine.assess(now);
  const cooldownWorks = cooldownResult?.skipped === true && cooldownResult?.reason === "cooldown_active";

  // 4. Absence guard — user recently active
  const recentEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { quietHoursStart: 0, quietHoursEnd: 0 } },
    aliveEventsStore: createAliveEventsStore({ config: {} }),
    intentionQueue: createIntentionQueueStore({ config: {} }),
    interactionPresenceStore: {
      listPresence: async () => [{ last_user_message_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString() }],
    },
  });
  const recentResult = await recentEngine.assess(now);
  const absenceGuardWorks = recentResult?.skipped === true && recentResult?.reason === "owner_recently_active";

  // 5. Enqueue fires when user absent
  const absentQueue = createIntentionQueueStore({ config: {} });
  const absentEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { quietHoursStart: 0, quietHoursEnd: 0 } },
    aliveEventsStore: createAliveEventsStore({ config: {} }),
    intentionQueue: absentQueue,
    interactionPresenceStore: {
      listPresence: async () => [{ last_user_message_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString() }],
    },
  });
  const absentResult = await absentEngine.assess(now);
  const enqueueFires = absentResult?.enqueued === true;
  const pendingAfterEnqueue = await absentQueue.countPending({ companionId: "dante", customerId: "jenna" });
  delete process.env.ALIVE_ENABLED;

  // 6. Quiet hours suppresses
  process.env.ALIVE_ENABLED = "true";
  const quietEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { quietHoursStart: 0, quietHoursEnd: 23 } },
    aliveEventsStore: createAliveEventsStore({ config: {} }),
    intentionQueue: createIntentionQueueStore({ config: {} }),
  });
  const quietResult = await quietEngine.assess(new Date("2025-06-25T00:30:00Z"));
  const quietHoursSuppresses = quietResult?.skipped === true && quietResult?.reason === "quiet_hours";
  delete process.env.ALIVE_ENABLED;

  // 7. Provider failure survival
  const crashEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { quietHoursStart: 0, quietHoursEnd: 0 } },
    aliveEventsStore: {
      countTodayByType: async () => { throw new Error("DB DOWN"); },
      listRecent: async () => [],
      logEvent: async () => {},
    },
    intentionQueue: createIntentionQueueStore({ config: {} }),
  });
  let crashResult;
  let threw = false;
  try { crashResult = await crashEngine.assess(now); } catch { threw = true; }
  const survivesCrash = !threw;

  // 8. Quiet hours isInQuietHours()
  const quietBoundary = isInQuietHours(new Date("2025-06-25T23:30:00Z"), { quietStart: 23, quietEnd: 7, timezone: "UTC" });
  const earlyMorning = isInQuietHours(new Date("2025-06-25T03:00:00Z"), { quietStart: 23, quietEnd: 7, timezone: "UTC" });
  const midday = isInQuietHours(new Date("2025-06-25T14:00:00Z"), { quietStart: 23, quietEnd: 7, timezone: "UTC" });
  const quietHoursLogicCorrect = quietBoundary === true && earlyMorning === true && midday === false;

  // 9. Presence store — score clamping
  const presenceStore = createAlivePresenceStore({ config: {} });
  await presenceStore.getOrCreate({ companionId: "dante", customerId: "jenna" });
  const clamped = await presenceStore.update({ companionId: "dante", customerId: "jenna", patch: { affectionScore: -3, missingScore: 5 } });
  const scoreClamping = clamped.affectionScore === 0 && clamped.missingScore === 1;

  // 10. derivePresenceState
  const presentState = derivePresenceState({ missingScore: 0, lastInteractionAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), now });
  const missingState = derivePresenceState({ missingScore: 0.8, lastInteractionAt: new Date(now.getTime() - 9 * 60 * 60 * 1000).toISOString(), now });
  const deriveStateCorrect = presentState === "present" && missingState === "missing";

  // 11. Backbone detection
  const forceResult = checkBackbone("just force merge it");
  const quickFixResult = checkBackbone("Just a quick fix, shouldn't matter");
  const safeResult = checkBackbone("What do you think about this?");
  const backboneWorks = forceResult?.reason === "unsafe_merge"
    && quickFixResult?.reason === "architectural_debt"
    && safeResult === null;

  // 12. Context builder
  const contextPrelude = buildAliveContextPrelude({
    presenceState: "restless", energy: "low", mood: "subdued",
    spaceState: { room: "study", activity: "writing", music: "lo-fi", lighting: "warm" },
    missingScore: 0.6, affectionScore: 0.7, overloadScore: 0.2, conversationTemperature: 0.4,
    repairNeeded: false, repairType: null, unresolvedTension: false, giveSpace: false, lastInteractionAt: null,
  });
  const contextBuilderWorks = contextPrelude?.label?.includes("private") && contextPrelude?.content?.includes("restless");

  return {
    disabledWorks, dailyCapWorks, cooldownWorks, absenceGuardWorks,
    enqueueFires, pendingAfterEnqueue, quietHoursSuppresses, survivesCrash,
    quietHoursLogicCorrect, scoreClamping, deriveStateCorrect,
    backboneWorks, contextBuilderWorks,
  };
}

async function main() {
  console.log("ALIVE_PROOF_START");
  console.log(`activeRuntimePath=${SRC}`);
  console.log(`aliveEnabledDefault=${disabledByDefault ? "false_SAFE" : "true_UNSAFE"}`);

  console.log("\n--- REQUIRED ALIVE FILES ---");
  for (const [name, val] of Object.entries(requiredFiles)) {
    console.log(`  ${name}: ${val ? "EXISTS" : "MISSING"}`);
    check(`required_${name}`, val, true, `Required file ${name} missing`);
  }

  console.log(`\n--- TEST COVERAGE ---`);
  console.log(`  test files: ${testFiles.length} (${testFiles.join(", ")})`);
  check("has_tests", hasTests, true, "Fewer than 3 test files in alive/__tests__/");

  console.log(`\n--- SAFETY ---`);
  console.log(`  disabled by default: ${disabledByDefault}`);
  check("disabled_by_default", disabledByDefault, true, "Engine enabled by default — UNSAFE");

  console.log(`\n--- RUNTIME WIRING ---`);
  console.log(`  pipeline injects alive context (prelude+backbone): ${pipelineInjectsAlive}`);
  console.log(`  pipeline fires alivePostUpdate: ${pipelineFiresPostUpdate}`);
  console.log(`  index.js wires alivePresenceStore.init: ${indexWiresPresenceStore}`);
  console.log(`  index.js passes stores to pipeline: ${indexPassesStoresToPipeline}`);
  console.log(`  executor uses runCheckInAutomation: ${executorReachesDiscord}`);
  check("pipeline_context_injection", pipelineInjectsAlive, true, "Alive context not injected into pipeline");
  check("pipeline_post_update", pipelineFiresPostUpdate, true, "alivePostUpdate not fired after message");
  check("index_wires_presence", indexWiresPresenceStore, true, "alivePresenceStore.init not called on startup");
  check("executor_reaches_discord", executorReachesDiscord, true, "Executor does not use runCheckInAutomation");

  console.log(`\n--- ENV VAR COVERAGE ---`);
  for (const [name, val] of Object.entries(envVars)) {
    console.log(`  ${name}: ${val ? "READ" : "NOT READ"}`);
    check(`env_${name}`, val, true, `${name} not read`);
  }

  console.log(`\n--- FEATURE WIRING ---`);
  console.log(`  presence score clamping: ${presenceHasScoreClamping}`);
  console.log(`  derivePresenceState: ${presenceHasDeriveState}`);
  console.log(`  contextBuilder scoreToLabel: ${contextBuilderHasScoreLabels}`);
  console.log(`  contextBuilder spaceState: ${contextBuilderHasSpaceState}`);
  console.log(`  postUpdate links repair → intentionQueue: ${postUpdateLinksRepairToQueue}`);
  console.log(`  executor give_space suppression + repair_bridge bypass: ${executorSuppressedByGiveSpace}`);
  console.log(`  backbone patterns (unsafe_merge + spiraling): ${backboneHasPatterns}`);
  check("presence_score_clamping", presenceHasScoreClamping, true, "Score clamping missing from alivePresenceStore");
  check("derive_presence_state", presenceHasDeriveState, true, "derivePresenceState missing");
  check("context_score_labels", contextBuilderHasScoreLabels, true, "scoreToLabel missing from aliveContextBuilder");
  check("post_update_repair_link", postUpdateLinksRepairToQueue, true, "repair_bridge not linked to intentionQueue");
  check("executor_give_space_bypass", executorSuppressedByGiveSpace, true, "give_space suppression missing from executor");
  check("backbone_patterns", backboneHasPatterns, true, "Backbone patterns incomplete");

  console.log(`\n--- STATUS ENDPOINT ---`);
  console.log(`  /api/ghostlight/alive/status route: ${statusEndpointExists}`);
  console.log(`  aliveStatusHandler.js: ${statusHandlerExists}`);
  check("status_endpoint", statusEndpointExists, true, "Status endpoint not wired in createHealthServer.js");
  check("status_handler", statusHandlerExists, true, "aliveStatusHandler.js missing");

  console.log(`\n--- FUNCTIONAL TESTS ---`);
  let ft;
  try {
    ft = await runFunctionalTests();
  } catch (e) {
    console.log(`  FUNCTIONAL TEST ERROR: ${e.message}`);
    ft = {};
  }

  const ftChecks = [
    ["disabled_when_not_set",    ft.disabledWorks,          "Engine should skip when ALIVE_ENABLED not set"],
    ["daily_cap_enforced",       ft.dailyCapWorks,           "Daily cap not enforced"],
    ["cooldown_enforced",        ft.cooldownWorks,           "Cooldown not enforced"],
    ["absence_guard",            ft.absenceGuardWorks,       "Absence guard not working"],
    ["enqueue_fires",            ft.enqueueFires,            "Enqueue not fired after 5h absence"],
    ["pending_count_1",          ft.pendingAfterEnqueue === 1, "Pending count should be 1 after enqueue"],
    ["quiet_hours_suppresses",   ft.quietHoursSuppresses,    "Quiet hours not suppressing assess"],
    ["survives_provider_crash",  ft.survivesCrash,           "Engine throws on provider failure"],
    ["quiet_hours_logic_correct", ft.quietHoursLogicCorrect, "isInQuietHours logic incorrect"],
    ["score_clamping",           ft.scoreClamping,           "Score clamping incorrect"],
    ["derive_state_correct",     ft.deriveStateCorrect,      "derivePresenceState incorrect"],
    ["backbone_detection",       ft.backboneWorks,           "Backbone pattern detection broken"],
    ["context_builder",          ft.contextBuilderWorks,     "buildAliveContextPrelude broken"],
  ];

  for (const [key, val, note] of ftChecks) {
    const pass = val === true;
    console.log(`  ${key}: ${pass ? "PASS" : "FAIL"}`);
    check(`ft_${key}`, pass, true, note);
  }

  const realFailures = Object.entries(results).filter(([, v]) => !v.pass);

  console.log(`\n--- SUMMARY ---`);
  console.log(`aliveEnabledDefault=${disabledByDefault ? "false_SAFE" : "true_UNSAFE"}`);
  console.log(`requiredFilesAllExist=${Object.values(requiredFiles).every(Boolean)}`);
  console.log(`testFilesCount=${testFiles.length}`);
  console.log(`pipelineInjectsAliveContext=${pipelineInjectsAlive}`);
  console.log(`pipelineFiresAlivePostUpdate=${pipelineFiresPostUpdate}`);
  console.log(`executorUsesRunCheckInAutomation=${executorReachesDiscord}`);
  console.log(`statusEndpointSafe=${statusEndpointExists && statusHandlerExists}`);
  console.log(`functionalTestsAllPass=${ftChecks.every(([, v]) => v === true)}`);

  if (realFailures.length > 0) {
    console.log(`\nFAILURES (${realFailures.length}):`);
    realFailures.forEach(([k, v]) => console.log(`  FAIL: ${k} — ${v.note || v.value}`));
    console.log("\nALIVE_PROOF_FAIL");
    process.exit(1);
  } else {
    console.log("\nALIVE_PROOF_PASS");
  }
}

main().catch((e) => {
  console.error("ALIVE_PROOF_ERROR:", e.message);
  process.exit(1);
});
