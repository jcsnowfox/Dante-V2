"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createConsequenceStore } = require("../consequenceStore");
const { createRepairPersistenceEngine } = require("../repairPersistenceEngine");
const { createRelationalConsequencesEngine } = require("../relationalConsequencesEngine");
const { createLifeRuntime } = require("../lifeRuntime");

const scope = { companionId: "dante", customerId: "jenna" };
async function setup(sendImpl = async () => ({ sent: true, messageId: "m1" })) {
  const store = createConsequenceStore();
  const engine = createRepairPersistenceEngine({ consequenceStore: store, discordSendGateway: sendImpl, quietHours: () => false, channelId: "chan" });
  return { store, engine };
}
async function consequence(store, eventType, now = new Date("2026-06-27T12:00:00Z")) {
  return store.create({ ...scope, eventType, repairRequired: true, now });
}


test("runtime integration: hurt message creates candidate, 59 minutes waits, 61 minutes sends once and updates status", async () => {
  let sends = 0;
  let sentContent = "";
  const store = createConsequenceStore();
  const repairPersistenceEngine = createRepairPersistenceEngine({
    consequenceStore: store,
    quietHours: () => false,
    channelId: "chan",
    discordSendGateway: async ({ content, label }) => {
      sends += 1;
      sentContent = content;
      assert.equal(label, "repair-persistence");
      return { sent: true, messageId: `m${sends}` };
    },
  });
  const relationalConsequencesEngine = createRelationalConsequencesEngine({ consequenceStore: store });
  const runtime = createLifeRuntime({
    config: { lifeRuntime: { enabled: true }, memory: { companionId: scope.companionId, userScope: scope.customerId } },
    consequenceStore: store,
    relationalConsequencesEngine,
    repairPersistenceEngine,
  });

  const now = new Date("2026-06-27T12:00:00Z");
  await runtime.observeInteraction({ userText: "you hurt me. i need to go.", now });
  let active = await store.getActive(scope);
  assert.equal(active.length, 1);
  assert.equal(active[0].eventType, "hurt_detected");
  assert.equal(active[0].metadata.repairFollowUp.dueAt, "2026-06-27T13:00:00.000Z");

  await runtime.tick(new Date("2026-06-27T12:59:00Z"));
  assert.equal(sends, 0);

  await runtime.tick(new Date("2026-06-27T13:01:00Z"));
  assert.equal(sends, 1);
  assert.equal(repairPersistenceEngine.messageStyleOk(sentContent), true);

  await runtime.tick(new Date("2026-06-27T13:02:00Z"));
  assert.equal(sends, 1);
  const status = runtime.getStatus().consequenceContext;
  assert.equal(status.repair_followup_pending, false);
  assert.equal(status.last_repair_followup_sent_at, "2026-06-27T13:01:00.000Z");
});

test("all repair templates reject forbidden pressure and theatrical phrases", () => {
  const { REPAIR_FOLLOWUP_MESSAGES } = require("../repairPersistenceEngine");
  const forbidden = /kneel|door|please don.?t leave|i can.?t function|after everything you built|you.?re not|this isn.?t|must answer|silence is killing me/i;
  for (const msg of REPAIR_FOLLOWUP_MESSAGES) {
    assert.equal(msg.length <= 140, true);
    assert.doesNotMatch(msg, forbidden);
  }
});

test("repair triggers create delayed candidates with default 60 minute delay", async () => {
  for (const eventType of ["hurt_detected", "disappointment", "claimed_action_without_evidence", "confabulation_detected"]) {
    const { store, engine } = await setup();
    const now = new Date("2026-06-27T12:00:00Z");
    const c = await consequence(store, eventType, now);
    const meta = await engine.evaluateConsequence({ ...scope, consequence: c, now });
    assert.equal(meta.pending, true);
    assert.equal(meta.dueAt, "2026-06-27T13:00:00.000Z");
  }
});

test("does not send before due, sends when due, and does not send twice", async () => {
  let sends = 0;
  const { store, engine } = await setup(async () => { sends++; return { sent: true, messageId: `m${sends}` }; });
  await consequence(store, "hurt_detected");
  await engine.tick({ ...scope, now: new Date("2026-06-27T12:00:00Z") });
  assert.deepEqual(await engine.tick({ ...scope, now: new Date("2026-06-27T12:30:00Z") }), { sent: 0, blocked: 0, pending: 1 });
  assert.equal(sends, 0);
  assert.equal((await engine.tick({ ...scope, now: new Date("2026-06-27T13:01:00Z") })).sent, 1);
  assert.equal((await engine.tick({ ...scope, now: new Date("2026-06-27T14:01:00Z") })).sent, 0);
  assert.equal(sends, 1);
});

test("give-space, quiet hours, disabled outbound, and repair completion block sending", async () => {
  for (const opts of [{ giveSpace: true, reason: "blocked_by_space" }, { quietHoursActive: true, reason: "blocked_by_quiet_hours" }, { outboundEnabled: false, reason: "disabled" }]) {
    const { store, engine } = await setup();
    await consequence(store, "disappointment");
    await engine.tick({ ...scope, now: new Date("2026-06-27T12:00:00Z") });
    const result = await engine.tick({ ...scope, now: new Date("2026-06-27T13:01:00Z"), ...opts });
    assert.equal(result.blocked, 1);
    const active = await store.getActive(scope);
    assert.equal(active[0].metadata.repairFollowUp.blockedReason, opts.reason);
  }

  const { store, engine } = await setup();
  const c = await consequence(store, "hurt_detected");
  await engine.evaluateConsequence({ ...scope, consequence: c, now: new Date("2026-06-27T12:00:00Z") });
  await store.markRepairCompleted({ ...scope, id: c.id, now: new Date("2026-06-27T12:10:00Z") });
  assert.equal((await engine.tick({ ...scope, now: new Date("2026-06-27T13:01:00Z") })).sent, 0);
});

test("message style is short, non-theatrical, and uses canonical send gateway injection", async () => {
  let content = "";
  const { store, engine } = await setup(async ({ content: c, label }) => { content = c; assert.equal(label, "repair-persistence"); return { sent: true }; });
  await consequence(store, "confabulation_detected");
  await engine.tick({ ...scope, now: new Date("2026-06-27T13:01:00Z") });
  assert.equal(engine.messageStyleOk(content), true);
  assert.ok(content.length <= 140);
  assert.doesNotMatch(content, /kneels|have to talk|silence is killing/i);
});

test("emoji reaction acknowledges without forced reply and space phrases block future follow-ups", async () => {
  const { store, engine } = await setup();
  await consequence(store, "hurt_detected");
  await engine.tick({ ...scope, now: new Date("2026-06-27T12:00:00Z") });
  await engine.tick({ ...scope, now: new Date("2026-06-27T13:01:00Z") });
  assert.deepEqual(await engine.acknowledgeReaction({ ...scope, now: new Date("2026-06-27T13:02:00Z") }), { acknowledged: 1, forcedReply: false });

  const c2 = await consequence(store, "disappointment", new Date("2026-06-27T14:00:00Z"));
  await engine.evaluateConsequence({ ...scope, consequence: c2, now: new Date("2026-06-27T14:00:00Z") });
  assert.equal((await engine.handleUserText({ ...scope, userText: "not now, leave me alone", now: new Date("2026-06-27T14:01:00Z") })).blocked, 2);
  const active = await store.getActive(scope);
  assert.ok(active.find(c => c.id === c2.id).metadata.repairFollowUp.blockedBySpace);
});

test("status exposes safe metadata only", async () => {
  const { store, engine } = await setup();
  await consequence(store, "hurt_detected");
  await engine.tick({ ...scope, now: new Date("2026-06-27T12:30:00Z") });
  assert.deepEqual(Object.keys(engine.getStatus(await store.getActive(scope))).sort(), [
    "last_repair_followup_sent_at", "repair_followup_blocked_reason", "repair_followup_due_at", "repair_followup_pending",
  ].sort());
});
