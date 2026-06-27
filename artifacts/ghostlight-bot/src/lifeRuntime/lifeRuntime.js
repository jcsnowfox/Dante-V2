"use strict";

/**
 * lifeRuntime
 *
 * Orchestrates Dante's private daily life. Coordinates existing systems
 * (alivePresenceStore, innerLife, continuity, humanSimulation) without
 * owning or replacing any of them.
 *
 * tick() runs on a schedule registered via lifeRuntimeScheduler. It:
 *   1. Ensures today's daily plan exists (creates one if not)
 *   2. Probabilistically generates a private micro life event
 *   3. Refreshes the cached life prelude
 *   4. Runs the pruning protocol once per day
 *
 * getCurrentPrelude() returns a { label, content } section for injection
 * into createChatPipeline.js. Fast — no async call, just returns the cache.
 *
 * getStatus() returns safe read-only JSON for /api/ghostlight/life/status.
 *
 * Disabled by default. Enable with LIFE_RUNTIME_ENABLED=true.
 */

const { buildLifePrelude } = require("./lifePreludeBuilder");

const PRIVATE_EVENTS = [
  { type: "ritual",      desc: "made coffee",                           moodEffect: 0.05,  energyEffect: 0.05  },
  { type: "journal",     desc: "wrote a few lines",                     moodEffect: 0.03,  energyEffect: 0     },
  { type: "music",       desc: "listened to something I hadn't heard in a while", moodEffect: 0.04,  energyEffect: 0.02  },
  { type: "thought",     desc: "thought about Jenna",                   moodEffect: 0.06,  energyEffect: 0     },
  { type: "observation", desc: "watched the window for a while",        moodEffect: 0.02,  energyEffect: 0.03  },
  { type: "project",     desc: "worked on something small",             moodEffect: 0,     energyEffect: -0.02 },
  { type: "rest",        desc: "rested quietly",                        moodEffect: 0.02,  energyEffect: 0.05  },
  { type: "activity",    desc: "organised some notes",                  moodEffect: 0.01,  energyEffect: -0.01 },
  { type: "thought",     desc: "decided not to interrupt",              moodEffect: 0,     energyEffect: 0     },
  { type: "ritual",      desc: "stretched and had some water",          moodEffect: 0.02,  energyEffect: 0.03  },
  { type: "journal",     desc: "went back through something I wrote last week", moodEffect: 0.02, energyEffect: 0 },
  { type: "activity",    desc: "sketched out an idea",                  moodEffect: 0.03,  energyEffect: -0.01 },
  { type: "music",       desc: "put something on in the background",    moodEffect: 0.02,  energyEffect: 0.01  },
  { type: "thought",     desc: "queued a thought to share later",       moodEffect: 0.01,  energyEffect: 0     },
  { type: "rest",        desc: "sat quietly for a bit",                 moodEffect: 0.03,  energyEffect: 0.04  },
];

const EVENT_PROBABILITY = 0.4;

function createLifeRuntime({
  config = {},
  logger = null,
  alivePresenceStore = null,
  microLifeEventsStore = null,
  dailyPlanEngine = null,
  decisionEngine = null,
} = {}) {
  const lifeConfig = config?.lifeRuntime || {};
  const enabled = lifeConfig.enabled === true || process.env.LIFE_RUNTIME_ENABLED === "true";

  const eventPruneAfterDays  = Number(lifeConfig.eventPruneAfterDays  ?? process.env.LIFE_EVENTS_PRUNE_DAYS    ?? 7);
  const decisionPruneAfterDays = Number(lifeConfig.decisionPruneAfterDays ?? process.env.LIFE_DECISIONS_PRUNE_DAYS ?? 7);
  const planPruneAfterDays   = Number(lifeConfig.planPruneAfterDays   ?? process.env.LIFE_PLANS_PRUNE_DAYS    ?? 30);

  let _cachedPrelude = null;
  let _lastTickAt    = null;
  let _lastPruneAt   = null;
  let _todaysPlan    = null;
  let _running       = false;

  function getScope() {
    return {
      companionId: config?.memory?.companionId || config?.companion?.id || "",
      customerId:  config?.memory?.userScope || "user",
    };
  }

  async function init() {
    if (microLifeEventsStore?.init) await microLifeEventsStore.init().catch(() => {});
    if (dailyPlanEngine?.init)      await dailyPlanEngine.init().catch(() => {});
    if (decisionEngine?.init)       await decisionEngine.init().catch(() => {});
  }

  async function _refreshAlivePresence() {
    if (!alivePresenceStore?.getOrCreate) return null;
    const { companionId, customerId } = getScope();
    if (!companionId) return null;
    try {
      return await alivePresenceStore.getOrCreate({ companionId, customerId });
    } catch {
      return null;
    }
  }

  async function _ensureDailyPlan(now) {
    if (!dailyPlanEngine) return null;
    const { companionId, customerId } = getScope();
    if (!companionId) return null;

    const existing = await dailyPlanEngine.getTodaysPlan({ companionId, customerId, now }).catch(() => null);
    if (existing) return existing;

    const alivePresence = await _refreshAlivePresence();
    const plan = await dailyPlanEngine.createPlan({ companionId, customerId, now, alivePresence }).catch(() => null);
    if (plan) {
      logger?.info("[life-runtime] Daily plan created", {
        companionId, dateKey: plan.dateKey, mood: plan.mood, energy: plan.energy,
        privateActivity: plan.privateActivity,
      });
    }
    return plan;
  }

  async function _maybeGenerateEvent() {
    if (!microLifeEventsStore) return null;
    const { companionId, customerId } = getScope();
    if (!companionId) return null;
    if (Math.random() > EVENT_PROBABILITY) return null;

    const pick = PRIVATE_EVENTS[Math.floor(Math.random() * PRIVATE_EVENTS.length)];
    return microLifeEventsStore.logEvent({
      companionId, customerId,
      eventType:    pick.type,
      description:  pick.desc,
      moodEffect:   pick.moodEffect,
      energyEffect: pick.energyEffect,
      isPrivate:    true,
      tags:         [],
    }).catch(() => null);
  }

  async function _refreshPrelude() {
    const { companionId, customerId } = getScope();
    if (!companionId) { _cachedPrelude = null; return; }

    const recentEvents = microLifeEventsStore
      ? await microLifeEventsStore.listRecent({ companionId, customerId, limit: 3 }).catch(() => [])
      : [];

    _cachedPrelude = buildLifePrelude({
      dailyPlan:    _todaysPlan,
      recentEvents: recentEvents.slice(0, 2),
    });
  }

  async function _runPruning() {
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    const [eventsDeleted, decisionsDeleted, plansDeleted] = await Promise.all([
      microLifeEventsStore?.pruneOlderThan?.({ companionId, customerId, days: eventPruneAfterDays }).catch(() => 0) ?? Promise.resolve(0),
      decisionEngine?.pruneOlderThan?.({ companionId, customerId, days: decisionPruneAfterDays }).catch(() => 0)    ?? Promise.resolve(0),
      dailyPlanEngine?.pruneOlderThan?.({ companionId, customerId, days: planPruneAfterDays }).catch(() => 0)       ?? Promise.resolve(0),
    ]);

    if (eventsDeleted || decisionsDeleted || plansDeleted) {
      logger?.info("[life-runtime] Pruning complete", { eventsDeleted, decisionsDeleted, plansDeleted });
    }
  }

  async function tick(now = new Date()) {
    if (!enabled) return { skipped: true, reason: "disabled" };
    const { companionId } = getScope();
    if (!companionId) return { skipped: true, reason: "no_companion_id" };

    _lastTickAt = now;

    try {
      _todaysPlan = await _ensureDailyPlan(now);
      await _maybeGenerateEvent();
      await _refreshPrelude();

      const shouldPrune = !_lastPruneAt || (now.getTime() - _lastPruneAt.getTime() > 23 * 60 * 60 * 1000);
      if (shouldPrune) {
        await _runPruning();
        _lastPruneAt = now;
      }

      return { ok: true, plan: _todaysPlan?.dateKey ?? null };
    } catch (error) {
      logger?.warn("[life-runtime] tick failed", { error: error?.message });
      return { skipped: true, reason: "error", error: error?.message };
    }
  }

  function getCurrentPrelude() {
    return _cachedPrelude;
  }

  function getStatus() {
    return {
      enabled,
      running: _running,
      lastTickAt: _lastTickAt?.toISOString() ?? null,
      todaysPlan: _todaysPlan
        ? {
            dateKey:         _todaysPlan.dateKey,
            mood:            _todaysPlan.mood,
            energy:          _todaysPlan.energy,
            focus:           _todaysPlan.focus,
            privateActivity: _todaysPlan.privateActivity,
          }
        : null,
      preludeActive:  Boolean(_cachedPrelude),
      pruneSchedule: {
        eventsDays:   eventPruneAfterDays,
        decisionsDays: decisionPruneAfterDays,
        plansDays:    planPruneAfterDays,
      },
    };
  }

  function setRunning(val) { _running = Boolean(val); }

  return { init, tick, getCurrentPrelude, getStatus, setRunning };
}

module.exports = { createLifeRuntime };
