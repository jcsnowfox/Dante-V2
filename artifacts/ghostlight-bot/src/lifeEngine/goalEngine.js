/**
 * lifeEngine/goalEngine
 *
 * Phase 19 — long-term goals.
 *
 * UI-configurable companion goals (visit N regions, discover music venues, build
 * a favorites collection, complete a photo album, learn owner preferences, find
 * a favorite cafe/beach/club, ...). The hard rule (spec): PROGRESS ONLY ADVANCES
 * THROUGH REAL EVENTS. `recordProgress` requires real evidence and a positive
 * amount; there is no fabricated-progress path and progress never decrements.
 *
 * With no database every method degrades to a safe no-op / empty list and never
 * throws.
 */

const GOAL_TYPES = [
  "visit_regions",
  "discover_music_venues",
  "build_favorites",
  "complete_photo_album",
  "learn_owner_preferences",
  "maintain_friendships",
  "find_favorite_cafe",
  "find_favorite_beach",
  "find_favorite_club",
  "custom",
];

function asText(value) {
  return value == null ? "" : String(value);
}

function normalizeType(type) {
  const t = asText(type).trim().toLowerCase();
  return GOAL_TYPES.includes(t) ? t : "custom";
}

function createGoalEngine({ secondLife = null, config = null, logger = null } = {}) {
  function hasStore(method) {
    return secondLife && typeof secondLife[method] === "function";
  }

  async function listGoals({ companionId, status } = {}) {
    if (!hasStore("listGoals")) return [];
    try {
      return await secondLife.listGoals({ companionId, status });
    } catch (error) {
      logger?.warn?.("[life-engine] listGoals failed.", { error: error.message });
      return [];
    }
  }

  async function listActive({ companionId } = {}) {
    return listGoals({ companionId, status: "active" });
  }

  async function createGoal({ companionId, goalType = "custom", label = "", targetValue = 0, unit = "", metadata = null } = {}) {
    if (!hasStore("upsertGoal")) return null;
    if (!asText(label)) return null;
    try {
      return await secondLife.upsertGoal({
        companionId,
        goalType: normalizeType(goalType),
        label: asText(label),
        targetValue: Math.max(0, Number(targetValue) || 0),
        currentValue: 0,
        unit: asText(unit),
        status: "active",
        metadata,
      });
    } catch (error) {
      logger?.warn?.("[life-engine] createGoal failed.", { error: error.message });
      return null;
    }
  }

  async function updateGoal({ companionId, id, goalType, label, targetValue, unit, status, metadata } = {}) {
    if (!hasStore("upsertGoal") || !id) return null;
    try {
      return await secondLife.upsertGoal({
        companionId,
        id,
        goalType: normalizeType(goalType),
        label: asText(label),
        targetValue: Math.max(0, Number(targetValue) || 0),
        unit: asText(unit),
        status: asText(status) || "active",
        metadata,
      });
    } catch (error) {
      logger?.warn?.("[life-engine] updateGoal failed.", { error: error.message });
      return null;
    }
  }

  async function deleteGoal({ companionId, id } = {}) {
    if (!hasStore("deleteGoal") || !id) return false;
    try {
      return await secondLife.deleteGoal({ companionId, id });
    } catch (error) {
      logger?.warn?.("[life-engine] deleteGoal failed.", { error: error.message });
      return false;
    }
  }

  /**
   * Advance progress for goals of a given type — ONLY when backed by real
   * evidence (a non-empty evidence object/string) and a positive amount. Returns
   * the list of goals that advanced (so callers can journal completions). Never
   * invents progress and never decrements.
   */
  async function recordProgress({ companionId, goalType, amount = 1, evidence = null } = {}) {
    const step = Math.max(0, Number(amount) || 0);
    const hasEvidence = evidence != null && (typeof evidence === "object" ? Object.keys(evidence).length > 0 : asText(evidence).length > 0);
    if (step === 0 || !hasEvidence) {
      logger?.debug?.("[life-engine] goal progress skipped — no real evidence/amount.");
      return [];
    }
    if (!hasStore("listGoals") || !hasStore("incrementGoalProgress")) return [];
    const type = normalizeType(goalType);
    let advanced = [];
    try {
      const active = await secondLife.listGoals({ companionId, status: "active" });
      const matching = (Array.isArray(active) ? active : []).filter((g) => g && g.goalType === type);
      for (const goal of matching) {
        try {
          const updated = await secondLife.incrementGoalProgress({ companionId, id: goal.id, amount: step });
          if (updated) advanced.push(updated);
        } catch (error) {
          logger?.warn?.("[life-engine] incrementGoalProgress failed.", { error: error.message, goalId: goal.id });
        }
      }
    } catch (error) {
      logger?.warn?.("[life-engine] recordProgress failed.", { error: error.message });
      return [];
    }
    return advanced;
  }

  return {
    listGoals,
    listActive,
    createGoal,
    updateGoal,
    deleteGoal,
    recordProgress,
    normalizeType,
    GOAL_TYPES,
  };
}

module.exports = {
  createGoalEngine,
  GOAL_TYPES,
};
