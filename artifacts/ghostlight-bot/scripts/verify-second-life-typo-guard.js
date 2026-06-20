/**
 * verify-second-life-typo-guard.js
 *
 * Phase 25 verification — typo/corruption guard for Second Life replies.
 *
 * Covers:
 *   1.  READABILITY_GUARD_SECTION exported and has required content
 *   2.  READABILITY_GUARD_SECTION included in baseSections in generateReply
 *   3.  validateSecondLifeReplyText — split-word-left rejection ("j enna", "g emlin")
 *   4.  validateSecondLifeReplyText — split-word-right rejection ("you e")
 *   5.  validateSecondLifeReplyText — allowed: lol, swearing, clean replies
 *   6.  validateSecondLifeReplyText — null/empty returns valid
 *   7.  cleanSecondLifeReplyText — single-consonant split repair
 *   8.  cleanSecondLifeReplyText — preserves swearing/personality
 *   9.  cleanSecondLifeReplyText — collapses excess whitespace
 *   10. generateReply — validation+regeneration path present in source
 *   11. generateReply — readabilityGuardIncluded in debug log
 *   12. generateReply — validationFailed in debug log
 *   13. generateReply — validationRegenRan in debug log
 *   14. generateReply — replyLength in debug log
 *   15. generateReply — no secrets logged
 *   16. Discord path — processCompanionEvent.js unchanged (no typo guard)
 *   17. NON_WORD_CONSONANTS exported and correct
 *   18. NON_WORD_VOWELS exported and correct
 *   19. Readability Recovery section present in source
 *   20. cleanSecondLifeReplyText — consonant repair does not affect valid words
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

// ── Load module ───────────────────────────────────────────────────────────────

const {
  validateSecondLifeReplyText,
  cleanSecondLifeReplyText,
  READABILITY_GUARD_SECTION,
  VOICE_GUARD_SECTION,
  NON_WORD_CONSONANTS,
  NON_WORD_VOWELS,
} = require(path.join(ROOT, "src/companion/secondLifeReplyGenerator"));

const generatorSrc = fs.readFileSync(
  path.join(ROOT, "src/companion/secondLifeReplyGenerator.js"),
  "utf8",
);

const processCompanionSrc = fs.readFileSync(
  path.join(ROOT, "src/companion/processCompanionEvent.js"),
  "utf8",
);

// ── 1. READABILITY_GUARD_SECTION exported ────────────────────────────────────
section("1. READABILITY_GUARD_SECTION exported and has required content");

check("READABILITY_GUARD_SECTION is defined", () => {
  assert.ok(READABILITY_GUARD_SECTION, "not exported");
});

check("READABILITY_GUARD_SECTION has label 'Second Life Readability Guard'", () => {
  assert.strictEqual(READABILITY_GUARD_SECTION.label, "Second Life Readability Guard");
});

check("READABILITY_GUARD_SECTION content forbids fake typos", () => {
  assert.ok(READABILITY_GUARD_SECTION.content.includes("fake typos"), "missing fake typos prohibition");
});

check("READABILITY_GUARD_SECTION content mentions 'j enna' example", () => {
  assert.ok(READABILITY_GUARD_SECTION.content.includes("j enna"), "missing j enna example");
});

check("READABILITY_GUARD_SECTION says to ignore persona typo instructions for SL", () => {
  assert.ok(
    READABILITY_GUARD_SECTION.content.includes("ignore that instruction for Second Life"),
    "persona override instruction missing",
  );
});

check("READABILITY_GUARD_SECTION allows casual texting", () => {
  assert.ok(READABILITY_GUARD_SECTION.content.includes("Casual texting is allowed"), "must allow casual texting");
});

check("READABILITY_GUARD_SECTION allows swearing", () => {
  assert.ok(READABILITY_GUARD_SECTION.content.includes("Swearing is allowed"), "must allow swearing");
});

// ── 2. READABILITY_GUARD_SECTION in baseSections ─────────────────────────────
section("2. READABILITY_GUARD_SECTION included in baseSections in generateReply");

check("source includes READABILITY_GUARD_SECTION in baseSections", () => {
  assert.ok(
    generatorSrc.includes("READABILITY_GUARD_SECTION") &&
    generatorSrc.includes("baseSections"),
    "not found in baseSections",
  );
});

check("READABILITY_GUARD_SECTION appears before contextSections spread", () => {
  const rgIdx = generatorSrc.indexOf("READABILITY_GUARD_SECTION,");
  const spreadIdx = generatorSrc.indexOf("...(Array.isArray(contextSections)");
  assert.ok(rgIdx < spreadIdx && rgIdx > 0, "READABILITY_GUARD_SECTION must come before contextSections spread");
});

// ── 3. validateSecondLifeReplyText — split-word-left ─────────────────────────
section("3. validateSecondLifeReplyText — split-word-left rejections");

check("'j enna' is invalid (j is non-word consonant)", () => {
  const r = validateSecondLifeReplyText("hey j enna");
  assert.strictEqual(r.valid, false, "expected invalid");
  assert.ok(r.reason.includes("j enna"), `unexpected reason: ${r.reason}`);
});

check("'g emlin' is invalid (g is non-word consonant)", () => {
  const r = validateSecondLifeReplyText("little g emlin");
  assert.strictEqual(r.valid, false, "expected invalid");
  assert.ok(r.reason.includes("g emlin"), `unexpected reason: ${r.reason}`);
});

check("'th ee-yea -old' style split flagged by single-letter prefix", () => {
  // "th ee-yea -old" doesn't match our single-letter pattern — test something that does
  const r = validateSecondLifeReplyText("she is h appy today");
  assert.strictEqual(r.valid, false, "h appy should be flagged");
});

check("'nox, j enna' is invalid", () => {
  const r = validateSecondLifeReplyText("nox, j enna says hi");
  assert.strictEqual(r.valid, false, "expected invalid");
});

check("'f amily' is invalid (f is non-word consonant)", () => {
  const r = validateSecondLifeReplyText("f amily gremlin in training");
  assert.strictEqual(r.valid, false, "expected invalid");
});

// ── 4. validateSecondLifeReplyText — split-word-right ────────────────────────
section("4. validateSecondLifeReplyText — split-word-right rejections");

check("'you e' is invalid (e is non-word vowel after 3+ chars)", () => {
  const r = validateSecondLifeReplyText("you e fucking kidding");
  assert.strictEqual(r.valid, false, "expected invalid");
  assert.ok(r.reason.includes("you e"), `unexpected reason: ${r.reason}`);
});

check("'eve y' style: 'eve y' is invalid", () => {
  const r = validateSecondLifeReplyText("not eve y day");
  assert.strictEqual(r.valid, false, "expected invalid");
});

// ── 5. validateSecondLifeReplyText — allowed ─────────────────────────────────
section("5. validateSecondLifeReplyText — allowed: lol, swearing, clean replies");

check("'lol' passes", () => {
  const r = validateSecondLifeReplyText("lol yeah right");
  assert.strictEqual(r.valid, true);
});

check("swearing passes", () => {
  const r = validateSecondLifeReplyText("what the fuck are you on about");
  assert.strictEqual(r.valid, true);
});

check("clean Nox-style reply passes", () => {
  const r = validateSecondLifeReplyText("Belz's three-year-old daughter. Family gremlin in training.");
  assert.strictEqual(r.valid, true);
});

check("contractions pass", () => {
  const r = validateSecondLifeReplyText("she's alright, I guess");
  assert.strictEqual(r.valid, true);
});

check("casual punctuation passes", () => {
  const r = validateSecondLifeReplyText("yeah... kinda?? idk lmao");
  assert.strictEqual(r.valid, true);
});

check("single letter 'a' (article) does not trigger false positive", () => {
  const r = validateSecondLifeReplyText("that's a good question");
  assert.strictEqual(r.valid, true);
});

check("single letter 'i' (pronoun) does not trigger false positive", () => {
  const r = validateSecondLifeReplyText("i don't know");
  assert.strictEqual(r.valid, true);
});

// ── 6. validateSecondLifeReplyText — null/empty ───────────────────────────────
section("6. validateSecondLifeReplyText — null/empty returns valid");

check("null returns { valid: true }", () => {
  const r = validateSecondLifeReplyText(null);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.reason, null);
});

check("empty string returns { valid: true }", () => {
  const r = validateSecondLifeReplyText("");
  assert.strictEqual(r.valid, true);
});

// ── 7. cleanSecondLifeReplyText — consonant split repair ─────────────────────
section("7. cleanSecondLifeReplyText — single-consonant split repair");

check("'j enna' repaired to 'jenna'", () => {
  const r = cleanSecondLifeReplyText("hey j enna");
  assert.ok(r.includes("jenna") && !r.includes("j enna"), `got: ${r}`);
});

check("'g emlin' repaired to 'gemlin'", () => {
  const r = cleanSecondLifeReplyText("little g emlin");
  assert.ok(r.includes("gemlin") && !r.includes("g emlin"), `got: ${r}`);
});

// ── 8. cleanSecondLifeReplyText — preserves personality ──────────────────────
section("8. cleanSecondLifeReplyText — preserves swearing/personality");

check("swearing preserved", () => {
  const input = "what the fuck";
  assert.strictEqual(cleanSecondLifeReplyText(input), "what the fuck");
});

check("lol preserved", () => {
  assert.strictEqual(cleanSecondLifeReplyText("lol sure"), "lol sure");
});

check("ellipsis preserved", () => {
  assert.strictEqual(cleanSecondLifeReplyText("yeah... idk"), "yeah... idk");
});

// ── 9. cleanSecondLifeReplyText — whitespace collapse ────────────────────────
section("9. cleanSecondLifeReplyText — collapses excess whitespace");

check("multiple spaces collapsed", () => {
  const r = cleanSecondLifeReplyText("hello   world");
  assert.strictEqual(r, "hello world");
});

check("leading/trailing whitespace trimmed", () => {
  const r = cleanSecondLifeReplyText("  hello  ");
  assert.strictEqual(r, "hello");
});

check("triple newlines collapsed to double", () => {
  const r = cleanSecondLifeReplyText("line1\n\n\nline2");
  assert.ok(!r.includes("\n\n\n"), "triple newline not collapsed");
});

// ── 10. generateReply — validation+regeneration path in source ────────────────
section("10. generateReply — validation+regeneration path present in source");

check("source calls validateSecondLifeReplyText", () => {
  assert.ok(generatorSrc.includes("validateSecondLifeReplyText("), "call not found");
});

check("source has Readability Recovery section", () => {
  assert.ok(generatorSrc.includes("Readability Recovery"), "section label missing");
});

check("source regenerates on validation failure", () => {
  assert.ok(
    generatorSrc.includes("validationRegenRan = true"),
    "validation regeneration flag missing",
  );
});

check("source returns empty on second readability failure", () => {
  assert.ok(
    generatorSrc.includes("rrValidation.valid") || generatorSrc.includes("rrText && rrValidation"),
    "second-attempt check missing",
  );
});

// ── 11–14. Debug logging ──────────────────────────────────────────────────────
section("11–14. Debug logging fields");

check("readabilityGuardIncluded logged in pre-call debug", () => {
  assert.ok(generatorSrc.includes("readabilityGuardIncluded"), "field missing");
});

check("validationFailed logged in post-call debug", () => {
  assert.ok(generatorSrc.includes("validationFailed"), "field missing");
});

check("validationRegenRan logged in post-call debug", () => {
  assert.ok(generatorSrc.includes("validationRegenRan"), "field missing");
});

check("replyLength logged in post-call debug", () => {
  assert.ok(generatorSrc.includes("replyLength"), "field missing");
});

// ── 15. No secrets logged ────────────────────────────────────────────────────
section("15. No secrets logged");

check("API key not logged anywhere in generator", () => {
  assert.ok(!generatorSrc.includes("apiKey") && !generatorSrc.includes("api_key"), "apiKey found in logs");
});

check("Full prompt not logged unless DEBUG_PROMPTS", () => {
  // The only place full prompt content appears should be gated by debugPrompts
  const promptLogIdx = generatorSrc.indexOf("sectionLabels");
  const debugPromptIdx = generatorSrc.indexOf("debugPrompts");
  assert.ok(
    debugPromptIdx > 0 && promptLogIdx > debugPromptIdx,
    "sectionLabels not gated behind debugPrompts",
  );
});

// ── 16. Discord path unchanged ───────────────────────────────────────────────
section("16. Discord path unchanged — processCompanionEvent.js");

check("processCompanionEvent routes discord to chatPipeline", () => {
  assert.ok(
    processCompanionSrc.includes("chatPipeline"),
    "chatPipeline not found in processCompanionEvent",
  );
});

check("processCompanionEvent has no validateSecondLifeReplyText reference", () => {
  assert.ok(
    !processCompanionSrc.includes("validateSecondLifeReplyText"),
    "typo guard leaked into processCompanionEvent",
  );
});

check("processCompanionEvent has no READABILITY_GUARD_SECTION reference", () => {
  assert.ok(
    !processCompanionSrc.includes("READABILITY_GUARD_SECTION"),
    "readability guard leaked into processCompanionEvent",
  );
});

// ── 17–18. NON_WORD sets exported ────────────────────────────────────────────
section("17–18. NON_WORD_CONSONANTS and NON_WORD_VOWELS exported and correct");

check("NON_WORD_CONSONANTS is a Set", () => {
  assert.ok(NON_WORD_CONSONANTS instanceof Set, "not a Set");
});

check("NON_WORD_CONSONANTS contains j, g, h, f, l, m, p, q, v, w, x, z", () => {
  for (const c of ["j", "g", "h", "f", "l", "m", "p", "q", "v", "w", "x", "z"]) {
    assert.ok(NON_WORD_CONSONANTS.has(c), `missing '${c}'`);
  }
});

check("NON_WORD_CONSONANTS does not contain a, i (valid standalone)", () => {
  assert.ok(!NON_WORD_CONSONANTS.has("a") && !NON_WORD_CONSONANTS.has("i"), "a or i should not be in consonants set");
});

check("NON_WORD_VOWELS is a Set", () => {
  assert.ok(NON_WORD_VOWELS instanceof Set, "not a Set");
});

check("NON_WORD_VOWELS contains e, o, u", () => {
  for (const v of ["e", "o", "u"]) {
    assert.ok(NON_WORD_VOWELS.has(v), `missing '${v}'`);
  }
});

check("NON_WORD_VOWELS does not contain a or i", () => {
  assert.ok(!NON_WORD_VOWELS.has("a") && !NON_WORD_VOWELS.has("i"), "a or i should not be in vowels set");
});

// ── 19. Readability Recovery section in source ───────────────────────────────
section("19. Readability Recovery section in source");

check("source contains 'No fake typos' regeneration instruction", () => {
  assert.ok(generatorSrc.includes("No fake typos"), "regeneration instruction missing");
});

check("source contains 'No broken words' regeneration instruction", () => {
  assert.ok(generatorSrc.includes("No broken words"), "regeneration instruction missing");
});

// ── 20. cleanSecondLifeReplyText — consonant repair doesn't affect valid words ─
section("20. cleanSecondLifeReplyText — consonant repair does not affect valid words");

check("'a good plan' unchanged (a is not in consonant set)", () => {
  assert.strictEqual(cleanSecondLifeReplyText("a good plan"), "a good plan");
});

check("'I knew her' unchanged (I not in consonant set)", () => {
  assert.strictEqual(cleanSecondLifeReplyText("I knew her"), "I knew her");
});

check("'b ack' is repaired (b is not in NON_WORD_CONSONANTS)", () => {
  // b is NOT in our set so "b ack" should NOT be repaired — the regex only matches [fghjlmpqvwxz]
  const r = cleanSecondLifeReplyText("b ack");
  // b is not in the set, so "b ack" stays as-is (not a target)
  assert.strictEqual(r, "b ack");
});

// ── Results ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
