/**
 * verify-reasoning-strip
 *
 * Regression harness for the hidden internal-thought feature. The model is
 * instructed to wrap its private reasoning in <think>...</think> tags. That
 * reasoning must ALWAYS be hidden from users on every channel, while being
 * captured (internal only) so it can feed memory curation.
 *
 * Guarantees checked here:
 *   1. stripReasoningMarkup (visible text) and extractReasoningMarkup (private
 *      thought) are exact inverses across matched, dangling, repeated, and
 *      malformed tag shapes — no reasoning tag ever leaks into visible output.
 *   2. buildReply hides the reasoning but carries reply.internalThought.
 *   3. The curator surfaces internalThought only for assistant-role events.
 *   4. The system-prompt instruction tells the model the tags are hidden.
 *
 * Run from artifacts/ghostlight-bot:  node scripts/verify-reasoning-strip.js
 */

const {
  buildReply,
  stripReasoningMarkup,
  extractReasoningMarkup,
} = require("../src/chat/pipeline/buildReply");
const { buildInternalThoughtInstruction } = require("../src/chat/prompt/buildSystemPrompt");
const { formatCuratorSourceEvents } = require("../src/memory/curator");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  \u2713  ${label}`);
  } else {
    failed += 1;
    console.log(`  \u2717  ${label}`);
  }
}

const REASONING_TAG_RE = /<\s*\/?\s*(think|thinking|reason|reasoning|reflection|analysis|scratchpad)\b/i;

// [input, expectedVisible, expectedThought]
const symmetryCases = [
  ["<think>a</think>Hello", "Hello", "a"],
  ["Hello <think>oops cut", "Hello", "oops cut"],
  ["reasoning leaked</think>Real reply", "Real reply", "reasoning leaked"],
  ["<think>a</think>mid<reasoning>b</reasoning>more", "midmore", "a\n\nb"],
  ["<think>a</think>Visible <analysis>trailing cut", "Visible", "a\n\ntrailing cut"],
  ["No tags here", "No tags here", ""],
  ["<think>only thinking</think>", "", "only thinking"],
  ["a</think>b</think>c", "c", "a\n\nb"],
  ["<think>x</think>a</think>b</think>c", "c", "x\n\na\n\nb"],
  ["x<think>y<think>z", "x", "y<think>z"],
  ["</think></think>visible", "visible", ""],
  ["<Thinking>Caps tag</Thinking>Reply", "Reply", "Caps tag"],
];

for (const [input, expectedVisible, expectedThought] of symmetryCases) {
  const visible = stripReasoningMarkup(input);
  const thought = extractReasoningMarkup(input);

  check(`strip hides reasoning for ${JSON.stringify(input)}`, visible === expectedVisible);
  check(`extract captures reasoning for ${JSON.stringify(input)}`, thought === expectedThought);
  check(`no reasoning tag leaks for ${JSON.stringify(input)}`, !REASONING_TAG_RE.test(visible));
}

// buildReply integration: tags hidden from content, thought carried internally.
const replyWithThought = buildReply({
  mode: { name: "default" },
  input: { content: "hi" },
  recentHistory: [],
  memories: [],
  modelOutput: {
    provider: "openai",
    text: "<think>they seem stressed about work</think>Hey, good to see you!",
  },
});
check("buildReply strips tags from visible content", replyWithThought.content === "Hey, good to see you!");
check("buildReply carries reply.internalThought", replyWithThought.internalThought === "they seem stressed about work");
check("buildReply content has no reasoning tag", !REASONING_TAG_RE.test(replyWithThought.content));

const replyNoThought = buildReply({
  mode: { name: "default" },
  input: { content: "hi" },
  recentHistory: [],
  memories: [],
  modelOutput: { provider: "openai", text: "Just a plain reply." },
});
check("buildReply omits internalThought when none present", replyNoThought.internalThought === undefined);
check("buildReply keeps plain content intact", replyNoThought.content === "Just a plain reply.");

// Curator: surface internalThought only for assistant events.
const curatorOutput = formatCuratorSourceEvents([
  {
    id: "e1",
    role: "assistant",
    created_at: new Date().toISOString(),
    content_text: "Hey there!",
    metadata: { internalThought: "they seem stressed about work" },
  },
  {
    id: "e2",
    role: "user",
    created_at: new Date().toISOString(),
    content_text: "hi",
    metadata: { internalThought: "should never appear for a user event" },
  },
]);
check("curator surfaces assistant internalThought", curatorOutput.includes("they seem stressed about work"));
check("curator ignores internalThought on user events", !curatorOutput.includes("should never appear for a user event"));

// System-prompt instruction communicates the tag + hidden guarantee.
const instruction = buildInternalThoughtInstruction();
check("instruction mentions the <think> tag", /<think>/.test(instruction));
check("instruction scopes the think block to planning only", /planning only|plan your reply/i.test(instruction));

console.log("");
console.log("================================");
console.log(`  PASSED:   ${passed}`);
console.log(`  FAILED:   ${failed}`);
console.log("================================");
console.log(`  VERDICT:  ${failed === 0 ? "\u2705 PASS" : "\u274c FAIL"}`);

process.exit(failed === 0 ? 0 : 1);
