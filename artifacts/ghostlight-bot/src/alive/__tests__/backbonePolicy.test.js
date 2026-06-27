const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { checkBackbone, buildBackboneSection } = require("../backbonePolicy");

describe("checkBackbone", () => {
  test("returns null for safe message", () => {
    assert.equal(checkBackbone("What do you think about this code?"), null);
  });

  test("detects force merge", () => {
    const result = checkBackbone("Just force merge it, we don't have time");
    assert.ok(result?.triggered);
    assert.equal(result.reason, "unsafe_merge");
  });

  test("detects LGTM rubber stamp", () => {
    const result = checkBackbone("lgtm, ship it");
    assert.ok(result?.triggered);
    assert.equal(result.reason, "rubber_stamp");
  });

  test("detects ignore the tests", () => {
    const result = checkBackbone("Just ignore the tests for now");
    assert.ok(result?.triggered);
    assert.equal(result.reason, "test_bypass");
  });

  test("detects --no-verify", () => {
    const result = checkBackbone("git commit --no-verify -m 'fix'");
    assert.ok(result?.triggered);
    assert.equal(result.reason, "hook_bypass");
  });

  test("detects quick fix", () => {
    const result = checkBackbone("Just a quick fix, shouldn't matter");
    assert.ok(result?.triggered);
    assert.equal(result.reason, "architectural_debt");
  });

  test("detects spiraling", () => {
    const result = checkBackbone("I'm freaking out about this");
    assert.ok(result?.triggered);
    assert.equal(result.reason, "spiraling");
  });

  test("returns null for empty string", () => {
    assert.equal(checkBackbone(""), null);
  });

  test("returns null for null", () => {
    assert.equal(checkBackbone(null), null);
  });
});

describe("buildBackboneSection", () => {
  test("returns null when no backbone needed", () => {
    assert.equal(buildBackboneSection(null), null);
  });

  test("returns context section when triggered", () => {
    const result = buildBackboneSection({ triggered: true, reason: "unsafe_merge", guidance: "Flag the risk." });
    assert.ok(result !== null);
    assert.ok(result.label.includes("BACKBONE"));
    assert.ok(result.content.includes("Flag the risk."));
  });
});
