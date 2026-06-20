"use strict";

/**
 * verify-image-refusal
 *
 * Regression guard for the recurring "The request was rejected because it was
 * considered high risk" leak. When the vision provider declines an inbound image
 * (commonly realistic human-face photos), its refusal must NOT be relayed as the
 * image description or as the companion's visible reply.
 *
 * Covers:
 *  (a) analyzeImageInput throws { contentFiltered:true } on a refusal in output_text
 *  (b) analyzeImageInput throws { contentFiltered:true } on a refusal in response.error
 *  (c) a normal caption (incl. "moderately lit") passes through untouched
 *  (d) enrichInput injects a neutral placeholder (no leak) on a filtered image
 *  (e) callModel.isStandaloneProviderRefusal flags real refusals, not legit prose
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  \u2713", name);
  } catch (error) {
    failed += 1;
    console.log("  \u2717", name, "\u2014", error.message);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log("  \u2713", name);
  } catch (error) {
    failed += 1;
    console.log("  \u2717", name, "\u2014", error.message);
  }
}

function makeClient(response) {
  return { responses: { create: async () => response } };
}

async function main() {
  const { analyzeImageInput } = require("../src/images/analyzeImage");
  const { isStandaloneProviderRefusal } = require("../src/chat/pipeline/callModel");

  console.log("\n1. analyzeImageInput refusal detection");

  await checkAsync("(a) refusal in output_text throws contentFiltered", async () => {
    const client = makeClient({ output_text: "The request was rejected because it was considered high risk" });
    let thrown = null;
    try {
      await analyzeImageInput({ client, config: {}, imageUrl: "x" });
    } catch (error) {
      thrown = error;
    }
    assert(thrown, "expected a throw");
    assert(thrown.contentFiltered === true, "expected contentFiltered=true");
  });

  await checkAsync("(b) refusal in response.error throws contentFiltered", async () => {
    const client = makeClient({ output_text: "", error: { message: "Flagged by the safety system" } });
    let thrown = null;
    try {
      await analyzeImageInput({ client, config: {}, imageUrl: "x" });
    } catch (error) {
      thrown = error;
    }
    assert(thrown, "expected a throw");
    assert(thrown.contentFiltered === true, "expected contentFiltered=true");
  });

  await checkAsync("(c) normal caption passes through (no false positive)", async () => {
    const caption = "A front-facing portrait of a man with short dark hair in a moderately lit room.";
    const client = makeClient({ output_text: caption });
    const result = await analyzeImageInput({ client, config: {}, imageUrl: "x" });
    assert(result === caption, `expected caption returned, got: ${result}`);
  });

  console.log("\n2. enrichInput neutral placeholder");

  await checkAsync("(d) filtered image yields neutral placeholder, no leak", async () => {
    // Patch the llm client module BEFORE requiring enrichInput so its
    // destructured imports pick up the mocks.
    const llm = require("../src/llm/client");
    llm.hasLlmApiKey = (config, capability) => capability === "image";
    llm.getLlmClient = () => makeClient({ output_text: "The request was rejected because it was considered high risk" });
    llm.resolveImageModel = () => "vision-model";

    const { enrichInput } = require("../src/chat/pipeline/enrichInput");
    const logger = { warn() {}, debug() {}, error() {}, info() {} };
    const out = await enrichInput({
      config: {},
      logger,
      input: {
        content: "how does he look now?",
        attachments: [{ kind: "image", name: "face.png", url: "http://x/face.png" }],
        inputTypes: [],
        authorName: "FISH",
      },
    });

    assert(!/high risk|rejected because/i.test(out.content), "refusal text leaked into content");
    assert(out.content.includes("could not be described automatically"), "missing neutral placeholder");
  });

  console.log("\n3. callModel standalone-refusal safety net");

  check("(e) flags known provider refusals", () => {
    assert(isStandaloneProviderRefusal("The request was rejected because it was considered high risk"));
    assert(isStandaloneProviderRefusal("Request rejected because it was flagged as high risk"));
    assert(isStandaloneProviderRefusal("This content was flagged by the safety system"));
  });

  check("(e) does NOT flag legit prose mentioning the phrases", () => {
    assert(!isStandaloneProviderRefusal("Honestly, going off-grid like that sounds like a high risk move, but I get the appeal."));
    assert(!isStandaloneProviderRefusal("I love how moderately lit that room is."));
    assert(!isStandaloneProviderRefusal(""));
  });

  console.log("\n4. stored-context sanitizer (recovers poisoned history/memory)");

  const { sanitizeStoredText, containsProviderRefusalText, SCRUBBED_PLACEHOLDER } = require("../src/chat/pipeline/providerRefusal");

  check("(f) scrubs a stored bare refusal", () => {
    assert.strictEqual(
      sanitizeStoredText("The request was rejected because it was considered high risk"),
      SCRUBBED_PLACEHOLDER,
    );
  });

  check("(f) scrubs a poisoned image-analysis description (wrapped)", () => {
    const wrapped = "[FISH attached an image. Description follows:]\nThe request was rejected because it was considered high risk";
    assert.strictEqual(sanitizeStoredText(wrapped), SCRUBBED_PLACEHOLDER);
  });

  check("(f) scrubs this app's own leaked fallback string", () => {
    assert.strictEqual(sanitizeStoredText("The model provider declined this request."), SCRUBBED_PLACEHOLDER);
  });

  check("(f) leaves ordinary stored text untouched", () => {
    const ok = "FISH: hey, did you see that head I linked earlier?";
    assert.strictEqual(sanitizeStoredText(ok), ok);
    assert.strictEqual(containsProviderRefusalText(ok), false);
    assert.strictEqual(sanitizeStoredText(""), "");
  });

  console.log("\n5. buildChatInput scrubs poisoned history before it reaches the provider");

  const { buildChatInput, formatMemories } = require("../src/chat/pipeline/buildChatInput");

  check("(g) poisoned history turn is not relayed verbatim", () => {
    const messages = buildChatInput({
      input: { content: "Hello?", authorName: "FISH" },
      recentHistory: [
        { role: "assistant", isBot: true, content: "The request was rejected because it was considered high risk" },
        { role: "user", isBot: false, authorName: "FISH", content: "you there?" },
      ],
      includeSpeakerNames: true,
    });
    const flat = JSON.stringify(messages);
    assert(!/considered high risk|request was rejected/i.test(flat), "poisoned history leaked into request");
    assert(flat.includes("you there?"), "legit history was lost");
  });

  check("(g) poisoned memory line is scrubbed", () => {
    const out = formatMemories([
      { memoryType: "anchor", content: "The request was rejected because it was considered high risk" },
      { memoryType: "anchor", content: "FISH likes the EvoX head named Kane." },
    ]);
    assert(!/considered high risk|request was rejected/i.test(out), "poisoned memory leaked");
    assert(out.includes("Kane"), "legit memory was lost");
  });

  console.log("\n" + "=".repeat(40));
  console.log(`  PASSED:  ${passed}`);
  console.log(`  FAILED:  ${failed}`);
  console.log(`  VERDICT: ${failed === 0 ? "\u2705 PASS" : "\u274c FAIL"}`);
  console.log("=".repeat(40));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("verify-image-refusal crashed:", error);
  process.exit(1);
});
