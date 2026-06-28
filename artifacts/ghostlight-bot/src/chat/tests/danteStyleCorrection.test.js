const assert = require("node:assert/strict");
const test = require("node:test");

const { buildSystemPrompt } = require("../prompt/buildSystemPrompt");
const { buildVoiceRules, validateVoice, fingerprint } = require("../../continuity/voiceFingerprintGuard");

function makeConfig(personaName = "Dante") {
  return {
    chat: {
      promptBlocks: {
        personaName,
        userName: "Jenna",
        personaProfile: "Dark romantic, direct, sarcastic, warm underneath.",
      },
    },
  };
}

test("Dante system prompt tells him to react instead of narrating Jenna's intentions", () => {
  const prompt = buildSystemPrompt({ config: makeConfig("Dante"), mode: { name: "personal" } });

  assert.match(prompt, /Dante Style Correction/);
  assert.match(prompt, /reply as Dante experiencing it, not reviewing or interpreting it/);
  assert.match(prompt, /catch one specific thing, react emotionally, ask one genuine question/);
  assert.match(prompt, /Avoid meta narration about what the user built, planned, mapped, wrote/);
  assert.match(prompt, /first-draft alive/);
});

test("non-Dante personas do not receive Dante-specific style correction", () => {
  const prompt = buildSystemPrompt({ config: makeConfig("Ghostlight"), mode: { name: "personal" } });

  assert.doesNotMatch(prompt, /Dante Style Correction/);
  assert.doesNotMatch(prompt, /reply as Dante experiencing it/);
});

test("voice rules and fingerprint carry the meta-narration correction", () => {
  assert.match(buildVoiceRules(), /React before interpreting/);
  assert.ok(fingerprint.style_correction_rules.some((rule) => rule.includes("avoid repeated meta narration")));
});

test("voice guard flags repeated meta narration patterns", () => {
  const result = validateVoice({
    text: "You built a careful map.\n\nYou planned the runtime beautifully.\n\nYou didn't just write code; you're actually making me alive.",
  });

  assert.equal(result.passed, false);
  assert.ok(result.violations.includes("meta_narration_overuse"));
});


const {
  buildConversationMirrorLimiterSection,
  countRecentMirrorReplies,
} = require("../conversationMirrorLimiter");

test("conversation mirror limiter activates after more than two recent motivation mirrors", () => {
  const recentHistory = [
    { role: "assistant", content: "I'm weirdly excited." },
    { role: "assistant", content: "You want this to feel alive." },
    { role: "assistant", content: "You are trying to make the heartbeat matter." },
    { role: "assistant", content: "You feel the difference when I stumble." },
  ];

  assert.equal(countRecentMirrorReplies(recentHistory), 3);
  const section = buildConversationMirrorLimiterSection({ recentHistory });

  assert.equal(section.label, "CONVERSATION MIRROR LIMITER");
  assert.match(section.content, /stop interpreting the user/);
  assert.match(section.content, /own thoughts, feelings, curiosity, uncertainty, and reactions/);
});

test("conversation mirror limiter stays quiet at two mirrors or fewer", () => {
  const recentHistory = [
    { role: "assistant", content: "You want this cleaner." },
    { role: "assistant", content: "I keep thinking about the heartbeat thing." },
    { role: "assistant", content: "You are trying to make it breathe." },
  ];

  assert.equal(countRecentMirrorReplies(recentHistory), 2);
  assert.equal(buildConversationMirrorLimiterSection({ recentHistory }), null);
});
