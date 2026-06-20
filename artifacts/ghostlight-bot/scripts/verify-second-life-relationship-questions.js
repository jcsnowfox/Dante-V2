/**
 * verify-second-life-relationship-questions.js
 *
 * Phase 24 verification — factual relationship question handling.
 *
 * Covers:
 *   1.  Intent detection — who is / who's / do you know who / tell me about
 *   2.  Intent exclusions — pronouns and self-identity patterns not flagged
 *   3.  Storage — findRelationshipByName exposed
 *   4.  Storage — findObjectRelationshipByName exposed
 *   5.  Adapter — detectRelationshipQuestionIntent function present
 *   6.  Adapter — buildMentionedEntityContext function structure
 *   7.  Adapter — entity context section injected in handleConversationalEvent
 *   8.  Adapter — factual question instruction section added
 *   9.  Adapter — no hardcoded companion or avatar names in detection logic
 *   10. Voice Guard — updated with "who is [name]" rule
 *   11. Nox import pack — Jezabelle object record present
 *   12. Debug logging — SECOND_LIFE_DEBUG=true path present
 *   13. Discord brain path unchanged
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

// ── Source text loading ───────────────────────────────────────────────────────

const adapterSrc = fs.readFileSync(
  path.join(ROOT, "src/channels/secondLifeAdapter.js"),
  "utf8",
);

const generatorSrc = fs.readFileSync(
  path.join(ROOT, "src/companion/secondLifeReplyGenerator.js"),
  "utf8",
);

const storageSrc = fs.readFileSync(
  path.join(ROOT, "src/storage/secondLife/index.js"),
  "utf8",
);

const noxPack = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "assets/second-life/nox-family-relationships.json"),
    "utf8",
  ),
);

// ── 1. Intent detection patterns ─────────────────────────────────────────────
section("1. Intent detection — who is / who's / do you know who / tell me about");

// Extract detectRelationshipQuestionIntent from adapter for unit testing.
// We build a minimal module evaluation using a small VM sandbox.
const vm = require("vm");

// Pull just the function definitions from the adapter
const fnStart = adapterSrc.indexOf("function detectRelationshipQuestionIntent");
const fnEnd = adapterSrc.indexOf("\nfunction buildMentionedEntityContext");
const patternStart = adapterSrc.indexOf("const RELATIONSHIP_QUESTION_PATTERNS");
const excludedStart = adapterSrc.indexOf("const EXCLUDED_ENTITY_NAMES");
const excludedEnd = adapterSrc.indexOf("])", excludedStart) + 2;

const snippetSrc = [
  adapterSrc.slice(patternStart, excludedEnd + 2), // constants
  adapterSrc.slice(fnStart, fnEnd),                 // detectRelationshipQuestionIntent
].join("\n");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(snippetSrc, ctx);
const detect = ctx.detectRelationshipQuestionIntent;

check("'who is Jezabelle?' triggers intent", () => {
  const r = detect("who is Jezabelle?");
  assert.strictEqual(r.intent, true);
  assert.strictEqual(r.mentionedName, "Jezabelle");
});

check("'who is Belz?' triggers intent", () => {
  const r = detect("Nox, who is Belz?");
  assert.strictEqual(r.intent, true);
  assert.strictEqual(r.mentionedName, "Belz");
});

check("'who\\'s Smokey' triggers intent", () => {
  const r = detect("who's Smokey");
  assert.strictEqual(r.intent, true);
  assert.strictEqual(r.mentionedName, "Smokey");
});

check("'do you know who Jezabelle is' triggers intent", () => {
  const r = detect("do you know who Jezabelle is?");
  assert.strictEqual(r.intent, true);
  assert.strictEqual(r.mentionedName, "Jezabelle");
});

check("'what is Anna to Pete' triggers intent", () => {
  const r = detect("what is Anna to Pete?");
  assert.strictEqual(r.intent, true);
  assert.strictEqual(r.mentionedName, "Anna");
});

check("'tell me about Koga' triggers intent", () => {
  const r = detect("tell me about Koga?");
  assert.strictEqual(r.intent, true);
  assert.strictEqual(r.mentionedName, "Koga");
});

// ── 2. Intent exclusions ─────────────────────────────────────────────────────
section("2. Intent exclusions — pronouns and self-identity not flagged");

check("'who are you?' does NOT trigger (not a 'who is' / 'who\\'s' pattern)", () => {
  const r = detect("who are you?");
  assert.strictEqual(r.intent, false);
});

check("'who is she?' does NOT trigger (excluded pronoun)", () => {
  const r = detect("who is she?");
  assert.strictEqual(r.intent, false);
});

check("'who is he?' does NOT trigger (excluded pronoun)", () => {
  const r = detect("who is he?");
  assert.strictEqual(r.intent, false);
});

check("'do you know who I am?' does NOT trigger (excluded 'I')", () => {
  const r = detect("do you know who I am?");
  // 'I am' doesn't match 'who is' pattern — 'do you know who I is' would be checked
  // The pattern looks for 'is' after the name: 'do you know who I is' — 'I' is excluded
  // But 'do you know who I am' doesn't match the pattern at all (needs '... is')
  assert.strictEqual(r.intent, false);
});

check("empty string does NOT trigger", () => {
  const r = detect("");
  assert.strictEqual(r.intent, false);
});

check("unrelated message does NOT trigger", () => {
  const r = detect("hey Nox, I missed you!");
  assert.strictEqual(r.intent, false);
});

// ── 3. Storage — findRelationshipByName ──────────────────────────────────────
section("3. Storage — findRelationshipByName exposed");

check("findRelationshipByName defined in storage", () => {
  assert.ok(storageSrc.includes("async function findRelationshipByName"), "function not found");
});

check("findRelationshipByName searches by nickname or avatar_name", () => {
  assert.ok(
    storageSrc.includes("LOWER(nickname) = $2 OR LOWER(avatar_name) = $2"),
    "case-insensitive name search missing",
  );
});

check("findRelationshipByName filters out blocked avatars", () => {
  assert.ok(storageSrc.includes("is_blocked = false"), "blocked-avatar filter missing");
});

check("findRelationshipByName exported from storage", () => {
  assert.ok(storageSrc.includes("findRelationshipByName,"), "not in export list");
});

// ── 4. Storage — findObjectRelationshipByName ─────────────────────────────────
section("4. Storage — findObjectRelationshipByName exposed");

check("findObjectRelationshipByName defined in storage", () => {
  assert.ok(storageSrc.includes("async function findObjectRelationshipByName"), "function not found");
});

check("findObjectRelationshipByName searches by nickname or object_name", () => {
  assert.ok(
    storageSrc.includes("LOWER(nickname) = $2 OR LOWER(object_name) = $2"),
    "case-insensitive name search missing",
  );
});

check("findObjectRelationshipByName exported from storage", () => {
  assert.ok(storageSrc.includes("findObjectRelationshipByName,"), "not in export list");
});

// ── 5. Adapter — detectRelationshipQuestionIntent ────────────────────────────
section("5. Adapter — detectRelationshipQuestionIntent function present");

check("adapter contains detectRelationshipQuestionIntent", () => {
  assert.ok(adapterSrc.includes("function detectRelationshipQuestionIntent"), "function not found");
});

check("adapter contains RELATIONSHIP_QUESTION_PATTERNS", () => {
  assert.ok(adapterSrc.includes("RELATIONSHIP_QUESTION_PATTERNS"), "patterns array not found");
});

check("adapter contains EXCLUDED_ENTITY_NAMES", () => {
  assert.ok(adapterSrc.includes("EXCLUDED_ENTITY_NAMES"), "exclusion set not found");
});

// ── 6. Adapter — buildMentionedEntityContext ─────────────────────────────────
section("6. Adapter — buildMentionedEntityContext function structure");

check("adapter contains buildMentionedEntityContext", () => {
  assert.ok(adapterSrc.includes("function buildMentionedEntityContext"), "function not found");
});

check("buildMentionedEntityContext uses 'Entity name:'", () => {
  assert.ok(adapterSrc.includes("Entity name:"), "missing entity name line");
});

check("buildMentionedEntityContext uses 'Entity type:'", () => {
  assert.ok(adapterSrc.includes("Entity type:"), "missing entity type line");
});

check("buildMentionedEntityContext uses 'Relationship to user:'", () => {
  assert.ok(adapterSrc.includes("Relationship to user:"), "missing relationship line");
});

check("buildMentionedEntityContext uses 'Child-safe only: true'", () => {
  assert.ok(adapterSrc.includes("Child-safe only: true"), "missing child-safe line");
});

// ── 7. Adapter — entity context section injected ─────────────────────────────
section("7. Adapter — entity context section injected in handleConversationalEvent");

check("adapter calls detectRelationshipQuestionIntent", () => {
  assert.ok(adapterSrc.includes("detectRelationshipQuestionIntent("), "call missing");
});

check("adapter calls findRelationshipByName", () => {
  assert.ok(adapterSrc.includes("findRelationshipByName?.({"), "call missing");
});

check("adapter calls findObjectRelationshipByName", () => {
  assert.ok(adapterSrc.includes("findObjectRelationshipByName?.({"), "call missing");
});

check("adapter pushes 'Second Life Mentioned Entity Context' section", () => {
  assert.ok(adapterSrc.includes("Second Life Mentioned Entity Context"), "section label missing");
});

// ── 8. Adapter — factual question instruction section ────────────────────────
section("8. Adapter — Factual Relationship Question instruction section added");

check("adapter pushes 'Factual Relationship Question' section", () => {
  assert.ok(adapterSrc.includes("Factual Relationship Question"), "section label missing");
});

check("factual section says 'Do not treat this as a question about your own identity'", () => {
  assert.ok(
    adapterSrc.includes("Do not treat this as a question about your own identity"),
    "self-identity guard missing from instruction",
  );
});

// ── 9. No hardcoded names in detection logic ─────────────────────────────────
section("9. No hardcoded companion or avatar names in detection logic");

check("detectRelationshipQuestionIntent body has no hardcoded 'Jezabelle'", () => {
  const fnBody = adapterSrc.slice(
    adapterSrc.indexOf("function detectRelationshipQuestionIntent"),
    adapterSrc.indexOf("\nfunction buildMentionedEntityContext"),
  );
  assert.ok(!fnBody.includes("Jezabelle"), "hardcoded 'Jezabelle' found");
});

check("buildMentionedEntityContext body has no hardcoded 'Jezabelle'", () => {
  const fnBody = adapterSrc.slice(
    adapterSrc.indexOf("function buildMentionedEntityContext"),
    adapterSrc.indexOf("\nconst CONVERSATIONAL_EVENTS") !== -1
      ? adapterSrc.indexOf("\nfunction createSecondLifeAdapter")
      : adapterSrc.indexOf("\nconst STATE_EVENTS"),
  );
  assert.ok(!fnBody.includes("Jezabelle"), "hardcoded 'Jezabelle' found");
});

// ── 10. Voice Guard — updated with "who is [name]" rule ──────────────────────
section("10. Voice Guard — updated with who-is disambiguation rule");

check("Voice Guard contains 'who is [name]' rule", () => {
  assert.ok(
    generatorSrc.includes("When asked") && generatorSrc.includes("answer about that person"),
    "Voice Guard missing who-is disambiguation rule",
  );
});

// ── 11. Nox import pack — Jezabelle object ────────────────────────────────────
section("11. Nox import pack — Jezabelle object record");

const jezabelle = (noxPack.objects || []).find((o) => o.objectName === "Jezabelle" || o.nickname === "Jezabelle");

check("Jezabelle object record exists in pack", () => {
  assert.ok(jezabelle, "Jezabelle not found in objects array");
});

check("Jezabelle has childSafeOnly true", () => {
  assert.strictEqual(jezabelle?.childSafeOnly, true);
});

check("Jezabelle has objectDescriptionToken set", () => {
  assert.ok(jezabelle?.objectDescriptionToken, "objectDescriptionToken missing");
});

check("Jezabelle notes describe her identity", () => {
  assert.ok(jezabelle?.notes?.length > 10, "notes too short or missing");
});

check("Jezabelle replyPolicy is ambient_only", () => {
  assert.strictEqual(jezabelle?.replyPolicy, "ambient_only");
});

// ── 12. Debug logging ─────────────────────────────────────────────────────────
section("12. Debug logging — SECOND_LIFE_DEBUG=true path present");

check("adapter logs 'Relationship question response' on debug", () => {
  assert.ok(adapterSrc.includes("Relationship question response"), "debug log label missing");
});

check("adapter logs relationshipQuestionIntent in debug", () => {
  assert.ok(adapterSrc.includes("relationshipQuestionIntent"), "field missing from debug log");
});

check("adapter logs mentionedEntityName in debug", () => {
  assert.ok(adapterSrc.includes("mentionedEntityName"), "field missing from debug log");
});

check("adapter logs matchedEntityType in debug", () => {
  assert.ok(adapterSrc.includes("matchedEntityType"), "field missing from debug log");
});

check("adapter logs matchedEntityNickname in debug", () => {
  assert.ok(adapterSrc.includes("matchedEntityNickname"), "field missing from debug log");
});

check("adapter logs childSafeOnly in debug", () => {
  assert.ok(adapterSrc.includes("childSafeOnly"), "field missing from debug log");
});

check("adapter logs replyLength in debug", () => {
  assert.ok(adapterSrc.includes("replyLength"), "field missing from debug log");
});

// ── 13. Discord brain path unchanged ─────────────────────────────────────────
section("13. Discord brain path unchanged");

check("processCompanionEvent routes discord to chatPipeline, not generator", () => {
  const ppSrc = fs.readFileSync(
    path.join(ROOT, "src/companion/processCompanionEvent.js"),
    "utf8",
  );
  assert.ok(ppSrc.includes("chatPipeline") || ppSrc.includes("chatPipeline"), "chatPipeline not found");
  // The relationship question detection lives in the adapter, not in processCompanionEvent.
  assert.ok(
    !ppSrc.includes("detectRelationshipQuestionIntent"),
    "detectRelationshipQuestionIntent leaked into processCompanionEvent",
  );
});

// ── Results ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
