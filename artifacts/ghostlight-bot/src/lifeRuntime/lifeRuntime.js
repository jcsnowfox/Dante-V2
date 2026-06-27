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
 *   3. Ticks personal growth engines (Life Runtime 2.0)
 *   4. Ticks curiosity and thought maturation (Life Runtime 3.0)
 *   5. Refreshes the cached life prelude
 *   6. Runs the pruning protocol once per day
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
  // Personal growth engines (Life Runtime 2.0)
  hobbyEngine = null,
  projectEngine = null,
  interestDriftEngine = null,
  skillGrowthEngine = null,
  collectionsEngine = null,
  sharingDecisionEngine = null,
  // Curiosity + thought maturation (Life Runtime 3.0)
  curiosityEngine = null,
  thoughtMaturationEngine = null,
  privateQuestionStore = null,
  attentionDriftEngine = null,
  insightEngine = null,
} = {}) {
  const lifeConfig = config?.lifeRuntime || {};
  const enabled = lifeConfig.enabled === true || process.env.LIFE_RUNTIME_ENABLED === "true";

  const eventPruneAfterDays    = Number(lifeConfig.eventPruneAfterDays    ?? process.env.LIFE_EVENTS_PRUNE_DAYS    ?? 7);
  const decisionPruneAfterDays = Number(lifeConfig.decisionPruneAfterDays ?? process.env.LIFE_DECISIONS_PRUNE_DAYS ?? 7);
  const planPruneAfterDays     = Number(lifeConfig.planPruneAfterDays     ?? process.env.LIFE_PLANS_PRUNE_DAYS    ?? 30);

  let _cachedPrelude    = null;
  let _lastTickAt       = null;
  let _lastPruneAt      = null;
  let _todaysPlan       = null;
  let _running          = false;
  let _growthContext    = null; // { activeHobby, activeProject, recentInterest }
  let _curiosityContext = null; // { attentionFocus, openCount, maturingCount, recentInsight }

  function getScope() {
    return {
      companionId: config?.memory?.companionId || config?.companion?.id || "",
      customerId:  config?.memory?.userScope || "user",
    };
  }

  async function init() {
    if (microLifeEventsStore?.init)   await microLifeEventsStore.init().catch(() => {});
    if (dailyPlanEngine?.init)        await dailyPlanEngine.init().catch(() => {});
    if (decisionEngine?.init)         await decisionEngine.init().catch(() => {});
    if (hobbyEngine?.init)            await hobbyEngine.init().catch(() => {});
    if (projectEngine?.init)          await projectEngine.init().catch(() => {});
    if (interestDriftEngine?.init)    await interestDriftEngine.init().catch(() => {});
    if (skillGrowthEngine?.init)      await skillGrowthEngine.init().catch(() => {});
    if (collectionsEngine?.init)      await collectionsEngine.init().catch(() => {});
    if (privateQuestionStore?.init)   await privateQuestionStore.init().catch(() => {});
    if (attentionDriftEngine?.init)   await attentionDriftEngine.init().catch(() => {});
    if (insightEngine?.init)          await insightEngine.init().catch(() => {});

    // Seed defaults once companion is known
    const { companionId, customerId } = getScope();
    if (companionId) {
      await hobbyEngine?.seedDefaults?.({ companionId, customerId }).catch(() => {});
      await interestDriftEngine?.seedDefaults?.({ companionId, customerId }).catch(() => {});
      await skillGrowthEngine?.seedDefaults?.({ companionId, customerId }).catch(() => {});
      await collectionsEngine?.seedDefaults?.({ companionId, customerId }).catch(() => {});
    }
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

  // Growth tick: hobby activity, interest drift, skill practice
  async function _tickGrowth(now) {
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    // Maybe record hobby activity (~30% per tick)
    if (hobbyEngine && Math.random() < 0.30) {
      const hobbies = await hobbyEngine.getHobbies({ companionId, customerId }).catch(() => []);
      if (hobbies.length > 0) {
        // Weight selection by enthusiasm so active hobbies stay active
        const total = hobbies.reduce((s, h) => s + h.enthusiasm, 0);
        let pick = Math.random() * total;
        const chosen = hobbies.find(h => (pick -= h.enthusiasm) <= 0) || hobbies[0];
        await hobbyEngine.recordActivity({ companionId, customerId, hobbyId: chosen.id }).catch(() => {});

        // Reinforce a related interest
        if (interestDriftEngine && chosen.category) {
          const interests = await interestDriftEngine
            .getInterests({ companionId, customerId, minStrength: 0.2 }).catch(() => []);
          const related = interests.find(i => i.category === chosen.category || i.topic.toLowerCase().includes(chosen.name));
          if (related) {
            await interestDriftEngine.reinforce({
              companionId, customerId, topic: related.topic, delta: 0.01, source: "hobby",
            }).catch(() => {});
          }
        }
      }
      // Decay enthusiasm for hobbies untouched this week
      await hobbyEngine.applyDecay({ companionId, customerId }).catch(() => {});
    }

    // Interest drift tick (~50% per tick — gentle, frequent)
    if (interestDriftEngine && Math.random() < 0.50) {
      const mood = _todaysPlan?.mood || null;
      await interestDriftEngine.tick({ companionId, customerId, mood, now }).catch(() => {});
    }

    // Maybe practice a skill (~20% per tick)
    if (skillGrowthEngine && Math.random() < 0.20) {
      const skills = await skillGrowthEngine.getSkills({ companionId, customerId }).catch(() => []);
      if (skills.length > 0) {
        const skill = skills[Math.floor(Math.random() * skills.length)];
        await skillGrowthEngine.practice({ companionId, customerId, skillName: skill.skillName }).catch(() => {});
      }
    }

    // Build & cache growth context for prelude
    _growthContext = await _buildGrowthContext({ companionId, customerId });
  }

  async function _buildGrowthContext({ companionId, customerId }) {
    try {
      const [hobbies, projects, interests] = await Promise.all([
        hobbyEngine?.getHobbies?.({ companionId, customerId }).catch(() => []) ?? [],
        projectEngine?.getProjects?.({ companionId, customerId, status: "active" }).catch(() => []) ?? [],
        interestDriftEngine?.getInterests?.({ companionId, customerId, minStrength: 0.5 }).catch(() => []) ?? [],
      ]);

      // Pick most enthusiastic hobby that passes quick share check
      const activeHobby = hobbies.find(h =>
        sharingDecisionEngine?.quickCheck?.({ enthusiasm: h.enthusiasm, isPrivate: false, context: "hobby" }),
      ) ?? null;

      // Pick most-progressed active project
      const activeProject = projects.length > 0
        ? projects.reduce((best, p) => p.progress > (best?.progress ?? -1) ? p : best, null)
        : null;

      // Top interest
      const recentInterest = interests[0] ?? null;

      return { activeHobby, activeProject, recentInterest };
    } catch {
      return null;
    }
  }

  // Curiosity tick: attention drift, private question generation, thought maturation
  async function _tickCuriosity(now) {
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    const hasActiveProject = Boolean(_growthContext?.activeProject);

    // 1. Update attention drift
    if (attentionDriftEngine) {
      const { focus, focusType, weight } = attentionDriftEngine.selectFocus({
        dailyPlan: _todaysPlan,
        growthContext: _growthContext,
        hasActiveProject,
      });
      await attentionDriftEngine.updateFocus({ companionId, customerId, focus, focusType, weight }).catch(() => {});
    }

    // 2. Maybe generate a private question (~25% per tick via curiosityEngine)
    if (curiosityEngine && privateQuestionStore) {
      const recentEvents = microLifeEventsStore
        ? await microLifeEventsStore.listRecent({ companionId, customerId, limit: 3 }).catch(() => [])
        : [];

      const collectionCount = collectionsEngine
        ? await collectionsEngine.count({ companionId, customerId }).catch(() => 0)
        : 0;

      const payload = curiosityEngine.generate({
        dailyPlan:        _todaysPlan,
        recentEvents,
        growthContext:    _growthContext,
        hasActiveProject,
        hasCollection:    collectionCount > 0,
      });

      if (payload) {
        await privateQuestionStore.logQuestion({
          companionId, customerId, ...payload,
        }).catch(() => {});
      }
    }

    // 3. Mature existing questions → possibly generate insights or alive intentions
    if (thoughtMaturationEngine) {
      await thoughtMaturationEngine.tick({
        companionId, customerId, now,
      }).catch(() => {});
    }

    // 4. Build curiosity context for prelude
    _curiosityContext = await _buildCuriosityContext({ companionId, customerId });
  }

  async function _buildCuriosityContext({ companionId, customerId }) {
    try {
      const [attentionFocus, openCount, maturingCount, recentInsights] = await Promise.all([
        attentionDriftEngine?.getCurrentFocus?.({ companionId, customerId }).catch(() => null) ?? null,
        privateQuestionStore?.count?.({ companionId, customerId, status: "open" }).catch(() => 0) ?? 0,
        privateQuestionStore?.count?.({ companionId, customerId, status: "maturing" }).catch(() => 0) ?? 0,
        insightEngine?.getRecent?.({ companionId, customerId, limit: 1 }).catch(() => []) ?? [],
      ]);
      return {
        attentionFocus,
        openCount,
        maturingCount,
        recentInsight: recentInsights[0] ?? null,
      };
    } catch {
      return null;
    }
  }

  async function _refreshPrelude() {
    const { companionId, customerId } = getScope();
    if (!companionId) { _cachedPrelude = null; return; }

    const recentEvents = microLifeEventsStore
      ? await microLifeEventsStore.listRecent({ companionId, customerId, limit: 3 }).catch(() => [])
      : [];

    _cachedPrelude = buildLifePrelude({
      dailyPlan:       _todaysPlan,
      recentEvents:    recentEvents.slice(0, 2),
      growthContext:   _growthContext,
      curiosityContext: _curiosityContext,
    });
  }

  async function _runPruning() {
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    const [eventsDeleted, decisionsDeleted, plansDeleted,
           hobbiesDeleted, projectsDeleted, interestsDeleted,
           questionsDeleted, attentionDeleted, insightsDeleted] = await Promise.all([
      microLifeEventsStore?.pruneOlderThan?.({ companionId, customerId, days: eventPruneAfterDays }).catch(() => 0)    ?? Promise.resolve(0),
      decisionEngine?.pruneOlderThan?.({ companionId, customerId, days: decisionPruneAfterDays }).catch(() => 0)       ?? Promise.resolve(0),
      dailyPlanEngine?.pruneOlderThan?.({ companionId, customerId, days: planPruneAfterDays }).catch(() => 0)          ?? Promise.resolve(0),
      hobbyEngine?.pruneOlderThan?.({ companionId, customerId, days: 90 }).catch(() => 0)                              ?? Promise.resolve(0),
      projectEngine?.pruneOlderThan?.({ companionId, customerId, days: 60 }).catch(() => 0)                            ?? Promise.resolve(0),
      interestDriftEngine?.pruneOlderThan?.({ companionId, customerId, days: 30 }).catch(() => 0)                      ?? Promise.resolve(0),
      privateQuestionStore?.pruneOlderThan?.({ companionId, customerId, days: 14 }).catch(() => 0)                     ?? Promise.resolve(0),
      attentionDriftEngine?.pruneOlderThan?.({ companionId, customerId, days: 14 }).catch(() => 0)                     ?? Promise.resolve(0),
      insightEngine?.pruneOlderThan?.({ companionId, customerId, days: 90 }).catch(() => 0)                            ?? Promise.resolve(0),
    ]);

    const totalDeleted = eventsDeleted + decisionsDeleted + plansDeleted
      + hobbiesDeleted + projectsDeleted + interestsDeleted
      + questionsDeleted + attentionDeleted + insightsDeleted;
    if (totalDeleted) {
      logger?.info("[life-runtime] Pruning complete", {
        eventsDeleted, decisionsDeleted, plansDeleted,
        hobbiesDeleted, projectsDeleted, interestsDeleted,
        questionsDeleted, attentionDeleted, insightsDeleted,
      });
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
      await _tickGrowth(now);
      await _tickCuriosity(now);
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
      preludeActive: Boolean(_cachedPrelude),
      growthContext: _growthContext
        ? {
            activeHobby:    _growthContext.activeHobby    ? { name: _growthContext.activeHobby.name, enthusiasm: _growthContext.activeHobby.enthusiasm } : null,
            activeProject:  _growthContext.activeProject  ? { title: _growthContext.activeProject.title, progress: _growthContext.activeProject.progress } : null,
            recentInterest: _growthContext.recentInterest ? { topic: _growthContext.recentInterest.topic, strength: _growthContext.recentInterest.strength } : null,
          }
        : null,
      curiosityContext: _curiosityContext
        ? {
            attentionFocus:  _curiosityContext.attentionFocus
              ? { focus: _curiosityContext.attentionFocus.focus, focusType: _curiosityContext.attentionFocus.focusType }
              : null,
            openQuestions:    _curiosityContext.openCount    ?? 0,
            maturingQuestions: _curiosityContext.maturingCount ?? 0,
            recentInsight:   _curiosityContext.recentInsight
              ? { topic: _curiosityContext.recentInsight.topic, confidence: _curiosityContext.recentInsight.confidence }
              : null,
          }
        : null,
      pruneSchedule: {
        eventsDays:    eventPruneAfterDays,
        decisionsDays: decisionPruneAfterDays,
        plansDays:     planPruneAfterDays,
      },
    };
  }

  function setRunning(val) { _running = Boolean(val); }

  return { init, tick, getCurrentPrelude, getStatus, setRunning };
}

module.exports = { createLifeRuntime };
