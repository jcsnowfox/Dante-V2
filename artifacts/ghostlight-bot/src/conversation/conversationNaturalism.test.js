"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyResponseIntent, buildIntentInstruction } = require("./responseIntentClassifier");
const { detectNaturalEnding } = require("./conversationNaturalEnding");
const { scoreConversationSatisfaction } = require("./conversationSatisfactionEngine");
const { createConversationStateStore } = require("./conversationStateStore");
const { createFollowUpCandidateStore } = require("./followUpCandidateStore");
const { planReactionResponse } = require("./reactionResponsePlanner");
const { evaluateSelfConsistency } = require("../lifeRuntime/selfConsistencyMonitor");

test("emoji-only user message can classify as emoji/no-response", () => {
  assert.match(classifyResponseIntent({ text: "😂" }).intent, /EMOJI_ONLY|NO_RESPONSE/);
});

test("heart reaction can end thread and increase satisfaction", () => {
  const intent = classifyResponseIntent({ eventType: "reaction", emoji: "❤️" });
  assert.equal(intent.intent, "END_THREAD");
  const before = scoreConversationSatisfaction({ text: "plain" });
  const after = scoreConversationSatisfaction({ eventType: "reaction", emoji: "❤️", intent: intent.intent });
  assert.equal(after.state, "COMPLETE");
  assert.ok(after.satisfaction_score > before.satisfaction_score);
});

test("lol sure does not require full reply and short reply injects one sentence instruction", () => {
  const classified = classifyResponseIntent({ text: "lol sure" });
  assert.notEqual(classified.intent, "FULL_REPLY");
  assert.equal(classified.intent, "SHORT_REPLY");
  assert.match(buildIntentInstruction(classified).content, /one sentence or less/i);
});

test("direct question requires answer", () => {
  const classified = classifyResponseIntent({ text: "what model are you using?" });
  assert.equal(classified.intent, "QUESTION_ANSWER");
  assert.equal(classified.shouldCallLlm, true);
});

test("that hurt requires repair reply", () => {
  const classified = classifyResponseIntent({ text: "that hurt" });
  assert.equal(classified.intent, "REPAIR_REPLY");
  assert.equal(classified.shouldCallLlm, true);
});

test("one sec creates follow-up candidate", async () => {
  const classified = classifyResponseIntent({ text: "one sec" });
  assert.equal(classified.intent, "FOLLOW_UP_LATER");
  assert.equal(classified.createFollowUp, true);
  const store = createFollowUpCandidateStore();
  const item = await store.create({ conversation_id: "c", reason: classified.reason, topic: "one sec", gravity_score: 0.55 });
  assert.equal(item.status, "pending");
});

test("selfie/media can use media acknowledgement", () => {
  const classified = classifyResponseIntent({ text: "", attachments: [{ contentType: "image/png" }] });
  assert.equal(classified.intent, "MEDIA_ACK");
  assert.equal(planReactionResponse({ intent: classified.intent, media: true }).emoji, "👀");
});

test("natural ending sets COMPLETE/COOLING", () => {
  assert.match(detectNaturalEnding({ text: "goodnight" }).state, /COMPLETE|COOLING/);
  assert.equal(detectNaturalEnding({ text: "ok" }).state, "COOLING");
});

test("unresolved repair prevents casual thread close", () => {
  const score = scoreConversationSatisfaction({ text: "ok", repairActive: true });
  assert.equal(score.state, "REPAIR_NEEDED");
});

test("open loop creates follow-up candidate", async () => {
  const classified = classifyResponseIntent({ text: "the shoulder tap thing", openLoopGravity: 0.8 });
  assert.equal(classified.intent, "FOLLOW_UP_LATER");
  const store = createFollowUpCandidateStore();
  const item = await store.create({ conversation_id: "c", topic: "shoulder tap", gravity_score: 0.8 });
  assert.equal(item.status, "pending");
});

test("low-gravity topic expires/dismisses", async () => {
  const store = createFollowUpCandidateStore();
  const item = await store.create({ gravity_score: 0.1 });
  assert.equal(item.status, "dismissed");
});

test("give-space and quiet hours block follow-up", async () => {
  const store = createFollowUpCandidateStore();
  const item = await store.create({ gravity_score: 0.7 });
  assert.equal((await store.shouldSend(item, { giveSpace: true })).reason, "give_space");
  assert.equal((await store.shouldSend(item, { quietHours: true })).reason, "quiet_hours");
});

test("no LLM call happens for no-response and reaction-only", () => {
  assert.equal(classifyResponseIntent({ text: "😂" }).shouldCallLlm, false);
  assert.equal(classifyResponseIntent({ eventType: "reaction", emoji: "👍" }).shouldCallLlm, false);
});

test("self-consistency flags over-answering", () => {
  const signal = evaluateSelfConsistency({ responseIntent: "NO_RESPONSE", replyText: "Here is a full reply anyway." });
  assert.equal(signal.self_confidence, "low");
  assert.ok(signal.evidence.includes("over_answering"));
});

test("conversation state persists satisfaction shape", async () => {
  const store = createConversationStateStore();
  const saved = await store.upsert({ conversation_id: "c", channel_id: "ch", user_id: "u", companion_id: "d", state: "COMPLETE", satisfaction_score: 0.9 });
  assert.equal(saved.state, "COMPLETE");
  assert.equal((await store.get({ conversationId: "c", userId: "u", companionId: "d" })).satisfaction_score, 0.9);
});
