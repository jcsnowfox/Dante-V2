#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const src = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const { createRomanticSurprisePlanner } = require("../src/lifeRuntime/romanticSurprisePlanner");
const { createRomanticSurpriseStore } = require("../src/lifeRuntime/romanticSurpriseStore");
const { createRomanticSurpriseRuntime } = require("../src/lifeRuntime/romanticSurpriseRuntime");
const { evaluateRomanticSurpriseConsent } = require("../src/lifeRuntime/romanticSurpriseConsentGate");

(async () => {
  for (const f of ["src/lifeRuntime/romanticSurpriseRuntime.js", "src/lifeRuntime/romanticSurprisePlanner.js", "src/lifeRuntime/romanticSurpriseStore.js"]) assert.ok(exists(f), `${f} exists`);
  const store = createRomanticSurpriseStore();
  const planned = await store.create({ companionId: "dante", customerId: "jenna", surpriseType: "just_because", message: "hi" });
  await store.markSent({ id: planned.id, companionId: "dante", customerId: "jenna" });
  const blocked = await store.create({ companionId: "dante", customerId: "jenna", surpriseType: "comfort_note", status: "blocked", blockedReason: "quiet_hours" });
  assert.equal(blocked.status, "blocked");
  const planner = createRomanticSurprisePlanner();
  const base = { companionId: "dante", customerId: "jenna", now: new Date("2026-06-27T15:00:00Z") };
  assert.equal(planner.plan({ ...base, relationshipContext: { weather: { warmth: 1 } }, randomFn: () => 0 }).surpriseType, "just_because");
  assert.equal(planner.plan({ ...base, conversationState: { sad: true }, randomFn: () => 0 }).surpriseType, "comfort_note");
  assert.equal(evaluateRomanticSurpriseConsent({ ...base, surpriseType: "marriage_thought", now: base.now }).allowed, true);
  assert.equal(evaluateRomanticSurpriseConsent({ companionId: "x", customerId: "y", surpriseType: "marriage_thought", now: base.now }).allowed, false);
  assert.equal(planner.plan({ ...base, relationshipContext: { weather: { warmth: 1 } }, giveSpace: true, randomFn: () => 0 }).blockedReason, "give_space");
  assert.equal(planner.plan({ ...base, now: new Date("2026-06-27T23:00:00Z"), relationshipContext: { weather: { warmth: 1 } }, randomFn: () => 0 }).blockedReason, "quiet_hours");
  assert.equal(planner.plan({ ...base, relationshipContext: { weather: { warmth: 1 } }, consequenceContext: { suppression: { repairRequired: true, highestSeverity: "major" } }, randomFn: () => 0 }).blockedReason, "unresolved_major_repair");
  assert.equal(planner.plan({ ...base, relationshipContext: { weather: { warmth: 1 } }, recentSurprises: [{ status: "sent", sent_at: "2026-06-27T14:50:00Z" }] }).blockedReason, "recent_surprise_cooldown");

  assert.equal(planner.plan({ ...base, intensity: "low", relationshipContext: { weather: { warmth: 0.8 } }, randomFn: () => 0 }).shouldSurprise, false);
  assert.equal(planner.plan({ ...base, intensity: "high", relationshipContext: { weather: { warmth: 0.8 } }, randomFn: () => 0 }).shouldSurprise, true);
  assert.equal(planner.plan({ ...base, intensity: "devoted", relationshipContext: { weather: { warmth: 1 } }, giveSpace: true, randomFn: () => 0 }).blockedReason, "give_space");
  const blockStore = createRomanticSurpriseStore();
  const blockedRuntime = createRomanticSurpriseRuntime({ config: { memory: { companionId: "dante", userScope: "jenna" } }, store: blockStore, discordSendGateway: async () => ({ sent: true }) });
  await blockedRuntime.handleUserText({ ...base, userText: "not now" });
  assert.ok(await blockStore.getActiveTemporaryBlock({ companionId: "dante", customerId: "jenna", now: base.now }), "not-now temporary block persists");
  const fakePool = { query: async (sql, params = []) => ({ rows: /RETURNING \*/i.test(String(sql)) ? [{ id: params[0] || "rs_pg", companion_id: "dante", customer_id: "jenna", surprise_type: "just_because", status: "planned", evidence_ids: [], metadata: {}, created_at: new Date(), updated_at: new Date(), planned_for: new Date() }] : [], rowCount: 0 }) };
  const pgStore = createRomanticSurpriseStore({ pool: fakePool });
  await pgStore.init();
  assert.ok(String(pgStore.CREATE_SCHEMA_REGISTRY_SQL).includes("runtime_schema_registry"), "schema registry table exists");
  let sent = 0;
  const rt = createRomanticSurpriseRuntime({ config: { memory: { companionId: "dante", userScope: "jenna" } }, discordSendGateway: async () => { sent++; return { sent: true, messageId: "m" }; } });
  await rt.tick({ ...base, relationshipContext: { weather: { warmth: 1 } }, randomFn: () => 0 });
  assert.equal(sent, 1, "canonical send gateway injection used");
  const status = await rt.getStatus(base);
  assert.equal(Object.prototype.hasOwnProperty.call(status, "message"), false, "status is safe");
  const files = ["src/lifeRuntime/romanticSurpriseRuntime.js", "src/lifeRuntime/romanticSurprisePlanner.js", "src/lifeRuntime/romanticSurpriseStore.js", "src/lifeRuntime/romanticGestureLibrary.js", "src/lifeRuntime/romanticSurpriseConsentGate.js"].map(src).join("\n");
  assert.equal(/setInterval|setTimeout|cron|schedulerRegistry/i.test(files), false, "no duplicate scheduler");
  assert.equal(/channel\.send|client\.channels\.fetch|createDiscordClient|new Discord/i.test(files), false, "no duplicate sender");
  const dashBefore = src("scripts/verify-dashboard-not-broken.js");
  assert.ok(dashBefore.includes("dashboard"), "dashboard safety proof remains in place");
  console.log("ROMANTIC_SURPRISE_RUNTIME_PASS");
})();
