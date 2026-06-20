/**
 * relationalDesireService
 *
 * The companion may FEEL internal desires (to reconnect, to send a voice note,
 * to suggest music, to follow up). This service records that internal pull —
 * and nothing else. It NEVER executes an action. Every desire is stored with
 * requiresPermission = true and allowedAction = null; acting on it is always a
 * separate, externally-permissioned step (spec Phase 8). Gated by
 * desire_tracking_enabled; if off, a blocked desire is logged, never created.
 */

const { isDesireType } = require("./relationalTypes");

function createRelationalDesireService({ store, companionId, logger, auditLog }) {
  // Record an internal desire. Returns the stored desire (never an action).
  async function maybeCreateDesire({ appraisal, settings }) {
    const config = (settings && settings.config) || {};

    if (!settings || !settings.active || config.desire_tracking_enabled !== true) {
      await auditLog.append({
        eventType: "desire:blocked",
        decision: "blocked",
        reason: "desire_tracking_disabled",
      });
      return null;
    }

    if (!appraisal?.desireGenerated) {
      return null;
    }

    const desireType = isDesireType(appraisal.desireType) ? appraisal.desireType : "do_nothing";
    if (desireType === "do_nothing" || desireType === "wait") {
      return null;
    }

    const intensity = scaleIntensity(appraisal.intensity, config.desire_intensity);

    let record = null;
    if (store) {
      try {
        record = await store.insertDesire({
          companionId,
          desireType,
          intensity,
          reason: appraisal.triggerSummary || appraisal.primarySignal || "relational pull",
          // Hard invariant: the engine never grants itself an action.
          allowedAction: null,
          requiresPermission: true,
          status: "internal",
        });
      } catch (error) {
        logger.warn("[relational-state:error] Failed to persist desire.", {
          companionId,
          error: error.message,
        });
      }
    }

    await auditLog.append({
      eventType: "desire:created",
      decision: "internal_only",
      inputSummary: desireType,
      outputSummary: "requiresPermission=true, allowedAction=null (never executed)",
    });

    return {
      desireId: record?.desireId || null,
      desireType,
      intensity,
      requiresPermission: true,
      allowedAction: null,
      status: "internal",
      executed: false,
    };
  }

  async function listDesires({ status = null, limit = 50 } = {}) {
    if (!store) return [];
    try {
      return await store.listDesires({ companionId, status, limit });
    } catch {
      return [];
    }
  }

  return { maybeCreateDesire, listDesires };
}

function scaleIntensity(rawIntensity, desireIntensitySetting) {
  const base = Number(rawIntensity) || 0;
  const scale = (Number(desireIntensitySetting) || 5) / 5; // 0..2
  return Math.min(10, Math.max(0, Math.round(base * scale * 100) / 100));
}

module.exports = { createRelationalDesireService };
