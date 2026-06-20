/**
 * lifeEngine/autonomyEngine
 *
 * Phase 14 — autonomy.
 *
 * Turns situational inputs (the current schedule window, behavioral state,
 * presence mode, and the real places the companion knows) into a single proposed
 * activity. It only ever proposes — it never executes. The orchestrator decides
 * whether to act, and any in-world action is carried out by the movement /
 * teleport engines through the durable command queue.
 *
 * It never invents places: targets are drawn only from the landmarks and
 * discoveries passed in. With nothing to go on it proposes a safe "idle".
 */

function pick(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * @returns {{ activityType: string, action: string, target: object|null, autonomyLevel: string, journal: boolean, reason: string }}
 */
function chooseActivity({
  scheduleEntry = null,
  state = "",
  influences = {},
  presenceMode = "active",
  landmarks = [],
  discoveries = [],
  ownerPresent = false,
} = {}) {
  const autonomyLevel = String(scheduleEntry?.autonomyLevel || "medium").toLowerCase();
  const activityType = String(scheduleEntry?.activityType || "").toLowerCase();
  const wanderBias = Number(influences?.wanderBias ?? 0.3);
  const idle = (reason) => ({
    activityType: activityType || "idle",
    action: "idle",
    target: null,
    autonomyLevel,
    journal: false,
    reason,
  });

  // Resting overrides everything.
  if (presenceMode === "sleep") return { ...idle("sleep_mode"), action: "rest" };

  // Night / wind-down: head home if a home landmark exists.
  if (activityType === "night") {
    const home = (Array.isArray(landmarks) ? landmarks : []).find((l) => l && l.isHome);
    if (home) {
      return { activityType, action: "return_home", target: home, autonomyLevel, journal: Boolean(influences?.shouldJournal), reason: "night_return_home" };
    }
    return { ...idle("night_no_home"), journal: Boolean(influences?.shouldJournal) };
  }

  // Owner is present and it's downtime: prefer staying with them.
  if (ownerPresent && (activityType === "evening" || influences?.shouldInviteOwner)) {
    return { activityType: activityType || "social", action: "spend_time_with_owner", target: null, autonomyLevel, journal: false, reason: "owner_present" };
  }

  // High autonomy + wander-y state: explore a known place (landmark or a rated discovery).
  if ((autonomyLevel === "high" || wanderBias >= 0.6) && presenceMode !== "away") {
    const candidates = (Array.isArray(landmarks) ? landmarks : []).filter((l) => l && l.enabled !== false && !l.isPrivate);
    const target = pick(candidates);
    if (target) {
      return { activityType: activityType || "explore", action: "visit_landmark", target, autonomyLevel, journal: Boolean(influences?.shouldJournal), reason: "explore_landmark" };
    }
    const real = (Array.isArray(discoveries) ? discoveries : []).filter((d) => d && d.visited);
    const revisit = pick(real);
    if (revisit) {
      return { activityType: activityType || "explore", action: "revisit_discovery", target: revisit, autonomyLevel, journal: Boolean(influences?.shouldJournal), reason: "revisit_discovery" };
    }
  }

  // Reflective / journaling bias.
  if (influences?.shouldJournal) {
    return { activityType: activityType || "reflect", action: "journal", target: null, autonomyLevel, journal: true, reason: "reflective" };
  }

  return idle("no_action");
}

module.exports = {
  chooseActivity,
};
