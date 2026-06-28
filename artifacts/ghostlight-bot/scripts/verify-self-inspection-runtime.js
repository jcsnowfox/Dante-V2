"use strict";

/**
 * verify-self-inspection-runtime.js
 *
 * Verifies Dante's Self-Inspection & Maintenance Runtime 1.0.
 * Expected output: SELF_INSPECTION_RUNTIME_PASS
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
  const { probe, HEALTH_STATES }                = require("../src/lifeRuntime/runtimeHealthProbe");
  const { plan, buildMessage, MESSAGES, CRITICAL_MESSAGES } = require("../src/lifeRuntime/maintenanceRequestPlanner");
  const { buildSelfInspectionPrelude }          = require("../src/lifeRuntime/selfInspectionPreludeBuilder");
  const { createSelfInspectionRuntime }         = require("../src/lifeRuntime/selfInspectionRuntime");
  const { createMaintenanceLedgerStore }        = require("../src/lifeRuntime/maintenanceLedgerStore");

  // ── Section 1: Module exports ───────────────────────────────────────────────

  check("runtimeHealthProbe exports probe()",         typeof probe === "function");
  check("runtimeHealthProbe exports HEALTH_STATES",   Array.isArray(HEALTH_STATES));
  check("HEALTH_STATES includes healthy",             HEALTH_STATES.includes("healthy"));
  check("HEALTH_STATES includes watch",               HEALTH_STATES.includes("watch"));
  check("HEALTH_STATES includes degraded",            HEALTH_STATES.includes("degraded"));
  check("HEALTH_STATES includes broken",              HEALTH_STATES.includes("broken"));
  check("HEALTH_STATES includes unknown",             HEALTH_STATES.includes("unknown"));

  check("maintenanceRequestPlanner exports plan()",       typeof plan === "function");
  check("maintenanceRequestPlanner exports buildMessage", typeof buildMessage === "function");
  check("maintenanceRequestPlanner exports MESSAGES",     typeof MESSAGES === "object");
  check("maintenanceRequestPlanner exports CRITICAL_MESSAGES", typeof CRITICAL_MESSAGES === "object");

  check("selfInspectionPreludeBuilder exports buildSelfInspectionPrelude", typeof buildSelfInspectionPrelude === "function");
  check("selfInspectionRuntime exports createSelfInspectionRuntime",       typeof createSelfInspectionRuntime === "function");
  check("maintenanceLedgerStore exports createMaintenanceLedgerStore",     typeof createMaintenanceLedgerStore === "function");

  // ── Section 2: Health probe — healthy snapshot ──────────────────────────────

  const healthySnap = {
    selfConsistencyStatus:   { lastSignal: { self_confidence: "high" }, recentEvents: [] },
    evidenceIntegrityStatus: { recentViolationCount: 0, recentEvents: [] },
    lifeRuntimeStatus:       { enabled: true, lastTickAt: new Date().toISOString() },
    repairStatus:            { repairRequired: false },
    sourceHealthSnapshot:    { db: { status: "healthy", runtime: "db" } },
    memoryHealth:            { status: "healthy", confidence: 0.95 },
    affectiveDecisionStatus: { recent_blocked_decisions: [] },
  };

  const healthyResult = probe(healthySnap);
  check("probe: healthy snapshot → overall healthy",    healthyResult.overall === "healthy");
  check("probe: healthy snapshot → empty degraded_sources", healthyResult.degraded_sources.length === 0);
  check("probe: result has sources map",                typeof healthyResult.sources === "object");
  check("probe: result has probed_at",                  typeof healthyResult.probed_at === "string");

  // ── Section 3: Health probe — empty snapshot → unknown ─────────────────────

  const unknownResult = probe({});
  check("probe: empty snapshot → overall unknown",      unknownResult.overall === "unknown");
  check("probe: all sources unknown when no data",
    Object.values(unknownResult.sources).every(s => s.state === "unknown"));

  // ── Section 4: Self-consistency probing ────────────────────────────────────

  const selfConsMedium = probe({ ...healthySnap, selfConsistencyStatus: { lastSignal: { self_confidence: "medium" }, recentEvents: [] } });
  check("probe: medium self-confidence → watch",        selfConsMedium.sources.self_consistency.state === "watch");

  const selfConsLow = probe({ ...healthySnap, selfConsistencyStatus: { lastSignal: { self_confidence: "low" }, recentEvents: [] } });
  check("probe: low self-confidence → degraded",        selfConsLow.sources.self_consistency.state === "degraded");

  const selfConsBroken = probe({
    ...healthySnap,
    selfConsistencyStatus: {
      lastSignal: { self_confidence: "low" },
      recentEvents: [{ eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }],
    },
  });
  check("probe: 3 low events → broken",                 selfConsBroken.sources.self_consistency.state === "broken");
  check("probe: broken self-consistency → overall broken", selfConsBroken.overall === "broken");

  // ── Section 5: Evidence integrity probing ──────────────────────────────────

  const evid1 = probe({ ...healthySnap, evidenceIntegrityStatus: { recentViolationCount: 1, recentEvents: [] } });
  check("probe: 1 violation → watch",                   evid1.sources.evidence_integrity.state === "watch");

  const evid2 = probe({ ...healthySnap, evidenceIntegrityStatus: { recentViolationCount: 2, recentEvents: [] } });
  check("probe: 2 violations → degraded",               evid2.sources.evidence_integrity.state === "degraded");

  const evidBroken = probe({ ...healthySnap, evidenceIntegrityStatus: { recentViolationCount: 3, recentEvents: [{ severity: "high" }] } });
  check("probe: 3 violations + high severity → broken", evidBroken.sources.evidence_integrity.state === "broken");

  // ── Section 6: Memory health probing ───────────────────────────────────────

  const memFailed = probe({ ...healthySnap, memoryHealth: { status: "failed", confidence: 0.1 } });
  check("probe: memory failed → degraded",              memFailed.sources.memory.state === "degraded");

  const memDegraded = probe({ ...healthySnap, memoryHealth: { status: "healthy", confidence: 0.35 } });
  check("probe: memory confidence 0.35 → degraded",    memDegraded.sources.memory.state === "degraded");

  const memWatch = probe({ ...healthySnap, memoryHealth: { status: "healthy", confidence: 0.55 } });
  check("probe: memory confidence 0.55 → watch",       memWatch.sources.memory.state === "watch");

  // ── Section 7: Life runtime tick probing ───────────────────────────────────

  const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
  const tickBroken = probe({ ...healthySnap, lifeRuntimeStatus: { enabled: true, lastTickAt: staleDate } });
  check("probe: tick >6h ago → broken",                 tickBroken.sources.life_runtime_tick.state === "broken");

  const recentDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const tickHealthy = probe({ ...healthySnap, lifeRuntimeStatus: { enabled: true, lastTickAt: recentDate } });
  check("probe: tick <15m ago → healthy",               tickHealthy.sources.life_runtime_tick.state === "healthy");

  // ── Section 8: Source health probing ───────────────────────────────────────

  const sourcesBroken = probe({
    ...healthySnap,
    sourceHealthSnapshot: {
      db: { status: "unavailable", runtime: "db" },
      redis: { status: "unavailable", runtime: "redis" },
      qdrant: { status: "unavailable", runtime: "qdrant" },
    },
  });
  check("probe: 3 unavailable sources → broken",        sourcesBroken.sources.source_health.state === "broken");

  // ── Section 9: Affective decision probing ──────────────────────────────────

  const adWatch = probe({ ...healthySnap, affectiveDecisionStatus: { recent_blocked_decisions: [1, 2, 3, 4, 5] } });
  check("probe: 5+ blocked decisions → watch",          adWatch.sources.affective_decision.state === "watch");

  // ── Section 10: Planner — healthy does not request ─────────────────────────

  const planHealthy = plan(healthyResult);
  check("planner: healthy → shouldRequest false",       planHealthy.shouldRequest === false);
  check("planner: healthy → message null",              planHealthy.message === null);
  check("planner: healthy → pending false",             planHealthy.pending === false);

  // ── Section 11: Planner — unknown does not request ─────────────────────────

  const planUnknown = plan(unknownResult);
  check("planner: unknown overall → shouldRequest false", planUnknown.shouldRequest === false);

  // ── Section 12: Planner — degraded creates normal request ──────────────────

  const degradedProbe = probe({ ...healthySnap, memoryHealth: { status: "degraded", confidence: 0.2 } });
  const planDegraded = plan(degradedProbe);
  check("planner: degraded → shouldRequest true",       planDegraded.shouldRequest === true);
  check("planner: degraded → urgency normal",           planDegraded.urgency === "normal");
  check("planner: degraded → has message",              typeof planDegraded.message === "string" && planDegraded.message.length > 0);
  check("planner: degraded → blocked_by is array",      Array.isArray(planDegraded.blocked_by));

  // ── Section 13: Planner — quiet hours blocks non-critical ──────────────────

  const planQuiet = plan(degradedProbe, { quietHours: true });
  check("planner: quiet hours → blocked_by includes quiet_hours", planQuiet.blocked_by.includes("quiet_hours"));
  check("planner: quiet hours → pending true",           planQuiet.pending === true);

  // ── Section 14: Planner — give-space blocks non-critical ───────────────────

  const planGiveSpace = plan(degradedProbe, { giveSpace: true });
  check("planner: give_space → blocked_by includes give_space", planGiveSpace.blocked_by.includes("give_space"));
  check("planner: give_space → pending true",            planGiveSpace.pending === true);

  // ── Section 15: Planner — critical bypasses quiet hours ────────────────────

  const brokenProbeResult = probe({
    ...healthySnap,
    selfConsistencyStatus: {
      lastSignal: { self_confidence: "low" },
      recentEvents: [{ eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }],
    },
  });
  const planCriticalQuiet = plan(brokenProbeResult, { quietHours: true, giveSpace: true });
  check("planner: critical bypasses quiet hours",        planCriticalQuiet.blocked_by.length === 0);
  check("planner: critical → pending false",             planCriticalQuiet.pending === false);
  check("planner: critical → urgency critical",          planCriticalQuiet.urgency === "critical");

  // ── Section 16: Message templates ──────────────────────────────────────────

  check("MESSAGES has self_consistency",      typeof MESSAGES.self_consistency === "string");
  check("MESSAGES has evidence_integrity",    typeof MESSAGES.evidence_integrity === "string");
  check("MESSAGES has memory",                typeof MESSAGES.memory === "string");
  check("MESSAGES has life_runtime_tick",     typeof MESSAGES.life_runtime_tick === "string");
  check("MESSAGES has source_health",         typeof MESSAGES.source_health === "string");
  check("MESSAGES has repair",                typeof MESSAGES.repair === "string");
  check("MESSAGES has affective_decision",    typeof MESSAGES.affective_decision === "string");
  check("MESSAGES has default",               typeof MESSAGES.default === "string");

  check("CRITICAL_MESSAGES has self_consistency", typeof CRITICAL_MESSAGES.self_consistency === "string");
  check("CRITICAL_MESSAGES has default",          typeof CRITICAL_MESSAGES.default === "string");

  for (const [key, msg] of Object.entries(MESSAGES)) {
    check(`MESSAGES.${key} has no theatrical language`,
      !/panic|guilt|shame|sorry|I'm breaking|I'm dying|catastrophe/i.test(msg));
  }

  // ── Section 17: buildMessage ────────────────────────────────────────────────

  const msgNormal = buildMessage(["memory"], "normal");
  check("buildMessage: normal memory → correct message",   msgNormal === MESSAGES.memory);

  const msgCritical = buildMessage(["self_consistency"], "critical");
  check("buildMessage: critical self_consistency → critical message", msgCritical === CRITICAL_MESSAGES.self_consistency);

  const msgDefault = buildMessage(["unknown_source"], "normal");
  check("buildMessage: unknown source → default message",  msgDefault === MESSAGES.default);

  // ── Section 18: Prelude builder ─────────────────────────────────────────────

  check("prelude builder: null → null",                    buildSelfInspectionPrelude(null) === null);
  check("prelude builder: healthy → null",                 buildSelfInspectionPrelude(healthyResult) === null);
  check("prelude builder: unknown → null",                 buildSelfInspectionPrelude(unknownResult) === null);

  const preludeDegraded = buildSelfInspectionPrelude(degradedProbe);
  check("prelude builder: degraded → non-null string",     typeof preludeDegraded === "string" && preludeDegraded.length > 0);
  check("prelude builder: degraded → contains [internal]", preludeDegraded?.includes("[internal]") ?? false);

  const preludeBroken = buildSelfInspectionPrelude(brokenProbeResult);
  check("prelude builder: broken → non-null string",       typeof preludeBroken === "string" && preludeBroken.length > 0);

  // ── Section 19: Maintenance ledger store ───────────────────────────────────

  const ledger = createMaintenanceLedgerStore();
  await checkAsync("ledger: init() resolves", async () => { await ledger.init(); return true; });

  await checkAsync("ledger: record() returns entry", async () => {
    const entry = await ledger.record({
      companionId: "dante", customerId: "jenna",
      message: "test", reason: "test_reason",
      health_state: "degraded", degraded_sources: ["memory"], urgency: "normal",
    });
    return entry && entry.id && entry.companionId === "dante";
  });

  await checkAsync("ledger: listRecent returns array", async () => {
    const rows = await ledger.listRecent({ companionId: "dante", customerId: "jenna" });
    return Array.isArray(rows) && rows.length > 0;
  });

  await checkAsync("ledger: listPending returns unsent entries", async () => {
    const rows = await ledger.listPending({ companionId: "dante", customerId: "jenna" });
    return Array.isArray(rows) && rows.every(r => !r.sent && !r.resolved);
  });

  await checkAsync("ledger: markSent works", async () => {
    const entry = await ledger.record({
      companionId: "dante", customerId: "jenna",
      message: "mark sent test", urgency: "normal", health_state: "degraded",
    });
    const updated = await ledger.markSent({ id: entry.id, companionId: "dante", customerId: "jenna" });
    return updated && updated.sent === true;
  });

  await checkAsync("ledger: markResolved works", async () => {
    const entry = await ledger.record({
      companionId: "dante", customerId: "jenna",
      message: "mark resolved test", urgency: "normal", health_state: "degraded",
    });
    const updated = await ledger.markResolved({ id: entry.id, companionId: "dante", customerId: "jenna" });
    return updated && updated.resolved === true && updated.sent === true;
  });

  await checkAsync("ledger: pruneOlderThan returns count", async () => {
    const count = await ledger.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 365 });
    return typeof count === "number";
  });

  // ── Section 20: selfInspectionRuntime — healthy → no dispatch ──────────────

  await checkAsync("runtime: evaluate healthy → no dispatch", async () => {
    const calls = [];
    const rt = createSelfInspectionRuntime({ dispatchFn: async (a) => { calls.push(a); return { sent: true }; } });
    await rt.init();
    const { planResult } = await rt.evaluate(healthySnap);
    return planResult.shouldRequest === false && calls.length === 0;
  });

  // ── Section 21: selfInspectionRuntime — degraded → dispatch ────────────────

  await checkAsync("runtime: evaluate degraded → dispatch called", async () => {
    const calls = [];
    const rt = createSelfInspectionRuntime({ dispatchFn: async (a) => { calls.push(a); return { sent: true }; } });
    await rt.init();
    const snap = { ...healthySnap, memoryHealth: { status: "degraded", confidence: 0.2 } };
    const { sent } = await rt.evaluate(snap);
    return sent === true && calls.length === 1;
  });

  // ── Section 22: runtime getStatus safe fields ───────────────────────────────

  await checkAsync("runtime: getStatus returns only safe fields", async () => {
    const rt = createSelfInspectionRuntime({ dispatchFn: async () => ({ sent: false }) });
    await rt.init();
    const snap = { ...healthySnap, memoryHealth: { status: "degraded", confidence: 0.2 } };
    await rt.evaluate(snap);
    const status = rt.getStatus();
    const allowed = new Set(["self_inspection_state","last_health_probe_at","active_maintenance_request","maintenance_request_reason","degraded_sources"]);
    return Object.keys(status).every(k => allowed.has(k));
  });

  // ── Section 23: runtime quiet hours ────────────────────────────────────────

  await checkAsync("runtime: quiet hours → no dispatch", async () => {
    const calls = [];
    const rt = createSelfInspectionRuntime({ dispatchFn: async (a) => { calls.push(a); return { sent: true }; } });
    await rt.init();
    const snap = { ...healthySnap, memoryHealth: { status: "degraded", confidence: 0.2 } };
    const { planResult, sent } = await rt.evaluate(snap, { quietHours: true });
    return planResult.blocked_by.includes("quiet_hours") && sent === false && calls.length === 0;
  });

  // ── Section 24: runtime critical bypasses quiet hours ──────────────────────

  await checkAsync("runtime: critical broken → dispatches despite quiet hours", async () => {
    const calls = [];
    const rt = createSelfInspectionRuntime({ dispatchFn: async (a) => { calls.push(a); return { sent: true }; } });
    await rt.init();
    const snap = {
      ...healthySnap,
      selfConsistencyStatus: {
        lastSignal: { self_confidence: "low" },
        recentEvents: [{ eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }],
      },
    };
    const { planResult, sent } = await rt.evaluate(snap, { quietHours: true });
    return planResult.urgency === "critical" && sent === true && calls.length === 1;
  });

  // ── Section 25: critical with failing dispatch does not throw ───────────────

  await checkAsync("runtime: critical broken + dispatch throws → no crash", async () => {
    const rt = createSelfInspectionRuntime({ dispatchFn: async () => { throw new Error("discord down"); } });
    await rt.init();
    const snap = {
      ...healthySnap,
      selfConsistencyStatus: {
        lastSignal: { self_confidence: "low" },
        recentEvents: [{ eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }, { eventType: "self_confidence_low" }],
      },
    };
    await rt.evaluate(snap);
    return true;
  });

  // ── Section 26: runtime getPreludeWarning ──────────────────────────────────

  await checkAsync("runtime: getPreludeWarning null when healthy", async () => {
    const rt = createSelfInspectionRuntime({ dispatchFn: async () => ({ sent: false }) });
    await rt.init();
    await rt.evaluate(healthySnap);
    return rt.getPreludeWarning() === null;
  });

  await checkAsync("runtime: getPreludeWarning string when degraded", async () => {
    const rt = createSelfInspectionRuntime({ dispatchFn: async () => ({ sent: false }) });
    await rt.init();
    const snap = { ...healthySnap, memoryHealth: { status: "degraded", confidence: 0.2 } };
    await rt.evaluate(snap);
    const w = rt.getPreludeWarning();
    return typeof w === "string" && w.includes("[internal]");
  });

  // ── Section 27: No duplicate scheduler / no direct discord require ──────────

  const selfInspectionSrc = fs.readFileSync(
    path.join(__dirname, "../src/lifeRuntime/selfInspectionRuntime.js"), "utf8"
  );
  check("selfInspectionRuntime: no setInterval",        !selfInspectionSrc.includes("setInterval"));
  check("selfInspectionRuntime: no setTimeout",         !selfInspectionSrc.includes("setTimeout"));
  check("selfInspectionRuntime: no channel.send",       !selfInspectionSrc.includes("channel.send"));
  check("selfInspectionRuntime: no direct discordSendGateway import",
    !selfInspectionSrc.includes("discordSendGateway"));

  const probeSrc = fs.readFileSync(
    path.join(__dirname, "../src/lifeRuntime/runtimeHealthProbe.js"), "utf8"
  );
  check("runtimeHealthProbe: pure — no discord",        !probeSrc.includes("discord"));
  check("runtimeHealthProbe: pure — no await",          !probeSrc.includes("await"));

  const plannerSrc = fs.readFileSync(
    path.join(__dirname, "../src/lifeRuntime/maintenanceRequestPlanner.js"), "utf8"
  );
  check("maintenanceRequestPlanner: pure — no discord", !plannerSrc.includes("discord"));
  check("maintenanceRequestPlanner: pure — no await",   !plannerSrc.includes("await"));

  const preludeSrc = fs.readFileSync(
    path.join(__dirname, "../src/lifeRuntime/selfInspectionPreludeBuilder.js"), "utf8"
  );
  check("selfInspectionPreludeBuilder: pure — no discord", !preludeSrc.includes("discord"));
  check("selfInspectionPreludeBuilder: pure — no await",   !preludeSrc.includes("await"));

  // ── Section 28: Cooldown prevents spam ─────────────────────────────────────

  await checkAsync("runtime: cooldown prevents duplicate requests", async () => {
    const calls = [];
    const rt = createSelfInspectionRuntime({ dispatchFn: async (a) => { calls.push(a); return { sent: true }; } });
    await rt.init();
    const snap = { ...healthySnap, memoryHealth: { status: "degraded", confidence: 0.2 } };
    await rt.evaluate(snap);
    const callsAfterFirst = calls.length;
    await rt.evaluate(snap);
    return callsAfterFirst === 1 && calls.length === 1;
  });

  // ── Section 29: File structure ──────────────────────────────────────────────

  const expectedFiles = [
    "src/lifeRuntime/runtimeHealthProbe.js",
    "src/lifeRuntime/maintenanceRequestPlanner.js",
    "src/lifeRuntime/maintenanceLedgerStore.js",
    "src/lifeRuntime/selfInspectionPreludeBuilder.js",
    "src/lifeRuntime/selfInspectionRuntime.js",
    "src/lifeRuntime/__tests__/selfInspection.test.js",
  ];
  for (const rel of expectedFiles) {
    const p = path.join(__dirname, "..", rel);
    check(`file exists: ${rel}`, fs.existsSync(p));
  }

  // ── Report ──────────────────────────────────────────────────────────────────

  if (failed === 0) {
    console.log(`SELF_INSPECTION_RUNTIME_PASS (${passed} checks passed)`);
    process.exit(0);
  } else {
    console.log(`SELF_INSPECTION_RUNTIME_FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("verify-self-inspection-runtime: unexpected error", err);
  process.exit(1);
});
