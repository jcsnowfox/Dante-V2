"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");

const { probe }                       = require("../runtimeHealthProbe");
const { plan, MESSAGES, CRITICAL_MESSAGES } = require("../maintenanceRequestPlanner");
const { buildSelfInspectionPrelude }  = require("../selfInspectionPreludeBuilder");
const { createSelfInspectionRuntime } = require("../selfInspectionRuntime");
const { createMaintenanceLedgerStore } = require("../maintenanceLedgerStore");

// ── Helpers ──────────────────────────────────────────────────────────────────

function healthySnapshot() {
  return {
    selfConsistencyStatus:   { lastSignal: { self_confidence: "high" }, recentEvents: [] },
    evidenceIntegrityStatus: { recentViolationCount: 0, recentEvents: [] },
    lifeRuntimeStatus:       { enabled: true, lastTickAt: new Date().toISOString() },
    repairStatus:            { repairRequired: false, pending: false, active: false },
    sourceHealthSnapshot:    { db: { status: "healthy", runtime: "db" } },
    memoryHealth:            { status: "healthy", confidence: 0.9 },
    affectiveDecisionStatus: { recent_blocked_decisions: [] },
  };
}

function degradedSnapshot(overrides = {}) {
  return Object.assign(healthySnapshot(), overrides);
}

// ── Test 1: Healthy systems do not create maintenance request ─────────────────

test("healthy systems do not create maintenance request", () => {
  const probeResult = probe(healthySnapshot());
  assert.equal(probeResult.overall, "healthy");

  const planResult = plan(probeResult);
  assert.equal(planResult.shouldRequest, false);
  assert.equal(planResult.message, null);
  assert.equal(planResult.pending, false);
});

// ── Test 2: Self-consistency failures create watch/degraded state ─────────────

test("self-consistency failures create watch/degraded state", () => {
  // medium confidence → watch
  const watchProbe = probe(degradedSnapshot({
    selfConsistencyStatus: { lastSignal: { self_confidence: "medium" }, recentEvents: [] },
  }));
  // "watch" overall doesn't trigger a request
  assert.equal(watchProbe.sources.self_consistency.state, "watch");

  // low confidence → degraded
  const degradedProbe = probe(degradedSnapshot({
    selfConsistencyStatus: { lastSignal: { self_confidence: "low" }, recentEvents: [] },
  }));
  assert.equal(degradedProbe.sources.self_consistency.state, "degraded");
  assert.ok(degradedProbe.degraded_sources.includes("self_consistency"));

  // 3 consecutive low events → broken
  const brokenProbe = probe(degradedSnapshot({
    selfConsistencyStatus: {
      lastSignal: { self_confidence: "low" },
      recentEvents: [
        { eventType: "self_confidence_low" },
        { eventType: "self_confidence_low" },
        { eventType: "self_confidence_low" },
      ],
    },
  }));
  assert.equal(brokenProbe.sources.self_consistency.state, "broken");
  assert.equal(brokenProbe.overall, "broken");
});

// ── Test 3: Evidence integrity failures create degraded state ─────────────────

test("evidence integrity failures create degraded state", () => {
  const result = probe(degradedSnapshot({
    evidenceIntegrityStatus: { recentViolationCount: 2, recentEvents: [] },
  }));
  assert.equal(result.sources.evidence_integrity.state, "degraded");
  assert.ok(result.degraded_sources.includes("evidence_integrity"));

  // 3 violations + high severity → broken
  const broken = probe(degradedSnapshot({
    evidenceIntegrityStatus: {
      recentViolationCount: 3,
      recentEvents: [{ severity: "high" }],
    },
  }));
  assert.equal(broken.sources.evidence_integrity.state, "broken");
});

// ── Test 4: Failed memory health creates maintenance request ──────────────────

test("failed memory health creates maintenance request", async () => {
  const dispatched = [];
  const runtime = createSelfInspectionRuntime({
    dispatchFn: async (args) => { dispatched.push(args); return { sent: true }; },
  });
  await runtime.init();

  const snap = degradedSnapshot({
    memoryHealth: { status: "failed", confidence: 0.1, reason: "store unreachable" },
  });
  const { planResult, sent } = await runtime.evaluate(snap);

  assert.ok(planResult.shouldRequest, "should request maintenance");
  assert.ok(sent, "should dispatch");
  assert.ok(dispatched.length > 0, "dispatch was called");
  assert.ok(typeof dispatched[0].content === "string");
});

// ── Test 5: Unavailable diagnostics reports unknown, not healthy ──────────────

test("unavailable diagnostics reports unknown, not healthy", () => {
  const result = probe({});  // all nulls
  assert.equal(result.overall, "unknown");
  for (const [, v] of Object.entries(result.sources)) {
    assert.equal(v.state, "unknown");
  }

  // unknown overall → no request
  const planResult = plan(result);
  assert.equal(planResult.shouldRequest, false);
});

// ── Test 6: Maintenance request uses canonical send gateway ───────────────────

test("maintenance request uses canonical send gateway", async () => {
  const calls = [];
  const mockDispatch = async ({ content }) => {
    calls.push({ content });
    return { sent: true };
  };

  const runtime = createSelfInspectionRuntime({ dispatchFn: mockDispatch });
  await runtime.init();

  const snap = degradedSnapshot({
    memoryHealth: { status: "degraded", confidence: 0.3 },
  });
  const { sent } = await runtime.evaluate(snap);

  assert.ok(sent, "message should be sent");
  assert.equal(calls.length, 1, "dispatch called exactly once");
  assert.ok(typeof calls[0].content === "string", "content is a string");
  assert.ok(calls[0].content.length > 0, "content is non-empty");
});

// ── Test 7: Quiet hours blocks non-critical maintenance request ───────────────

test("quiet hours blocks non-critical maintenance request", async () => {
  const dispatched = [];
  const runtime = createSelfInspectionRuntime({
    dispatchFn: async (args) => { dispatched.push(args); return { sent: true }; },
  });
  await runtime.init();

  const snap = degradedSnapshot({
    memoryHealth: { status: "degraded", confidence: 0.3 },
  });
  const { planResult, sent } = await runtime.evaluate(snap, { quietHours: true });

  assert.ok(planResult.shouldRequest, "request is planned");
  assert.equal(planResult.urgency, "normal");
  assert.ok(planResult.blocked_by.includes("quiet_hours"), "blocked by quiet_hours");
  assert.ok(planResult.pending, "should be pending");
  assert.equal(sent, false, "should NOT dispatch during quiet hours");
  assert.equal(dispatched.length, 0, "dispatch not called");
});

// ── Test 8: Critical broken state can remain pending safely ───────────────────

test("critical broken state can remain pending safely", async () => {
  // dispatchFn throws — should not crash; ledger entry stays as pending
  const runtime = createSelfInspectionRuntime({
    dispatchFn: async () => { throw new Error("discord unavailable"); },
  });
  await runtime.init();

  const snap = degradedSnapshot({
    selfConsistencyStatus: {
      lastSignal: { self_confidence: "low" },
      recentEvents: [
        { eventType: "self_confidence_low" },
        { eventType: "self_confidence_low" },
        { eventType: "self_confidence_low" },
      ],
    },
  });

  let result;
  await assert.doesNotReject(async () => {
    result = await runtime.evaluate(snap);
  }, "critical state with failing dispatch should not throw");

  assert.equal(result.planResult.urgency, "critical");
  // ledger entry should exist even if not sent
  assert.ok(result.ledgerEntry !== null || result.planResult.shouldRequest, "evidence recorded");
});

// ── Test 9: Status exposes safe metadata only ─────────────────────────────────

test("status exposes safe metadata only", async () => {
  const runtime = createSelfInspectionRuntime({ dispatchFn: async () => ({ sent: false }) });
  await runtime.init();

  const snap = degradedSnapshot({
    memoryHealth: { status: "degraded", confidence: 0.3 },
  });
  await runtime.evaluate(snap);

  const status = runtime.getStatus();
  const allowedKeys = new Set([
    "self_inspection_state",
    "last_health_probe_at",
    "active_maintenance_request",
    "maintenance_request_reason",
    "degraded_sources",
  ]);

  for (const key of Object.keys(status)) {
    assert.ok(allowedKeys.has(key), `unexpected key exposed in status: ${key}`);
  }

  assert.ok(typeof status.self_inspection_state === "string");
  assert.ok(Array.isArray(status.degraded_sources));
  assert.ok(typeof status.active_maintenance_request === "boolean");
});

// ── Test 10: No duplicate scheduler ──────────────────────────────────────────

test("no duplicate scheduler", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "../selfInspectionRuntime.js"),
    "utf8",
  );
  assert.ok(!src.includes("setInterval"), "selfInspectionRuntime must not create a scheduler");
  assert.ok(!src.includes("setTimeout"), "selfInspectionRuntime must not create its own timer");
});

// ── Test 11: No duplicate sender ─────────────────────────────────────────────

test("no duplicate sender", () => {
  const fs   = require("fs");
  const path = require("path");

  const pureFiles = [
    "../runtimeHealthProbe.js",
    "../maintenanceRequestPlanner.js",
    "../selfInspectionPreludeBuilder.js",
  ];

  for (const rel of pureFiles) {
    const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
    assert.ok(!src.includes("discordSendGateway"), `${rel} must not import discordSendGateway directly`);
    assert.ok(!src.includes("channel.send"), `${rel} must not call channel.send`);
    assert.ok(!src.includes("sendDiscordMessage"), `${rel} must not call sendDiscordMessage`);
  }

  // selfInspectionRuntime may only use canonical path via dispatchDiagnosticEntry
  const runtimeSrc = fs.readFileSync(path.join(__dirname, "../selfInspectionRuntime.js"), "utf8");
  assert.ok(!runtimeSrc.includes("channel.send"), "runtime must not call channel.send directly");
  // Must use dispatchDiagnosticEntry (or injected dispatchFn), not raw sendDiscordMessage
  assert.ok(
    !runtimeSrc.includes("require(\"../discord/discordSendGateway\")") &&
    !runtimeSrc.includes("require('../discord/discordSendGateway')"),
    "runtime must not import discordSendGateway directly — use innerLifeDispatch"
  );
});

// ── Test 12: Dashboard unchanged ─────────────────────────────────────────────

test("dashboard unchanged", () => {
  // selfInspectionRuntime does not export anything that would interfere
  // with existing dashboard routes. Verify the module shape is additive only.
  const { createSelfInspectionRuntime: factory } = require("../selfInspectionRuntime");
  const rt = factory({ dispatchFn: async () => ({}) });

  assert.equal(typeof rt.init,             "function");
  assert.equal(typeof rt.probe,            "function");
  assert.equal(typeof rt.evaluate,         "function");
  assert.equal(typeof rt.getStatus,        "function");
  assert.equal(typeof rt.getPreludeWarning,"function");

  // Must not export methods that could be confused for scheduler/dashboard APIs
  assert.ok(!("tick"    in rt), "must not export tick()");
  assert.ok(!("start"   in rt), "must not export start()");
  assert.ok(!("stop"    in rt), "must not export stop()");
  assert.ok(!("schedule" in rt), "must not export schedule()");
});
