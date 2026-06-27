"use strict";
/**
 * verify-alive-layer-proof.js
 * Audits the Alive Layer for completeness, safety, and correct wiring.
 * Uses only mocks / in-process checks — no real Discord/Postgres/provider calls.
 * Prints ALIVE_PROOF_START … ALIVE_PROOF_PASS or ALIVE_PROOF_FAIL.
 */

const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");

const SRC = path.resolve(__dirname, "../src");
const ALIVE = path.join(SRC, "alive");

const results = {};
let failed = false;

function check(key, value, expected = true, note = "") {
  const pass = value === expected;
  results[key] = { pass, value, expected, note };
  if (!pass) failed = true;
  return pass;
}

function fileExists(rel) {
  return fs.existsSync(path.join(ALIVE, rel));
}

function srcFileExists(rel) {
  return fs.existsSync(path.join(SRC, rel));
}

function srcContains(rel, pattern) {
  try {
    const content = fs.readFileSync(path.join(SRC, rel), "utf8");
    return typeof pattern === "string" ? content.includes(pattern) : pattern.test(content);
  } catch { return false; }
}

// ── VERIFY 1: ACTIVE RUNTIME FILES ──────────────────────────────────────────
const coreFilesExist = {
  aliveEngine: fileExists("aliveEngine.js"),
  aliveEventsStore: fileExists("aliveEventsStore.js"),
  intentionQueueStore: fileExists("intentionQueueStore.js"),
};
// Required per spec — check if they exist
const requiredFilesExist = {
  presenceEngine: fileExists("presenceEngine.js"),
  emotionalContinuity: fileExists("emotionalContinuity.js"),
  unpromptedThoughts: fileExists("unpromptedThoughts.js"),
  repairProtocol: fileExists("repairProtocol.js"),
  preferenceProof: fileExists("preferenceProof.js"),
  spaceState: fileExists("spaceState.js"),
  backbonePolicy: fileExists("backbonePolicy.js"),
  aliveScheduler: fileExists("aliveScheduler.js"),
};

// ── VERIFY 2: WIRING INTO PIPELINE ──────────────────────────────────────────
const pipelineInjectsAlive = srcContains("chat/createChatPipeline.js", "aliveEngine")
  || srcContains("chat/createChatPipeline.js", "intentionQueue")
  || srcContains("chat/createChatPipeline.js", "aliveEventsStore");

const indexWiresAlive = srcContains("index.js", "createAliveEngine")
  && srcContains("index.js", "aliveEngine.start()");

// ── VERIFY 3: INTENTION EXECUTOR (sends Discord messages) ───────────────────
const intentionExecutorExists = fileExists("aliveExecutor.js")
  || srcFileExists("alive/aliveExecutor.js")
  || (() => {
    // Check if any file reads pending intentions and sends via Discord
    const files = ["heartbeat/conductor.js", "proactiveActions/index.js", "alive/aliveScheduler.js"];
    return files.some((f) => srcContains(f, "intentionQueue") || srcContains(f, "listPending"));
  })();

// ── VERIFY 4: ENV CONFIG ─────────────────────────────────────────────────────
const envVarsChecked = {
  ALIVE_LAYER_ENABLED: srcContains("alive/aliveEngine.js", "ALIVE_LAYER_ENABLED") || srcContains("config/env.js", "ALIVE_LAYER_ENABLED"),
  ALIVE_ENABLED: srcContains("alive/aliveEngine.js", "ALIVE_ENABLED"),
  ALIVE_UNPROMPTED_ENABLED: srcContains("alive/aliveEngine.js", "ALIVE_UNPROMPTED_ENABLED") || srcContains("config/env.js", "ALIVE_UNPROMPTED_ENABLED"),
  ALIVE_TARGET_CHANNEL_ID: srcContains("alive/aliveEngine.js", "ALIVE_TARGET_CHANNEL_ID") || srcContains("index.js", "ALIVE_TARGET_CHANNEL_ID"),
  ALIVE_TARGET_USER_ID: srcContains("alive/aliveEngine.js", "ALIVE_TARGET_USER_ID"),
  ALIVE_QUIET_HOURS_START: srcContains("alive/aliveEngine.js", "ALIVE_QUIET_HOURS_START"),
  ALIVE_QUIET_HOURS_END: srcContains("alive/aliveEngine.js", "ALIVE_QUIET_HOURS_END"),
  ALIVE_VOICE_NOTES_ENABLED: srcContains("alive/aliveEngine.js", "ALIVE_VOICE_NOTES_ENABLED"),
  ALIVE_IMAGES_ENABLED: srcContains("alive/aliveEngine.js", "ALIVE_IMAGES_ENABLED"),
};

// ── VERIFY 5: DISABLED-BY-DEFAULT SAFETY ─────────────────────────────────────
// In aliveEngine.js: enabled = (aliveConfig.enabled !== false && process.env.ALIVE_ENABLED !== "false")
// This means it is ENABLED by default unless explicitly set to false
const aliveEngineContent = fs.readFileSync(path.join(ALIVE, "aliveEngine.js"), "utf8");
const enabledByDefault = !aliveEngineContent.includes('!== false\n    && process.env.ALIVE_ENABLED !== "false"')
  && aliveEngineContent.includes("enabled !== false");
// true means it defaults to ENABLED (unsafe), false means it defaults to DISABLED (safe)
const disabledByDefault = aliveEngineContent.includes("=== true") || aliveEngineContent.includes('"true"');

// ── VERIFY 6: ALIVE ENGINE FUNCTIONAL TEST ────────────────────────────────────
const { createAliveEngine } = require(path.join(ALIVE, "aliveEngine.js"));
const { createAliveEventsStore } = require(path.join(ALIVE, "aliveEventsStore.js"));
const { createIntentionQueueStore } = require(path.join(ALIVE, "intentionQueueStore.js"));

// Build in-memory stores (no DB_URL set)
const eventsStore = createAliveEventsStore({ config: {} });
const intentionQueue = createIntentionQueueStore({ config: {} });

let engineResult = null;
let engineError = null;

async function runEngineTest() {
  // Test 1: disabled when ALIVE_ENABLED=false
  process.env.ALIVE_ENABLED = "false";
  const disabledEngine = createAliveEngine({ config: {}, eventsStore, intentionQueue });
  const disabledResult = await disabledEngine.assess(new Date());
  const disabledWorks = disabledResult?.skipped === true && disabledResult?.reason === "disabled";
  delete process.env.ALIVE_ENABLED;

  // Test 2: daily cap enforced
  process.env.ALIVE_ENABLED = "true";
  const capEvents = createAliveEventsStore({ config: {} });
  const capQueue = createIntentionQueueStore({ config: {} });
  const now = new Date();
  // Pre-populate 3 intention_created events today
  await capEvents.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "test1" });
  await capEvents.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "test2" });
  await capEvents.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "test3" });
  const capEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { dailyReachOutCap: 3 } },
    logger: null,
    aliveEventsStore: capEvents,
    intentionQueue: capQueue,
  });
  const capResult = await capEngine.assess(now);
  const capWorks = capResult?.skipped === true && capResult?.reason === "daily_cap_reached";
  delete process.env.ALIVE_ENABLED;

  // Test 3: cooldown enforced
  const cooldownEvents = createAliveEventsStore({ config: {} });
  const cooldownQueue = createIntentionQueueStore({ config: {} });
  // Log an intention_created 30 min ago
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  cooldownEvents._rows = [{
    id: 1,
    companion_id: "dante",
    customer_id: "jenna",
    event_type: "intention_created",
    reason: "test",
    decision: "",
    payload: {},
    created_at: thirtyMinAgo.toISOString(),
  }];
  // Monkey-patch listRecent to return the fake row
  const origListRecent = cooldownEvents.listRecent.bind(cooldownEvents);
  cooldownEvents.listRecent = async (opts) => {
    if (opts?.eventType === "intention_created") {
      return [{ id: 1, companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "test", decision: "", payload: {}, createdAt: thirtyMinAgo }];
    }
    return origListRecent(opts);
  };
  const cooldownEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { cooldownMs: 2 * 60 * 60 * 1000 } },
    logger: null,
    aliveEventsStore: cooldownEvents,
    intentionQueue: cooldownQueue,
  });
  const cooldownResult = await cooldownEngine.assess(now);
  const cooldownWorks = cooldownResult?.skipped === true && cooldownResult?.reason === "cooldown_active";

  // Test 4: absence gap — if user recently active, do not enqueue
  const recentEvents = createAliveEventsStore({ config: {} });
  const recentQueue = createIntentionQueueStore({ config: {} });
  const fakePresenceStore = {
    listPresence: async () => [{
      last_user_message_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10 min ago
    }],
  };
  const recentEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" } },
    logger: null,
    aliveEventsStore: recentEvents,
    intentionQueue: recentQueue,
    interactionPresenceStore: fakePresenceStore,
  });
  const recentResult = await recentEngine.assess(now);
  const absenceGuardWorks = recentResult?.skipped === true && recentResult?.reason === "owner_recently_active";

  // Test 5: enqueue fires when user is absent
  const absentEvents = createAliveEventsStore({ config: {} });
  const absentQueue = createIntentionQueueStore({ config: {} });
  const absentPresence = {
    listPresence: async () => [{
      last_user_message_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago
    }],
  };
  const absentEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" } },
    logger: null,
    aliveEventsStore: absentEvents,
    intentionQueue: absentQueue,
    interactionPresenceStore: absentPresence,
  });
  const absentResult = await absentEngine.assess(now);
  const enqueueFires = absentResult?.enqueued === true;
  const pendingAfterEnqueue = await absentQueue.countPending({ companionId: "dante", customerId: "jenna" });

  // Test 6: engine survives provider failure (error in assess is caught)
  const crashQueue = {
    countPending: async () => { throw new Error("DB DEAD"); },
    enqueue: async () => { throw new Error("DB DEAD"); },
  };
  const crashEvents = {
    countTodayByType: async () => 0,
    listRecent: async () => [],
    logEvent: async () => {},
  };
  const crashEngine = createAliveEngine({
    config: { memory: { companionId: "dante", userScope: "jenna" } },
    logger: null,
    aliveEventsStore: crashEvents,
    intentionQueue: crashQueue,
    interactionPresenceStore: absentPresence,
  });
  let crashResult;
  try { crashResult = await crashEngine.assess(now); } catch (e) { crashResult = { threw: true, error: e.message }; }
  const schedulerSafeOnFailure = !crashResult?.threw && crashResult?.skipped === true && crashResult?.reason === "error";

  return {
    disabledWorks,
    capWorks,
    cooldownWorks,
    absenceGuardWorks,
    enqueueFires,
    pendingAfterEnqueue,
    schedulerSafeOnFailure,
  };
}

async function main() {
  console.log("ALIVE_PROOF_START");
  console.log(`activeRuntimePath=${SRC}`);
  console.log(`aliveEnabledDefault=${!aliveEngineContent.includes("=== true") && aliveEngineContent.includes("!== false") ? "true_UNSAFE" : "false_SAFE"}`);

  // Required files
  console.log(`\n--- REQUIRED ALIVE FILES ---`);
  for (const [name, val] of Object.entries(coreFilesExist)) {
    console.log(`  ${name}: ${val ? "EXISTS" : "MISSING"}`);
  }
  for (const [name, val] of Object.entries(requiredFilesExist)) {
    console.log(`  ${name}: ${val ? "EXISTS" : "MISSING (NOT BUILT)"}`);
    check(`required_${name}`, val, true, "Required file missing");
  }

  // Wiring
  console.log(`\n--- RUNTIME WIRING ---`);
  console.log(`  index.js wires aliveEngine: ${indexWiresAlive}`);
  console.log(`  chat pipeline injects alive context: ${pipelineInjectsAlive}`);
  console.log(`  intention executor exists: ${intentionExecutorExists}`);
  check("pipeline_injection", pipelineInjectsAlive, true, "Alive layer not injected into chat pipeline");
  check("intention_executor", intentionExecutorExists, true, "No executor consumes intentions to send Discord messages");

  // ENV vars
  console.log(`\n--- ENV VAR COVERAGE ---`);
  for (const [name, val] of Object.entries(envVarsChecked)) {
    console.log(`  ${name}: ${val ? "READ" : "NOT READ"}`);
    if (!val) check(`env_${name}`, val, true, `${name} not read by alive engine`);
  }

  // Functional tests
  console.log(`\n--- FUNCTIONAL TESTS ---`);
  let ft;
  try {
    ft = await runEngineTest();
  } catch (e) {
    console.log(`  ENGINE TEST ERROR: ${e.message}`);
    ft = {};
    failed = true;
  }

  check("aliveEnabledDefault_is_unsafe", true, false, "Engine is ENABLED by default — must be disabled by default");
  // (this check always fails — it's intentional to flag the safety issue)
  // Override: mark as informational
  results["aliveEnabledDefault_is_unsafe"] = { pass: false, value: "ENABLED_BY_DEFAULT", note: "Safety gap: engine starts unless ALIVE_ENABLED=false" };

  console.log(`  disabledWhenEnvFalse: ${ft.disabledWorks ?? "N/A"}`);
  check("disabled_when_env_false", ft.disabledWorks, true, "ALIVE_ENABLED=false should skip assess()");
  console.log(`  dailyCapEnforced: ${ft.capWorks ?? "N/A"}`);
  check("daily_cap_enforced", ft.capWorks, true, "Daily cap not enforced");
  console.log(`  cooldownEnforced: ${ft.cooldownWorks ?? "N/A"}`);
  check("cooldown_enforced", ft.cooldownWorks, true, "Cooldown not enforced");
  console.log(`  absenceGuardWorks: ${ft.absenceGuardWorks ?? "N/A"}`);
  check("absence_guard", ft.absenceGuardWorks, true, "Absence guard not working");
  console.log(`  enqueueFires: ${ft.enqueueFires ?? "N/A"}`);
  check("enqueue_fires", ft.enqueueFires, true, "Enqueue does not fire after 5h absence");
  console.log(`  pendingAfterEnqueue: ${ft.pendingAfterEnqueue ?? "N/A"}`);
  check("pending_count", ft.pendingAfterEnqueue, 1, "Pending count should be 1 after enqueue");
  console.log(`  schedulerSafeOnProviderFailure: ${ft.schedulerSafeOnFailure ?? "N/A"}`);
  check("scheduler_safe_on_failure", ft.schedulerSafeOnFailure, true, "Engine should not throw on provider failure");

  // Things that are NOT built
  console.log(`\n--- UNBUILT FEATURES ---`);
  const gaps = [
    "presenceBefore/presenceAfter: alive/presenceEngine does not exist",
    "repairDetected: alive/repairProtocol does not exist (analyzeRepair in pipeline is separate)",
    "repairIntentionCreated: no link between analyzeRepair and intentionQueue",
    "quietHoursSuppressed: no quiet hours logic in aliveEngine",
    "giveSpaceSuppressed: no give_space / space state logic",
    "preferenceProofSilent: alive/preferenceProof does not exist",
    "spaceStatePersisted: alive/spaceState and alive_presence_state table do not exist",
    "backboneTriggered: alive/backbonePolicy does not exist",
    "discordOutboundMockCalled: no executor reads intentions and calls Discord send",
    "mediaVoiceMockCalled: ALIVE_VOICE_NOTES_ENABLED not wired to TTS",
    "mediaImageMockCalled: ALIVE_IMAGES_ENABLED not wired to image gen",
    "statusEndpointSafe: /api endpoint does not exist (only /admin/alive HTML page)",
    "alive/__tests__/: directory is EMPTY — zero tests for alive layer",
    "alive_presence_state table: does not exist anywhere",
  ];
  gaps.forEach((g) => { console.log(`  MISSING: ${g}`); });
  gaps.forEach((_, i) => { check(`gap_${i}`, false, false, "Intentional gap marker"); });
  // Don't mark those as failures (they're informational)
  gaps.forEach((_, i) => { results[`gap_${i}`] = { pass: false, informational: true }; });

  // Determine true failures (non-informational)
  const realFailures = Object.entries(results).filter(([k, v]) => !v.informational && !v.pass);

  console.log(`\n--- SUMMARY ---`);
  console.log(`aliveEnabledDefault=true_UNSAFE`);
  console.log(`presenceBefore=UNKNOWN (alive/presenceEngine missing)`);
  console.log(`presenceAfter=UNKNOWN (alive/presenceEngine missing)`);
  console.log(`repairDetected=N/A (separate existing system, not wired to alive layer)`);
  console.log(`repairIntentionCreated=false`);
  console.log(`quietHoursSuppressed=false`);
  console.log(`maxDailySuppressed=${ft.capWorks ?? false}`);
  console.log(`giveSpaceSuppressed=false`);
  console.log(`preferenceProofSilent=false`);
  console.log(`spaceStatePersisted=false`);
  console.log(`backboneTriggered=false`);
  console.log(`schedulerSafeOnProviderFailure=${ft.schedulerSafeOnFailure ?? false}`);
  console.log(`statusEndpointSafe=false (no /api endpoint, only HTML admin page)`);
  console.log(`discordOutboundMockCalled=false (no executor built)`);
  console.log(`mediaVoiceMockCalled=false`);
  console.log(`mediaImageMockCalled=false`);

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
  console.log("ALIVE_PROOF_FAIL");
  process.exit(1);
});
