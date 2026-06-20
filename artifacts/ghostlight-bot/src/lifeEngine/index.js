/**
 * lifeEngine/index — the Companion Life Engine orchestrator.
 *
 * Phase 14 ties the life-engine modules together behind one configurable switch.
 * When enabled, a periodic `tick` reads the live world state, derives a behavioral
 * state, resolves the current schedule activity, and asks the autonomy engine what
 * the companion would do right now. The chosen intent is recorded to the life
 * journal for continuity.
 *
 * Boundaries (Stage 5): the orchestrator DECIDES and JOURNALS. It does not drive
 * the avatar in-world — turning intent into queued teleport/movement commands is
 * the initiative engine's job (Stage 6). Targets are only ever drawn from real
 * landmarks and genuinely-visited discoveries, never invented.
 *
 * Non-breaking: disabled by default. With the life engine off, or with no
 * database, `tick` is a guarded no-op and never throws.
 */

const { createDailyScheduleEngine } = require("./dailyScheduleEngine");
const { createDiscoveryEngine } = require("./discoveryEngine");
const { createWorldAwarenessEngine } = require("./worldAwarenessEngine");
const { createPresenceEngine } = require("./presenceEngine");
const { createRelationshipEngine } = require("./relationshipEngine");
const { createMemoryEngineBridge } = require("./memoryEngineBridge");
const { createSharedExperienceEngine } = require("./sharedExperienceEngine");
const { createGoalEngine } = require("./goalEngine");
const { createInitiativeEngine } = require("./initiativeEngine");
const emotionalStateEngine = require("./emotionalStateEngine");
const socialIntelligenceEngine = require("./socialIntelligenceEngine");
const autonomyEngine = require("./autonomyEngine");

function createLifeEngine({ secondLife = null, config = null, logger = null, engines = {} } = {}) {
  const schedule = engines.schedule || createDailyScheduleEngine({ secondLife, config, logger });
  const discovery = engines.discovery || createDiscoveryEngine({ secondLife, config, logger });
  const world = engines.world || createWorldAwarenessEngine({ secondLife, config, logger });
  const presence = engines.presence || createPresenceEngine({ secondLife, config, logger });
  const relationship = engines.relationship || createRelationshipEngine({ secondLife, config, logger });
  const memory = engines.memory || createMemoryEngineBridge({ secondLife, config, logger });
  const sharedExperience = engines.sharedExperience || createSharedExperienceEngine({ secondLife, config, logger });
  const goal = engines.goal || createGoalEngine({ secondLife, config, logger });
  const initiative = engines.initiative || createInitiativeEngine({ secondLife, config, logger });
  const emotional = engines.emotional || emotionalStateEngine;
  const social = engines.social || socialIntelligenceEngine;
  const autonomy = engines.autonomy || autonomyEngine;

  function isEnabled() {
    return Boolean(config?.secondLife?.lifeEngine?.enabled);
  }

  function getTickIntervalMs() {
    const ms = Number(config?.secondLife?.lifeEngine?.tickIntervalMs);
    return Number.isFinite(ms) && ms >= 30000 ? ms : 5 * 60 * 1000;
  }

  /**
   * Idempotently seed the generic default daily schedule. Safe with no DB.
   */
  async function seed({ companionId }) {
    try {
      return await schedule.seedDefaults({ companionId });
    } catch (error) {
      logger?.warn?.("[life-engine] seed failed.", { error: error.message });
      return 0;
    }
  }

  /**
   * Compute the companion's current situation and chosen activity without acting
   * in-world. Used by both `tick` and the dashboard status panel. Always returns
   * a well-formed object; never throws.
   */
  async function assess({ companionId, now = new Date() } = {}) {
    const result = {
      enabled: isEnabled(),
      world: world.EMPTY_SUMMARY,
      state: "relaxed",
      influences: emotional.influencesFor("relaxed"),
      scheduleActivity: null,
      presenceMode: "active",
      social: { action: "idle", reason: "default" },
      activity: { action: "idle", target: null, reason: "default" },
    };
    try {
      const summary = await world.summarize({ companionId, now });
      result.world = summary;

      const scheduleEntry = await schedule.resolveCurrentActivity({ companionId, now });
      result.scheduleActivity = scheduleEntry;

      const { state, influences } = emotional.deriveState({
        timeOfDay: summary.timeOfDay,
        ownerPresent: summary.ownerPresent,
        scheduleActivityType: scheduleEntry?.activityType || "",
        nearbyCount: summary.nearbyCount,
      });
      result.state = state;
      result.influences = influences;

      const presenceMode = presence.getPresenceMode({
        scheduleEntry,
        state,
        ownerPresent: summary.ownerPresent,
      });
      result.presenceMode = presenceMode;

      result.social = social.decideSocialAction({
        nearbyAvatars: summary.nearbyAvatars,
        state,
        ownerPresent: summary.ownerPresent,
      });

      let landmarks = [];
      if (secondLife && typeof secondLife.listLandmarks === "function") {
        try {
          landmarks = await secondLife.listLandmarks({ companionId });
        } catch (error) {
          logger?.warn?.("[life-engine] listLandmarks failed.", { error: error.message });
        }
      }
      const discoveries = await discovery.listRecent({ companionId, limit: 50 });

      result.activity = autonomy.chooseActivity({
        scheduleEntry,
        state,
        influences,
        presenceMode,
        landmarks,
        discoveries,
        ownerPresent: summary.ownerPresent,
      });
    } catch (error) {
      logger?.warn?.("[life-engine] assess failed.", { error: error.message });
    }
    return result;
  }

  /**
   * One life-engine tick. No-op (and no error) when disabled. When enabled, it
   * assesses the situation and journals the chosen activity for continuity.
   */
  async function tick({ companionId, now = new Date() } = {}) {
    if (!isEnabled()) return { ran: false, reason: "disabled" };
    if (!companionId) return { ran: false, reason: "no_companion" };

    const assessment = await assess({ companionId, now });
    const activity = assessment.activity || {};

    if (activity.journal) {
      const label = assessment.scheduleActivity?.activityLabel || activity.action || "spending time";
      await memory.recordExperience({
        companionId,
        entryType: "life",
        title: `Feeling ${assessment.state}`,
        body: `${label} (${activity.action}).`,
        location: assessment.world?.region ? { region: assessment.world.region } : null,
      });
    }

    // Phase 18 — initiative. Observation/decision only (never drives the avatar).
    // Disabled by default; when on, propose() enforces evidence/quiet-hours/
    // cooldown/cap/owner-busy/privacy and logs WHY for every outcome. Owner-busy
    // is derived conservatively from presence (sleep/away ⇒ do not interrupt).
    let initiativeResult = null;
    if (initiative.isEnabled()) {
      const ownerBusy = assessment.presenceMode === "sleep" || assessment.presenceMode === "away";
      // Privacy is honored when the social posture says to respect privacy.
      const privacy = assessment.social?.action === "respect_privacy";
      initiativeResult = await initiative.propose({ companionId, now, ownerBusy, privacy });
    }

    return { ran: true, assessment, initiative: initiativeResult };
  }

  /**
   * Record a genuine shared experience (Phase 17) and let it advance any matching
   * long-term goal (Phase 19). This is a REAL-event entry point — callers invoke
   * it when something actually happened, so the goal progress it produces is
   * always evidence-backed, never fabricated by the observational tick.
   */
  async function recordSharedExperience(args = {}) {
    const stored = await sharedExperience.recordExperience(args);
    if (stored) {
      try {
        await goal.recordProgress({
          companionId: args.companionId,
          goalType: stored.experienceType,
          amount: 1,
          evidence: { sharedExperienceId: stored.id, experienceType: stored.experienceType },
        });
      } catch (error) {
        logger?.debug?.("[life-engine] goal progress from shared experience failed.", { error: error.message });
      }
    }
    return stored;
  }

  /**
   * Advance long-term goals from a real event. Thin pass-through to the goal
   * engine, which refuses to advance without real evidence + a positive amount.
   */
  async function recordGoalProgress(args = {}) {
    return goal.recordProgress(args);
  }

  /**
   * Ask the initiative engine for a proposal on demand (e.g. from a command).
   * Fully gated + logged inside the engine. Returns { proposal: null } when off.
   */
  async function proposeInitiative(args = {}) {
    return initiative.propose(args);
  }

  return {
    isEnabled,
    getTickIntervalMs,
    seed,
    assess,
    tick,
    recordSharedExperience,
    recordGoalProgress,
    proposeInitiative,
    engines: {
      schedule,
      discovery,
      world,
      presence,
      relationship,
      memory,
      sharedExperience,
      goal,
      initiative,
      emotional,
      social,
      autonomy,
    },
  };
}

module.exports = {
  createLifeEngine,
};
