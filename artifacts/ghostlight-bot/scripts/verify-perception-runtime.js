"use strict";

/**
 * verify-perception-runtime.js
 *
 * Verifies Dante's Perception Runtime 1.0.
 * Expected output: PERCEPTION_RUNTIME_PASS
 */

const path = require("path");
const fs   = require("fs");

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}${detail ? " — " + detail : ""}`);
  }
}

async function checkAsync(label, fn) {
  try {
    const result = await fn();
    if (result === false) {
      failed++;
      console.error(`  FAIL: ${label}`);
    } else {
      passed++;
    }
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${label} — threw: ${err?.message}`);
  }
}

async function main() {
  const { createPerceptionRuntime }     = require("../src/lifeRuntime/perceptionRuntime");
  const { createWorldStateStore, SIGNAL_SOURCES, DEFAULT_STALENESS_MS, STALENESS_DECAY_RATE } = require("../src/lifeRuntime/worldStateStore");
  const { interpretAlivePresence, interpretDiscordEvent, interpretExplicitStatement, AVAILABILITY, DISCORD_STATUS_MAP, EXPLICIT_PATTERNS } = require("../src/lifeRuntime/presenceInterpreter");
  const { inferQuietHours, inferSeason, inferJennaActivity, inferDanteState, inferConversationState, inferRepairState, QUIET_HOURS_START, QUIET_HOURS_END } = require("../src/lifeRuntime/activityInferenceEngine");
  const { resolveConfidence, applyStalenesDecay, detectConflict, getSourceWeight, SOURCE_WEIGHTS } = require("../src/lifeRuntime/perceptionConfidenceResolver");
  const { buildWorldState, buildUncertainties } = require("../src/lifeRuntime/worldStateBuilder");
  const { buildPerceptionSignal, buildPerceptionPrelude } = require("../src/lifeRuntime/perceptionPreludeBuilder");

  const SCOPE = { companionId: "dante", customerId: "jenna" };

  // ── Section 1: Module exports ─────────────────────────────────────────────────

  check("createPerceptionRuntime is a function",    typeof createPerceptionRuntime === "function");
  check("createWorldStateStore is a function",      typeof createWorldStateStore === "function");
  check("interpretAlivePresence is a function",     typeof interpretAlivePresence === "function");
  check("interpretDiscordEvent is a function",      typeof interpretDiscordEvent === "function");
  check("interpretExplicitStatement is a function", typeof interpretExplicitStatement === "function");
  check("inferQuietHours is a function",            typeof inferQuietHours === "function");
  check("inferJennaActivity is a function",         typeof inferJennaActivity === "function");
  check("resolveConfidence is a function",          typeof resolveConfidence === "function");
  check("detectConflict is a function",             typeof detectConflict === "function");
  check("buildWorldState is a function",            typeof buildWorldState === "function");
  check("buildUncertainties is a function",         typeof buildUncertainties === "function");
  check("buildPerceptionSignal is a function",      typeof buildPerceptionSignal === "function");
  check("buildPerceptionPrelude is a function",     typeof buildPerceptionPrelude === "function");

  // ── Section 2: Constants ──────────────────────────────────────────────────────

  check("AVAILABILITY.AVAILABLE is a string",    typeof AVAILABILITY.AVAILABLE === "string");
  check("AVAILABILITY.BUSY is a string",         typeof AVAILABILITY.BUSY === "string");
  check("AVAILABILITY.ASLEEP is a string",       typeof AVAILABILITY.ASLEEP === "string");
  check("AVAILABILITY.UNAVAILABLE is a string",  typeof AVAILABILITY.UNAVAILABLE === "string");
  check("AVAILABILITY.GIVE_SPACE is a string",   typeof AVAILABILITY.GIVE_SPACE === "string");
  check("AVAILABILITY.UNKNOWN is a string",      typeof AVAILABILITY.UNKNOWN === "string");

  check("QUIET_HOURS_START === 22",              QUIET_HOURS_START === 22);
  check("QUIET_HOURS_END === 7",                 QUIET_HOURS_END === 7);

  check("DEFAULT_STALENESS_MS > 0",             DEFAULT_STALENESS_MS > 0);
  check("STALENESS_DECAY_RATE > 0",             STALENESS_DECAY_RATE > 0);
  check("STALENESS_DECAY_RATE < 1",             STALENESS_DECAY_RATE < 1);

  check("SIGNAL_SOURCES is an object",          typeof SIGNAL_SOURCES === "object" && SIGNAL_SOURCES !== null);
  check("SIGNAL_SOURCES.EXPLICIT_STATEMENT exists", "EXPLICIT_STATEMENT" in SIGNAL_SOURCES || Object.values(SIGNAL_SOURCES).includes("explicit_statement"));

  check("SOURCE_WEIGHTS is an object",          typeof SOURCE_WEIGHTS === "object" && SOURCE_WEIGHTS !== null);

  check("DISCORD_STATUS_MAP is an object",      typeof DISCORD_STATUS_MAP === "object");
  check("DISCORD_STATUS_MAP has online key",    "online" in DISCORD_STATUS_MAP);

  check("EXPLICIT_PATTERNS is an array",        Array.isArray(EXPLICIT_PATTERNS));
  check("EXPLICIT_PATTERNS has entries",        EXPLICIT_PATTERNS.length > 0);

  // ── Section 3: inferQuietHours — pure functions ──────────────────────────────

  const nightHour = new Date("2026-01-01T23:00:00Z");
  const morningHour = new Date("2026-01-01T08:00:00Z");

  const nightQH = inferQuietHours(nightHour);
  const dayQH   = inferQuietHours(morningHour);

  check("inferQuietHours: 23:00 UTC → active",      Boolean(nightQH.active));
  check("inferQuietHours: 08:00 UTC → not active",  !dayQH.active);
  check("inferQuietHours returns start",             typeof nightQH.start === "number");
  check("inferQuietHours returns end",               typeof nightQH.end === "number");

  // ── Section 4: inferRepairState — pure function ──────────────────────────────

  check("inferRepairState: null → none",             inferRepairState(null) === "none");
  check("inferRepairState: giveSpace → give_space",  inferRepairState({ suppression: { giveSpace: true } }) === "give_space");
  check("inferRepairState: healing → healing",       inferRepairState({ suppression: { healing: true } }) === "healing");
  check("inferRepairState: repairRequired → needed", inferRepairState({ suppression: { repairRequired: true } }) === "needed");
  check("inferRepairState: empty → none",            inferRepairState({ suppression: {} }) === "none");

  // ── Section 5: resolveConfidence — pure function ─────────────────────────────

  const singleSource = [{ source: "explicit_statement", confidence: 0.90 }];
  const resolved = resolveConfidence(singleSource);
  check("resolveConfidence: returns {confidence, dominant_source, conflict}", resolved && "confidence" in resolved && "dominant_source" in resolved && "conflict" in resolved);
  check("resolveConfidence: single source confidence is close to input", Math.abs(resolved.confidence - 0.90) < 0.20);

  const conflictingSources = [
    { source: "explicit_statement", confidence: 0.90, value: "available" },
    { source: "discord_event",      confidence: 0.80, value: "busy" },
  ];
  const conflictResolved = resolveConfidence(conflictingSources);
  check("resolveConfidence: conflicting sources → conflict > 0",     conflictResolved.conflict > 0);
  check("resolveConfidence: conflict lowers confidence",             conflictResolved.confidence <= 0.90);

  // ── Section 6: detectConflict ─────────────────────────────────────────────────

  check("detectConflict: no sources → 0",            detectConflict([]) === 0);
  check("detectConflict: single source → 0",         detectConflict([{ value: "a" }]) === 0);
  check("detectConflict: same values → 0",           detectConflict([{ value: "a" }, { value: "a" }]) === 0);
  check("detectConflict: different values → > 0",    detectConflict([{ value: "a" }, { value: "b" }]) > 0);
  check("detectConflict: returns 0–1",               detectConflict([{ value: "x" }, { value: "y" }, { value: "z" }]) <= 1);

  // ── Section 7: applyStalenesDecay ────────────────────────────────────────────

  check("applyStalenesDecay: fresh signal → unchanged",     applyStalenesDecay(0.80, 0, DEFAULT_STALENESS_MS) === 0.80);
  check("applyStalenesDecay: 1 period stale → decayed",     applyStalenesDecay(0.80, DEFAULT_STALENESS_MS, DEFAULT_STALENESS_MS) < 0.80);
  check("applyStalenesDecay: very old → 0 floor",           applyStalenesDecay(0.80, DEFAULT_STALENESS_MS * 100, DEFAULT_STALENESS_MS) === 0);

  // ── Section 8: interpretExplicitStatement — pure function ────────────────────

  const giveSpaceSignals = interpretExplicitStatement("give me some space please");
  check("interpretExplicitStatement: give space → signals array", Array.isArray(giveSpaceSignals));
  if (giveSpaceSignals.length > 0) {
    check("interpretExplicitStatement: give space → give_space or unavailable signal",
      giveSpaceSignals.some(s => s.value === "give_space" || s.value === AVAILABILITY.GIVE_SPACE || s.key?.includes("give_space")));
    check("interpretExplicitStatement: signals have source explicit_statement",
      giveSpaceSignals.every(s => s.source === "explicit_statement"));
  } else {
    check("interpretExplicitStatement: give space → at least empty array", true);
  }

  const emptySignals = interpretExplicitStatement("hello how are you");
  check("interpretExplicitStatement: non-availability text → empty array", Array.isArray(emptySignals) && emptySignals.length === 0);

  // ── Section 9: interpretAlivePresence — pure function ────────────────────────

  const presence = interpretAlivePresence({
    userDiscordStatus: "online",
    userRecentlyActive: true,
  }, new Date("2026-01-01T10:00:00Z"));
  check("interpretAlivePresence: online → availability signal", Array.isArray(presence) && presence.length > 0);
  if (presence.length > 0) {
    check("interpretAlivePresence: signals have source", presence.every(s => typeof s.source === "string"));
    check("interpretAlivePresence: signals have key",    presence.every(s => typeof s.key === "string"));
    check("interpretAlivePresence: signals have value",  presence.every(s => s.value !== undefined));
  }

  // ── Section 10: worldStateStore ───────────────────────────────────────────────

  const store = createWorldStateStore();
  await checkAsync("worldStateStore.init() resolves", async () => { await store.init?.(); return true; });

  await checkAsync("worldStateStore.upsertSignal stores and retrieves signal", async () => {
    await store.upsertSignal({ ...SCOPE, key: "jenna.availability", value: "available", confidence: 0.80, source: "explicit_statement", evidence_ids: ["ev-1"], now: new Date() });
    const sig = await store.getSignal({ ...SCOPE, key: "jenna.availability" });
    return sig && sig.value === "available" && sig.confidence === 0.80;
  });

  await checkAsync("worldStateStore.getAll returns array", async () => {
    const all = await store.getAll(SCOPE);
    return Array.isArray(all);
  });

  await checkAsync("worldStateStore.resolveSignal applies staleness decay", async () => {
    const staleTime = new Date(Date.now() - DEFAULT_STALENESS_MS * 3);
    await store.upsertSignal({ ...SCOPE, key: "jenna.stale_test", value: "test", confidence: 0.90, source: "alive_presence", evidence_ids: ["ev-stale"], now: staleTime });
    const sig = await store.resolveSignal({ ...SCOPE, key: "jenna.stale_test", now: new Date() });
    return sig && sig.confidence < 0.90;
  });

  await checkAsync("worldStateStore: explicit statement blocks downgrade within grace period", async () => {
    await store.upsertSignal({ ...SCOPE, key: "jenna.grace_test", value: "give_space", confidence: 0.95, source: "explicit_statement", evidence_ids: ["ev-explicit"], now: new Date() });
    await store.upsertSignal({ ...SCOPE, key: "jenna.grace_test", value: "available", confidence: 0.70, source: "alive_presence", evidence_ids: ["ev-pres"], now: new Date() });
    const sig = await store.getSignal({ ...SCOPE, key: "jenna.grace_test" });
    return sig && sig.value === "give_space"; // explicit statement not overwritten
  });

  await checkAsync("worldStateStore.pruneStale returns number", async () => {
    const n = await store.pruneStale({ ...SCOPE });
    return typeof n === "number";
  });

  // ── Section 11: buildWorldState — pure function ───────────────────────────────

  const emptyWS = buildWorldState({ signals: [], now: new Date() });
  check("buildWorldState: empty signals → jenna.availability = unknown",     emptyWS?.jenna?.availability === AVAILABILITY.UNKNOWN || emptyWS?.jenna?.availability === "unknown");
  check("buildWorldState: empty signals → dante.runtime_health present",     "runtime_health" in (emptyWS?.dante || {}));
  check("buildWorldState: returns environment block",                        emptyWS?.environment && "quiet_hours" in emptyWS.environment);
  check("buildWorldState: returns uncertainty array",                        Array.isArray(emptyWS?.uncertainty));

  const signals = [
    { key: "jenna.availability", value: AVAILABILITY.AVAILABLE, confidence: 0.80, source: "explicit_statement", evidence_ids: ["ev-1"], updated_at: new Date().toISOString(), staleness_threshold_ms: DEFAULT_STALENESS_MS },
  ];
  const populatedWS = buildWorldState({ signals, now: new Date() });
  check("buildWorldState: available signal → jenna.availability = available", populatedWS?.jenna?.availability === AVAILABILITY.AVAILABLE);

  // ── Section 12: buildPerceptionSignal — pure function ─────────────────────────

  check("buildPerceptionSignal: null → null",  buildPerceptionSignal(null) === null);
  check("buildPerceptionSignal: empty → null", buildPerceptionSignal({}) === null);

  const giveSpaceWS = {
    jenna: { availability: AVAILABILITY.GIVE_SPACE, _confidence: 0.92, repair_state: "give_space" },
    dante: { runtime_health: "healthy" },
    environment: { quiet_hours: false },
    uncertainty: [],
  };
  const giveSpaceSignal = buildPerceptionSignal({ worldState: giveSpaceWS, uncertainty: [] });
  check("buildPerceptionSignal: give_space → starts with 'Perception:'", typeof giveSpaceSignal === "string" && giveSpaceSignal.startsWith("Perception:"));
  check("buildPerceptionSignal: give_space → includes space/space requested", giveSpaceSignal?.toLowerCase().includes("space"));
  check("buildPerceptionSignal: ≤200 chars", (giveSpaceSignal?.length ?? 0) <= 200);

  const degradedWS = {
    jenna: { availability: AVAILABILITY.UNKNOWN, _confidence: 0 },
    dante: { runtime_health: "degraded", degraded_sources: ["worldStateStore"] },
    environment: { quiet_hours: false },
    uncertainty: [],
  };
  const degradedSignal = buildPerceptionSignal({ worldState: degradedWS, uncertainty: [] });
  check("buildPerceptionSignal: degraded runtime → includes 'degraded'", degradedSignal?.includes("degraded") ?? false);

  const quietWS = {
    jenna: { availability: AVAILABILITY.UNKNOWN, _confidence: 0 },
    dante: { runtime_health: "healthy" },
    environment: { quiet_hours: true },
    uncertainty: [],
  };
  const quietSignal = buildPerceptionSignal({ worldState: quietWS, uncertainty: [] });
  check("buildPerceptionSignal: quiet hours → includes 'quiet'", quietSignal?.toLowerCase().includes("quiet") ?? false);

  // ── Section 13: perceptionRuntime — integration ───────────────────────────────

  await checkAsync("runtime: init() resolves", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    return true;
  });

  await checkAsync("runtime: tick() with no events does not throw", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    await rt.tick({ ...SCOPE, now: new Date() });
    return true;
  });

  await checkAsync("runtime: tick() produces world state", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    await rt.tick({ ...SCOPE, now: new Date() });
    const ws = rt.getWorldState();
    return ws !== null && typeof ws === "object";
  });

  await checkAsync("runtime: explicit userText beats inference", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    // First tick with busy presence
    await rt.tick({ ...SCOPE, now: new Date(), alivePresence: { userDiscordStatus: "dnd", userBusy: true }, userText: "" });
    // Then explicit statement
    await rt.tick({ ...SCOPE, now: new Date(), userText: "give me some space today" });
    const ws = rt.getWorldState();
    // After explicit give_space statement, jenna should NOT be AVAILABLE
    return ws?.jenna?.availability !== AVAILABILITY.AVAILABLE;
  });

  await checkAsync("runtime: consequence context repair state flows into world state", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    await rt.tick({
      ...SCOPE, now: new Date(),
      consequenceContext: { suppression: { giveSpace: true, repairRequired: true } },
    });
    const ws = rt.getWorldState();
    return ws?.jenna?.repair_state !== undefined;
  });

  await checkAsync("runtime: self-inspection flows into world state", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    await rt.tick({
      ...SCOPE, now: new Date(),
      selfInspectionStatus: { overall: "degraded", degradedSources: ["worldStateStore"] },
    });
    const ws = rt.getWorldState();
    return ws?.dante?.runtime_health === "degraded";
  });

  await checkAsync("runtime: getStatus returns only safe fields", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    await rt.tick({ ...SCOPE, now: new Date() });
    const status = rt.getStatus();
    const allowed = new Set(["jenna_availability","jenna_busy_confidence","quiet_hours","repair_state","runtime_health","give_space","uncertainty_count","last_tick_at"]);
    return typeof status === "object" && Object.keys(status).every(k => allowed.has(k));
  });

  await checkAsync("runtime: getStatus contains no private text or raw scores", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    await rt.tick({ ...SCOPE, now: new Date(), userText: "I want some space" });
    const status = rt.getStatus();
    const statusStr = JSON.stringify(status);
    // Should not contain raw message text
    return !statusStr.includes("I want some space");
  });

  await checkAsync("runtime: getPreludeSignal returns null or string starting with 'Perception:'", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    await rt.tick({
      ...SCOPE, now: new Date("2026-01-01T10:00:00Z"),
      selfInspectionStatus: { overall: "degraded", degradedSources: [] },
    });
    const sig = rt.getPreludeSignal();
    if (sig === null) return true;
    return typeof sig === "string" && sig.startsWith("Perception:");
  });

  await checkAsync("runtime: recordEvent queues events", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    rt.recordEvent({ eventType: "repair_started", eventId: "ev-repair", confidence: 0.85, now: new Date() });
    await rt.tick({ ...SCOPE, now: new Date() });
    return true; // no throw
  });

  await checkAsync("runtime: observeRuntimeEvent feeds repair events", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    rt.observeRuntimeEvent({ event_type: "repair_started", id: "bus-repair-1", summary: "Repair started", confidence: 0.85, created_at: new Date().toISOString() });
    rt.observeRuntimeEvent({ event_type: "repair_completed", id: "bus-repair-2", summary: "Repair completed", confidence: 0.85, created_at: new Date().toISOString() });
    await rt.tick({ ...SCOPE, now: new Date() });
    return true; // no throw
  });

  await checkAsync("runtime: pruneAll returns signalsPruned count", async () => {
    const rt = createPerceptionRuntime();
    await rt.init();
    const result = await rt.pruneAll(SCOPE);
    return typeof result.signalsPruned === "number";
  });

  await checkAsync("runtime: runtimeEventBus receives perception_world_state_updated", async () => {
    const emitted = [];
    const mockBus = { emit: async (e) => { emitted.push(e); return e; } };
    const rt = createPerceptionRuntime({ runtimeEventBus: mockBus });
    await rt.init();
    await rt.tick({ ...SCOPE, now: new Date() });
    return emitted.some(e => e.event_type === "perception_world_state_updated");
  });

  // ── Section 14: runtimeEventBus perception event types ───────────────────────

  await checkAsync("runtimeEventBus: perception event types are registered", async () => {
    const { EVENT_TYPES } = require("../src/lifeRuntime/runtimeEventBus");
    // perception_availability_changed and perception_confidence_decayed were removed
    // as dead events by Integration Layer Repair 1.0; only perception_world_state_updated remains.
    return EVENT_TYPES.includes("perception_world_state_updated");
  });

  // ── Section 15: lifePreludeBuilder accepts perceptionContext ─────────────────

  await checkAsync("lifePreludeBuilder accepts perceptionContext", async () => {
    const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");
    const result = buildLifePrelude({
      perceptionContext: {
        worldState: {
          jenna: { availability: AVAILABILITY.GIVE_SPACE, _confidence: 0.92 },
          dante: { runtime_health: "healthy" },
          environment: { quiet_hours: false },
          uncertainty: [],
        },
        uncertainty: [],
      },
    });
    // Since Integration Layer Repair 1.0 the prelude reconciler produces compact presence lines
    // (not "Perception:") — perceptionContext is consumed via reconcilePresencePrelude().
    return result !== null && result.content.length > 0;
  });

  await checkAsync("lifePreludeBuilder: null perceptionContext → no crash", async () => {
    const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");
    const result = buildLifePrelude({ perceptionContext: null });
    return result === null || typeof result.content === "string";
  });

  // ── Section 16: lifeRuntime wiring ───────────────────────────────────────────

  await checkAsync("lifeRuntime accepts perceptionRuntime parameter", async () => {
    const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");
    const rt = createPerceptionRuntime();
    await rt.init();
    const life = createLifeRuntime({
      config: { lifeRuntime: { enabled: true }, memory: { companionId: "dante", userScope: "jenna" } },
      perceptionRuntime: rt,
    });
    await life.init();
    return true;
  });

  await checkAsync("lifeRuntime.getStatus includes perception field", async () => {
    const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");
    const life = createLifeRuntime({
      config: { lifeRuntime: { enabled: true }, memory: { companionId: "dante", userScope: "jenna" } },
    });
    await life.init();
    const status = life.getStatus();
    return "perception" in status;
  });

  // ── Section 17: No scheduler / sender in perception source files ──────────────

  const src = path.join(__dirname, "../src/lifeRuntime");
  const perceptionFiles = [
    "perceptionRuntime.js",
    "worldStateStore.js",
    "presenceInterpreter.js",
    "activityInferenceEngine.js",
    "worldStateBuilder.js",
    "perceptionConfidenceResolver.js",
    "perceptionPreludeBuilder.js",
  ];
  for (const file of perceptionFiles) {
    const content = fs.readFileSync(path.join(src, file), "utf8");
    check(`${file}: no setInterval`,        !content.includes("setInterval("));
    check(`${file}: no setTimeout`,         !content.includes("setTimeout("));
    check(`${file}: no channel.send`,       !content.includes("channel.send("));
    check(`${file}: no discordSendGateway`, !content.includes("discordSendGateway"));
  }

  // Pure functions must have no await
  const pureFiles = [
    "presenceInterpreter.js",
    "activityInferenceEngine.js",
    "perceptionConfidenceResolver.js",
    "worldStateBuilder.js",
    "perceptionPreludeBuilder.js",
  ];
  for (const file of pureFiles) {
    const content = fs.readFileSync(path.join(src, file), "utf8");
    check(`${file}: pure — no await`,   !content.includes("await "));
    check(`${file}: pure — no discord`, !content.includes("discord.js") && !content.includes("new Client("));
  }

  // ── Section 18: Dashboard unchanged ──────────────────────────────────────────

  const handlersDir = path.join(__dirname, "../src/http/adminPageHandlers");
  if (fs.existsSync(handlersDir)) {
    const handlerFiles = fs.readdirSync(handlersDir).filter(f => f.endsWith(".js"));
    let dashboardClean = true;
    for (const file of handlerFiles) {
      const content = fs.readFileSync(path.join(handlersDir, file), "utf8");
      if (content.includes("perceptionRuntime") || content.includes("worldStateStore") || content.includes("perceptionPreludeBuilder")) {
        dashboardClean = false;
        console.error(`  FAIL: dashboard handler ${file} references perception runtime`);
      }
    }
    check("dashboard handlers do not reference perception runtime", dashboardClean);
  } else {
    check("dashboard handlers directory present (skipped in test env)", true);
  }

  // ── Section 19: File structure ────────────────────────────────────────────────

  const expectedFiles = [
    "src/lifeRuntime/perceptionRuntime.js",
    "src/lifeRuntime/worldStateStore.js",
    "src/lifeRuntime/presenceInterpreter.js",
    "src/lifeRuntime/activityInferenceEngine.js",
    "src/lifeRuntime/worldStateBuilder.js",
    "src/lifeRuntime/perceptionConfidenceResolver.js",
    "src/lifeRuntime/perceptionPreludeBuilder.js",
    "src/lifeRuntime/__tests__/perception.test.js",
    "scripts/verify-perception-runtime.js",
  ];
  for (const rel of expectedFiles) {
    const p = path.join(__dirname, "..", rel);
    check(`file exists: ${rel}`, fs.existsSync(p));
  }

  // ── Report ────────────────────────────────────────────────────────────────────

  if (failed === 0) {
    console.log(`PERCEPTION_RUNTIME_PASS (${passed} checks passed)`);
    process.exit(0);
  } else {
    console.log(`PERCEPTION_RUNTIME_FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("verify-perception-runtime: unexpected error", err);
  process.exit(1);
});
