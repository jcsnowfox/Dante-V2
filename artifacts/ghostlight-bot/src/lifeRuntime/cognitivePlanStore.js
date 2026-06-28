"use strict";

/**
 * cognitivePlanStore
 *
 * Stores Dante's private plans — structured intentions formed during deliberation.
 * Plans are not actions. They exist in Dante's private cognition until the right
 * moment presents itself, or until they are abandoned.
 *
 * Table: dante_cognitive_plans (additive schema, not yet migrated)
 *
 * Dante ONLY — not a general companion plan store.
 */

const PLAN_TYPES = Object.freeze([
  "repair_plan",
  "romantic_plan",
  "maintenance_plan",
  "learning_plan",
  "project_plan",
  "conversation_plan",
  "restraint_plan",
  "followup_plan",
  "private_reflection_plan",
]);

const PLAN_STATUSES = Object.freeze(["forming", "active", "paused", "abandoned", "completed"]);

const MAX_ACTIVE_PLANS = 5;

function createCognitivePlanStore({ config = {}, logger = null } = {}) {
  // In-memory: Map<scopeKey, plan[]>
  const _mem = new Map();

  function _scopeKey(companionId, customerId) { return `${companionId}:${customerId}`; }
  function _scopeList(companionId, customerId) {
    const k = _scopeKey(companionId, customerId);
    if (!_mem.has(k)) _mem.set(k, []);
    return _mem.get(k);
  }

  async function init() {}

  async function createPlan({
    companionId  = "",
    customerId   = "user",
    planType     = "conversation_plan",
    summary      = "",
    intent       = "",
    conditions   = [],
    steps        = [],
    confidence   = 0.50,
    suppressedBy = null,
    metadata     = {},
  } = {}) {
    if (!PLAN_TYPES.includes(planType)) {
      logger?.warn("[cognitive-plan-store] unknown planType", { planType });
    }

    const plan = {
      id:           `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      companion_id: companionId,
      customer_id:  customerId,
      plan_type:    planType,
      summary:      String(summary).slice(0, 200),
      intent:       String(intent).slice(0, 200),
      conditions,
      steps,
      confidence,
      status:       "forming",
      suppressed_by: suppressedBy,
      metadata,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };

    const list = _scopeList(companionId, customerId);
    list.push(plan);

    // Cap active plans to avoid unbounded growth
    const active = list.filter(p => p.status === "active" || p.status === "forming");
    if (active.length > MAX_ACTIVE_PLANS) {
      // Mark the oldest forming plan as abandoned
      const oldest = active.find(p => p.status === "forming");
      if (oldest) oldest.status = "abandoned";
    }

    return plan;
  }

  async function updatePlan({ id, companionId, customerId, status, confidence, steps } = {}) {
    const list = _scopeList(companionId, customerId);
    const plan = list.find(p => p.id === id);
    if (!plan) return null;
    if (status) plan.status = status;
    if (typeof confidence === "number") plan.confidence = confidence;
    if (steps) plan.steps = steps;
    plan.updated_at = new Date().toISOString();
    return plan;
  }

  async function listActive({ companionId, customerId } = {}) {
    return _scopeList(companionId, customerId)
      .filter(p => p.status === "active" || p.status === "forming")
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  }

  async function listAll({ companionId, customerId, limit = 20 } = {}) {
    return _scopeList(companionId, customerId)
      .slice(-limit)
      .reverse();
  }

  async function pruneCompleted({ companionId, customerId, keepLast = 10 } = {}) {
    const list = _scopeList(companionId, customerId);
    const done = list.filter(p => p.status === "abandoned" || p.status === "completed");
    if (done.length > keepLast) {
      const toRemove = done.slice(0, done.length - keepLast).map(p => p.id);
      const pruned = list.filter(p => !toRemove.includes(p.id));
      const k = _scopeKey(companionId, customerId);
      _mem.set(k, pruned);
      return toRemove.length;
    }
    return 0;
  }

  function getStatus() {
    let totalActive = 0;
    let totalAbandoned = 0;
    for (const list of _mem.values()) {
      totalActive    += list.filter(p => p.status === "active" || p.status === "forming").length;
      totalAbandoned += list.filter(p => p.status === "abandoned").length;
    }
    return { active_plans: totalActive, abandoned_plans: totalAbandoned };
  }

  return { init, createPlan, updatePlan, listActive, listAll, pruneCompleted, getStatus, PLAN_TYPES, PLAN_STATUSES };
}

module.exports = { createCognitivePlanStore, PLAN_TYPES, PLAN_STATUSES };
