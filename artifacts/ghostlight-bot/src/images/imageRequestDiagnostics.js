"use strict";

let lastImageRequest = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function startImageRequestDiagnostics(initial = {}) {
  lastImageRequest = {
    prompt: "",
    provider: "",
    model: "",
    status: "started",
    failureStage: "",
    providerResponseSummary: {},
    discordUploadSummary: {},
    regression_source_commit_if_identified: "not_identified_in_runtime",
    dashboard_media_path_used: false,
    discord_media_path_used: true,
    media_execution_stage: "structured_request_created",
    events: [],
    updatedAt: new Date().toISOString(),
    ...clone(initial),
  };
  return updateImageRequestDiagnostics({ event: "started" });
}

function updateImageRequestDiagnostics(update = {}) {
  if (!lastImageRequest) {
    lastImageRequest = {
      status: "unknown",
      events: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const event = update.event ? { event: update.event, at: new Date().toISOString() } : null;
  const next = { ...update };
  delete next.event;

  lastImageRequest = {
    ...lastImageRequest,
    ...clone(next),
    providerResponseSummary: {
      ...(lastImageRequest.providerResponseSummary || {}),
      ...(next.providerResponseSummary || {}),
    },
    discordUploadSummary: {
      ...(lastImageRequest.discordUploadSummary || {}),
      ...(next.discordUploadSummary || {}),
    },
    events: event ? [...(lastImageRequest.events || []), event].slice(-30) : (lastImageRequest.events || []),
    updatedAt: new Date().toISOString(),
  };

  return clone(lastImageRequest);
}

function getLastImageRequestDiagnostics() {
  return clone(lastImageRequest || { status: "none", events: [] });
}

function formatLastImageRequestDiagnostics() {
  const last = getLastImageRequestDiagnostics();
  if (last.status === "none") return "No image request has been recorded yet.";
  return [
    `status: ${last.status || "unknown"}`,
    `stage: ${last.media_execution_stage || "unknown"}`,
    `failure_stage: ${last.failureStage || ""}`,
    `prompt: ${last.prompt || ""}`,
    `provider/model: ${(last.provider || "")}/${(last.model || "")}`,
    `provider_response: ${JSON.stringify(last.providerResponseSummary || {})}`,
    `discord_upload: ${JSON.stringify(last.discordUploadSummary || {})}`,
    `dashboard_media_path_used: ${Boolean(last.dashboard_media_path_used)}`,
    `discord_media_path_used: ${Boolean(last.discord_media_path_used)}`,
    `regression_source_commit_if_identified: ${last.regression_source_commit_if_identified || "not_identified_in_runtime"}`,
  ].join("\n").slice(0, 1900);
}

module.exports = {
  startImageRequestDiagnostics,
  updateImageRequestDiagnostics,
  getLastImageRequestDiagnostics,
  formatLastImageRequestDiagnostics,
};
