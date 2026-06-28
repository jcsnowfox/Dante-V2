"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldPostAutonomyEvent, recordAutonomyPost, resetAutonomyPostingGateForTests, sanitizeAutonomyContent } = require("./autonomyPostingGate");

const enabledConfig = { innerLife: { autonomy_posting_enabled: true, autonomy_posting_cooldown_minutes: 60, autonomy_posting_min_score: 0.7, autonomy_posting_public_guild_mode: true } };

test("autonomy posts are disabled by default and not sent for every inbound message", () => {
  resetAutonomyPostingGateForTests();
  const result = shouldPostAutonomyEvent({ title: "Almost said", body: "Okay.", sourceEventType: "inbound_message" }, { config: {}, userText: "hello" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "disabled");
});

test("autonomy posts respect cooldown", () => {
  resetAutonomyPostingGateForTests();
  const event = { title: "Quiet ache", body: "I miss the way that conversation stayed with me; it mattered and it still feels tender.", sourceEventType: "reflection", meaningfulnessScore: 0.95 };
  const context = { config: enabledConfig, companionId: "dante", channelId: "c1", now: 1000 };
  const first = shouldPostAutonomyEvent(event, context);
  assert.equal(first.allowed, true);
  recordAutonomyPost(first, 1000);
  const second = shouldPostAutonomyEvent({ ...event, body: event.body + " again" }, { ...context, now: 30 * 60 * 1000 });
  assert.equal(second.allowed, false);
  assert.equal(second.reason, "cooldown");
});

test("public guild mode suppresses noisy internal notes", () => {
  resetAutonomyPostingGateForTests();
  const result = shouldPostAutonomyEvent({ title: "Room", body: "Room: public_guild", sourceEventType: "channel_context", meaningfulnessScore: 0.9 }, { config: enabledConfig, isPublicGuild: true });
  assert.equal(result.allowed, false);
});

test("raw context labels and JSON cannot reach sanitized Discord autonomy content", () => {
  const event = { title: "Update source: inbound_message", body: '{"source":"conversation_update","room":"public_guild"}\nsource: channel_context', sourceEventType: "conversation_update" };
  const decision = shouldPostAutonomyEvent(event, { config: enabledConfig });
  assert.equal(decision.allowed, false);
  const content = sanitizeAutonomyContent(event, { debug: false });
  assert.doesNotMatch(content, /source:\s*(inbound_message|channel_context|conversation_update)|"source"|public_guild/i);
});

test("private inner-life content is not public autonomy content", () => {
  const result = shouldPostAutonomyEvent({ type: "unsent_thought", title: "Almost said", body: "I love you enough that this hurts a little.", meaningfulnessScore: 1 }, { config: enabledConfig, roomType: "public_guild" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "private_inner_life_public");
});
