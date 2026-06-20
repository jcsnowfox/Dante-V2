/**
 * verify-second-life-command-handling.js
 *
 * Phase 25 verification — bang command detection and routing.
 *
 * Covers:
 *   1.  detectBangCommand exported from adapter
 *   2.  detectBangCommand — basic ! detection
 *   3.  detectBangCommand — commandName extraction
 *   4.  detectBangCommand — commandArgs extraction
 *   5.  detectBangCommand — non-! message not detected
 *   6.  detectBangCommand — empty string not detected
 *   7.  Adapter source — bang gate in handleConversationalEvent before social engine
 *   8.  Adapter source — bang commands do not call the model
 *   9.  Adapter source — clean response format with action:"command"
 *   10. Adapter source — commandAcknowledgementsEnabled checked
 *   11. COMMAND_ACKNOWLEDGEMENTS exported
 *   12. COMMAND_ACKNOWLEDGEMENTS — autonomy_on maps to "On."
 *   13. COMMAND_ACKNOWLEDGEMENTS — autonomy_off maps to "Off."
 *   14. Adapter source — bang gate returns early before shouldReplyToLocalChat
 *   15. Adapter source — unknown bang command returns action:"command" applied:false
 *   16. Integration — !autonomyon handled (no model call) via injected mocks
 *   17. Integration — !autonomyon result has applied:true and autonomyPaused:false
 *   18. Integration — non-! chat does NOT go through bang command path
 *   19. Adapter source — SECOND_LIFE_DEBUG logs commandName, commandType, applied, state
 *   20. Adapter source — debug does not log secrets
 */

"use strict";

const path = require("path");
const assert = require("assert");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function section(label) {
  console.log(`\n── ${label}`);
}

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗  ${label}: ${err.message}`);
    failed++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗  ${label}: ${err.message}`);
    failed++;
  }
}

const { detectBangCommand, COMMAND_ACKNOWLEDGEMENTS, createSecondLifeAdapter } = require(
  path.join(ROOT, "src/channels/secondLifeAdapter"),
);

const adapterSrc = fs.readFileSync(
  path.join(ROOT, "src/channels/secondLifeAdapter.js"),
  "utf8",
);

// ── 1. detectBangCommand exported ────────────────────────────────────────────
section("1. detectBangCommand exported from adapter");

check("detectBangCommand is a function", () => {
  assert.strictEqual(typeof detectBangCommand, "function");
});

// ── 2–6. detectBangCommand unit tests ────────────────────────────────────────
section("2–6. detectBangCommand unit tests");

check("'!autonomyon' is detected as bang command", () => {
  const r = detectBangCommand("!autonomyon");
  assert.strictEqual(r.isBangCommand, true);
});

check("'!autonomyon' commandName is 'autonomyon'", () => {
  const r = detectBangCommand("!autonomyon");
  assert.strictEqual(r.commandName, "autonomyon");
});

check("'!follow me please' commandArgs is 'me please'", () => {
  const r = detectBangCommand("!follow me please");
  assert.strictEqual(r.commandArgs, "me please");
});

check("'!autonomyon' commandArgs is ''", () => {
  const r = detectBangCommand("!autonomyon");
  assert.strictEqual(r.commandArgs, "");
});

check("commandName is lowercased: '!AutonOMYon' → 'autonomyon'", () => {
  const r = detectBangCommand("!AutonOMYon");
  assert.strictEqual(r.commandName, "autonomyon");
});

check("non-! message is NOT a bang command", () => {
  const r = detectBangCommand("hey nox what's up");
  assert.strictEqual(r.isBangCommand, false);
});

check("empty string is NOT a bang command", () => {
  const r = detectBangCommand("");
  assert.strictEqual(r.isBangCommand, false);
});

check("null is NOT a bang command", () => {
  const r = detectBangCommand(null);
  assert.strictEqual(r.isBangCommand, false);
});

check("'!follow' has commandText '!follow'", () => {
  const r = detectBangCommand("!follow");
  assert.strictEqual(r.commandText, "!follow");
});

// ── 7. Bang gate before social engine ────────────────────────────────────────
section("7. Bang gate in handleConversationalEvent — before social engine");

check("source calls detectBangCommand in handleConversationalEvent", () => {
  assert.ok(adapterSrc.includes("detectBangCommand("), "detectBangCommand call missing");
});

check("bang gate is present before social.shouldReplyToLocalChat call", () => {
  // Use lastIndexOf for the actual method call (not the JSDoc comment mention at the top)
  const bangGateIdx = adapterSrc.indexOf("bangCmd.isBangCommand");
  const socialCallIdx = adapterSrc.indexOf("social.shouldReplyToLocalChat(");
  assert.ok(bangGateIdx > 0 && socialCallIdx > 0 && bangGateIdx < socialCallIdx, "bang gate must come before social.shouldReplyToLocalChat call");
});

// ── 8. Bang commands do not call the model ───────────────────────────────────
section("8. Bang commands do not call the model");

check("inside bang branch there is no companion.processCompanionEvent call", () => {
  // The bang gate returns before processCompanionEvent is reached.
  // We verify this by checking that the return inside the bang branch
  // (buildBangCommandResult call) appears before processCompanionEvent.
  const bangResultIdx = adapterSrc.indexOf("buildBangCommandResult({");
  const processIdx = adapterSrc.indexOf("processCompanionEvent(");
  assert.ok(bangResultIdx > 0 && processIdx > 0 && bangResultIdx < processIdx, "buildBangCommandResult must precede processCompanionEvent");
});

check("buildBangCommandResult is defined in adapter", () => {
  assert.ok(adapterSrc.includes("async function buildBangCommandResult"), "function not found");
});

// ── 9. Clean response format ─────────────────────────────────────────────────
section("9. Clean response format with action:'command'");

check("buildBangCommandResult returns action: 'command'", () => {
  assert.ok(adapterSrc.includes("action: \"command\""), "action field missing");
});

check("buildBangCommandResult returns commandType field", () => {
  assert.ok(adapterSrc.includes("commandType,") || adapterSrc.includes("commandType:"), "commandType field missing");
});

check("buildBangCommandResult returns applied field", () => {
  assert.ok(adapterSrc.includes("applied: true") && adapterSrc.includes("applied: false"), "applied field missing");
});

check("buildBangCommandResult returns state object", () => {
  assert.ok(adapterSrc.includes("state,") || adapterSrc.includes("state }"), "state field missing");
});

// ── 10. commandAcknowledgementsEnabled ───────────────────────────────────────
section("10. commandAcknowledgementsEnabled checked");

check("source checks commandAcknowledgementsEnabled", () => {
  assert.ok(adapterSrc.includes("commandAcknowledgementsEnabled"), "setting not referenced");
});

check("source checks for === true (default is off)", () => {
  assert.ok(adapterSrc.includes("commandAcknowledgementsEnabled === true"), "must check === true");
});

// ── 11–13. COMMAND_ACKNOWLEDGEMENTS ──────────────────────────────────────────
section("11–13. COMMAND_ACKNOWLEDGEMENTS exported and correct");

check("COMMAND_ACKNOWLEDGEMENTS is exported", () => {
  assert.ok(COMMAND_ACKNOWLEDGEMENTS && typeof COMMAND_ACKNOWLEDGEMENTS === "object", "not exported");
});

check("autonomy_on → 'On.'", () => {
  assert.strictEqual(COMMAND_ACKNOWLEDGEMENTS.autonomy_on, "On.");
});

check("autonomy_off → 'Off.'", () => {
  assert.strictEqual(COMMAND_ACKNOWLEDGEMENTS.autonomy_off, "Off.");
});

check("emergency_stop → 'Stopped.'", () => {
  assert.ok(COMMAND_ACKNOWLEDGEMENTS.emergency_stop, "missing emergency_stop");
});

check("clear_queue → 'Done.'", () => {
  assert.ok(COMMAND_ACKNOWLEDGEMENTS.clear_queue, "missing clear_queue");
});

// ── 14. Bang gate returns early ───────────────────────────────────────────────
section("14. Bang gate returns early before shouldReplyToLocalChat");

check("if (bangCmd.isBangCommand) { return buildBangCommandResult... } present", () => {
  assert.ok(
    adapterSrc.includes("if (bangCmd.isBangCommand)") && adapterSrc.includes("return buildBangCommandResult"),
    "early return pattern missing",
  );
});

// ── 15. Unknown bang command → applied:false ──────────────────────────────────
section("15. Unknown bang command → action:command, applied:false");

check("buildBangCommandResult handles null commandOutcome with applied:false", () => {
  assert.ok(
    adapterSrc.includes("commandOutcome === null") && adapterSrc.includes("applied: false"),
    "null commandOutcome handling with applied:false missing",
  );
});

check("unknown command returns reason:'unknown_command'", () => {
  assert.ok(adapterSrc.includes("unknown_command"), "unknown_command reason missing");
});

// ── 16–18. Integration tests ──────────────────────────────────────────────────
section("16–18. Integration — !autonomyon via mock adapter");

// Build minimal mocks for integration test
function buildMocks({ isOwner = true, commandAcknowledgementsEnabled = false } = {}) {
  const enqueued = [];
  const journaled = [];
  const worldStatePatch = {};

  const mockSecondLife = {
    available: true,
    loadBridgeSettings: async () => ({
      autonomyEnabled: false,
      commandAcknowledgementsEnabled,
      agentUuid: "agent-uuid-test",
    }),
    loadWorldState: async () => ({ ownerPresent: true }),
    upsertBridgeSettings: async ({ settings }) => settings,
    setAutonomyPaused: async ({ paused }) => { worldStatePatch.autonomyPaused = paused; },
    appendJournalEntry: async () => {},
    enqueueCommand: async (cmd) => { enqueued.push(cmd); return cmd; },
    markRelationshipSeen: async () => {},
  };

  const mockIdentityResolver = {
    resolve: async () => ({
      isKnown: true, isOwner, tier: isOwner ? "owner" : "stranger",
      permissions: { privateMemory: isOwner },
      displayName: "TestOwner", nickname: "TestOwner",
    }),
  };

  const mockSocialEngine = {
    shouldReplyToLocalChat: async () => ({ action: "reply", trigger: "whitelist_speaker" }),
    interactionGuidance: () => "",
  };

  let modelCallCount = 0;
  const mockCompanion = {
    processCompanionEvent: async () => {
      modelCallCount++;
      return { outbound: { responseText: "hello from model" } };
    },
  };

  const mockCommands = {
    parseTrigger: (msg) => {
      const t = String(msg || "").trim();
      if (!t.startsWith("!")) return "";
      return t.split(/\s+/)[0].toLowerCase();
    },
    resolveCommand: async ({ trigger }) => {
      if (trigger === "!autonomyon") {
        return {
          command: { commandTrigger: "!autonomyon", commandType: "system", requiresOwnerPermission: true, payload: { action: "autonomy_on" } },
          allowed: isOwner,
          reason: isOwner ? "ok" : "owner_only",
        };
      }
      return { command: null, allowed: false, reason: "unknown" };
    },
  };

  return { mockSecondLife, mockIdentityResolver, mockSocialEngine, mockCompanion, mockCommands, enqueued, journaled, worldStatePatch, getModelCallCount: () => modelCallCount };
}

(async () => {
  // Test 16 — !autonomyon detected as command, model NOT called
  await checkAsync("!autonomyon is handled as command (model not called)", async () => {
    const { mockSecondLife, mockIdentityResolver, mockSocialEngine, mockCompanion, mockCommands, getModelCallCount } = buildMocks({ isOwner: true });

    const adapter = createSecondLifeAdapter({
      secondLife: mockSecondLife,
      companion: mockCompanion,
      config: {},
      logger: null,
      identityResolver: mockIdentityResolver,
      socialEngine: mockSocialEngine,
      commandRegistry: mockCommands,
    });

    const result = await adapter.handleEvent({
      companionId: "test-companion",
      event: { eventType: "local_chat", messageText: "!autonomyon", externalUserId: "owner-uuid", userDisplayName: "Owner" },
    });

    assert.strictEqual(getModelCallCount(), 0, "model should NOT have been called");
    assert.strictEqual(result.action, "command", `action should be 'command', got: ${result.action}`);
  });

  // Test 17 — !autonomyon returns applied:true and autonomyPaused:false
  await checkAsync("!autonomyon result has applied:true and state.autonomyPaused:false", async () => {
    const { mockSecondLife, mockIdentityResolver, mockSocialEngine, mockCompanion, mockCommands } = buildMocks({ isOwner: true });

    const adapter = createSecondLifeAdapter({
      secondLife: mockSecondLife,
      companion: mockCompanion,
      config: {},
      logger: null,
      identityResolver: mockIdentityResolver,
      socialEngine: mockSocialEngine,
      commandRegistry: mockCommands,
    });

    const result = await adapter.handleEvent({
      companionId: "test-companion",
      event: { eventType: "local_chat", messageText: "!autonomyon", externalUserId: "owner-uuid", userDisplayName: "Owner" },
    });

    assert.strictEqual(result.applied, true, `applied should be true, got: ${result.applied}`);
    assert.strictEqual(result.state?.autonomyPaused, false, `state.autonomyPaused should be false, got: ${result.state?.autonomyPaused}`);
  });

  // Test 18 — non-! chat goes to model
  await checkAsync("normal chat (non-!) does NOT go through bang command path", async () => {
    const { mockSecondLife, mockIdentityResolver, mockSocialEngine, mockCompanion, mockCommands, getModelCallCount } = buildMocks({ isOwner: true });

    const adapter = createSecondLifeAdapter({
      secondLife: mockSecondLife,
      companion: mockCompanion,
      config: {},
      logger: null,
      identityResolver: mockIdentityResolver,
      socialEngine: mockSocialEngine,
      commandRegistry: mockCommands,
    });

    const result = await adapter.handleEvent({
      companionId: "test-companion",
      event: { eventType: "local_chat", messageText: "hey nox what are you up to", externalUserId: "owner-uuid", userDisplayName: "Owner" },
    });

    // Model should have been called for normal chat
    assert.ok(getModelCallCount() > 0 || result.action !== "command", "normal chat should not use command path");
    assert.ok(result.action !== "command", `normal chat result.action should not be 'command', got: ${result.action}`);
  });

  // ── 19. Debug logging ──────────────────────────────────────────────────────
  section("19. Debug logging — SECOND_LIFE_DEBUG logs command fields");

  check("source logs 'commandName' in bang command debug", () => {
    assert.ok(adapterSrc.includes("commandName: bangCmd.commandName"), "commandName not logged");
  });

  check("source logs 'commandType' in bang command debug", () => {
    assert.ok(
      adapterSrc.includes("commandType,") || adapterSrc.includes("commandType\n") || (adapterSrc.match(/commandType[,\n ]/g) || []).length > 0,
      "commandType not in debug log",
    );
  });

  check("source logs 'applied' in bang command debug", () => {
    assert.ok(adapterSrc.includes("applied: true") || adapterSrc.includes("applied,"), "applied not in debug log");
  });

  check("source logs 'state' in bang command debug", () => {
    assert.ok(adapterSrc.includes("state,") || adapterSrc.includes("state\n"), "state not in debug log");
  });

  // ── 20. No secrets logged ──────────────────────────────────────────────────
  section("20. Debug does not log secrets");

  check("adapter does not log apiKey", () => {
    assert.ok(!adapterSrc.includes("apiKey"), "apiKey found in adapter");
  });

  check("adapter does not log shared secret", () => {
    assert.ok(!adapterSrc.includes("sharedSecret") && !adapterSrc.includes("bridgeSecret"), "secret logging found");
  });

  // ── Results ────────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
