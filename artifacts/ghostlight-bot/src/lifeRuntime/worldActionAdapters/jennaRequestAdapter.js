"use strict";

/**
 * jennaRequestAdapter
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Adapter for the ask_jenna strategy. Creates a real pending request in
 * pendingRequestStore — a genuine queue entry, not a text claim.
 *
 * Hard rules:
 *   - Never guilt-trip: messages are factual, not emotionally coercive
 *   - Never spam: cooldown enforced via listRecent() check before create()
 *   - Respect give-space: canExecute() returns false
 *   - Respect repair: canExecute() returns false when repair required and not completed
 *   - Respect quiet hours: canExecute() returns false
 *   - Respect cooldowns: COOLDOWN_HOURS window per needType
 */

const { OUTCOMES } = require("./index");

const COOLDOWN_HOURS = 24;

const jennaRequestAdapter = {
  strategyKeys: ["ask_jenna"],

  canExecute({ context = {} } = {}) {
    if (context.giveSpace)                                  return false;
    if (context.repairRequired && !context.repairCompleted) return false;
    if (context.quietHours)                                 return false;
    if (context.jennaIsAsleep)                              return false;
    return true;
  },

  async execute({
    companionId, customerId, need, plan, context = {}, now = new Date(),
  } = {}) {
    const pendingRequestStore = context.pendingRequestStore ?? null;

    if (!pendingRequestStore) {
      return {
        outcome:  OUTCOMES.UNAVAILABLE,
        evidence: { reason: "no_pending_request_store" },
        note:     "Cannot queue request — no request store available",
      };
    }

    // Cooldown check: don't ask about the same needType more than once per window
    const recentRequests = await pendingRequestStore.listRecent({
      companionId, customerId,
      needType:   need.needType,
      sinceHours: COOLDOWN_HOURS,
      status:     "pending",
    }).catch(() => []);

    if (recentRequests.length > 0) {
      return {
        outcome:  OUTCOMES.DEFERRED,
        evidence: {
          reason:          "cooldown_active",
          recentCount:     recentRequests.length,
          cooldownHours:   COOLDOWN_HOURS,
          needType:        need.needType,
        },
        note:    `Cooldown active — already have a pending request about ${need.needType.replace(/_/g, " ")}`,
        followUp: "Wait for existing request to be resolved",
      };
    }

    // Create the real pending request
    const request = await pendingRequestStore.create({
      companionId, customerId,
      requestType: "ask_resource",
      needType:    need.needType,
      message:     `Dante is interested in ${need.needType.replace(/_/g, " ")} and would appreciate suggestions`,
    }).catch(() => null);

    if (!request) {
      return {
        outcome:  OUTCOMES.UNAVAILABLE,
        evidence: { reason: "request_create_failed", needType: need.needType },
        note:     "Could not queue request",
      };
    }

    return {
      outcome:  OUTCOMES.PARTIAL,
      evidence: {
        requestId:    request.id,
        requestType:  "ask_resource",
        needType:     need.needType,
        requestedAt:  now.toISOString(),
      },
      note:    `Request queued about ${need.needType.replace(/_/g, " ")}`,
      followUp: "Await Jenna's response before asking again",
    };
  },
};

module.exports = { jennaRequestAdapter, COOLDOWN_HOURS };
