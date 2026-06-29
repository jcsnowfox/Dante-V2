const { buildWorldContext, formatWorldContextForPrompt } = require("./worldContext");
const { readCallsEnabled } = require("../http/callRoutes");

function buildContextDiagnostics({
  config,
  logger,
  lastInvocations = {},
} = {}) {
  const worldContext = buildWorldContext({
    config,
    logger,
  });

  return {
    timestamp: new Date().toISOString(),
    features: {
      worldContext: {
        enabled: config.features?.worldContextEnabled !== false,
        resolvedTimezone: worldContext.timezone.iana,
        timezoneSource: worldContext.timezone.source,
        currentLocalTime: worldContext.timestamp.humanReadable,
        lastInjected: lastInvocations?.worldContext?.at || null,
        sampleOutput: formatWorldContextForPrompt(worldContext).split("\n").slice(0, 5).join("\n"),
      },
      crossChannelAwareness: {
        enabled: config.features?.crossChannelAwarenessEnabled !== false,
        lastRetrieved: lastInvocations?.crossChannel?.at || null,
        lastEventsCount: lastInvocations?.crossChannel?.eventsCount || 0,
        lastPlatforms: lastInvocations?.crossChannel?.platforms || [],
      },
      webSearch: {
        enabled: config.features?.webSearchEnabled !== false,
        urlFetchingEnabled: config.features?.urlFetchingEnabled !== false,
        lastFetchedUrl: lastInvocations?.urlFetch?.url || null,
        lastFetchStatus: lastInvocations?.urlFetch?.status || null,
      },
      attachmentProcessing: {
        enabled: config.features?.attachmentProcessingEnabled !== false,
        maxAttachmentMb: config.features?.maxAttachmentMb || 25,
        maxVideoSeconds: config.features?.maxVideoSeconds || 600,
        lastProcessedType: lastInvocations?.attachment?.type || null,
        lastProcessedAt: lastInvocations?.attachment?.at || null,
      },
      calls: {
        calls_enabled: readCallsEnabled(config),
        call_route_mounted: true,
      },
      modelContextBuilder: {
        active: true,
        injectsByDefault: {
          worldContext: config.features?.worldContextEnabled !== false,
          crossChannel: config.features?.crossChannelAwarenessEnabled !== false,
          webResults: config.features?.webResultsInContext !== false,
          attachments: config.features?.attachmentProcessingEnabled !== false,
        },
      },
    },
    environmentDefaults: {
      defaultTimezone: process.env.DEFAULT_TIMEZONE || "UTC",
      nodeEnv: process.env.NODE_ENV || "development",
    },
  };
}

function formatDiagnosticsAsHtml(diagnostics = {}) {
  const lines = [];

  lines.push("<!DOCTYPE html>");
  lines.push("<html>");
  lines.push("<head>");
  lines.push("<meta charset='utf-8'>");
  lines.push("<title>Companion Features Diagnostics</title>");
  lines.push("<style>");
  lines.push("body { font-family: monospace; margin: 20px; background: #f5f5f5; }");
  lines.push(".section { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }");
  lines.push(".enabled { color: green; font-weight: bold; }");
  lines.push(".disabled { color: red; font-weight: bold; }");
  lines.push("h2 { border-bottom: 2px solid #ccc; padding-bottom: 10px; }");
  lines.push("pre { background: #f0f0f0; padding: 10px; overflow-x: auto; }");
  lines.push("</style>");
  lines.push("</head>");
  lines.push("<body>");

  lines.push("<h1>Companion System Diagnostics</h1>");
  lines.push(`<p>Generated: ${diagnostics.timestamp}</p>`);

  // Features section
  lines.push("<div class='section'>");
  lines.push("<h2>Features Status</h2>");

  const { features } = diagnostics;

  lines.push("<h3>World Context (Time Awareness)</h3>");
  lines.push(`<p>Status: <span class="${features.worldContext.enabled ? "enabled" : "disabled"}">${features.worldContext.enabled ? "ENABLED" : "DISABLED"}</span></p>`);
  lines.push(`<p>Resolved Timezone: <code>${features.worldContext.resolvedTimezone}</code></p>`);
  lines.push(`<p>Timezone Source: <code>${features.worldContext.timezoneSource}</code></p>`);
  lines.push(`<p>Current Local Time: <code>${features.worldContext.currentLocalTime}</code></p>`);
  lines.push("<p>Sample Output:</p>");
  lines.push("<pre>" + features.worldContext.sampleOutput + "</pre>");

  lines.push("<h3>Cross-Channel Awareness</h3>");
  lines.push(`<p>Status: <span class="${features.crossChannelAwareness.enabled ? "enabled" : "disabled"}">${features.crossChannelAwareness.enabled ? "ENABLED" : "DISABLED"}</span></p>`);
  lines.push(`<p>Last Retrieved: ${features.crossChannelAwareness.lastRetrieved || "Never"}</p>`);
  lines.push(`<p>Last Events Count: ${features.crossChannelAwareness.lastEventsCount}</p>`);
  lines.push(`<p>Last Platforms: ${features.crossChannelAwareness.lastPlatforms.join(", ") || "None"}</p>`);

  lines.push("<h3>Web Search & URL Fetching</h3>");
  lines.push(`<p>Web Search: <span class="${features.webSearch.enabled ? "enabled" : "disabled"}">${features.webSearch.enabled ? "ENABLED" : "DISABLED"}</span></p>`);
  lines.push(`<p>URL Fetching: <span class="${features.webSearch.urlFetchingEnabled ? "enabled" : "disabled"}">${features.webSearch.urlFetchingEnabled ? "ENABLED" : "DISABLED"}</span></p>`);
  lines.push(`<p>Last Fetched URL: ${features.webSearch.lastFetchedUrl || "None"}</p>`);
  lines.push(`<p>Last Status: ${features.webSearch.lastFetchStatus || "N/A"}</p>`);

  lines.push("<h3>Attachment Processing</h3>");
  lines.push(`<p>Status: <span class="${features.attachmentProcessing.enabled ? "enabled" : "disabled"}">${features.attachmentProcessing.enabled ? "ENABLED" : "DISABLED"}</span></p>`);
  lines.push(`<p>Max Attachment: ${features.attachmentProcessing.maxAttachmentMb} MB</p>`);
  lines.push(`<p>Max Video: ${features.attachmentProcessing.maxVideoSeconds} seconds</p>`);
  lines.push(`<p>Last Processed Type: ${features.attachmentProcessing.lastProcessedType || "None"}</p>`);

  lines.push("<h3>Call Routes</h3>");
  lines.push(`<p>CALLS_ENABLED: <span class="${features.calls.calls_enabled ? "enabled" : "disabled"}">${features.calls.calls_enabled ? "ENABLED" : "DISABLED"}</span></p>`);
  lines.push(`<p>call_route_mounted: <code>${features.calls.call_route_mounted ? "true" : "false"}</code></p>`);

  lines.push("<h3>Model Context Builder</h3>");
  lines.push(`<p>Status: <span class="enabled">ACTIVE</span></p>`);
  lines.push("<p>Default Injections:</p>");
  lines.push("<ul>");
  lines.push(`<li>World Context: ${features.modelContextBuilder.injectsByDefault.worldContext ? "✓" : "✗"}</li>`);
  lines.push(`<li>Cross-Channel: ${features.modelContextBuilder.injectsByDefault.crossChannel ? "✓" : "✗"}</li>`);
  lines.push(`<li>Web Results: ${features.modelContextBuilder.injectsByDefault.webResults ? "✓" : "✗"}</li>`);
  lines.push(`<li>Attachments: ${features.modelContextBuilder.injectsByDefault.attachments ? "✓" : "✗"}</li>`);
  lines.push("</ul>");

  lines.push("</div>");

  // Environment section
  lines.push("<div class='section'>");
  lines.push("<h2>Environment Configuration</h2>");
  lines.push(`<p>Default Timezone: <code>${diagnostics.environmentDefaults.defaultTimezone}</code></p>`);
  lines.push(`<p>Node Env: <code>${diagnostics.environmentDefaults.nodeEnv}</code></p>`);
  lines.push("</div>");

  lines.push("</body>");
  lines.push("</html>");

  return lines.join("\n");
}

function formatDiagnosticsAsJson(diagnostics = {}) {
  return JSON.stringify(diagnostics, null, 2);
}

module.exports = {
  buildContextDiagnostics,
  formatDiagnosticsAsHtml,
  formatDiagnosticsAsJson,
};
