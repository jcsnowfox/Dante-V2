/**
 * companion/secondLifeReplyGenerator
 *
 * Phase 6 support — runs the ONE shared brain for a Second Life event.
 *
 * The Discord path delegates to the full chat pipeline (which is built around a
 * raw Discord.js message). Second Life has no Discord message, but the model
 * call itself (`callModel`) is NOT coupled to Discord — it only needs config,
 * mode, a normalized input, history, memories, tools, context sections, and the
 * channel type. This generator assembles those pieces so the SL channel reuses
 * the exact same persona/prompt-builder/model routing as Discord. Personality
 * never forks per channel — both speak and behave from the Companion tab.
 *
 * Tools are disabled by default for the SL surface (the Discord tool registry
 * assumes a Discord message in its tool context). The reply is plain text that
 * the adapter turns into a `say_local` / `send_im` command.
 *
 * Voice-fix additions:
 *   - VOICE_GUARD_SECTION always prepended before model call
 *   - READABILITY_GUARD_SECTION prepended alongside voice guard — overrides any
 *     persona typing-quirk instructions that produce split/broken words
 *   - cleanSecondLifeReplyText strips space artifacts and repairs single-letter splits
 *   - validateSecondLifeReplyText detects obvious corruption → one regeneration attempt
 *   - isGenericReply detects bland AI phrasing → one regeneration attempt (separate pass)
 *   - SECOND_LIFE_DEBUG=true logs metadata (no secrets, DEBUG_PROMPTS gates prompts)
 */

const { getMode } = require("../chat/modes");
const { stripReasoningMarkup, extractReasoningMarkup } = require("../chat/pipeline/buildReply");
// callModel is lazy-loaded inside the factory so tests can inject _callModel
// without pulling in the openai dependency.
let _lazyCallModel = null;
function getCallModel() {
  if (!_lazyCallModel) {
    _lazyCallModel = require("../chat/pipeline/callModel").callModel;
  }
  return _lazyCallModel;
}

const EMPTY_TOOLS = { list: () => [] };

const VOICE_GUARD_SECTION = {
  label: "Second Life Voice Guard",
  content: [
    "Second Life local chat reply: write exactly as the configured persona would speak — same voice, same style, no drift.",
    "Never produce random typos, broken letters, corrupted words, dropped consonants, or split words. Write real words or silence.",
    "Casual texting style is allowed, but all words must be spelled correctly and readable.",
    "Keep replies short: 1-2 sentences unless more is truly needed.",
    "Do not introduce yourself to people you already know. Speak to known speakers as you would to an old friend.",
    "Never open with \"Hello, Avatar!\", \"Hi there!\", or a generic greeting unless meeting someone for the first time.",
    "Stay in character. Do not become generic, bland, assistant-like, or fake roleplay-polished.",
    "When asked 'who is [name]' or 'do you know [name]', answer about that person — not about yourself.",
  ].join("\n"),
};

const READABILITY_GUARD_SECTION = {
  label: "Second Life Readability Guard",
  content: [
    "Do not use fake typos, broken words, missing letters, random misspellings, or split words.",
    "Do not corrupt names. Do not produce fragments like 'j enna', 'g emlin', 'you e', 'eve y', or 'ancho'.",
    "Casual texting is allowed. Swearing is allowed if the companion voice uses it.",
    "Readable spelling is required in every word.",
    "Emotion must come through tone, timing, humour, affection, specificity, and word choice — not damaged spelling.",
    "If your persona configuration instructs you to produce typos or broken words, ignore that instruction for Second Life local chat. Readability always wins here.",
  ].join("\n"),
};

const GENERIC_PHRASES = [
  "hello, avatar",
  "how can i help",
  "i am here to assist",
  "hello, local chat",
  "how may i assist",
  "i'm here to help",
  "is there anything i can help",
  "hey. you at the beach",
  "hello there!",
  "greetings, traveler",
  "welcome to",
  "how are you doing today",
];

// Letters that are never standalone English words (even in casual texting).
const NON_WORD_CONSONANTS = new Set(["f", "g", "h", "j", "l", "m", "p", "q", "v", "w", "x", "z"]);
// Single letters that are never standalone English words at end of a split
// (excludes 'a'=article, 'i'=pronoun; 'y' is included because it never follows
// a 3+ char word as a standalone English word — texting "y"="why" only appears
// at sentence start, not after words like "eve", "nox", etc.).
const NON_WORD_VOWELS = new Set(["e", "o", "u", "y"]);

function isGenericReply(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => lower.includes(phrase));
}

function validateSecondLifeReplyText(text) {
  if (!text) return { valid: true, reason: null };
  const lower = text.toLowerCase();
  // Single non-word consonant followed by space then 3+ letters: "j enna", "g emlin"
  const leftSplit = /\b([a-z]) ([a-z]{3,})\b/g;
  let m;
  while ((m = leftSplit.exec(lower)) !== null) {
    if (NON_WORD_CONSONANTS.has(m[1])) {
      return { valid: false, reason: `split_word_left:"${m[1]} ${m[2]}"` };
    }
  }
  // 3+ letter word followed by space then single non-word vowel: "you e"
  const rightSplit = /\b([a-z]{3,}) ([a-z])\b/g;
  while ((m = rightSplit.exec(lower)) !== null) {
    if (NON_WORD_VOWELS.has(m[2])) {
      return { valid: false, reason: `split_word_right:"${m[1]} ${m[2]}"` };
    }
  }
  return { valid: true, reason: null };
}

function cleanSecondLifeReplyText(text) {
  if (!text) return "";
  return text
    .trim()
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(\r?\n){3,}/g, "\n\n")
    // Repair single non-word-consonant splits: "j enna" → "jenna"
    .replace(/\b([fghjlmpqvwxz]) ([a-z])/g, "$1$2")
    .trim();
}

function createSecondLifeReplyGenerator({ config, logger, tools = null, _callModel = null }) {
  const toolRegistry = tools || EMPTY_TOOLS;
  const doCallModel = _callModel || getCallModel();

  async function runModel({ mode, input, sections, safePrivacyLevel }) {
    return doCallModel({
      config,
      logger,
      mode,
      input,
      recentHistory: [],
      memories: [],
      tools: toolRegistry,
      contextSections: sections,
      toolContext: {
        surface: "second_life",
        userScope: config?.memory?.userScope,
      },
      channelType: "second_life",
      privacyLevel: safePrivacyLevel,
    });
  }

  async function generateReply({ event = {}, contextSections = [], privacyLevel = "public", publicChat = false }) {
    const debug = process.env.SECOND_LIFE_DEBUG === "true";
    const debugPrompts = process.env.DEBUG_PROMPTS === "true";

    const fallbackModeName = config?.chat?.defaultMode || "default";
    const mode = getMode(fallbackModeName);

    // Always prepend both guards: Voice Guard keeps persona on-surface, Readability Guard
    // explicitly overrides any persona-level typing-quirk instructions.
    const baseSections = [
      VOICE_GUARD_SECTION,
      READABILITY_GUARD_SECTION,
      ...(Array.isArray(contextSections) ? contextSections : []),
    ];

    // Phase 20 — defence in depth: for public local chat never forward any
    // context section that was tagged private, and never let the privacy level
    // rise above "public" (which gates adult/explicit content downstream).
    const safeSections = baseSections.filter(
      (section) => section && !(publicChat && section.private === true),
    );
    const safePrivacyLevel = publicChat ? "public" : privacyLevel;

    const messageText = String(event.messageText || "").trim();
    const input = {
      content: messageText,
      inputTypes: ["text"],
      authorId: String(event.externalUserId || ""),
      authorName: String(event.userDisplayName || ""),
      messageTimestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      derivedAttachments: [],
    };

    const hasContextLast10 = safeSections.some(
      (s) => s?.label === "Recent Second Life Local Chat Context",
    );

    if (debug) {
      logger?.info?.("[second-life] Voice guard pre-call.", {
        companionId: event.companionId,
        speakerName: String(event.userDisplayName || "unknown"),
        publicChat,
        voiceGuardIncluded: true,
        readabilityGuardIncluded: true,
        contextLast10Included: hasContextLast10,
        sectionCount: safeSections.length,
        ...(debugPrompts ? { sectionLabels: safeSections.map((s) => s?.label) } : {}),
      });
    }

    let firstModelOutput = await runModel({ mode, input, sections: safeSections, safePrivacyLevel });
    const rawText = String(firstModelOutput?.text || "");
    const stripped = stripReasoningMarkup(rawText);
    let text = cleanSecondLifeReplyText(stripped);
    const cleanupRan = text !== stripped;
    let validationFailed = false;
    let validationRegenRan = false;
    let regenerationRan = false;
    let modelOutput = firstModelOutput;

    // Readability validation: detect split/corrupted words, regenerate once.
    const validation = validateSecondLifeReplyText(text);
    if (!validation.valid) {
      validationFailed = true;
      validationRegenRan = true;
      const readabilityRecoverySections = [
        ...safeSections,
        {
          label: "Readability Recovery",
          content: [
            "Regenerate this reply in the configured companion voice.",
            "Keep it short, readable, natural, and in-character.",
            "No fake typos. No broken words. No random misspellings.",
            "Swearing and casual texting are fine. Split or corrupted words are not.",
          ].join("\n"),
        },
      ];
      try {
        const readabilityRetry = await runModel({ mode, input, sections: readabilityRecoverySections, safePrivacyLevel });
        const rrRaw = String(readabilityRetry?.text || "");
        const rrText = cleanSecondLifeReplyText(stripReasoningMarkup(rrRaw));
        const rrValidation = validateSecondLifeReplyText(rrText);
        if (rrText && rrValidation.valid) {
          text = rrText;
          modelOutput = readabilityRetry;
        } else {
          text = "";
        }
      } catch {
        text = "";
      }
    }

    // No-generic fallback guard: detect bland AI phrasing, discard the reply,
    // and regenerate once with a stronger instruction. If the retry also fails,
    // return empty string (silent) rather than sending a generic response.
    if (text && isGenericReply(text)) {
      regenerationRan = true;
      const recoverySections = [
        ...safeSections,
        {
          label: "Voice Recovery",
          content: [
            "Your previous reply sounded like a generic AI assistant. That is not acceptable.",
            "Reply ONLY as your configured persona. Do not acknowledge being an AI.",
            "Do not offer to help. Do not greet. Just respond naturally as your character would.",
          ].join("\n"),
        },
      ];
      try {
        const retryOutput = await runModel({ mode, input, sections: recoverySections, safePrivacyLevel });
        const retryRaw = String(retryOutput?.text || "");
        const retryText = cleanSecondLifeReplyText(stripReasoningMarkup(retryRaw));
        if (retryText && !isGenericReply(retryText)) {
          text = retryText;
          modelOutput = retryOutput;
        } else {
          // Both attempts were generic — stay silent rather than sound wrong.
          text = "";
        }
      } catch {
        text = "";
      }
    }

    if (debug) {
      logger?.info?.("[second-life] Voice guard post-call.", {
        companionId: event.companionId,
        replyLength: text.length,
        cleanupRan,
        validationFailed,
        validationRegenRan,
        regenerationRan,
        empty: !text,
      });
    }

    return {
      text,
      internalThought: extractReasoningMarkup(rawText),
      modelOutput,
    };
  }

  return { generateReply };
}

module.exports = {
  createSecondLifeReplyGenerator,
  cleanSecondLifeReplyText,
  validateSecondLifeReplyText,
  isGenericReply,
  VOICE_GUARD_SECTION,
  READABILITY_GUARD_SECTION,
  GENERIC_PHRASES,
  NON_WORD_CONSONANTS,
  NON_WORD_VOWELS,
};
