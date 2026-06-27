#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "../..");
const read = rel => fs.readFileSync(path.join(repo, rel), "utf8");
const exists = rel => fs.existsSync(path.join(repo, rel));

async function main() {
  assert.ok(exists("docs/RUNTIME_OWNERSHIP_MAP.md"), "runtime ownership map exists");
  assert.ok(exists("artifacts/ghostlight-bot/src/lifeRuntime/runtimeEventBus.js"));
  assert.ok(exists("artifacts/ghostlight-bot/src/lifeRuntime/runtimeEventStore.js"));
  assert.ok(exists("artifacts/ghostlight-bot/src/lifeRuntime/mindStateSnapshotBuilder.js"));
  assert.ok(exists("artifacts/ghostlight-bot/src/lifeRuntime/sourceHealth.js"));

  const busSrc = read("artifacts/ghostlight-bot/src/lifeRuntime/runtimeEventBus.js");
  assert.ok(!/discord|client\.channels|setInterval|setTimeout|cron|schedule/i.test(busSrc), "event bus has no Discord sender or scheduler");

  const { createRuntimeEventBus } = require("../src/lifeRuntime/runtimeEventBus");
  const { createRuntimeEventStore } = require("../src/lifeRuntime/runtimeEventStore");
  const { createSourceHealthTracker } = require("../src/lifeRuntime/sourceHealth");
  const { buildMindStateSnapshot } = require("../src/lifeRuntime/mindStateSnapshotBuilder");
  const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");

  const bus = createRuntimeEventBus({ store: createRuntimeEventStore() });
  const required = {
    homeostasis: "need_changed",
    identity: "identity_value_changed",
    fulfillment: "fulfillment_succeeded",
    curiosity: "insight_created",
    growth: "project_progressed",
    relationship: "relationship_weather_changed",
    diagnostics: "self_confidence_low",
  };
  for (const [source_runtime, event_type] of Object.entries(required)) await bus.emit({ event_type, source_runtime, evidence_ids: event_type === "fulfillment_succeeded" ? ["ev"] : [] });
  assert.equal((await bus.listRecent({ limit: 20 })).length, Object.keys(required).length);

  const sourceHealth = createSourceHealthTracker();
  sourceHealth.degraded("homeostasis", "test_missing_store");
  const snapshot = await buildMindStateSnapshot({ eventBus: bus, sourceHealth, contexts: { identity: { apiKey: "strip", ok: true } } });
  for (const key of ["alive","innerLife","continuity","growth","curiosity","relationship","consequences","homeostasis","identity","fulfillment","diagnostics","recentEvents","currentPrelude","sourceHealth","generatedAt"]) assert.ok(Object.hasOwn(snapshot, key), key);
  assert.equal(snapshot.identity.apiKey, undefined);
  assert.equal(snapshot.sourceHealth.homeostasis.status, "degraded");

  const lr = createLifeRuntime({ config: { memory: { companionId: "dante" } } });
  assert.equal(typeof lr.getMindStateSnapshot, "function");
  assert.ok(lr.getStatus().mindStateSnapshot.available);

  const schedulerFiles = fs.readdirSync(path.join(root, "src/lifeRuntime")).filter(f => /scheduler/i.test(f));
  assert.deepEqual(schedulerFiles, ["lifeRuntimeScheduler.js"], "no duplicate scheduler");
  assert.ok(!/runtimeEventBus|runtimeEventStore|mindStateSnapshotBuilder/.test(read("artifacts/ghostlight-bot/src/http/createHealthServer.js")), "dashboard/server not redesigned for cohesion");
  assert.ok(!/fake fulfillment|fabricat/i.test(busSrc), "event bus does not fake fulfillment or fabricate memories");

  console.log("RUNTIME_COHESION_PASS");
}

main().catch(err => { console.error(err); process.exit(1); });
