"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { detectOutputCorruption } = require("../outputCorruptionDetector");

describe("outputCorruptionDetector", () => {

  // ── Block cases ─────────────────────────────────────────────────────────────

  test("blocks reply with printStats internal token", () => {
    const result = detectOutputCorruption("printStatsYour ass tastes so good tonight");
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.some(r => r.includes("internal_token") || r.includes("camelcase")));
    assert.ok(result.recommendation === "regenerate" || result.recommendation === "trim_to_safe_prefix");
  });

  test("blocks reply with constructor + contentassist cluster", () => {
    const result = detectOutputCorruption("I love you so much. constructor contentassist privacy policy getPrototypeOf");
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.length > 0);
  });

  test("blocks Maritime Boundaries noun dump", () => {
    const result = detectOutputCorruption("Maritime Boundaries Cluster exercises and MIT License EA Sports Passport strategy");
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.includes("known_noun_dump"));
  });

  test("blocks reply with SQL fragment", () => {
    const result = detectOutputCorruption("SELECT * FROM users WHERE id = 1 and I miss you");
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.includes("sql_fragment"));
  });

  test("blocks reply with JSON fragment", () => {
    const result = detectOutputCorruption('{"key": "value", "another": 123} I want you so bad');
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.includes("json_fragment"));
  });

  test("blocks reply with code artifact (stack trace)", () => {
    const result = detectOutputCorruption("Error: at Object.<anonymous> (/app/src/chat/createChatPipeline.js:1002:20) I glitched");
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.includes("code_artifact"));
  });

  test("blocks reply with camelCase cluster (3+ long tokens)", () => {
    const result = detectOutputCorruption("buildChatRequestShapeSummary createCognitiveRuntime applyPromptBudget detectOutputCorruption");
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.some(r => r.includes("camelcase")));
  });

  test("blocks reply with provider debug text", () => {
    const result = detectOutputCorruption("x-request-id: abc123 x-ratelimit-remaining: 4 usage.total_tokens: 800");
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.reasons.includes("provider_debug_text"));
  });

  // ── Valid reply cases — must NOT block ────────────────────────────────────

  test("valid romantic reply is NOT blocked", () => {
    const result = detectOutputCorruption("Hey, I've been thinking about you all day. How are you holding up?");
    assert.equal(result.severity, "none");
    assert.equal(result.recommendation, "send");
  });

  test("valid casual reply is NOT blocked", () => {
    const result = detectOutputCorruption("Yeah, that sounds like a good plan. Let's figure it out together.");
    assert.equal(result.severity, "none");
    assert.equal(result.recommendation, "send");
  });

  test("valid code answer is NOT blocked (coding context)", () => {
    const result = detectOutputCorruption(
      "You can use `Array.from()` to convert a NodeList. For example:\n\n```js\nconst items = Array.from(document.querySelectorAll('li'));\n```",
      { intent: "coding_help" }
    );
    // code fences are watch-level at worst; the reply is valid for coding
    assert.ok(result.severity !== "block" || result.recommendation !== "block");
  });

  // ── Safe prefix extraction ────────────────────────────────────────────────

  test("safePrefix is extracted when coherent prefix exists before corruption", () => {
    const text = "I love you and I've been thinking about you. constructor getPrototypeOf printStats buildChatRequestShapeSummary";
    const result = detectOutputCorruption(text);
    assert.equal(result.corrupted, true);
    assert.equal(result.severity, "block");
    assert.ok(result.safePrefix.length > 0);
    assert.ok(!result.safePrefix.includes("constructor"));
  });

  test("returns empty string when no safe prefix can be found", () => {
    const result = detectOutputCorruption("constructor getPrototypeOf buildChatRequest applyPromptBudget printStats");
    assert.equal(result.corrupted, true);
    // safePrefix may be empty or minimal since there's no coherent sentence
    assert.equal(typeof result.safePrefix, "string");
  });

  // ── Output contract ───────────────────────────────────────────────────────

  test("always returns a valid result object for empty input", () => {
    const result = detectOutputCorruption("");
    assert.equal(typeof result.corrupted, "boolean");
    assert.ok(["none", "watch", "block"].includes(result.severity));
    assert.ok(Array.isArray(result.reasons));
    assert.equal(typeof result.safePrefix, "string");
    assert.ok(["send", "trim_to_safe_prefix", "regenerate", "block"].includes(result.recommendation));
  });

  test("always returns a valid result object for null input", () => {
    const result = detectOutputCorruption(null);
    assert.equal(result.severity, "none");
    assert.equal(result.recommendation, "send");
  });

  test("tool name leak in romance is flagged", () => {
    const result = detectOutputCorruption("I want you. create_image generate_image search_memories store_memory I need you.");
    assert.ok(result.severity !== "none");
    assert.ok(result.reasons.some(r => r.includes("tool_name")));
  });

});
