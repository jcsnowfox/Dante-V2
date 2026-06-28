#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createConsequenceStore } = require("../src/lifeRuntime/consequenceStore");
const { createRelationalConsequencesEngine } = require("../src/lifeRuntime/relationalConsequencesEngine");
const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");
const { createRepairPersistenceEngine, REPAIR_FOLLOWUP_MESSAGES, messageStyleOk } = require("../src/lifeRuntime/repairPersistenceEngine");

const forbiddenStyle = /kneel|door|please don.?t leave|i can.?t function|after everything you built|you.?re not|this isn.?t|must answer|silence is killing me/i;
const scope = { companionId: "dante", customerId: "jenna" };

function assertSafeStatus(status) {
  const json = JSON.stringify(status || {});
  for (const unsafe of ["you hurt me", "i need to go", "DISCORD_TOKEN", "OPENAI_API_KEY", "DATABASE_URL", "allowedMentions", "payload"]) {
    assert.equal(json.includes(unsafe), false, `status leaked ${unsafe}`);
  }
  for (const key of ["repair_followup_pending", "repair_followup_due_at", "last_repair_followup_sent_at", "repair_followup_blocked_reason"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(status, key), `missing status ${key}`);
  }
}

function buildRuntime({ quietHours = () => false, send = async () => ({ sent: true, messageId: "m" }) } = {}) {
  const store = createConsequenceStore();
  const repairPersistenceEngine = createRepairPersistenceEngine({ consequenceStore: store, quietHours, channelId: "chan", discordSendGateway: send });
  const relationalConsequencesEngine = createRelationalConsequencesEngine({ consequenceStore: store });
  const runtime = createLifeRuntime({
    config: { lifeRuntime: { enabled: true }, memory: { companionId: scope.companionId, userScope: scope.customerId } },
    consequenceStore: store,
    relationalConsequencesEngine,
    repairPersistenceEngine,
  });
  return { store, repairPersistenceEngine, relationalConsequencesEngine, runtime };
}

async function createObservedRepair(runtime, store, now = new Date("2026-06-27T12:00:00Z"), text = "you hurt me. i need to go.") {
  await runtime.observeInteraction({ userText: text, now });
  const active = await store.getActive(scope);
  assert.equal(active.length, 1, "runtime observeInteraction should create exactly one active consequence");
  assert.equal(active[0].repairRequired, true, "consequence requires repair");
  assert.equal(active[0].repairCompleted, false, "repair starts unresolved");
  assert.ok(active[0].metadata.repairFollowUp, "repair follow-up candidate stored on consequence metadata");
  return active[0];
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const enginePath = path.join(root, "src/lifeRuntime/repairPersistenceEngine.js");
  const engineSource = fs.readFileSync(enginePath, "utf8");
  assert.ok(engineSource.includes("discordSendGateway"), "approved outbound gateway referenced");
  assert.equal(/setInterval\s*\(|setTimeout\s*\(|registerBackground\s*\(|registerPostLogin\s*\(/.test(engineSource), false, "repair engine creates no scheduler");
  assert.equal(/\.send\s*\(/.test(engineSource), false, "repair engine has no direct channel.send");

  const dashboardDiff = require("node:child_process").execSync("git diff --name-only", { cwd: path.resolve(root, "../.."), encoding: "utf8" });
  const allowedTravelStabilizationFiles = new Set([
    "artifacts/ghostlight-bot/src/http/nordicDashboardAssets.js",
    "artifacts/ghostlight-bot/src/http/nordicDashboardAssets.test.js",
    "artifacts/ghostlight-bot/src/http/nordicHomeDashboard.test.js",
    "artifacts/ghostlight-bot/src/http/renderAdminPages/shared.js",
    "artifacts/ghostlight-bot/src/http/renderAdminPages/topLevelPages.js",
    "artifacts/ghostlight-bot/src/http/travelDashboard.test.js",
  ]);
  assert.equal(dashboardDiff.split(/\r?\n/).filter(Boolean).some(f => /src\/http\/renderAdminPages|dashboard/i.test(f) && !allowedTravelStabilizationFiles.has(f)), false, "dashboard unchanged outside approved Travel stabilization files");

  for (const msg of REPAIR_FOLLOWUP_MESSAGES) {
    assert.ok(messageStyleOk(msg), `template failed style guard: ${msg}`);
    assert.equal(forbiddenStyle.test(msg), false, `template contains forbidden pressure/theatre: ${msg}`);
  }

  let sent = 0;
  let sentContent = "";
  let outboundLabel = "";
  const { store, runtime, repairPersistenceEngine } = buildRuntime({ send: async ({ content, label }) => {
    sent += 1;
    sentContent = content;
    outboundLabel = label;
    return { sent: true, messageId: `m${sent}` };
  }});

  const consequence = await createObservedRepair(runtime, store);
  assert.equal(consequence.eventType, "hurt_detected", "hurt text detected as hurt_detected");
  assert.equal(consequence.metadata.repairFollowUp.dueAt, "2026-06-27T13:00:00.000Z", "default delay is 60 minutes");

  await runtime.tick(new Date("2026-06-27T12:59:00Z"));
  assert.equal(sent, 0, "59 minutes must not send");
  let status = runtime.getStatus().consequenceContext;
  assert.equal(status.repair_followup_pending, true, "status shows pending before due");
  assertSafeStatus(status);

  await runtime.tick(new Date("2026-06-27T13:01:00Z"));
  assert.equal(sent, 1, "61 minutes sends exactly once");
  assert.equal(outboundLabel, "repair-persistence", "approved repair outbound label used");
  assert.ok(messageStyleOk(sentContent), "sent repair content is short/non-theatrical");
  status = runtime.getStatus().consequenceContext;
  assert.equal(status.repair_followup_pending, false, "status no longer pending after send");
  assert.equal(status.last_repair_followup_sent_at, "2026-06-27T13:01:00.000Z", "status records sent timestamp");
  assertSafeStatus(status);

  await runtime.tick(new Date("2026-06-27T13:02:00Z"));
  assert.equal(sent, 1, "duplicate follow-ups prevented");

  const space = buildRuntime({ send: async () => { throw new Error("give-space should not send"); } });
  await createObservedRepair(space.runtime, space.store);
  await space.runtime.tick(new Date("2026-06-27T13:01:00Z"));
  let spaceActive = await space.store.getActive(scope);
  await space.repairPersistenceEngine.tick({ ...scope, now: new Date("2026-06-27T13:02:00Z"), giveSpace: true });
  spaceActive = await space.store.getActive(scope);
  assert.equal(spaceActive[0].metadata.repairFollowUp.blockedReason, "blocked_by_space", "give-space blocks follow-up");
  assert.equal(spaceActive[0].repairCompleted, false, "give-space leaves repair unresolved");

  const quiet = buildRuntime({ send: async () => { throw new Error("quiet hours should not send"); } });
  await createObservedRepair(quiet.runtime, quiet.store);
  await quiet.repairPersistenceEngine.tick({ ...scope, now: new Date("2026-06-27T13:01:00Z"), quietHoursActive: true });
  const quietActive = await quiet.store.getActive(scope);
  assert.equal(quietActive[0].metadata.repairFollowUp.blockedReason, "blocked_by_quiet_hours", "quiet hours block follow-up");

  const complete = buildRuntime({ send: async () => { throw new Error("completed repair should not send"); } });
  const completeConsequence = await createObservedRepair(complete.runtime, complete.store);
  await complete.store.markRepairCompleted({ ...scope, id: completeConsequence.id, now: new Date("2026-06-27T12:10:00Z") });
  assert.equal((await complete.repairPersistenceEngine.tick({ ...scope, now: new Date("2026-06-27T13:01:00Z") })).sent, 0, "repair completion cancels follow-up");

  const blocked = buildRuntime({ send: async () => { throw new Error("space phrase should not send"); } });
  await createObservedRepair(blocked.runtime, blocked.store);
  await blocked.runtime.observeInteraction({ userText: "not now, leave me alone", now: new Date("2026-06-27T12:05:00Z") });
  const blockedActive = await blocked.store.getActive(scope);
  assert.equal(blockedActive[0].metadata.repairFollowUp.blockedBySpace, true, "stop/not now/leave me alone blocks future follow-ups");
  assert.equal(blockedActive[0].repairCompleted, false, "space phrase keeps repair unresolved but quiet");

  // Direct engine sanity for non-runtime confabulation trigger.
  const cStore = createConsequenceStore();
  const cEngine = createRepairPersistenceEngine({ consequenceStore: cStore, quietHours: () => false, discordSendGateway: async () => ({ sent: true }) });
  const c = await cStore.create({ ...scope, eventType: "claimed_action_without_evidence", repairRequired: true, now: new Date("2026-06-27T12:00:00Z") });
  const meta = await cEngine.evaluateConsequence({ ...scope, consequence: c, now: new Date("2026-06-27T12:00:00Z") });
  assert.equal(meta.dueAt, "2026-06-27T13:00:00.000Z", "confab/claimed-action trigger creates delayed candidate");

  console.log("REPAIR_PERSISTENCE_PASS");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
