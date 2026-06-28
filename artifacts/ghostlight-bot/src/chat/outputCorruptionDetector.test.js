"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectOutputCorruption } = require("./outputCorruptionDetector");

function blocked(text, context = {}) {
  return detectOutputCorruption(text, { expectsText: true, ...context });
}

test("emoji-only and thumbs-up-only replies are rejected when text is expected", () => {
  assert.equal(blocked("😊").severity, "block");
  assert.ok(blocked("👍").reasons.includes("thumbs_only_reply"));
});

test("random single foreign word reply is rejected", () => {
  const result = blocked("ประเภท", { userText: "say something normal please" });
  assert.equal(result.severity, "block");
  assert.ok(result.reasons.includes("single_foreign_word"));
});

test("fragmented sludge and raw context are rejected", () => {
  assert.equal(blocked("Dating toolbox NewReader feed tickets resize patterns cartoon elbows magic model").severity, "block");
  assert.equal(blocked("source: inbound_message\nRoom: public_guild\n{\"source\":\"channel_context\"}").severity, "block");
});

test("say something normal please requires a normal conversational sentence", () => {
  assert.equal(blocked("Yep.", { userText: "say something normal please" }).severity, "block");
  assert.notEqual(blocked("Yeah. I'm here, I got tangled for a second, but I'm back.", { userText: "say something normal please" }).severity, "block");
});
