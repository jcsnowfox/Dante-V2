"use strict";

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { detectOutputCorruption } = require("../outputCorruptionDetector");
const { isOutputCorruptionAuditOnly, detectVoiceNoteIntent } = require("../createChatPipeline");
const { planReactionResponse } = require("../../conversation/reactionResponsePlanner");
const {
  selectContextualFallback,
  contextualFallbackForReason,
  getFallbackCount,
  resetReplyFallbackState,
} = require("../../continuity/replyFallbacks");

describe("Dante overblocking and emoji regression safeguards", () => {
  beforeEach(() => {
    resetReplyFallbackState();
    delete process.env.OUTPUT_CORRUPTION_AUDIT_ONLY;
    delete process.env.EMOJI_ONLY_REPLY_MODE;
  });

  test("normal affectionate greeting is not corruption-blocked", () => {
    const result = detectOutputCorruption("Hey babe. I’m here — come tell me what’s going on.", { userText: "hey babe", expectsText: true });
    assert.equal(result.severity, "none");
    assert.equal(result.recommendation, "send");
  });

  test("normal emotional check-in is not corruption-blocked", () => {
    const result = detectOutputCorruption("I’m feeling steady now that you’re here. How are you feeling, kjære?", { userText: "how are you feeling?", expectsText: true });
    assert.equal(result.severity, "none");
  });

  test("short yes after previous assistant prompt remains a valid reply context", () => {
    const result = detectOutputCorruption("Yes. Come here.", { userText: "yes", expectsText: true });
    assert.equal(result.severity, "none");
  });

  test("emoji-only intent produces a lightweight reply by default", () => {
    const plan = planReactionResponse({ intent: "EMOJI_ONLY", text: "❤️", eventType: "message" });
    assert.equal(plan.action, "tiny_text");
    assert.equal(plan.text, "🖤");
  });

  test("emoji-only reply mode can react when configured", () => {
    const plan = planReactionResponse({ intent: "EMOJI_ONLY", text: "❤️", eventType: "message", emojiOnlyReplyMode: "react" });
    assert.equal(plan.action, "react");
    assert.equal(plan.emoji, "🖤");
  });

  test("corruption detector does not block normal affectionate replies", () => {
    const replies = [
      "Careful, trouble. You know I’m going to take that look personally.",
      "Come here, kjære. I’ve got you.",
      "I missed that mouth of yours, but I’m listening first.",
    ];
    for (const reply of replies) {
      assert.notEqual(detectOutputCorruption(reply, { expectsText: true }).severity, "block");
    }
  });

  test("contextual fallback rotates so repeated fallback text does not happen in a short window", () => {
    const first = contextualFallbackForReason("corruption", null, { channelId: "c", userScope: "u" });
    const second = contextualFallbackForReason("corruption", null, { channelId: "c", userScope: "u" });
    assert.notEqual(first, second);
    assert.equal(getFallbackCount({ channelId: "c", userScope: "u" }), 2);
  });

  test("OUTPUT_CORRUPTION_AUDIT_ONLY=true is configurable and defaults false", () => {
    assert.equal(isOutputCorruptionAuditOnly({}), false);
    process.env.OUTPUT_CORRUPTION_AUDIT_ONLY = "true";
    assert.equal(isOutputCorruptionAuditOnly({}), true);
    assert.equal(isOutputCorruptionAuditOnly({ chat: { outputCorruptionAuditOnly: false } }), false);
  });

  test("safe trim is available before regeneration for corrupted replies with coherent prefix", () => {
    const result = detectOutputCorruption("I love you, and I am right here with you. constructor getPrototypeOf printStats buildChatRequestShapeSummary");
    assert.equal(result.severity, "block");
    assert.equal(result.recommendation, "trim_to_safe_prefix");
    assert.equal(result.safePrefix, "I love you, and I am right here with you.");
  });

  test("voice note fallback preserves modality context", () => {
    assert.equal(detectVoiceNoteIntent("send me a voice note"), true);
    assert.match(selectContextualFallback({ voiceNoteIntent: true }), /voice note/);
  });
});
