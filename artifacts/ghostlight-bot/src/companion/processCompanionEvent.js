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
const {
  emitCanonicalPipelineTrace,
  finishCanonicalPipelineTrace,
  startCanonicalPipelineTrace,
} = require("./canonicalPipelineDiagnostics");

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

    emitCanonicalPipelineTrace("llm_provider", event, { provider: "chatPipeline.run" });

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

    emitCanonicalPipelineTrace("post_processing", event, { diagnostics: "discord reply normalized" });
    emitCanonicalPipelineTrace("memory_writer", event, { diagnostics: "delegated to existing chat pipeline" });
    emitCanonicalPipelineTrace("diagnostics", event, { diagnostics: "discord canonical pass-through complete" });

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

    emitCanonicalPipelineTrace("llm_provider", event, { provider: "secondLifeReplyGenerator.generateReply" });

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

    emitCanonicalPipelineTrace("post_processing", event, { diagnostics: "second life reply normalized" });
    emitCanonicalPipelineTrace("memory_writer", event, { diagnostics: "delegated to existing second life pipeline" });
    emitCanonicalPipelineTrace("diagnostics", event, { diagnostics: "second life canonical pass-through complete" });

    return { event, outbound, reply: text ? { content: text } : null };
  }

  async function processCompanionEvent(rawEvent) {
    const event = normalizeInboundEvent(rawEvent);
    startCanonicalPipelineTrace(event);
    emitCanonicalPipelineTrace("companion_event", event, { diagnostics: "normalized inbound companion event" });
    emitCanonicalPipelineTrace("identity_resolver", event, { diagnostics: "using existing companion identity path" });
    emitCanonicalPipelineTrace("user_resolver", event, { diagnostics: "using existing channel user path" });
    emitCanonicalPipelineTrace("relationship_resolver", event, { diagnostics: "using existing relationship context path" });

    if (event.channelType === "discord") {
      const result = await processDiscordEvent(event);
      finishCanonicalPipelineTrace(event, { diagnostics: "discord response ready" });
      return result;
    }

    if (event.channelType === "second_life") {
      const result = await processSecondLifeEvent(event);
      finishCanonicalPipelineTrace(event, { diagnostics: "second life response ready" });
      return result;
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
