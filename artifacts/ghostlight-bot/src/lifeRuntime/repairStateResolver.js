"use strict";

/**
 * repairStateResolver
 *
 * Canonical repair state authority.
 *
 * The DB (consequenceStore) is the single source of truth for repair state.
 * This module normalises the already-computed consequenceContext (loaded from
 * DB by lifeRuntime each tick) into a canonical repair snapshot that all
 * read models must use.
 *
 * CORE LAW:
 *   - The prelude reads repair state from this resolver only.
 *   - worldModelRuntime._beliefMap is a DERIVED read model, not an authority.
 *   - consequenceStore is the authority; consequenceContext is its computed view.
 *   - After restart, hydrateFromStore() re-derives state directly from the store.
 *
 * Repair snapshot schema:
 *   {
 *     repair_required:              boolean,
 *     repair_completed:             boolean,
 *     give_space_active:            boolean,
 *     unresolved_consequence_count: number,
 *     active_repair_types:          string[],  // ["needed"] | ["started"] | ["healing"] | []
 *     last_repair_event_at:         string|null,
 *     confidence:                   number,    // 0.90 when from DB, lower when derived
 *     source:                       "consequenceStore"|"derived",
 *   }
 */

/**
 * createRepairStateResolver
 *
 * @param {object}      opts
 * @param {object|null} opts.consequenceStore - consequenceStore instance (optional, for direct hydration)
 * @returns {{ fromConsequenceContext, hydrateFromStore, getSnapshot }}
 */
function createRepairStateResolver({ consequenceStore = null } = {}) {
  let _snapshot = null;

  /**
   * fromConsequenceContext
   *
   * Normalises a consequenceContext carryover into a canonical repair snapshot.
   * This is the fast path — called every tick from lifeRuntime's cached context.
   *
   * @param {object|null} carryover - consequenceContext.carryover
   *        (from repairCarryoverEngine: { giveSpace, repairRequired, repairStarted, healing, warming, active })
   * @param {number} [activeCount=0]
   * @returns {RepairSnapshot|null}
   */
  function fromConsequenceContext(carryover, activeCount = 0) {
    if (!carryover) { _snapshot = null; return null; }

    const { giveSpace = false, healing = false, repairStarted = false, repairRequired = false } = carryover;

    const repairType = giveSpace ? "give_space"
      : healing       ? "healing"
      : repairStarted ? "started"
      : repairRequired ? "needed"
      : null;

    _snapshot = {
      repair_required:              Boolean(repairRequired),
      repair_completed:             Boolean(healing && !repairRequired),
      give_space_active:            Boolean(giveSpace),
      unresolved_consequence_count: Number.isFinite(activeCount) ? activeCount : 0,
      active_repair_types:          repairType ? [repairType] : [],
      last_repair_event_at:         null,
      confidence:                   0.90,
      source:                       "consequenceStore",
    };

    return _snapshot;
  }

  /**
   * hydrateFromStore
   *
   * Direct hydration from consequenceStore (for startup/restart recovery).
   * Re-derives canonical repair state without needing a prior tick to complete.
   *
   * @param {string} companionId
   * @param {string} customerId
   * @returns {Promise<RepairSnapshot|null>}
   */
  async function hydrateFromStore(companionId, customerId) {
    if (!consequenceStore || !companionId) return null;

    try {
      const active = await consequenceStore.listActive({ companionId, customerId });
      if (!Array.isArray(active)) return null;

      const repairRequired = active.some(c => c.repairRequired && !c.repairCompleted);
      const repairStarted  = active.some(c => c.repairStarted && !c.repairCompleted);
      const healing        = active.some(c => c.repairStarted && c.repairCompleted);
      const giveSpace      = active.some(c =>
        Array.isArray(c.suppressionRules) && c.suppressionRules.some(r => r?.type === "give_space")
      );

      const repairType = giveSpace ? "give_space"
        : healing       ? "healing"
        : repairStarted ? "started"
        : repairRequired ? "needed"
        : null;

      _snapshot = {
        repair_required:              repairRequired,
        repair_completed:             !repairRequired && healing,
        give_space_active:            giveSpace,
        unresolved_consequence_count: active.length,
        active_repair_types:          repairType ? [repairType] : [],
        last_repair_event_at:         active[0]?.updatedAt ?? null,
        confidence:                   0.90,
        source:                       "consequenceStore",
      };

      return _snapshot;
    } catch {
      return null;
    }
  }

  /**
   * getSnapshot
   * Returns the most recently computed repair snapshot.
   * @returns {RepairSnapshot|null}
   */
  function getSnapshot() { return _snapshot; }

  return { fromConsequenceContext, hydrateFromStore, getSnapshot };
}

module.exports = { createRepairStateResolver };
