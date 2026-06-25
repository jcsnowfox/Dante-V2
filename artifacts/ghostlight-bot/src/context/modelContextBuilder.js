const { buildWorldContext, formatWorldContextForPrompt } = require("./worldContext");
const { retrieveCrossChannelEvents, buildCrossChannelContextSection, filterCrossChannelByPrivacy } = require("./crossChannelAwareness");
const { formatAttachmentUnderstandingForPrompt } = require("./attachmentUnderstanding");

async function buildModelContext({
  message,
  input,
  config,
  logger,
  conversations,
  companionConfig = {},
  customerConfig = {},
  attachment = null,
  webSearchResults = null,
  now = new Date(),
  enableWorldContext = true,
  enableCrossChannel = true,
  enableAttachment = true,
  enableWebResults = true,
} = {}) {
  const contextSections = [];
  const diagnostics = {
    worldContextInjected: false,
    crossChannelInjected: false,
    attachmentInjected: false,
    webResultsInjected: false,
    crossChannelEventsCount: 0,
    crossChannelPlatforms: [],
    crossChannelFiltered: false,
  };

  // Feature 1: World Context
  if (enableWorldContext) {
    try {
      const worldContext = buildWorldContext({
        now,
        companionConfig,
        customerConfig,
        config,
        logger,
      });

      const worldContextSection = formatWorldContextForPrompt(worldContext);
      if (worldContextSection) {
        contextSections.push(worldContextSection);
        diagnostics.worldContextInjected = true;
        diagnostics.currentLocalTime = worldContext.timestamp.humanReadable;
        diagnostics.resolvedTimezone = worldContext.timezone;
      }
    } catch (error) {
      if (logger) {
        logger.warn("[model-context-builder] World context build failed", {
          error: error.message,
        });
      }
    }
  }

  // Feature 2: Cross-Channel Awareness
  if (enableCrossChannel && conversations && message) {
    try {
      const userId = input?.authorId || message.authorId || null;
      const companionId = companionConfig?.id || null;
      const customerId = customerConfig?.id || null;
      const currentChannelId = message.channelId || message.channel?.id;

      const crossChannelEvents = await retrieveCrossChannelEvents({
        conversations,
        userId,
        companionId,
        customerId,
        currentChannelId,
        limit: 15,
        hoursBack: 24,
        logger,
      });

      if (crossChannelEvents && crossChannelEvents.length > 0) {
        const currentChannelScope = message.channel?.isDMBased?.() ? "private" : "public";
        const filtered = filterCrossChannelByPrivacy(crossChannelEvents, currentChannelScope);

        if (filtered.length > 0) {
          diagnostics.crossChannelFiltered = filtered.length < crossChannelEvents.length;
          diagnostics.crossChannelEventsCount = filtered.length;

          const platformMap = {};
          filtered.forEach((event) => {
            const platform = event.platform || "unknown";
            platformMap[platform] = (platformMap[platform] || 0) + 1;
          });
          diagnostics.crossChannelPlatforms = Object.keys(platformMap).map(
            (platform) => `${platform}(${platformMap[platform]})`
          );

          const crossChannelSection = buildCrossChannelContextSection(filtered);
          if (crossChannelSection) {
            contextSections.push(crossChannelSection);
            diagnostics.crossChannelInjected = true;
          }
        }
      }
    } catch (error) {
      if (logger) {
        logger.warn("[model-context-builder] Cross-channel context build failed", {
          error: error.message,
        });
      }
    }
  }

  // Feature 4: Attachment Understanding
  if (enableAttachment && attachment) {
    try {
      const attachmentSection = formatAttachmentUnderstandingForPrompt(attachment);
      if (attachmentSection) {
        contextSections.push(attachmentSection);
        diagnostics.attachmentInjected = true;
        diagnostics.lastProcessedAttachmentType = attachment.type;
      }
    } catch (error) {
      if (logger) {
        logger.warn("[model-context-builder] Attachment context build failed", {
          error: error.message,
        });
      }
    }
  }

  // Feature 3: Web Results
  if (enableWebResults && webSearchResults) {
    try {
      const lines = ["## WEB SEARCH RESULTS"];
      lines.push("");

      if (typeof webSearchResults === "string") {
        lines.push(webSearchResults);
      } else if (Array.isArray(webSearchResults)) {
        for (const result of webSearchResults) {
          lines.push(`- ${result.title || result.url || "Untitled"}`);
          if (result.snippet || result.description) {
            lines.push(`  ${result.snippet || result.description}`);
          }
          if (result.url) {
            lines.push(`  Source: ${result.url}`);
          }
          lines.push("");
        }
      }

      const webSection = lines.join("\n");
      contextSections.push(webSection);
      diagnostics.webResultsInjected = true;
    } catch (error) {
      if (logger) {
        logger.warn("[model-context-builder] Web results context build failed", {
          error: error.message,
        });
      }
    }
  }

  return {
    contextSections,
    diagnostics,
  };
}

module.exports = {
  buildModelContext,
};
