"use strict";

// Railway log fetcher + Discord formatter.
//
// Two log sources:
//   1. In-memory ring buffer — captured from the running process via logger.js.
//      Always available; shows the last RING_BUFFER_SIZE log lines for the
//      current session. Import `getLogRingBuffer` from utils/logger to read it.
//   2. Railway deployment API — fetches the last N lines from the active
//      deployment on Railway. Requires RAILWAY_TOKEN + RAILWAY_SERVICE_ID.
//      RAILWAY_ENVIRONMENT_ID is optional (Railway injects it automatically
//      when the service runs on Railway).
//
// Call `getLogsForDevReport()` to get both sources. Call
// `formatLogsForDiscord()` to turn the result into Discord-ready message chunks.

const RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";

async function fetchRailwayDeploymentLogs({ token, serviceId, environmentId, limit }) {
  const deploymentsQuery = `
    query($serviceId: String!, $environmentId: String) {
      deployments(
        input: { serviceId: $serviceId, environmentId: $environmentId }
        first: 1
      ) {
        edges { node { id status createdAt } }
      }
    }
  `;

  const depRes = await fetch(RAILWAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: deploymentsQuery,
      variables: { serviceId, environmentId: environmentId || undefined },
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!depRes.ok) {
    throw new Error(`Railway API HTTP ${depRes.status} listing deployments`);
  }

  const depData = await depRes.json();
  if (depData.errors?.length) {
    throw new Error(`Railway API: ${depData.errors[0]?.message || "unknown error"}`);
  }

  const deploymentId = depData?.data?.deployments?.edges?.[0]?.node?.id;
  if (!deploymentId) {
    throw new Error("No active deployment found for this service");
  }

  const logsQuery = `
    query($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        timestamp
        message
        severity
      }
    }
  `;

  const logsRes = await fetch(RAILWAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: logsQuery,
      variables: { deploymentId, limit },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!logsRes.ok) {
    throw new Error(`Railway API HTTP ${logsRes.status} fetching logs`);
  }

  const logsData = await logsRes.json();
  if (logsData.errors?.length) {
    throw new Error(`Railway logs: ${logsData.errors[0]?.message || "unknown error"}`);
  }

  const entries = logsData?.data?.deploymentLogs || [];
  return entries.map((e) => {
    const sev = String(e.severity || "info").toLowerCase();
    return `[${e.timestamp || ""}] [${sev}] ${e.message || ""}`;
  });
}

async function getLogsForDevReport({ limit = 60 } = {}) {
  const { getLogRingBuffer } = require("../utils/logger");
  const sections = [];

  const bufferEntries = getLogRingBuffer(limit);
  if (bufferEntries.length) {
    const lines = bufferEntries.map((e) => {
      const metaPart = e.meta ? ` ${e.meta}` : "";
      return `[${e.ts}] [${e.level}] ${e.message}${metaPart}`;
    });
    sections.push({
      title: `📋 Process logs — last ${lines.length} lines (current session)`,
      lines,
    });
  } else {
    sections.push({
      title: "📋 Process logs (current session)",
      lines: ["(buffer empty — no log lines captured yet)"],
    });
  }

  const token = String(process.env.RAILWAY_TOKEN || "").trim();
  const serviceId = String(process.env.RAILWAY_SERVICE_ID || "").trim();

  if (token && serviceId) {
    try {
      const environmentId = String(process.env.RAILWAY_ENVIRONMENT_ID || "").trim() || undefined;
      const railwayLines = await fetchRailwayDeploymentLogs({ token, serviceId, environmentId, limit });
      sections.push({
        title: railwayLines.length
          ? `🚂 Railway deployment logs — last ${railwayLines.length} lines`
          : "🚂 Railway deployment logs",
        lines: railwayLines.length ? railwayLines : ["(no log entries returned)"],
      });
    } catch (err) {
      sections.push({
        title: "🚂 Railway deployment logs",
        lines: [`(fetch failed: ${err.message})`],
      });
    }
  } else {
    const missing = [
      !token && "RAILWAY_TOKEN",
      !serviceId && "RAILWAY_SERVICE_ID",
    ].filter(Boolean);
    sections.push({
      title: "🚂 Railway deployment logs",
      lines: [`(not configured — set ${missing.join(" and ")} as env vars to enable)`],
    });
  }

  return sections;
}

function formatLogsForDiscord(sections, maxChars = 1800) {
  const chunks = [];

  for (const section of sections) {
    const header = `**${section.title}**\n`;
    const body = section.lines.join("\n");
    const block = `${header}\`\`\`\n${body}\n\`\`\``;

    if (block.length <= maxChars) {
      chunks.push(block);
    } else {
      const available = maxChars - header.length - 12;
      const truncated = body.slice(-Math.max(available, 200));
      chunks.push(`${header}\`\`\`\n[...truncated]\n${truncated}\n\`\`\``);
    }
  }

  return chunks;
}

module.exports = {
  getLogsForDevReport,
  formatLogsForDiscord,
};
