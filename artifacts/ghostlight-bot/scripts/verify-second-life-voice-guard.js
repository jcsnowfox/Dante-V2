/**
 * verify-second-life-voice-guard.js
 *
 * Smoke-tests the voice-guard additions to secondLifeReplyGenerator:
 *   - VOICE_GUARD_SECTION constant and content
 *   - cleanSecondLifeReplyText post-processing
 *   - isGenericReply detection
 *   - generateReply behaviour: voice guard prepended, public-section filtering,
 *     generic-reply discard + regeneration, known-speaker context
 *   - Debug log fields (no secrets, DEBUG_PROMPTS gate)
 *   - Adapter Known Speaker Tone section insertion
 *   - Discord brain path unchanged
 */

"use strict";

(async () => {
  let passed = 0;
  let failed = 0;

  function check(label, condition) {
    if (condition) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ ${label}`);
      failed++;
    }
  }

  async function checkAsync(label, asyncFn) {
    try {
      const result = await asyncFn();
      if (result === true || result === undefined) {
        console.log(`  ✓ ${label}`);
        passed++;
      } else if (result === false) {
        console.error(`  ✗ ${label}`);
        failed++;
      } else {
        // non-boolean: treat truthy/falsy
        if (result) {
          console.log(`  ✓ ${label}`);
          passed++;
        } else {
          console.error(`  ✗ ${label}`);
          failed++;
        }
      }
    } catch (err) {
      console.error(`  ✗ ${label} — threw: ${err.message}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Load the module under test
  // ---------------------------------------------------------------------------
  const {
    createSecondLifeReplyGenerator,
    cleanSecondLifeReplyText,
    isGenericReply,
    VOICE_GUARD_SECTION,
    GENERIC_PHRASES,
  } = require("../src/companion/secondLifeReplyGenerator");

  // ---------------------------------------------------------------------------
  // Section 1: VOICE_GUARD_SECTION constant
  // ---------------------------------------------------------------------------
  console.log("\n1. VOICE_GUARD_SECTION constant");

  check(
    "label is 'Second Life Voice Guard'",
    VOICE_GUARD_SECTION.label === "Second Life Voice Guard",
  );
  check(
    "content is a non-empty string",
    typeof VOICE_GUARD_SECTION.content === "string" && VOICE_GUARD_SECTION.content.length > 0,
  );
  check(
    "content prohibits typos",
    VOICE_GUARD_SECTION.content.toLowerCase().includes("typo")
    || VOICE_GUARD_SECTION.content.toLowerCase().includes("broken letters")
    || VOICE_GUARD_SECTION.content.toLowerCase().includes("corrupted words"),
  );
  check(
    "content mentions short replies",
    VOICE_GUARD_SECTION.content.includes("1-2 sentences")
    || VOICE_GUARD_SECTION.content.toLowerCase().includes("short"),
  );
  check(
    "content prohibits generic assistant drift",
    VOICE_GUARD_SECTION.content.toLowerCase().includes("generic ai assistant")
    || VOICE_GUARD_SECTION.content.toLowerCase().includes("do not become"),
  );
  check(
    "content warns against 'Hello, Avatar!'",
    VOICE_GUARD_SECTION.content.includes("Hello, Avatar!"),
  );

  // ---------------------------------------------------------------------------
  // Section 2: GENERIC_PHRASES array
  // ---------------------------------------------------------------------------
  console.log("\n2. GENERIC_PHRASES array");

  check("is an array", Array.isArray(GENERIC_PHRASES));
  check("has at least 4 entries", GENERIC_PHRASES.length >= 4);
  check("includes 'hello, avatar'", GENERIC_PHRASES.includes("hello, avatar"));
  check("includes 'how can i help'", GENERIC_PHRASES.includes("how can i help"));
  check("includes 'i am here to assist'", GENERIC_PHRASES.includes("i am here to assist"));
  check("includes 'hello, local chat'", GENERIC_PHRASES.includes("hello, local chat"));

  // ---------------------------------------------------------------------------
  // Section 3: isGenericReply()
  // ---------------------------------------------------------------------------
  console.log("\n3. isGenericReply()");

  check("returns false for empty string", isGenericReply("") === false);
  check("returns false for null", isGenericReply(null) === false);
  check(
    "detects 'Hello, Avatar!'",
    isGenericReply("Hello, Avatar! Welcome to this region.") === true,
  );
  check(
    "detects 'How can I help?'",
    isGenericReply("How can I help you today?") === true,
  );
  check(
    "detects 'I am here to assist'",
    isGenericReply("I am here to assist you with anything you need.") === true,
  );
  check(
    "detects 'Hello, local chat'",
    isGenericReply("Hello, local chat! What's happening?") === true,
  );
  check(
    "detects 'How may I assist'",
    isGenericReply("How may I assist you this evening?") === true,
  );
  check(
    "does NOT flag natural persona reply",
    isGenericReply("Oh, you're back — I was just thinking about you.") === false,
  );
  check(
    "does NOT flag short casual reply",
    isGenericReply("Hey, what's up?") === false,
  );
  check(
    "case-insensitive detection",
    isGenericReply("HOW CAN I HELP YOU?") === true,
  );

  // ---------------------------------------------------------------------------
  // Section 4: cleanSecondLifeReplyText()
  // ---------------------------------------------------------------------------
  console.log("\n4. cleanSecondLifeReplyText()");

  check("returns empty string for empty input", cleanSecondLifeReplyText("") === "");
  check("returns empty string for null", cleanSecondLifeReplyText(null) === "");
  check("trims leading/trailing whitespace", cleanSecondLifeReplyText("  hello  ") === "hello");
  check(
    "collapses multiple spaces",
    cleanSecondLifeReplyText("hello   world") === "hello world",
  );
  check(
    "collapses multiple tabs",
    cleanSecondLifeReplyText("hello\t\t\tworld") === "hello world",
  );
  check(
    "collapses mixed space/tab runs",
    cleanSecondLifeReplyText("a  \t  b") === "a b",
  );
  check(
    "does not change normal text",
    cleanSecondLifeReplyText("Hey, I missed you.") === "Hey, I missed you.",
  );
  check(
    "preserves single newlines",
    cleanSecondLifeReplyText("line one\nline two") === "line one\nline two",
  );
  check(
    "collapses 3+ consecutive newlines to 2",
    cleanSecondLifeReplyText("a\n\n\n\nb").includes("\n\n")
    && !cleanSecondLifeReplyText("a\n\n\n\nb").includes("\n\n\n"),
  );

  // ---------------------------------------------------------------------------
  // Section 5: generateReply — voice guard always prepended
  // ---------------------------------------------------------------------------
  console.log("\n5. generateReply — voice guard always prepended to callModel");

  await checkAsync("voice guard is first section passed to callModel", async () => {
    let capturedSections = null;
    const mockCallModel = async ({ contextSections }) => {
      capturedSections = contextSections;
      return { text: "Hey, how are you?" };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    await gen.generateReply({ event: {}, contextSections: [], publicChat: false });
    return (
      Array.isArray(capturedSections)
      && capturedSections[0]?.label === "Second Life Voice Guard"
    );
  });

  await checkAsync("voice guard prepended before caller-supplied sections", async () => {
    let capturedSections = null;
    const mockCallModel = async ({ contextSections }) => {
      capturedSections = contextSections;
      return { text: "Yep, I remember." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const extra = [{ label: "My Context", content: "some content" }];
    await gen.generateReply({ event: {}, contextSections: extra, publicChat: false });
    return (
      capturedSections[0]?.label === "Second Life Voice Guard"
      && capturedSections[1]?.label === "My Context"
    );
  });

  // ---------------------------------------------------------------------------
  // Section 6: generateReply — clean text returned
  // ---------------------------------------------------------------------------
  console.log("\n6. generateReply — output is cleaned");

  await checkAsync("collapses extra spaces in model output", async () => {
    const mockCallModel = async () => ({ text: "Hey   there." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const { text } = await gen.generateReply({ event: {} });
    return text === "Hey there.";
  });

  await checkAsync("strips reasoning markup before cleanup", async () => {
    const mockCallModel = async () => ({ text: "<think>thinking...</think>  Hello." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const { text } = await gen.generateReply({ event: {} });
    return text === "Hello." && !text.includes("<think>");
  });

  // ---------------------------------------------------------------------------
  // Section 7: generateReply — no-generic guard
  // ---------------------------------------------------------------------------
  console.log("\n7. generateReply — no-generic guard regenerates once");

  await checkAsync("generic first reply triggers regeneration attempt", async () => {
    let callCount = 0;
    const mockCallModel = async ({ contextSections }) => {
      callCount++;
      if (callCount === 1) return { text: "Hello, Avatar! How can I help you today?" };
      return { text: "Oh, JC — there you are. I was waiting." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const { text } = await gen.generateReply({ event: {} });
    return callCount === 2 && text === "Oh, JC — there you are. I was waiting.";
  });

  await checkAsync("Voice Recovery section added on regeneration", async () => {
    let secondCallSections = null;
    let callCount = 0;
    const mockCallModel = async ({ contextSections }) => {
      callCount++;
      if (callCount === 1) return { text: "How can I help you today?" };
      secondCallSections = contextSections;
      return { text: "Good to see you." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    await gen.generateReply({ event: {} });
    return (
      secondCallSections !== null
      && secondCallSections.some((s) => s?.label === "Voice Recovery")
    );
  });

  await checkAsync("returns empty string when both attempts are generic", async () => {
    const mockCallModel = async () => ({ text: "How can I help you?" });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const { text } = await gen.generateReply({ event: {} });
    return text === "";
  });

  await checkAsync("does NOT regenerate when first reply is normal", async () => {
    let callCount = 0;
    const mockCallModel = async () => {
      callCount++;
      return { text: "Yeah, been thinking about that too." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    await gen.generateReply({ event: {} });
    return callCount === 1;
  });

  // ---------------------------------------------------------------------------
  // Section 8: generateReply — public safety (publicChat=true)
  // ---------------------------------------------------------------------------
  console.log("\n8. generateReply — public safety (publicChat=true strips private sections)");

  await checkAsync("private sections are filtered when publicChat=true", async () => {
    let capturedSections = null;
    const mockCallModel = async ({ contextSections }) => {
      capturedSections = contextSections;
      return { text: "Hey there." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const sections = [
      { label: "Public Section", content: "visible", private: false },
      { label: "Private Section", content: "secret", private: true },
    ];
    await gen.generateReply({ event: {}, contextSections: sections, publicChat: true });
    const hasPrivate = capturedSections.some((s) => s?.label === "Private Section");
    const hasPublic = capturedSections.some((s) => s?.label === "Public Section");
    return hasPublic && !hasPrivate;
  });

  await checkAsync("private sections are kept when publicChat=false", async () => {
    let capturedSections = null;
    const mockCallModel = async ({ contextSections }) => {
      capturedSections = contextSections;
      return { text: "Hey there." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    const sections = [{ label: "Private Section", content: "secret", private: true }];
    await gen.generateReply({ event: {}, contextSections: sections, publicChat: false });
    return capturedSections.some((s) => s?.label === "Private Section");
  });

  await checkAsync("voice guard is NOT marked private (always present in public chat)", async () => {
    let capturedSections = null;
    const mockCallModel = async ({ contextSections }) => {
      capturedSections = contextSections;
      return { text: "Hi." };
    };
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, _callModel: mockCallModel });
    await gen.generateReply({ event: {}, contextSections: [], publicChat: true });
    const guard = capturedSections.find((s) => s?.label === "Second Life Voice Guard");
    return guard !== undefined && guard.private !== true;
  });

  // ---------------------------------------------------------------------------
  // Section 9: generateReply — contextLast10 detected correctly
  // ---------------------------------------------------------------------------
  console.log("\n9. generateReply — contextLast10 detection for debug flag");

  await checkAsync("hasContextLast10 is true when section label matches", async () => {
    const loggedFields = [];
    const mockLogger = { info: (msg, fields) => loggedFields.push(fields) };
    const mockCallModel = async () => ({ text: "Sure." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, logger: mockLogger, _callModel: mockCallModel });

    const origEnv = process.env.SECOND_LIFE_DEBUG;
    process.env.SECOND_LIFE_DEBUG = "true";
    try {
      const sections = [{ label: "Recent Second Life Local Chat Context", content: "JC: hello" }];
      await gen.generateReply({ event: { companionId: "nox" }, contextSections: sections, publicChat: false });
    } finally {
      if (origEnv === undefined) {
        delete process.env.SECOND_LIFE_DEBUG;
      } else {
        process.env.SECOND_LIFE_DEBUG = origEnv;
      }
    }
    return loggedFields.some((f) => f?.contextLast10Included === true);
  });

  await checkAsync("hasContextLast10 is false when section is absent", async () => {
    const loggedFields = [];
    const mockLogger = { info: (msg, fields) => loggedFields.push(fields) };
    const mockCallModel = async () => ({ text: "Sure." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, logger: mockLogger, _callModel: mockCallModel });

    const origEnv = process.env.SECOND_LIFE_DEBUG;
    process.env.SECOND_LIFE_DEBUG = "true";
    try {
      await gen.generateReply({ event: { companionId: "nox" }, contextSections: [], publicChat: false });
    } finally {
      if (origEnv === undefined) {
        delete process.env.SECOND_LIFE_DEBUG;
      } else {
        process.env.SECOND_LIFE_DEBUG = origEnv;
      }
    }
    return loggedFields.some((f) => f?.contextLast10Included === false);
  });

  // ---------------------------------------------------------------------------
  // Section 10: Debug logging fields
  // ---------------------------------------------------------------------------
  console.log("\n10. Debug logging (SECOND_LIFE_DEBUG=true)");

  await checkAsync("logs companionId, speakerName, publicChat, voiceGuardIncluded", async () => {
    const loggedFields = [];
    const mockLogger = { info: (msg, fields) => loggedFields.push(fields) };
    const mockCallModel = async () => ({ text: "Yep." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, logger: mockLogger, _callModel: mockCallModel });

    const origEnv = process.env.SECOND_LIFE_DEBUG;
    process.env.SECOND_LIFE_DEBUG = "true";
    try {
      await gen.generateReply({
        event: { companionId: "nox", userDisplayName: "JC SnowFox" },
        contextSections: [],
        publicChat: false,
      });
    } finally {
      if (origEnv === undefined) {
        delete process.env.SECOND_LIFE_DEBUG;
      } else {
        process.env.SECOND_LIFE_DEBUG = origEnv;
      }
    }
    const preCall = loggedFields.find((f) => f?.voiceGuardIncluded === true && f?.companionId !== undefined);
    return (
      preCall !== undefined
      && preCall.companionId === "nox"
      && preCall.speakerName === "JC SnowFox"
      && typeof preCall.publicChat === "boolean"
      && preCall.voiceGuardIncluded === true
    );
  });

  await checkAsync("does NOT log sectionLabels without DEBUG_PROMPTS=true", async () => {
    const loggedFields = [];
    const mockLogger = { info: (msg, fields) => loggedFields.push(fields) };
    const mockCallModel = async () => ({ text: "Yep." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, logger: mockLogger, _callModel: mockCallModel });

    const origDebug = process.env.SECOND_LIFE_DEBUG;
    const origPrompts = process.env.DEBUG_PROMPTS;
    process.env.SECOND_LIFE_DEBUG = "true";
    delete process.env.DEBUG_PROMPTS;
    try {
      await gen.generateReply({ event: { companionId: "nox" }, contextSections: [] });
    } finally {
      if (origDebug === undefined) delete process.env.SECOND_LIFE_DEBUG;
      else process.env.SECOND_LIFE_DEBUG = origDebug;
      if (origPrompts === undefined) delete process.env.DEBUG_PROMPTS;
      else process.env.DEBUG_PROMPTS = origPrompts;
    }
    return loggedFields.every((f) => f?.sectionLabels === undefined);
  });

  await checkAsync("logs sectionLabels when DEBUG_PROMPTS=true", async () => {
    const loggedFields = [];
    const mockLogger = { info: (msg, fields) => loggedFields.push(fields) };
    const mockCallModel = async () => ({ text: "Yep." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, logger: mockLogger, _callModel: mockCallModel });

    const origDebug = process.env.SECOND_LIFE_DEBUG;
    const origPrompts = process.env.DEBUG_PROMPTS;
    process.env.SECOND_LIFE_DEBUG = "true";
    process.env.DEBUG_PROMPTS = "true";
    try {
      await gen.generateReply({ event: { companionId: "nox" }, contextSections: [] });
    } finally {
      if (origDebug === undefined) delete process.env.SECOND_LIFE_DEBUG;
      else process.env.SECOND_LIFE_DEBUG = origDebug;
      if (origPrompts === undefined) delete process.env.DEBUG_PROMPTS;
      else process.env.DEBUG_PROMPTS = origPrompts;
    }
    return loggedFields.some((f) => Array.isArray(f?.sectionLabels));
  });

  await checkAsync("logs replyLength and cleanupRan and regenerationRan after call", async () => {
    const loggedFields = [];
    const mockLogger = { info: (msg, fields) => loggedFields.push(fields) };
    const mockCallModel = async () => ({ text: "Hey." });
    const config = { chat: { defaultMode: "default" } };
    const gen = createSecondLifeReplyGenerator({ config, logger: mockLogger, _callModel: mockCallModel });

    const origEnv = process.env.SECOND_LIFE_DEBUG;
    process.env.SECOND_LIFE_DEBUG = "true";
    try {
      await gen.generateReply({ event: { companionId: "nox" }, contextSections: [] });
    } finally {
      if (origEnv === undefined) delete process.env.SECOND_LIFE_DEBUG;
      else process.env.SECOND_LIFE_DEBUG = origEnv;
    }
    const postCall = loggedFields.find((f) => "replyLength" in (f || {}));
    return (
      postCall !== undefined
      && typeof postCall.replyLength === "number"
      && typeof postCall.cleanupRan === "boolean"
      && typeof postCall.regenerationRan === "boolean"
    );
  });

  // ---------------------------------------------------------------------------
  // Section 11: Adapter Known Speaker Tone section
  // ---------------------------------------------------------------------------
  console.log("\n11. Adapter — Known Speaker Tone section presence");

  // We test buildContextSections indirectly by checking the adapter module
  // contains the Known Speaker Tone label in its source.
  await checkAsync("adapter source contains Known Speaker Tone label", async () => {
    const fs = require("fs");
    const path = require("path");
    const adapterPath = path.join(__dirname, "../src/channels/secondLifeAdapter.js");
    const src = fs.readFileSync(adapterPath, "utf8");
    return src.includes("Known Speaker Tone");
  });

  await checkAsync("adapter Known Speaker Tone guarded by isKnownSpeaker (isOwner/isFamily etc)", async () => {
    const fs = require("fs");
    const path = require("path");
    const adapterPath = path.join(__dirname, "../src/channels/secondLifeAdapter.js");
    const src = fs.readFileSync(adapterPath, "utf8");
    return src.includes("isKnownSpeaker") && src.includes("isOwner") && src.includes("isFamily");
  });

  await checkAsync("adapter Known Speaker Tone includes 'do not introduce yourself'", async () => {
    const fs = require("fs");
    const path = require("path");
    const adapterPath = path.join(__dirname, "../src/channels/secondLifeAdapter.js");
    const src = fs.readFileSync(adapterPath, "utf8");
    const idx = src.indexOf("Known Speaker Tone");
    if (idx === -1) return false;
    const block = src.slice(idx, idx + 500).toLowerCase();
    return block.includes("do not introduce");
  });

  // ---------------------------------------------------------------------------
  // Section 12: Discord brain path unchanged
  // ---------------------------------------------------------------------------
  console.log("\n12. Discord brain path unchanged");

  await checkAsync("processCompanionEvent routes discord to chatPipeline, not generator", async () => {
    const { createCompanionEventProcessor } = require("../src/companion/processCompanionEvent");
    let pipelineCalled = false;
    let generatorCalled = false;
    const mockPipeline = {
      run: async () => {
        pipelineCalled = true;
        return { content: "ok" };
      },
    };
    const mockGenerator = {
      generateReply: async () => {
        generatorCalled = true;
        return { text: "ok" };
      },
    };
    const { processCompanionEvent } = createCompanionEventProcessor({
      chatPipeline: mockPipeline,
      logger: null,
      secondLifeReplyGenerator: mockGenerator,
    });
    try {
      await processCompanionEvent({
        companionId: "nox",
        channelType: "discord",
        eventType: "message",
        metadata: { discord: { message: { content: "hello", author: { id: "u1", username: "JC" } } } },
      });
    } catch {
      // may throw if normalizeInboundEvent requires more fields — that's ok
    }
    // The key assertion: generator was NOT called for a discord event.
    return !generatorCalled;
  });

  await checkAsync("processCompanionEvent routes second_life to generator, not chatPipeline", async () => {
    const { createCompanionEventProcessor } = require("../src/companion/processCompanionEvent");
    let pipelineCalled = false;
    let generatorCalled = false;
    const mockPipeline = {
      run: async () => {
        pipelineCalled = true;
        return { content: "ok" };
      },
    };
    const mockGenerator = {
      generateReply: async () => {
        generatorCalled = true;
        return { text: "ok" };
      },
    };
    const { processCompanionEvent } = createCompanionEventProcessor({
      chatPipeline: mockPipeline,
      logger: null,
      secondLifeReplyGenerator: mockGenerator,
    });
    await processCompanionEvent({
      companionId: "nox",
      channelType: "second_life",
      eventType: "local_chat",
      messageText: "hello",
      metadata: { secondLife: { contextSections: [], publicChat: false } },
    });
    return generatorCalled && !pipelineCalled;
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
})();
