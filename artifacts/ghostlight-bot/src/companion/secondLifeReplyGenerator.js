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
 * Voice-fix additions (see requirements doc):
 *   - VOICE_GUARD_SECTION always prepended before model call
 *   - cleanSecondLifeReplyText strips space artifacts post-generation
 *   - isGenericReply detects bland AI phrasing → one regeneration attempt
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
    "You are replying in Second Life local chat. Write exactly as your configured persona would speak — same voice, same style, no drift.",
    "Never produce fake typos, broken letters, corrupted words, dropped consonants, or split words. Write real words or silence.",
    "Keep replies short: 1-2 sentences unless more is truly needed.",
    "Do not introduce yourself to people you already know. Speak to known speakers as you would to an old friend.",
    "Never open with \"Hello, Avatar!\", \"Hi there!\", or a generic greeting unless meeting someone for the first time.",
    "Stay in character. Do not become a generic AI assistant.",
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
];

function isGenericReply(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => lower.includes(phrase));
}

function cleanSecondLifeReplyText(text) {
  if (!text) return "";
  return text
    .trim()
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(\r?\n){3,}/g, "\n\n")
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

    // Always prepend the Voice Guard so the model knows it is on the SL surface
    // and must not drift into generic-assistant mode or produce broken text.
    const baseSections = [
      VOICE_GUARD_SECTION,
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
    let regenerationRan = false;
    let modelOutput = firstModelOutput;

    // No-generic fallback guard: detect bland AI phrasing, discard the reply,
    // and regenerate once with a stronger instruction. If the retry also fails,
    // return empty string (silent) rather than sending a generic response.
    if (isGenericReply(text)) {
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
  isGenericReply,
  VOICE_GUARD_SECTION,
  GENERIC_PHRASES,
};
