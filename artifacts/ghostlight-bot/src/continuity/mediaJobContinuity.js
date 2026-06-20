"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Media Job Continuity
 *
 * Tracks media generation jobs (images, audio, video).
 *
 * Rules:
 * - Do not claim media sent without sent_message_id.
 * - Remember provider errors (GETIMG reference limits, etc.).
 * - sent_message_id must be set before status can be "sent".
 * - If job has no sent_message_id, it is never "sent" — period.
 */

async function captureMediaJob({
  store,
  config,
  mediaType = "image",
  provider = "getimg",
  model = "",
  jobId = "",
  status = "pending",
  metadata = {},
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.media_job_continuity_enabled) return null;

  try {
    const item = await store.create({
      type: ITEM_TYPES.MEDIA_JOB,
      title: `${mediaType} job — ${provider}`,
      summary: `${provider} ${mediaType} job. Status: ${status}`,
      sourceMessageId,
      sourceChannelId,
      status: ITEM_STATUSES.OPEN,
      priority: "low",
      certainty: CERTAINTY_LEVELS.DEFINITE,
      createdBy: "system",
      metadata: {
        media_type: mediaType,
        provider,
        model,
        job_id: jobId,
        status,
        sent_message_id: null, // MUST be set explicitly before marking sent
        gallery_item_id: null,
        reference_mode: metadata.reference_mode || null,
        last_error: null,
        retry_allowed: true,
        ...metadata,
      },
    });

    if (item) {
      logger?.debug?.("[continuity] captured media_job", { id: item.id, jobId, provider });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] mediaJobContinuity error", { error: err?.message });
    return null;
  }
}

async function markMediaJobSent({ store, itemId, sentMessageId, galleryItemId = null, logger }) {
  if (!sentMessageId) {
    logger?.warn("[continuity] markMediaJobSent: sentMessageId is required — cannot mark sent without message id", { itemId });
    throw new Error("sentMessageId is required to mark a media job as sent.");
  }

  return store.update(itemId, {
    status: ITEM_STATUSES.RESOLVED,
    resolution: `Sent. message_id=${sentMessageId}`,
    resolvedAt: new Date(),
    metadata: undefined, // caller must merge
  });
}

async function markMediaJobFailed({ store, itemId, error = "", retryAllowed = false, logger }) {
  logger?.warn("[continuity] media job failed", { itemId, error });
  return store.update(itemId, {
    status: ITEM_STATUSES.OUTCOME_PENDING,
    nextAction: retryAllowed ? "Retry when appropriate." : "Do not retry — log and report.",
    metadata: undefined, // caller merges last_error + retry_allowed
  });
}

module.exports = { captureMediaJob, markMediaJobSent, markMediaJobFailed };
