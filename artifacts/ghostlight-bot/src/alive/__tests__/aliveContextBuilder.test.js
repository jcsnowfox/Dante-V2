const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildAliveContextPrelude, scoreToLabel } = require("../aliveContextBuilder");

describe("buildAliveContextPrelude", () => {
  const basePresence = {
    presenceState: "restless",
    energy: "low",
    mood: "subdued",
    spaceState: { room: "study", activity: "writing", music: "lo-fi", lighting: "warm" },
    missingScore: 0.6,
    affectionScore: 0.7,
    overloadScore: 0.2,
    conversationTemperature: 0.4,
    repairNeeded: false,
    repairType: null,
    unresolvedTension: false,
    giveSpace: false,
    lastInteractionAt: null,
  };

  test("returns null for null input", () => {
    const result = buildAliveContextPrelude(null);
    assert.equal(result, null);
  });

  test("builds context with presence and energy", () => {
    const result = buildAliveContextPrelude(basePresence);
    assert.ok(result !== null);
    assert.ok(result.content.includes("restless"));
    assert.ok(result.content.includes("low"));
  });

  test("includes repair guidance when repair is needed", () => {
    const presence = { ...basePresence, repairNeeded: true, repairType: "cold_shoulder" };
    const result = buildAliveContextPrelude(presence);
    assert.ok(result.content.includes("Repair needed"));
    assert.ok(result.content.includes("cold_shoulder"));
  });

  test("includes give space guidance when active", () => {
    const presence = { ...basePresence, giveSpace: true };
    const result = buildAliveContextPrelude(presence);
    assert.ok(result.content.includes("Give space"));
  });

  test("includes space description", () => {
    const result = buildAliveContextPrelude(basePresence);
    assert.ok(result.content.includes("study"));
    assert.ok(result.content.includes("writing"));
  });

  test("includes pending intention type", () => {
    const result = buildAliveContextPrelude(basePresence, {
      pendingIntention: { intentionType: "repair_bridge", reason: "cold_shoulder" },
    });
    assert.ok(result.content.includes("repair_bridge"));
  });

  test("includes silent preferences from memories", () => {
    const memories = [{ text: "She prefers directness over sugarcoating" }];
    const result = buildAliveContextPrelude(basePresence, { memories });
    assert.ok(result.content.includes("prefers directness"));
  });

  test("label includes private marker", () => {
    const result = buildAliveContextPrelude(basePresence);
    assert.ok(result.label.includes("private"));
  });
});

describe("scoreToLabel", () => {
  test("returns correct labels", () => {
    assert.equal(scoreToLabel(0.9), "high");
    assert.equal(scoreToLabel(0.6), "moderate");
    assert.equal(scoreToLabel(0.3), "low");
    assert.equal(scoreToLabel(0.1), "none");
  });
});
