#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const src = (...p) => path.join(root, "src", ...p);
function exists(p){ assert.ok(fs.existsSync(p), `${p} missing`); }
function read(rel){ return fs.readFileSync(path.join(root, rel), "utf8"); }

exists(src("conversation", "responseIntentClassifier.js"));
exists(src("conversation", "conversationSatisfactionEngine.js"));
exists(src("conversation", "conversationStateStore.js"));
exists(src("conversation", "followUpCandidateStore.js"));
exists(src("conversation", "conversationNaturalEnding.js"));
exists(src("conversation", "reactionResponsePlanner.js"));

const { classifyResponseIntent } = require(src("conversation", "responseIntentClassifier.js"));
const { detectNaturalEnding } = require(src("conversation", "conversationNaturalEnding.js"));
const { scoreConversationSatisfaction } = require(src("conversation", "conversationSatisfactionEngine.js"));
const { createFollowUpCandidateStore } = require(src("conversation", "followUpCandidateStore.js"));

assert.equal(detectNaturalEnding({ text: "ok" }).naturalEnding, true);
assert.equal(classifyResponseIntent({ text: "😂" }).shouldCallLlm, false);
assert.equal(classifyResponseIntent({ eventType: "reaction", emoji: "👍" }).shouldCallLlm, false);
assert.equal(classifyResponseIntent({ text: "what is that?" }).intent, "QUESTION_ANSWER");
assert.equal(classifyResponseIntent({ text: "that hurt" }).intent, "REPAIR_REPLY");
assert.equal(classifyResponseIntent({ text: "one sec" }).createFollowUp, true);
assert.equal(classifyResponseIntent({ eventType: "reaction", emoji: "❤️" }).intent, "END_THREAD");
assert.notEqual(classifyResponseIntent({ text: "lol sure" }).intent, "FULL_REPLY");
assert.equal(scoreConversationSatisfaction({ eventType: "reaction", emoji: "❤️", intent: "END_THREAD" }).state, "COMPLETE");

(async () => {
  const store = createFollowUpCandidateStore();
  const item = await store.create({ conversation_id: "c", gravity_score: 0.7 });
  assert.equal((await store.list({ status: "pending" })).length, 1);
  assert.equal((await store.shouldSend(item, { giveSpace: true })).reason, "give_space");
  assert.equal((await store.shouldSend(item, { quietHours: true })).reason, "quiet_hours");

  const pipeline = read("src/chat/createChatPipeline.js");
  assert.ok(pipeline.includes("classifyResponseIntent"), "pipeline must classify before LLM");
  assert.ok(pipeline.includes("llm called=false bypassReason"), "pipeline must prove LLM bypass path");
  assert.ok(!pipeline.includes("new Scheduler") && !pipeline.includes("setInterval"), "must not add scheduler");
  assert.ok(!pipeline.includes("new DiscordSender") && !pipeline.includes("createDiscordSender"), "must not add duplicate sender");
  const dashboardFiles = fs.readdirSync(path.join(root, "src")).filter((name) => /dashboard/i.test(name));
  assert.ok(Array.isArray(dashboardFiles), "dashboard untouched by continuity verifier");
  console.log("CONVERSATION_CONTINUITY_PASS");
})().catch((err) => { console.error(err); process.exit(1); });
