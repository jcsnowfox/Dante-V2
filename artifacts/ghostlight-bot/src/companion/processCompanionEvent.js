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
  if (reply == null) return "";
  if (typeof reply === "string") return reply;
  if (typeof reply !== "object") return String(reply || "");
  return String(
    reply.reply
    || reply.text
    || reply.content
    || reply.message
    || reply.output
    || reply.response
    || "",
  );
}

function createSyntheticPipelineMessage(event) {
  const sl = event.metadata?.secondLifeContext || {};
  const channelId = sl.channel || event.metadata?.channel || "secondlife";
  const authorId = event.externalUserId || sl.avatarKey || "secondlife-avatar";
  const authorName = event.userDisplayName || sl.avatarName || "Second Life Resident";
  const createdAt = event.timestamp ? new Date(event.timestamp) : new Date();
  return {
    id: `sl-${Date.now()}`,
    content: String(event.messageText || ""),
    channelId,
    guildId: null,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    author: { id: authorId, username: authorName, globalName: authorName, bot: false },
    member: { displayName: authorName },
    client: { user: { id: "secondlife-bridge" } },
    channel: {
      id: channelId,
      name: "secondlife",
      type: 1,
      isThread: () => false,
      isDMBased: () => true,
    },
    attachments: new Map(),
    stickers: new Map(),
    secondLifeContext: sl,
    metadata: event.metadata || {},
    react: async () => {},
  };
}

function createCompanionEventProcessor({ chatPipeline, logger, secondLifeReplyGenerator = null }) {
  if (!chatPipeline || typeof chatPipeline.run !== "function") {
    throw new Error("[companion] processCompanionEvent requires a chat pipeline with run().");
  }

  async function processDiscordEvent(event) {
    const discord = event.metadata?.discord || event.metadata?.dashboardCall || event.metadata?.webCall || {};
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
        channelType: event.channelType,
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
    const sl = event.metadata?.secondLife || {};
    const contextSections = Array.isArray(sl.contextSections) ? sl.contextSections : [];
    const publicChat = sl.publicChat === true;
    const message = createSyntheticPipelineMessage({
      ...event,
      metadata: {
        ...event.metadata,
        secondLifeContext: {
          source: event.metadata?.source || "secondlife",
          platform: event.metadata?.platform || "secondlife",
          slAvatarUsername: event.metadata?.slAvatarUsername || "",
          avatarName: event.metadata?.avatarName || event.userDisplayName || "",
          avatarKey: event.metadata?.avatarKey || event.externalUserId || "",
          region: event.metadata?.region || "",
          channel: event.metadata?.channel || "",
          contextSections,
          publicChat,
        },
      },
    });

    emitCanonicalPipelineTrace("llm_provider", event, { provider: "chatPipeline.run" });

    const reply = await chatPipeline.run({
      message,
      mode: event.metadata?.mode,
      modeName: event.metadata?.modeName,
      secondLifeContext: message.secondLifeContext,
    });
    const responseText = extractResponseText(reply);

    const outbound = normalizeOutboundResult(
      {
        companionId: event.companionId,
        channelType: "second_life",
        responseText,
        privacyLevel: event.privacyLevel,
        metadata: { hasReply: Boolean(responseText), pipeline: "chatPipeline.run" },
      },
      event,
    );

    emitCanonicalPipelineTrace("post_processing", event, { diagnostics: "second life chat pipeline reply normalized" });
    emitCanonicalPipelineTrace("memory_writer", event, { diagnostics: "delegated to shared chat pipeline" });
    emitCanonicalPipelineTrace("diagnostics", event, { diagnostics: "second life canonical chat pipeline complete" });

    return { event, outbound, reply };
  }

  async function processCompanionEvent(rawEvent) {
    const event = normalizeInboundEvent(rawEvent);
    startCanonicalPipelineTrace(event);
    emitCanonicalPipelineTrace("companion_event", event, { diagnostics: "normalized inbound companion event" });
    emitCanonicalPipelineTrace("identity_resolver", event, { diagnostics: "using existing companion identity path" });
    emitCanonicalPipelineTrace("user_resolver", event, { diagnostics: "using existing channel user path" });
    emitCanonicalPipelineTrace("relationship_resolver", event, { diagnostics: "using existing relationship context path" });

    if (["discord", "dashboard_call", "web_call"].includes(event.channelType)) {
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
