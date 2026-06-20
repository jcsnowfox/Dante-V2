#!/usr/bin/env node
"use strict";

/**
 * verify-continuity.js
 * Usage: node scripts/verify-continuity.js
 */

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${label}: ${err.message}`);
    failed++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${label}: ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "assertion failed");
}

async function main() {
  console.log("\n=== Continuity & Open Loops Engine — Verification ===\n");

  // --- Types ---
  console.log("1. Types");
  const {
    ITEM_TYPES, ALL_ITEM_TYPES, ITEM_STATUSES, ALL_STATUSES,
    PROMISE_STATUSES, PRIORITY_LEVELS, CERTAINTY_LEVELS,
    SENSITIVE_TYPES, PRIVATE_ONLY_TYPES, PRELUDE_PRIORITY,
    FORBIDDEN_FOLLOW_UP_PHRASES,
  } = require("../src/continuity/continuityTypes");

  check("ITEM_TYPES has 18 types", () => assert(Object.keys(ITEM_TYPES).length === 18, `got ${Object.keys(ITEM_TYPES).length}`));
  check("ALL_ITEM_TYPES is array of strings", () => assert(ALL_ITEM_TYPES.every((t) => typeof t === "string")));
  check("ITEM_STATUSES has 9 statuses", () => assert(Object.keys(ITEM_STATUSES).length === 9, `got ${Object.keys(ITEM_STATUSES).length}`));
  check("PROMISE_STATUSES has 9 statuses", () => assert(Object.keys(PROMISE_STATUSES).length === 9));
  check("SENSITIVE_TYPES is a Set", () => assert(SENSITIVE_TYPES instanceof Set));
  check("PRIVATE_ONLY_TYPES is a Set", () => assert(PRIVATE_ONLY_TYPES instanceof Set));
  check("PRIVATE_ONLY_TYPES is subset of ALL_ITEM_TYPES", () => {
    for (const t of PRIVATE_ONLY_TYPES) assert(ALL_ITEM_TYPES.includes(t), `${t} not in ALL_ITEM_TYPES`);
  });
  check("PRELUDE_PRIORITY covers all 18 types", () => {
    for (const t of ALL_ITEM_TYPES) assert(PRELUDE_PRIORITY[t] !== undefined, `${t} missing from PRELUDE_PRIORITY`);
  });
  check("FORBIDDEN_FOLLOW_UP_PHRASES non-empty", () => assert(FORBIDDEN_FOLLOW_UP_PHRASES.length > 0));
  check("PRIORITY_LEVELS has expected values", () => {
    ["critical", "high", "medium", "low", "background"].forEach((p) =>
      assert(Object.values(PRIORITY_LEVELS).includes(p), `missing ${p}`));
  });

  // --- Config ---
  console.log("\n2. Config");
  const { loadContinuityConfig, isQuietHours, BOOLEAN_FLAGS, NUMERIC_FIELDS, STRING_FIELDS } =
    require("../src/continuity/continuityConfig");

  check("loadContinuityConfig returns defaults when empty", () => {
    const c = loadContinuityConfig({});
    assert(c.continuity_enabled === true);
    assert(c.max_active_prelude_items === 4);
  });
  check("loadContinuityConfig normalises bool from string", () => {
    const c = loadContinuityConfig({ proactive_followups_enabled: "true" });
    assert(c.proactive_followups_enabled === true);
  });
  check("loadContinuityConfig clamps numeric fields", () => {
    const c = loadContinuityConfig({ max_active_prelude_items: 9999 });
    assert(c.max_active_prelude_items === 12, `expected 12, got ${c.max_active_prelude_items}`);
  });
  check("isQuietHours returns false when disabled", () => {
    const c = loadContinuityConfig({ quiet_hours_enabled: false });
    assert(!isQuietHours(c));
  });
  check("BOOLEAN_FLAGS non-empty array", () => assert(Array.isArray(BOOLEAN_FLAGS) && BOOLEAN_FLAGS.length > 0));
  check("NUMERIC_FIELDS has max_active_prelude_items", () => assert(NUMERIC_FIELDS.max_active_prelude_items !== undefined));
  check("STRING_FIELDS has quiet hours fields", () => {
    assert(STRING_FIELDS.includes("quiet_hours_start"));
    assert(STRING_FIELDS.includes("quiet_hours_end"));
  });

  const config = loadContinuityConfig({});

  // --- Safety ---
  console.log("\n3. Safety");
  const { canDeliverProactively, canAppearInPrelude, auditFollowUpText, isAllowedInChannel } =
    require("../src/continuity/continuitySafety");

  check("canDeliverProactively: blocked when engine disabled", () => {
    const c = loadContinuityConfig({ continuity_enabled: false });
    const r = canDeliverProactively({ item: { type: "open_loop", sensitivity: "normal" }, config: c });
    assert(!r.allowed && r.reason === "engine_disabled");
  });
  check("canDeliverProactively: blocked when proactive=false", () => {
    const c = loadContinuityConfig({ proactive_followups_enabled: false });
    const r = canDeliverProactively({ item: { type: "open_loop", sensitivity: "normal" }, config: c });
    assert(!r.allowed && r.reason === "proactive_disabled");
  });
  check("canDeliverProactively: sensitive type blocked without permission", () => {
    const c = loadContinuityConfig({ proactive_followups_enabled: true, sensitive_followups_allowed: false });
    const r = canDeliverProactively({ item: { type: "health_context", sensitivity: "sensitive" }, config: c });
    assert(!r.allowed && r.reason === "sensitive_type_blocked");
  });
  check("canDeliverProactively: public channel blocked without permission", () => {
    const c = loadContinuityConfig({ proactive_followups_enabled: true, public_channel_followups_allowed: false });
    const r = canDeliverProactively({ item: { type: "open_loop", sensitivity: "normal" }, config: c, channelContext: { isPublic: true } });
    assert(!r.allowed && r.reason === "public_channel_blocked");
  });
  check("canDeliverProactively: private-only type in public channel blocked", () => {
    const c = loadContinuityConfig({ proactive_followups_enabled: true, public_channel_followups_allowed: true });
    const r = canDeliverProactively({ item: { type: "promise", sensitivity: "normal" }, config: c, channelContext: { isPublic: true } });
    assert(!r.allowed && r.reason === "private_type_public_channel");
  });
  check("canAppearInPrelude: cancelled excluded", () =>
    assert(!canAppearInPrelude({ item: { type: "open_loop", status: "cancelled", sensitivity: "normal" }, config })));
  check("canAppearInPrelude: restricted sensitivity excluded", () =>
    assert(!canAppearInPrelude({ item: { type: "open_loop", status: "open", sensitivity: "restricted" }, config })));
  check("auditFollowUpText: catches 'you promised'", () => {
    const r = auditFollowUpText("You promised me you would do this.");
    assert(!r.safe && r.violations.includes("you promised"));
  });
  check("auditFollowUpText: passes clean text", () => {
    const r = auditFollowUpText("How did the camping trip go?");
    assert(r.safe, `violations: ${r.violations.join(", ")}`);
  });
  check("auditFollowUpText: catches 'reminder:'", () => {
    const r = auditFollowUpText("Reminder: you said you'd upload it.");
    assert(!r.safe);
  });
  check("isAllowedInChannel: empty list = always allowed", () =>
    assert(isAllowedInChannel({ item: { allowedChannels: [] }, channelId: "ch1" })));
  check("isAllowedInChannel: channel in list = allowed", () =>
    assert(isAllowedInChannel({ item: { allowedChannels: ["ch1"] }, channelId: "ch1" })));
  check("isAllowedInChannel: channel not in list = blocked", () =>
    assert(!isAllowedInChannel({ item: { allowedChannels: ["ch1"] }, channelId: "ch2" })));

  // --- Selector ---
  console.log("\n4. Selector");
  const { selectContinuityPrelude } = require("../src/continuity/continuitySelector");

  check("selectContinuityPrelude: empty items → empty", () => {
    const r = selectContinuityPrelude({ items: [], config });
    assert(Array.isArray(r) && r.length === 0);
  });
  check("selectContinuityPrelude: respects max_active_prelude_items", () => {
    const c = loadContinuityConfig({ max_active_prelude_items: 2 });
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: i, type: "open_loop", status: "open", priority: "medium",
      emotionalWeight: 0, certainty: "definite", sensitivity: "normal",
      createdAt: new Date().toISOString(),
    }));
    const r = selectContinuityPrelude({ items, config: c });
    assert(r.length <= 2, `expected ≤2, got ${r.length}`);
  });
  check("selectContinuityPrelude: disabled → empty", () => {
    const c = loadContinuityConfig({ continuity_enabled: false });
    const r = selectContinuityPrelude({ items: [{ id: 1, type: "open_loop", status: "open", sensitivity: "normal" }], config: c });
    assert(r.length === 0);
  });
  check("selectContinuityPrelude: repair_thread scores above open_loop", () => {
    const now = new Date().toISOString();
    const items = [
      { id: 1, type: "open_loop", status: "open", priority: "high", emotionalWeight: 0, certainty: "definite", sensitivity: "normal", createdAt: now },
      { id: 2, type: "repair_thread", status: "open", priority: "medium", emotionalWeight: 0.8, certainty: "definite", sensitivity: "sensitive", createdAt: now },
    ];
    const r = selectContinuityPrelude({ items, config });
    assert(r[0].type === "repair_thread", `expected repair_thread first, got ${r[0].type}`);
  });

  // --- Prelude ---
  console.log("\n5. Prelude Builder");
  const { buildContinuityPrelude, itemToLine } = require("../src/continuity/continuityPrelude");
  const fakeLogger = { debug: () => {}, warn: () => {}, info: () => {} };

  check("buildContinuityPrelude: null with no items", () => assert(buildContinuityPrelude({ items: [], config }) === null));
  check("buildContinuityPrelude: null when engine disabled", () => {
    const c = loadContinuityConfig({ continuity_enabled: false });
    const items = [{ id: 1, type: "open_loop", status: "open", summary: "test", sensitivity: "normal" }];
    assert(buildContinuityPrelude({ items, config: c }) === null);
  });
  check("buildContinuityPrelude: returns label + content", () => {
    const now = new Date().toISOString();
    const items = [{ id: 1, type: "open_loop", status: "open", summary: "Fix auth", title: "Auth", sensitivity: "normal", priority: "medium", certainty: "definite", emotionalWeight: 0, createdAt: now }];
    const r = buildContinuityPrelude({ items, config, logger: fakeLogger });
    assert(r !== null && r.label === "Continuity" && typeof r.content === "string" && r.content.length > 0);
  });
  check("itemToLine: open_loop → 'Active thread:'", () => {
    const line = itemToLine({ type: "open_loop", summary: "Auth bug", title: "auth" });
    assert(line && line.includes("Active thread:"), `got: ${line}`);
  });
  check("itemToLine: repair_thread → 'Repair thread open:'", () => {
    const line = itemToLine({ type: "repair_thread", summary: "Friction" });
    assert(line && line.includes("Repair thread open:"), `got: ${line}`);
  });
  check("itemToLine: boundary → 'Boundary note:'", () => {
    const line = itemToLine({ type: "boundary", summary: "Don't ask" });
    assert(line && line.includes("Boundary note:"), `got: ${line}`);
  });
  check("buildContinuityPrelude: content has private-note disclaimer", () => {
    const now = new Date().toISOString();
    const items = [{ id: 1, type: "open_loop", status: "open", summary: "Fix auth", title: "Auth", sensitivity: "normal", priority: "medium", certainty: "definite", emotionalWeight: 0, createdAt: now }];
    const r = buildContinuityPrelude({ items, config, logger: fakeLogger });
    assert(r.content.includes("private context notes"), `missing disclaimer`);
  });

  // --- Future Event Extractor ---
  console.log("\n6. Future Event Extractor");
  const { detectCertainty, detectEventTopic, extractFollowUpDate } = require("../src/continuity/futureEventExtractor");

  check("detectCertainty: 'I'm going camping on Friday' → definite", () => {
    assert(detectCertainty("I'm going camping on Friday") === "definite");
  });
  check("detectCertainty: 'maybe camping' → maybe", () => {
    assert(detectCertainty("maybe camping this weekend") === "maybe");
  });
  check("detectCertainty: 'someday I'll go' → vague", () => {
    assert(detectCertainty("someday I'll go camping") === "vague");
  });
  check("detectEventTopic: 'camping' → travel", () => {
    const t = detectEventTopic("going camping this weekend");
    assert(t && t.topic === "travel", `got: ${t?.topic}`);
  });
  check("detectEventTopic: 'dentist' → appointment", () => {
    const t = detectEventTopic("I have the dentist tomorrow");
    assert(t && t.topic === "appointment", `got: ${t?.topic}`);
  });
  check("extractFollowUpDate: 'tomorrow' → future Date", () => {
    const d = extractFollowUpDate("going to the dentist tomorrow");
    assert(d instanceof Date && d > new Date());
  });
  check("extractFollowUpDate: 'this weekend' → future Date", () => {
    const d = extractFollowUpDate("camping this weekend");
    assert(d instanceof Date && d > new Date());
  });

  // --- Promise Ledger ---
  console.log("\n7. Promise Ledger");
  const { detectCompanionPromise, detectOwnerPromise } = require("../src/continuity/promiseLedger");

  check("detectCompanionPromise: 'I'll ask you Monday' → true", () => assert(detectCompanionPromise("I'll ask you on Monday")));
  check("detectCompanionPromise: 'How are you?' → false", () => assert(!detectCompanionPromise("How are you today?")));
  check("detectOwnerPromise: 'I'll upload it tonight' → true", () => assert(detectOwnerPromise("I'll upload it tonight")));
  check("detectOwnerPromise: 'I promise to send' → true", () => assert(detectOwnerPromise("I promise to send it")));
  check("detectOwnerPromise: 'What do you think?' → false", () => assert(!detectOwnerPromise("What do you think?")));

  // --- Decision Ledger ---
  console.log("\n8. Decision Ledger");
  const { detectDecision, detectReversal } = require("../src/continuity/decisionLedger");

  check("detectDecision: 'We decided to use GETIMG' → true", () => assert(detectDecision("We decided to use GETIMG")));
  check("detectDecision: 'What time is it?' → false", () => assert(!detectDecision("What time is it?")));
  check("detectReversal: 'actually changed my mind' → true", () => assert(detectReversal("Actually I changed my mind on this")));

  // --- Follow-up Composer ---
  console.log("\n9. Follow-up Composer");
  const { composeFollowUp, composePromiseRepair, composeOwnerPromiseNudge, composeAbsenceReentry } =
    require("../src/continuity/followUpComposer");

  check("composeFollowUp: camping safe", () => {
    const item = { type: "future_event", metadata: { event_topic: "travel" }, title: "camping trip", summary: "camping" };
    const text = composeFollowUp({ item, config });
    const { safe, violations } = auditFollowUpText(text);
    assert(safe, `violations: ${violations.join(", ")}`);
  });
  check("composeFollowUp: appointment safe", () => {
    const item = { type: "future_event", metadata: { event_topic: "appointment" }, title: "dentist" };
    const text = composeFollowUp({ item, config });
    assert(auditFollowUpText(text).safe, `text: ${text}`);
  });
  check("composePromiseRepair: safe + no blame", () => {
    const promise = { metadata: { promise_text: "follow up on the camping trip" }, title: "camping" };
    const text = composePromiseRepair({ promise });
    assert(auditFollowUpText(text).safe, `text: ${text}`);
    assert(!/you promised/i.test(text) && !/where were you/i.test(text));
  });
  check("composeOwnerPromiseNudge: no 'you promised'", () => {
    const promise = { metadata: { promise_text: "upload the repo" } };
    const text = composeOwnerPromiseNudge({ promise });
    assert(!/you promised/i.test(text), `text: ${text}`);
  });
  check("composeAbsenceReentry: no 'where were you'", () => {
    const text = composeAbsenceReentry({ item: { summary: "engine" }, lastContext: "the continuity engine" });
    assert(!/where were you/i.test(text) && !/you disappeared/i.test(text));
  });

  // --- Repair ---
  console.log("\n10. Repair Continuity");
  const { detectRepairSignal } = require("../src/continuity/repairContinuity");

  check("detectRepairSignal: 'that wasn't what I asked' → true", () => assert(detectRepairSignal("that wasn't what I asked")));
  check("detectRepairSignal: 'I'm frustrated with you' → true", () => assert(detectRepairSignal("I'm frustrated with you")));
  check("detectRepairSignal: 'I love this' → false", () => assert(!detectRepairSignal("I love this response!")));

  // --- Boundary ---
  console.log("\n11. Boundary");
  const { detectBoundarySignal } = require("../src/continuity/boundaryContinuity");

  check("detectBoundarySignal: 'please don't ask about that' → true", () => assert(detectBoundarySignal("please don't ask about that")));
  check("detectBoundarySignal: 'that's off limits' → true", () => assert(detectBoundarySignal("that's off limits")));
  check("detectBoundarySignal: 'I love camping' → false", () => assert(!detectBoundarySignal("I love camping")));

  // --- Absence Re-entry ---
  console.log("\n12. Absence Re-entry");
  const { isLikelyReentry, REENTRY_THRESHOLD_MS } = require("../src/continuity/absenceReentry");

  check("REENTRY_THRESHOLD_MS is 4h", () => assert(REENTRY_THRESHOLD_MS === 4 * 60 * 60 * 1000));
  check("isLikelyReentry: 6h gap → true", () => {
    assert(isLikelyReentry({ lastMessageAt: new Date(Date.now() - 6 * 60 * 60 * 1000) }));
  });
  check("isLikelyReentry: 1h gap → false", () => {
    assert(!isLikelyReentry({ lastMessageAt: new Date(Date.now() - 60 * 60 * 1000) }));
  });
  check("isLikelyReentry: null → false", () => assert(!isLikelyReentry({ lastMessageAt: null })));

  // --- Emotional Residue ---
  console.log("\n13. Emotional Residue");
  const { detectEmotionalResidue } = require("../src/continuity/emotionalResidue");

  check("detectEmotionalResidue: 'I'm exhausted' → depleted", () => {
    const r = detectEmotionalResidue("I'm exhausted");
    assert(r && r.tone === "depleted", `got: ${r?.tone}`);
  });
  check("detectEmotionalResidue: 'great day!' → positive", () => {
    const r = detectEmotionalResidue("I had such a great day!");
    assert(r && r.tone === "positive", `got: ${r?.tone}`);
  });
  check("detectEmotionalResidue: 'Hello.' → null", () => {
    assert(detectEmotionalResidue("Hello.") === null);
  });

  // --- Trust Ledger ---
  console.log("\n14. Trust Ledger");
  const { detectTrustPositive, detectTrustNegative } = require("../src/continuity/trustLedger");

  check("detectTrustPositive: 'that's exactly right' → true", () => assert(detectTrustPositive("That's exactly right!")));
  check("detectTrustNegative: 'wrong again' → true", () => assert(detectTrustNegative("wrong again")));
  check("detectTrustPositive: 'wrong answer' → false", () => assert(!detectTrustPositive("wrong answer")));

  // --- Open Loop closeLoopIfOutcomeFound ---
  console.log("\n15. Open Loop Registry");
  const { closeLoopIfOutcomeFound } = require("../src/continuity/openLoopRegistry");

  await checkAsync("closeLoopIfOutcomeFound: returns 0 with empty store", async () => {
    const fakeStore = { list: async () => [] };
    const n = await closeLoopIfOutcomeFound({ store: fakeStore, message: "done with it", logger: null });
    assert(n === 0);
  });

  // --- Storage noop ---
  console.log("\n16. Storage noop (no DATABASE_URL)");
  const { createContinuityStore: createRawStore } = require("../src/storage/continuity");

  await checkAsync("createContinuityStore noop: available=false, no throw", async () => {
    const fakeConfig = { database: { url: null } };
    const fakeLog = { warn: () => {}, info: () => {}, debug: () => {} };
    const store = createRawStore({ config: fakeConfig, logger: fakeLog });
    assert(store.available === false);
    await store.init();
    const items = await store.listItems({ companionId: "c", ownerId: "o" });
    assert(Array.isArray(items) && items.length === 0);
  });

  // --- Engine noop ---
  console.log("\n17. Engine (noop mode — no DB)");
  const { createContinuityEngine } = require("../src/continuity/continuityEngine");

  await checkAsync("createContinuityEngine: boots without DB", async () => {
    const fakeConfig = { database: { url: null }, memory: { userScope: "test_user", companionId: "test_companion" } };
    const fakeLog = { warn: () => {}, info: () => {}, debug: () => {}, error: () => {} };
    const engine = createContinuityEngine({ config: fakeConfig, logger: fakeLog });
    assert(engine && typeof engine.init === "function" && typeof engine.processMessage === "function");
    assert(engine.store.available === false);
    await engine.init();
  });

  await checkAsync("createContinuityEngine.processMessage: returns null prelude without DB", async () => {
    const fakeConfig = { database: { url: null }, memory: { userScope: "test_user" } };
    const fakeLog = { warn: () => {}, info: () => {}, debug: () => {}, error: () => {} };
    const engine = createContinuityEngine({ config: fakeConfig, logger: fakeLog });
    await engine.init();
    const result = await engine.processMessage({ message: "Hello", sourceMessageId: "m1", sourceChannelId: "c1" });
    assert(result && "preludeSection" in result);
    assert(result.preludeSection === null, `expected null prelude, got: ${JSON.stringify(result.preludeSection)}`);
  });

  // --- Admin modules ---
  console.log("\n18. Admin modules loadable");
  check("continuityPage.js loads", () => {
    const { renderContinuityPage } = require("../src/http/renderAdminPages/continuityPage");
    assert(typeof renderContinuityPage === "function");
  });
  check("continuityPageHandler.js loads", () => {
    const { handleContinuityPageRequest } = require("../src/http/adminPageHandlers/continuityPageHandler");
    assert(typeof handleContinuityPageRequest === "function");
  });
  check("continuityActions.js loads", () => {
    const { handleContinuityActions } = require("../src/http/actions/continuityActions");
    assert(typeof handleContinuityActions === "function");
  });

  // --- Scheduler ---
  console.log("\n19. Scheduler");
  const { createContinuityScheduler } = require("../src/continuity/continuityScheduler");

  check("createContinuityScheduler: returns start/stop/tick", () => {
    const fakeStore = { listDueFollowUps: async () => [], countTodayFollowUps: async () => 0 };
    const fakeLog = { warn: () => {}, info: () => {}, debug: () => {} };
    const sched = createContinuityScheduler({ store: fakeStore, config: loadContinuityConfig({}), deliverFn: null, logger: fakeLog });
    assert(typeof sched.start === "function" && typeof sched.stop === "function" && typeof sched.tick === "function");
  });

  await checkAsync("scheduler.tick: skips when proactive disabled", async () => {
    const fakeStore = { listDueFollowUps: async () => [], countTodayFollowUps: async () => 0 };
    const fakeLog = { warn: () => {}, info: () => {}, debug: () => {} };
    const c = loadContinuityConfig({ continuity_enabled: true, proactive_followups_enabled: false });
    const sched = createContinuityScheduler({ store: fakeStore, config: c, deliverFn: null, logger: fakeLog });
    await sched.tick();
  });

  // --- Summary ---
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Continuity Engine — ${passed} passed, ${failed} failed`);
  console.log("─".repeat(50));
  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("\n✓ All checks passed — Continuity Engine is healthy.\n");
  }
}

main().catch((err) => {
  console.error("\nFatal error in verify-continuity:", err);
  process.exitCode = 1;
});
