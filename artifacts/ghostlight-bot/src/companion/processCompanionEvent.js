/**
 * companion/processCompanionEvent
 *
 * Phase 1 — the single shared brain entry point.
 *
 * Every channel normalizes its input into a companion event and calls
 * processCompanionEvent, which runs the ONE companion brain (chat pipeline =
 * one personality, one memory source, one relationship state, one prompt
 * builder, one model router) and returns a normalized outbound result.
 *
 * Stage 1 implements the Discord channel by delegating to the existing chat
 * pipeline using the raw Discord message carried in metadata.discord. This
 * keeps Discord behaviour byte-for-byte identical while establishing the shared
 * contract that the future Second Life adapter will reuse. Other channels are
 * recognised by the contract but not yet wired to an adapter.
 */

const {
  normalizeInboundEvent,
  normalizeOutboundResult,
} = require("./companionEvent");

function extractResponseText(reply) {
  if (reply == null) {
    return "";
  }
  if (typeof reply === "string") {
    return reply;
  }
  return String(reply.content || "");
}

function createCompanionEventProcessor({ chatPipeline, logger, secondLifeReplyGenerator = null }) {
  if (!chatPipeline || typeof chatPipeline.run !== "function") {
    throw new Error("[companion] processCompanionEvent requires a chat pipeline with run().");
  }

  async function processDiscordEvent(event) {
    const discord = event.metadata?.discord || {};
    const message = discord.message;

    if (!message) {
      throw new Error("[companion] Discord companion event is missing metadata.discord.message.");
    }

    const reply = await chatPipeline.run({
      message,
      mode: discord.mode,
      wasMentioned: discord.wasMentioned,
    });

    const outbound = normalizeOutboundResult(
      {
        companionId: event.companionId,
        channelType: "discord",
        responseText: extractResponseText(reply),
        privacyLevel: event.privacyLevel,
        metadata: { hasReply: reply != null },
      },
      event,
    );

    // `reply` is passed through untouched so the Discord sender keeps its full
    // payload (files, generated image/audio ids, suppressEmbeds, warnings).
    return { event, outbound, reply };
  }

  async function processSecondLifeEvent(event) {
    if (!secondLifeReplyGenerator || typeof secondLifeReplyGenerator.generateReply !== "function") {
      throw new Error("[companion] Second Life companion event requires a reply generator (Stage 2).");
    }

    const sl = event.metadata?.secondLife || {};
    const contextSections = Array.isArray(sl.contextSections) ? sl.contextSections : [];
    const publicChat = sl.publicChat === true;

    const { text } = await secondLifeReplyGenerator.generateReply({
      event,
      contextSections,
      privacyLevel: event.privacyLevel,
      publicChat,
    });

    const outbound = normalizeOutboundResult(
      {
        companionId: event.companionId,
        channelType: "second_life",
        responseText: text,
        privacyLevel: event.privacyLevel,
        metadata: { hasReply: Boolean(text) },
      },
      event,
    );

    return { event, outbound, reply: text ? { content: text } : null };
  }

  async function processCompanionEvent(rawEvent) {
    const event = normalizeInboundEvent(rawEvent);

    if (event.channelType === "discord") {
      return processDiscordEvent(event);
    }

    if (event.channelType === "second_life") {
      return processSecondLifeEvent(event);
    }

    logger?.warn?.("[companion] Received event for a channel without an adapter yet.", {
      channelType: event.channelType,
      eventType: event.eventType,
    });
    throw new Error(`[companion] channelType "${event.channelType}" has no adapter yet.`);
  }

  return { processCompanionEvent };
}

module.exports = { createCompanionEventProcessor };
