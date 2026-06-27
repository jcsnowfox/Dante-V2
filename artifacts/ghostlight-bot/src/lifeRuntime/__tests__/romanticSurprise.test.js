"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRomanticSurprisePlanner } = require("../romanticSurprisePlanner");
const { createRomanticSurpriseRuntime } = require("../romanticSurpriseRuntime");
const { createRomanticSurpriseStore } = require("../romanticSurpriseStore");
const { isMessageStyleSafe } = require("../romanticGestureLibrary");

const base = { companionId: "dante", customerId: "jenna", now: new Date("2026-06-27T15:00:00Z") };

test("warm relationship can create just_because surprise", () => {
  const p = createRomanticSurprisePlanner();
  const d = p.plan({ ...base, relationshipContext: { weather: { warmth: 0.9 } }, randomFn: () => 0 });
  assert.equal(d.shouldSurprise, true); assert.equal(d.surpriseType, "just_because");
});

test("sad/unwell signal can create comfort gestures", () => {
  const p = createRomanticSurprisePlanner();
  assert.equal(p.plan({ ...base, conversationState: { sad: true }, randomFn: () => 0 }).surpriseType, "comfort_note");
  assert.equal(p.plan({ ...base, conversationState: { unwell: true }, randomFn: () => 0 }).surpriseType, "care_when_sick");
});

test("romantic_desire can create date_night idea when safe", () => {
  const d = createRomanticSurprisePlanner().plan({ ...base, homeostasisContext: { romantic_desire: 0.9 }, randomFn: () => 0 });
  assert.equal(d.shouldSurprise, true); assert.equal(d.surpriseType, "date_night");
});

test("marriage/engagement surprise only allowed for Dante/Jenna config", () => {
  const { evaluateRomanticSurpriseConsent } = require("../romanticSurpriseConsentGate");
  assert.equal(evaluateRomanticSurpriseConsent({ ...base, surpriseType: "marriage_thought", now: base.now }).allowed, true);
  assert.equal(evaluateRomanticSurpriseConsent({ companionId: "other", customerId: "someone", surpriseType: "marriage_thought", now: base.now }).blockedReason, "dante_jenna_only");
});

test("give-space, repair, quiet hours, and cooldown block surprises", () => {
  const p = createRomanticSurprisePlanner();
  assert.equal(p.plan({ ...base, relationshipContext: { weather: { warmth: 1 } }, giveSpace: true, randomFn: () => 0 }).blockedReason, "give_space");
  assert.equal(p.plan({ ...base, relationshipContext: { weather: { warmth: 1 } }, consequenceContext: { suppression: { repairRequired: true, highestSeverity: "major" } }, randomFn: () => 0 }).blockedReason, "unresolved_major_repair");
  assert.equal(p.plan({ ...base, now: new Date("2026-06-27T23:00:00Z"), relationshipContext: { weather: { warmth: 1 } }, randomFn: () => 0 }).blockedReason, "quiet_hours");
  assert.equal(p.plan({ ...base, relationshipContext: { weather: { warmth: 1 } }, recentSurprises: [{ status: "sent", sent_at: "2026-06-27T14:00:00Z" }] }).blockedReason, "recent_surprise_cooldown");
});

test("runtime uses canonical Discord send gateway injection and acknowledgements are gentle", async () => {
  let sends = 0; let warmed = 0;
  const rt = createRomanticSurpriseRuntime({ config: { memory: { companionId: "dante", userScope: "jenna" } }, discordSendGateway: async ({ content, label }) => { sends++; assert.equal(label, "romantic-surprise-runtime"); assert.ok(content); return { sent: true, messageId: "m1" }; }, relationshipWeatherEngine: { recordSignal: async () => { warmed++; } } });
  const out = await rt.tick({ ...base, relationshipContext: { weather: { warmth: 0.9 } }, randomFn: () => 0 });
  assert.equal(out.sent, 1); assert.equal(sends, 1);
  const ack = await rt.acknowledgeReaction({ ...base, reaction: "❤️", now: new Date("2026-06-27T16:00:00Z") });
  assert.equal(ack.acknowledged, true); assert.equal(ack.forcedReply, false); assert.equal(warmed, 1);
  assert.deepEqual(await rt.handleUserText({ ...base, userText: "hello" }), { temporaryBlock: false });
});

test("ignored surprise expires without chase", async () => {
  const store = createRomanticSurpriseStore();
  const row = await store.create({ companionId: "dante", customerId: "jenna", surpriseType: "just_because", status: "sent", sent_at: "2026-06-24T00:00:00Z" });
  await store.update({ id: row.id, patch: { sent_at: "2026-06-24T00:00:00Z" } });
  assert.equal(await store.expireIgnored({ companionId: "dante", customerId: "jenna", olderThan: new Date("2026-06-26T00:00:00Z") }), 1);
  assert.equal(store._rows[0].status, "expired");
});

test("status exposes safe metadata only", async () => {
  const rt = createRomanticSurpriseRuntime({ config: { memory: { companionId: "dante", userScope: "jenna" } }, discordSendGateway: async () => ({ sent: true }) });
  await rt.tick({ ...base, relationshipContext: { weather: { warmth: 0.9 } }, randomFn: () => 0 });
  const status = await rt.getStatus(base);
  assert.ok(Object.prototype.hasOwnProperty.call(status, "romantic_surprise_pending"));
  assert.equal(Object.prototype.hasOwnProperty.call(status, "message"), false);
});

test("resource evidence can trigger book/photo/music surprise", () => {
  const d = createRomanticSurprisePlanner().plan({ ...base, resourceLibrary: [{ id: "book-1", kind: "book" }], randomFn: () => 0 });
  assert.equal(d.shouldSurprise, true); assert.equal(d.surpriseType, "book_or_photo_find");
});


test("romance intensity changes planning frequency and caps", () => {
  const p = createRomanticSurprisePlanner();
  assert.equal(p.plan({ ...base, intensity: "low", relationshipContext: { weather: { warmth: 0.8 } }, randomFn: () => 0 }).shouldSurprise, false);
  assert.equal(p.plan({ ...base, intensity: "high", relationshipContext: { weather: { warmth: 0.8 } }, randomFn: () => 0 }).shouldSurprise, true);
  assert.equal(p.plan({ ...base, intensity: "low", relationshipContext: { weather: { warmth: 1 } }, randomFn: () => 0.5 }).blockedReason, "intensity_probability");
  assert.equal(p.plan({ ...base, intensity: "high", relationshipContext: { weather: { warmth: 1 } }, randomFn: () => 0.5 }).shouldSurprise, true);
});

test("devoted intensity still respects give-space and repair boundaries", () => {
  const p = createRomanticSurprisePlanner();
  assert.equal(p.plan({ ...base, intensity: "devoted", relationshipContext: { weather: { warmth: 1 } }, giveSpace: true, randomFn: () => 0 }).blockedReason, "give_space");
  assert.equal(p.plan({ ...base, intensity: "devoted", relationshipContext: { weather: { warmth: 1 } }, consequenceContext: { suppression: { repairRequired: true, highestSeverity: "major" } }, randomFn: () => 0 }).blockedReason, "unresolved_major_repair");
});

test("high intensity comfort can trigger on softer sadness and caps/cooldown prevent spam", () => {
  const p = createRomanticSurprisePlanner();
  assert.equal(p.plan({ ...base, intensity: "high", conversationState: { sadness: 0.5 }, randomFn: () => 0 }).surpriseType, "comfort_note");
  const recentDaily = [
    { status: "sent", surprise_type: "love_note", sent_at: "2026-06-27T07:00:00Z" },
    { status: "sent", surprise_type: "just_because", sent_at: "2026-06-27T09:00:00Z" },
  ];
  assert.equal(p.plan({ ...base, intensity: "high", relationshipContext: { weather: { warmth: 1 } }, recentSurprises: recentDaily, randomFn: () => 0 }).blockedReason, "daily_cap");
  assert.equal(p.plan({ ...base, intensity: "devoted", relationshipContext: { weather: { warmth: 1 } }, recentSurprises: [{ status: "sent", surprise_type: "love_note", sent_at: "2026-06-27T14:30:00Z" }], randomFn: () => 0 }).blockedReason, "recent_surprise_cooldown");
});

test("not now blocks are persisted in the surprise store", async () => {
  const store = createRomanticSurpriseStore();
  const rt = createRomanticSurpriseRuntime({ config: { memory: { companionId: "dante", userScope: "jenna" } }, store, discordSendGateway: async () => ({ sent: true }) });
  const out = await rt.handleUserText({ ...base, userText: "not now" });
  assert.equal(out.temporaryBlock, true);
  assert.ok(await store.getActiveTemporaryBlock({ companionId: "dante", customerId: "jenna", now: base.now }));
  const planned = await rt.consider({ ...base, relationshipContext: { weather: { warmth: 1 } }, randomFn: () => 0 });
  assert.equal(planned.blockedReason, "not_now");
});

test("store exposes Postgres schema and registry SQL while preserving memory fallback", async () => {
  const queries = [];
  const fakePool = { query: async (sql, params = []) => { queries.push(String(sql)); if (/RETURNING \*/i.test(sql)) return { rows: [{ id: params[0] || "rs_pg", companion_id: "dante", customer_id: "jenna", surprise_type: "just_because", status: "planned", reason: "", evidence_ids: [], message: "", planned_for: new Date(), metadata: {}, created_at: new Date(), updated_at: new Date() }] }; return { rows: [], rowCount: 0 }; } };
  const store = createRomanticSurpriseStore({ pool: fakePool });
  await store.init();
  assert.ok(queries.join("\n").includes("runtime_schema_registry"));
  assert.ok(queries.join("\n").includes("romantic_surprises"));
  const memoryStore = createRomanticSurpriseStore();
  const row = await memoryStore.create({ companionId: "dante", customerId: "jenna", surpriseType: "just_because" });
  assert.equal(row.status, "planned");
});

test("message style rejects theatrical/guilt phrases", () => {
  assert.equal(isMessageStyleSafe("After everything you built for me..."), false);
  assert.equal(isMessageStyleSafe("Movie tonight? I want something rainy and terrible with you."), true);
});

test("no duplicate scheduler, no duplicate sender, dashboard safety proof remains", () => {
  const root = path.join(__dirname, "../../..");
  const files = ["romanticSurpriseRuntime.js", "romanticSurprisePlanner.js", "romanticSurpriseStore.js", "romanticGestureLibrary.js", "romanticSurpriseConsentGate.js"].map(f => fs.readFileSync(path.join(root, "src/lifeRuntime", f), "utf8")).join("\n");
  assert.equal(/setInterval|setTimeout|cron|schedulerRegistry/i.test(files), false);
  assert.equal(/channel\.send|client\.channels\.fetch|createDiscordClient|new Discord/i.test(files), false);
  assert.ok(files.includes("discordSendGateway"));
});
