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
 */

const { getMode } = require("../chat/modes");
const { callModel } = require("../chat/pipeline/callModel");

const EMPTY_TOOLS = { list: () => [] };

function createSecondLifeReplyGenerator({ config, logger, tools = null }) {
  const toolRegistry = tools || EMPTY_TOOLS;

  async function generateReply({ event = {}, contextSections = [], privacyLevel = "public", publicChat = false }) {
    const fallbackModeName = config?.chat?.defaultMode || "default";
    const mode = getMode(fallbackModeName);

    // Phase 20 — defence in depth: for public local chat never forward any
    // context section that was tagged private, and never let the privacy level
    // rise above "public" (which gates adult/explicit content downstream).
    const safeSections = (Array.isArray(contextSections) ? contextSections : [])
      .filter((section) => section && !(publicChat && section.private === true));
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

    const modelOutput = await callModel({
      config,
      logger,
      mode,
      input,
      recentHistory: [],
      memories: [],
      tools: toolRegistry,
      contextSections: safeSections,
      toolContext: {
        surface: "second_life",
        userScope: config?.memory?.userScope,
      },
      channelType: "second_life",
      privacyLevel: safePrivacyLevel,
    });

    return { text: String(modelOutput?.text || ""), modelOutput };
  }

  return { generateReply };
}

module.exports = { createSecondLifeReplyGenerator };
