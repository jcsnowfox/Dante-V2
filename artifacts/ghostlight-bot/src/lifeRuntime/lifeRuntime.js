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
 *   5. Ticks relationship continuity engines (Life Runtime 4.0)
 *   6. Refreshes the cached life prelude
 *   7. Runs the pruning protocol once per day
 *
 * getCurrentPrelude() returns a { label, content } section for injection
 * into createChatPipeline.js. Fast — no async call, just returns the cache.
 *
 * getStatus() returns safe read-only JSON for /api/ghostlight/life/status.
 *
 * Disabled by default. Enable with LIFE_RUNTIME_ENABLED=true.
 */

const { buildLifePrelude } = require("./lifePreludeBuilder");
const { createSelfConsistencyMonitor } = require("./selfConsistencyMonitor");
const { createRelationshipStateRuntime } = require("./relationshipStateRuntime");
const { createDiagnosticRuntime } = require("../diagnostics");
const { createRuntimeEventBus } = require("./runtimeEventBus");
const { createSourceHealthTracker, RUNTIME_NAMES } = require("./sourceHealth");
const { buildMindStateSnapshot } = require("./mindStateSnapshotBuilder");
const { bridgeGrowthToIdentity, bridgeCuriosityToProjects, bridgeProjectsToPurpose } = require("./emergenceBridges");
const { createRepairPersistenceEngine } = require("./repairPersistenceEngine");
const { createRelationshipLearningRuntime } = require("../relationshipLearning/relationshipLearningRuntime");
const { createRomanticSurpriseRuntime } = require("./romanticSurpriseRuntime");
const { createAffectiveDecisionRuntime } = require("./affectiveDecisionRuntime");
const { createEvidenceIntegrityRuntime } = require("./evidenceIntegrityRuntime");
const { createSelfInspectionRuntime }    = require("./selfInspectionRuntime");
const { createNarrativeIdentityRuntime } = require("./narrativeIdentityRuntime");
const { createPerceptionRuntime }        = require("./perceptionRuntime");
const { createWorldModelRuntime }        = require("./worldModelRuntime");
const { createCognitiveRuntime }         = require("./cognitiveRuntime");
const { createEmergentLivingBehaviorRuntime } = require("./emergentLivingBehaviorRuntime");

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
  // Relationship continuity (Life Runtime 4.0)
  relationshipWeatherEngine = null,
  sharedHistoryEngine = null,
  ritualEngine = null,
  traditionEngine = null,
  anniversaryEngine = null,
  insideJokeEngine = null,
  relationshipTimelineEngine = null,
  // Relational consequences (Life Runtime 5.0) — Dante & Jenna
  consequenceStore = null,
  relationalConsequencesEngine = null,
  repairCarryoverEngine = null,
  repairPersistenceEngine = null,
  relationshipLearningRuntime = null,
  // Homeostasis runtime (Life Runtime 6.0) — needs, drives, real fulfillment
  homeostasisRuntime = null,
  // Identity runtime (Life Runtime 7.0) — constitution, values, beliefs, choice
  identityRuntime = null,
  // Fulfillment runtime (Life Runtime 8.0) — proactive agency, adapters, four-outcome model
  fulfillmentRuntime = null,
  runtimeEventBus = null,
  sourceHealth = null,
  romanticSurpriseRuntime = null,
  romanticSurpriseStore = null,
  affectiveDecisionRuntime = null,
  evidenceIntegrityRuntime = null,
  selfInspectionRuntime = null,
  narrativeIdentityRuntime = null,
  perceptionRuntime = null,
  worldModelRuntime = null,
  cognitiveRuntime: cognitiveRuntimeParam = null,
  emergentLivingBehaviorRuntime = null,
} = {}) {
  const lifeConfig = config?.lifeRuntime || {};
  const enabled = lifeConfig.enabled === true || process.env.LIFE_RUNTIME_ENABLED === "true";
  const selfConsistencyMonitor = createSelfConsistencyMonitor({ logger });
  const relationshipStateRuntime = createRelationshipStateRuntime({ logger });
  const diagnosticRuntime = createDiagnosticRuntime({ config, selfConsistencyMonitor });
  const healthTracker = sourceHealth || createSourceHealthTracker();
  const eventBus = runtimeEventBus || createRuntimeEventBus({ logger, sourceHealth: healthTracker });
  const affectiveDecision = affectiveDecisionRuntime || createAffectiveDecisionRuntime({ config, logger });
  const evidenceIntegrity = evidenceIntegrityRuntime || createEvidenceIntegrityRuntime({ config, logger, selfConsistencyMonitor });
  const { companionId: _companionId, customerId: _customerId } = (() => {
    const companionId = config?.memory?.companionId || config?.companion?.id || "dante";
    const customerId  = config?.memory?.userScope || "user";
    return { companionId, customerId };
  })();
  const selfInspection = selfInspectionRuntime || createSelfInspectionRuntime({
    config, logger,
    companionId: _companionId,
    customerId:  _customerId,
  });
  const repairPersistence = repairPersistenceEngine || createRepairPersistenceEngine({
    consequenceStore, logger, client: config?.discordClient || null, channelId: config?.chat?.channelId || config?.discord?.channelId || "",
    affectiveDecisionRuntime: affectiveDecision,
  });
  const relationshipLearning = relationshipLearningRuntime || createRelationshipLearningRuntime({
    config, logger, identityRuntime, homeostasisRuntime, runtimeEventBus: eventBus,
  });
  const romanticSurprises = romanticSurpriseRuntime || createRomanticSurpriseRuntime({
    config, logger, store: romanticSurpriseStore, client: config?.discordClient || null, channelId: config?.chat?.channelId || config?.discord?.channelId || "", relationshipWeatherEngine, runtimeEventBus: eventBus,
    affectiveDecisionRuntime: affectiveDecision,
  });
  const narrativeIdentity = narrativeIdentityRuntime || createNarrativeIdentityRuntime({
    config, logger, runtimeEventBus: eventBus,
  });
  const perception = perceptionRuntime || createPerceptionRuntime({
    config, logger, runtimeEventBus: eventBus,
  });
  const worldModel = worldModelRuntime || createWorldModelRuntime({
    config, logger, runtimeEventBus: eventBus,
  });
  const cognitiveRt = cognitiveRuntimeParam || createCognitiveRuntime({ config, logger });
  const emergentRt = emergentLivingBehaviorRuntime || createEmergentLivingBehaviorRuntime({ config, logger });

  const eventPruneAfterDays    = Number(lifeConfig.eventPruneAfterDays    ?? process.env.LIFE_EVENTS_PRUNE_DAYS    ?? 7);
  const decisionPruneAfterDays = Number(lifeConfig.decisionPruneAfterDays ?? process.env.LIFE_DECISIONS_PRUNE_DAYS ?? 7);
  const planPruneAfterDays     = Number(lifeConfig.planPruneAfterDays     ?? process.env.LIFE_PLANS_PRUNE_DAYS    ?? 30);

  let _cachedPrelude          = null;
  let _lastTickAt             = null;
  let _lastPruneAt            = null;
  let _todaysPlan             = null;
  let _running                = false;
  let _growthContext          = null; // { activeHobby, activeProject, recentInterest }
  let _curiosityContext       = null; // { attentionFocus, openCount, maturingCount, recentInsight }
  let _relationshipContext    = null; // { chapter, weatherSummary, activeRitualsCount, traditionsCount, sharedHistoryCount, insideJokeCount, upcomingAnniversaries }
  let _consequenceContext     = null; // { suppression, carryover, activeCount, lastConsequenceAt }
  let _homeostasisContext     = null; // homeostasisRuntime.getNeedsContext()
  let _identityContext        = null; // identityRuntime.getIdentityContext()
  let _fulfillmentContext     = null; // fulfillmentRuntime.getFulfillmentContext()
  let _selfConsistencyContext = null; // last reply self-trust signal
  let _relationshipLearningStatus = null; // safe relationship-learning metadata
  let _romanticSurpriseStatus = null; // safe romantic surprise metadata
  let _relationshipStateSnapshot = null; // canonical read model snapshot
  let _learningContext       = null; // relationshipLearningRuntime.getLearningContext()
  let _narrativeContext      = null; // narrativeIdentityRuntime.getNarrativeContext()
  let _perceptionContext     = null; // perceptionRuntime.getPerceptionContext()
  let _worldModelContext     = null; // worldModelRuntime.getWorldModelContext()
  let _cognitiveContext      = null; // cognitiveRuntime.getCognitiveContext()
  let _emergentContext       = null; // emergentLivingBehaviorRuntime.getEmergentContext()

  function _emitRuntimeEvent(event) {
    return eventBus.emit({ ...getScope(), ...event }).catch(err => {
      logger?.warn?.("[life-runtime] runtime event emission failed", { error: err?.message, eventType: event?.event_type || event?.eventType });
      return null;
    });
  }

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
    if (insightEngine?.init)                  await insightEngine.init().catch(() => {});
    if (relationshipWeatherEngine?.init)      await relationshipWeatherEngine.init().catch(() => {});
    if (sharedHistoryEngine?.init)            await sharedHistoryEngine.init().catch(() => {});
    if (ritualEngine?.init)                   await ritualEngine.init().catch(() => {});
    if (traditionEngine?.init)                await traditionEngine.init().catch(() => {});
    if (anniversaryEngine?.init)              await anniversaryEngine.init().catch(() => {});
    if (insideJokeEngine?.init)               await insideJokeEngine.init().catch(() => {});
    if (relationshipTimelineEngine?.init)     await relationshipTimelineEngine.init().catch(() => {});
    if (consequenceStore?.init)               await consequenceStore.init().catch(() => {});
    if (homeostasisRuntime?.init)             await homeostasisRuntime.init().catch(() => {});
    if (identityRuntime?.init)               await identityRuntime.init().catch(() => {});
    if (fulfillmentRuntime?.init)            await fulfillmentRuntime.init().catch(() => {});
    if (relationshipLearningRuntime?.init)   await relationshipLearningRuntime.init().catch(() => {});
    else if (relationshipLearning?.init)     await relationshipLearning.init().catch(() => {});
    if (romanticSurprises?.init)             await romanticSurprises.init().catch(() => {});
    if (selfInspection?.init)               await selfInspection.init().catch(() => {});
    if (narrativeIdentity?.init)            await narrativeIdentity.init().catch(() => {});
    if (perception?.init)                  await perception.init().catch(() => {});
    if (worldModel?.init)                  await worldModel.init().catch(() => {});
    if (cognitiveRt?.init)                 await cognitiveRt.init().catch(() => {});
    if (emergentRt?.init)                  await emergentRt.init().catch(() => {});

    // Seed defaults once companion is known
    const { companionId, customerId } = getScope();
    if (companionId) {
      await identityRuntime?._seedConstitution?.({ companionId, customerId }).catch(() => {});
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

      // Casual sharing is held back while a relational consequence is unresolved.
      const sup = _consequenceContext?.suppression;
      const consequenceSuppressed = Boolean(sup && (sup.repairRequired || sup.healing || sup.giveSpace));

      // Pick most enthusiastic hobby that passes quick share check
      const activeHobby = hobbies.find(h =>
        sharingDecisionEngine?.quickCheck?.({ enthusiasm: h.enthusiasm, isPrivate: false, context: "hobby", consequenceSuppressed }),
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

    // Relational consequence bias: when repair is unresolved (or mending),
    // attention drifts toward repair and casual thought-maturation is held back.
    const sup = _consequenceContext?.suppression;
    const hasRepair = Boolean(sup && (sup.repairRequired || sup.healing));
    const isGiveSpace = Boolean(sup && (sup.giveSpace || sup.repairRequired));

    // 1. Update attention drift
    if (attentionDriftEngine) {
      const { focus, focusType, weight } = attentionDriftEngine.selectFocus({
        dailyPlan: _todaysPlan,
        growthContext: _growthContext,
        hasActiveProject,
        hasRepair,
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

    // 3. Mature existing questions → possibly generate insights or alive intentions.
    //    While repair is unresolved, isGiveSpace holds back casual intention
    //    conversion so repair/meaning-making is what surfaces, not curiosities.
    if (thoughtMaturationEngine) {
      await thoughtMaturationEngine.tick({
        companionId, customerId, now, isGiveSpace,
      }).catch(() => {});
    }

    // 4. Build curiosity context for prelude
    _curiosityContext = await _buildCuriosityContext({ companionId, customerId });
    await bridgeCuriosityToProjects({ companionId, customerId, curiosityContext: _curiosityContext, projectEngine, now });
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

  // Relationship tick: weather drift, ritual/tradition decay, upcoming anniversaries
  async function _tickRelationship(now) {
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    // Passive weather tick (no interaction signal at runtime level — interactions happen in chat)
    if (relationshipWeatherEngine) {
      await relationshipWeatherEngine.tick({ companionId, customerId, hadInteraction: false }).catch(() => {});
    }

    // Ritual decay
    if (ritualEngine) {
      await ritualEngine.applyDecay({ companionId, customerId }).catch(() => {});

      // Promote strong active rituals to traditions
      if (traditionEngine) {
        const activeRituals = await ritualEngine.getRituals({ companionId, customerId, status: "active" }).catch(() => []);
        for (const r of activeRituals) {
          if (r.occurrenceCount >= 8) {
            await traditionEngine.promoteFromRitual({
              companionId, customerId, name: r.name, origin: r.pattern, tags: r.tags,
            }).catch(() => {});
          }
        }
      }
    }

    // Tradition decay
    if (traditionEngine) {
      await traditionEngine.applyDecay({ companionId, customerId }).catch(() => {});
    }

    // Inside joke decay
    if (insideJokeEngine) {
      await insideJokeEngine.applyDecay({ companionId, customerId }).catch(() => {});
    }

    // Build & cache relationship context for prelude
    _relationshipContext = await _buildRelationshipContext({ companionId, customerId, now });
    _relationshipStateSnapshot = relationshipStateRuntime.buildSnapshot({
      relationshipContext: _relationshipContext,
      consequenceContext: _consequenceContext,
    });
  }

  async function _buildRelationshipContext({ companionId, customerId, now = new Date() }) {
    try {
      const [weather, activeRitualsCount, traditionsCount, sharedHistoryCount, insideJokeCount,
             upcomingAnniversaries, currentChapter] = await Promise.all([
        relationshipWeatherEngine?.getWeather?.({ companionId, customerId }).catch(() => null) ?? null,
        ritualEngine?.count?.({ companionId, customerId }).catch(() => 0) ?? 0,
        traditionEngine?.count?.({ companionId, customerId }).catch(() => 0) ?? 0,
        sharedHistoryEngine?.count?.({ companionId, customerId }).catch(() => 0) ?? 0,
        insideJokeEngine?.count?.({ companionId, customerId }).catch(() => 0) ?? 0,
        anniversaryEngine?.getUpcoming?.({ companionId, customerId, now }).catch(() => []) ?? [],
        relationshipTimelineEngine?.getCurrentChapter?.({ companionId, customerId }).catch(() => "beginning") ?? "beginning",
      ]);
      return {
        chapter: currentChapter,
        weatherSummary: weather?.weatherSummary ?? null,
        weather,
        activeRitualsCount,
        traditionsCount,
        sharedHistoryCount,
        insideJokeCount,
        upcomingAnniversaries,
      };
    } catch {
      return null;
    }
  }

  // Relational consequences tick (Life Runtime 5.0): review active marks,
  // let Dante begin repair on his own, expire only what is safe, and refresh
  // the suppression/carryover context that shapes the next reply and his day.
  async function _tickConsequences(now) {
    if (!relationalConsequencesEngine) { return; }
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    const review = await relationalConsequencesEngine
      .reviewActive({ companionId, customerId, now })
      .catch(() => null);
    if (!review) return;

    // When Dante just began repair on something, log one private reflection
    // micro-event through the EXISTING micro-life store (no new store).
    if (review.newlyStarted?.length && microLifeEventsStore && repairCarryoverEngine) {
      const carry = repairCarryoverEngine.buildCarryover({ suppression: review.suppression });
      const ev = repairCarryoverEngine.reflectionEvent(carry);
      if (ev) {
        await microLifeEventsStore.logEvent({
          companionId, customerId,
          eventType: ev.eventType, description: ev.description,
          moodEffect: ev.moodEffect, energyEffect: ev.energyEffect,
          isPrivate: true, tags: ev.tags || [],
        }).catch(() => {});
      }
    }

    await repairPersistence?.tick?.({
      companionId, customerId, now,
      giveSpace: Boolean(review.suppression?.giveSpace),
      quietHoursActive: (now.getHours() >= 22 || now.getHours() < 7),
      cognitiveContext: _cognitiveContext,
      emergentContext: _emergentContext,
    }).catch(err => logger?.warn?.("[life-runtime] repair persistence tick failed", { error: err?.message }));

    const postRepairActive = consequenceStore?.getActive
      ? await consequenceStore.getActive({ companionId, customerId }).catch(() => review.activeConsequences)
      : review.activeConsequences;
    const postRepairSuppression = relationalConsequencesEngine.computeSuppression(postRepairActive);
    _applyConsequenceContext(postRepairSuppression, postRepairActive);
  }

  // Build & cache the consequence context from a suppression state + active set,
  // and overlay the cached daily plan toward repair/reflection when needed.
  function _applyConsequenceContext(suppression, activeConsequences = []) {
    if (!suppression) { _consequenceContext = null; return; }
    const carryover = repairCarryoverEngine
      ? repairCarryoverEngine.buildCarryover({ suppression })
      : null;

    let lastConsequenceAt = null;
    for (const c of activeConsequences) {
      const t = c?.createdAt ? new Date(c.createdAt).getTime() : 0;
      if (t && (!lastConsequenceAt || t > lastConsequenceAt)) lastConsequenceAt = t;
    }

    _consequenceContext = {
      suppression,
      carryover,
      activeCount: activeConsequences.length,
      activeConsequences,
      lastConsequenceAt: lastConsequenceAt ? new Date(lastConsequenceAt).toISOString() : null,
    };

    if (_todaysPlan && carryover?.active && repairCarryoverEngine) {
      _todaysPlan = repairCarryoverEngine.applyToPlan(_todaysPlan, carryover);
    }
    _relationshipStateSnapshot = relationshipStateRuntime.buildSnapshot({
      relationshipContext: _relationshipContext,
      consequenceContext: _consequenceContext,
    });
  }

  // Homeostasis tick (Life Runtime 6.0): drift needs, plan and execute fulfillment.
  // Called AFTER consequence context is resolved so repair/give-space gates are current.
  async function _tickHomeostasis(now) {
    if (!homeostasisRuntime) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    const alivePresence = await _refreshAlivePresence().catch(() => null);

    await homeostasisRuntime.tick({
      companionId,
      customerId,
      now,
      dailyPlan:           _todaysPlan,
      consequenceContext:  _consequenceContext,
      growthContext:       _growthContext,
      curiosityContext:    _curiosityContext,
      relationshipContext: _relationshipStateSnapshot || _relationshipContext,
      alivePresence,
    }).catch(err => {
      logger?.warn("[life-runtime] _tickHomeostasis failed", { error: err?.message });
    });

    _homeostasisContext = homeostasisRuntime.getNeedsContext() ?? null;
  }

  // Identity tick (Life Runtime 7.0): drain first experiences, detect value
  // signals from context, refresh cached identity context.
  async function _tickIdentity(now) {
    if (!identityRuntime) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    await identityRuntime.tick({
      companionId,
      customerId,
      now,
      homeostasisContext:  _homeostasisContext,
      consequenceContext:  _consequenceContext,
      firstExperienceStore: null, // passed via homeostasisRuntime; drained from the store directly
    }).catch(err => {
      logger?.warn("[life-runtime] _tickIdentity failed", { error: err?.message });
    });

    _identityContext = identityRuntime.getIdentityContext() ?? null;
  }

  // Fulfillment tick (Life Runtime 8.0): proactive agency, adapters, four-outcome model.
  // Called AFTER identity tick so identity context is current.
  async function _tickFulfillment(now) {
    if (!fulfillmentRuntime) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    // Build fulfillContext from homeostasis config (same shape as homeostasisRuntime uses)
    const { isEnabled: webLearningEnabled, getDailyUsage } = require("./webLearningTool");
    const webUsage = getDailyUsage(now);
    const alivePresence = await _refreshAlivePresence().catch(() => null);

    const fulfillContext = {
      hasActiveProject:         Boolean(_growthContext?.activeProject),
      activeProject:            _growthContext?.activeProject ?? null,
      webLearningEnabled:       webLearningEnabled(),
      webLearningRemainingToday: webUsage.remaining,
      imageGenerationEnabled:   Boolean(config?.imageGeneration?.enabled ?? process.env.IMAGE_GENERATION_ENABLED === "true"),
      voiceNoteEnabled:         Boolean(config?.audio?.enabled ?? process.env.AUDIO_GENERATION_ENABLED === "true"),
      secondLifeAvailable:      Boolean(config?.secondLife?.enabled ?? process.env.SECOND_LIFE_ENABLED === "true"),
      attentionFocus:           _curiosityContext?.attentionFocus ?? null,
      recentInterest:           _growthContext?.recentInterest ?? null,
      repairRequired:           Boolean(_consequenceContext?.suppression?.repairRequired),
      repairStarted:            Boolean(_consequenceContext?.suppression?.repairStarted),
      healing:                  Boolean(_consequenceContext?.suppression?.healing),
      giveSpace:                Boolean(_consequenceContext?.suppression?.giveSpace),
      jennaIsBusy:              Boolean(alivePresence?.userBusy || alivePresence?.userDoNotDisturb),
      jennaIsAsleep:            alivePresence?.userAsleep || (now.getHours() >= 23 || now.getHours() < 6),
      jennaIsAvailable:         !alivePresence?.userBusy && Boolean(alivePresence?.userRecentlyActive ?? true),
      quietHours:               (now.getHours() >= 22 || now.getHours() < 7),
      mood:                     _todaysPlan?.mood   ?? "neutral",
      energy:                   _todaysPlan?.energy ?? "steady",
    };

    await fulfillmentRuntime.tick({
      companionId,
      customerId,
      now,
      homeostasisContext: _homeostasisContext,
      identityContext:    _identityContext,
      fulfillContext,
      cognitiveContext:   _cognitiveContext,
      emergentContext:    _emergentContext,
    }).catch(err => {
      logger?.warn("[life-runtime] _tickFulfillment failed", { error: err?.message });
    });

    _fulfillmentContext = fulfillmentRuntime.getFulfillmentContext() ?? null;
  }

  /**
   * observeInteraction — post-message hook. After every interaction with Jenna,
   * read her language (+ the existing repair analysis) to resolve or create a
   * consequence, then refresh the cached suppression context and prelude so the
   * effect carries into the NEXT reply. Fire-and-forget from the chat pipeline.
   */
  async function observeInteraction({
    userText = "",
    replyText = "",
    repairResult = null,
    now = new Date(),
    recentHistory = [],
    duplicate = false,
    tone = "",
    generatedImageIds = [],
    generatedAudioIds = [],
    memoryContext = [],
  } = {}) {
    const { companionId, customerId } = getScope();
    if (!companionId) return null;
    try {
      const repairActive = Boolean(repairResult?.repairNeeded || _consequenceContext?.suppression?.repairRequired || _consequenceContext?.suppression?.repairStarted);
      const giveSpace = Boolean(_consequenceContext?.suppression?.giveSpace);
      const signal = selfConsistencyMonitor.evaluate({
        userText,
        replyText,
        recentHistory,
        duplicate,
        tone,
        generatedImageIds,
        generatedAudioIds,
        repairActive,
        giveSpace,
        fulfillmentEvidence: _fulfillmentContext?.evidence || _fulfillmentContext?.lastOutcome?.evidence || [],
        memoryContext,
        relationshipState: _relationshipStateSnapshot || _consequenceContext?.suppression || null,
      });
      _selfConsistencyContext = { ...signal, preludeWarning: selfConsistencyMonitor.getPreludeWarning() };

      if (!relationalConsequencesEngine) {
        await _refreshPrelude();
      _emitRuntimeEvent({ event_type: "prelude_refreshed", source_runtime: "lifeRuntime", summary: "Life prelude refreshed" });
        return { selfConsistency: signal, consequence: null };
      }
      // Resolution / reconciliation first, so a forgiving message doesn't also
      // get read as a fresh hurt.
      await relationalConsequencesEngine.resolveFromSignals({ companionId, customerId, userText, now }).catch(() => {});
      await repairPersistence?.handleUserText?.({ companionId, customerId, userText, now }).catch(() => {});
      const created = await relationalConsequencesEngine.detect({ companionId, customerId, userText, repairResult, source: "chat", now }).catch(() => null);
      if (created) {
        await repairPersistence?.evaluateConsequence?.({ companionId, customerId, consequence: created, now }).catch(() => {});
        await relationshipLearning?.learnFromConsequence?.({ companionId, customerId, consequence: created, event: "created", now }).catch(() => {});
      }
      const signalEvidence = Array.isArray(signal?.evidence) ? signal.evidence : [];
      const unsupportedPerception = signalEvidence.some(e => /unsupported_perception|context_treated_as_perception/i.test(String(e)));
      const claimedWithoutEvidence = signalEvidence.some(e => /claimed_action_without_evidence|voice_note_mismatch|image_mismatch/i.test(String(e)));
      if ((unsupportedPerception || claimedWithoutEvidence) && relationalConsequencesEngine?.recordEvent) {
        const eventType = unsupportedPerception ? "confabulation_detected" : "claimed_action_without_evidence";
        const diagnosticConsequence = await relationalConsequencesEngine.recordEvent({
          companionId, customerId, eventType, source: "self_consistency_monitor", now,
          summary: signal.reason || eventType,
          metadata: { evidenceIds: signalEvidence, claim: replyText ? String(replyText).slice(0, 240) : "" },
        }).catch(() => null);
        if (diagnosticConsequence) {
          await repairPersistence?.evaluateConsequence?.({ companionId, customerId, consequence: diagnosticConsequence, now }).catch(() => {});
          if (unsupportedPerception) await relationshipLearning?.learnConfabulation?.({ companionId, customerId, consequence: diagnosticConsequence, metadata: diagnosticConsequence.metadata || {}, now }).catch(() => {});
          else await relationshipLearning?.learnEvidenceViolation?.({ companionId, customerId, consequence: diagnosticConsequence, metadata: diagnosticConsequence.metadata || {}, now }).catch(() => {});
        }
      }

      const active = consequenceStore?.getActive
        ? await consequenceStore.getActive({ companionId, customerId }).catch(() => [])
        : [];
      const suppression = relationalConsequencesEngine.computeSuppression(active);
      _applyConsequenceContext(suppression, active);
      if (relationshipLearning && repairResult) {
        relationshipLearning.processInteraction?.({ userText, repairResult, now });
      }
      if (perception && userText) {
        const { companionId: cId, customerId: cuId } = getScope();
        await perception.tick({
          companionId: cId, customerId: cuId, now,
          consequenceContext: _consequenceContext,
          selfInspectionStatus: selfInspection?.getStatus?.() ?? null,
          identityContext: _identityContext,
          narrativeContext: _narrativeContext,
          learningContext: _learningContext,
          homeostasisContext: _homeostasisContext,
          fulfillmentContext: _fulfillmentContext,
          userText,
        }).catch(() => {});
        _perceptionContext = perception.getPerceptionContext?.() ?? null;
      }
      await _refreshPrelude();
      _emitRuntimeEvent({ event_type: "prelude_refreshed", source_runtime: "lifeRuntime", summary: "Life prelude refreshed" });
      return { selfConsistency: signal, consequence: created };
    } catch (error) {
      logger?.warn?.("[life-runtime] observeInteraction failed", { error: error?.message });
      return null;
    }
  }

  // Is a casual/outbound action currently suppressed by an unresolved
  // consequence? Consulted by sharing/alive surfaces before acting casual.
  function isActionSuppressed(actionType) {
    const sup = _consequenceContext?.suppression;
    if (!sup || !Array.isArray(sup.suppressed)) return false;
    return sup.suppressed.includes(actionType);
  }

  async function _tickRelationshipLearning(now) {
    if (!relationshipLearning) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;
    await relationshipLearning.tick({
      companionId, customerId, now,
      homeostasisContext: _homeostasisContext,
      identityContext:    _identityContext,
      fulfillmentContext: _fulfillmentContext,
      consequenceContext: _consequenceContext,
    }).catch(err => { logger?.warn("[life-runtime] _tickRelationshipLearning failed", { error: err?.message }); });
    _learningContext = relationshipLearning.getLearningContext?.() ?? null;
  }

  async function _tickNarrativeIdentity(now) {
    if (!narrativeIdentity) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;
    await narrativeIdentity.tick({
      companionId, customerId, now,
      identityContext:    _identityContext,
      consequenceContext: _consequenceContext,
      learningContext:    _learningContext,
    }).catch(err => { logger?.warn?.("[life-runtime] _tickNarrativeIdentity failed", { error: err?.message }); });
    _narrativeContext = narrativeIdentity.getNarrativeContext?.() ?? null;
  }

  async function _tickPerception(now) {
    if (!perception) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;
    const alivePresence = await _refreshAlivePresence().catch(() => null);
    await perception.tick({
      companionId, customerId, now,
      alivePresence,
      consequenceContext:   _consequenceContext,
      selfInspectionStatus: selfInspection?.getStatus?.() ?? null,
      identityContext:      _identityContext,
      narrativeContext:     _narrativeContext,
      learningContext:      _learningContext,
      homeostasisContext:   _homeostasisContext,
      fulfillmentContext:   _fulfillmentContext,
    }).catch(err => { logger?.warn?.("[life-runtime] _tickPerception failed", { error: err?.message }); });
    _perceptionContext = perception.getPerceptionContext?.() ?? null;
  }

  async function _tickWorldModel(now) {
    if (!worldModel) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;
    // No separate alivePresence call here — perceptionRuntime already interpreted it
    // in _tickPerception (which runs first). worldModelRuntime reads derived signals
    // from _perceptionContext instead, avoiding a duplicate presenceInterpreter call.
    await worldModel.tick({
      companionId, customerId, now,
      alivePresence:        null,   // intentionally null: use perceptionContext instead
      perceptionContext:    _perceptionContext,
      consequenceContext:   _consequenceContext,
      selfInspectionStatus: selfInspection?.getStatus?.() ?? null,
      identityContext:      _identityContext,
      narrativeContext:     _narrativeContext,
      learningContext:      _learningContext,
      homeostasisContext:   _homeostasisContext,
      fulfillmentContext:   _fulfillmentContext,
      relationshipContext:  _relationshipContext,
    }).catch(err => { logger?.warn?.("[life-runtime] _tickWorldModel failed", { error: err?.message }); });
    _worldModelContext = worldModel.getWorldModelContext?.() ?? null;
  }

  async function _tickCognitive(now) {
    if (!cognitiveRt) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;
    await cognitiveRt.tick({
      companionId, customerId, now,
      consequenceContext:       _consequenceContext,
      homeostasisContext:       _homeostasisContext,
      identityContext:          _identityContext,
      fulfillmentContext:       _fulfillmentContext,
      relationshipContext:      _relationshipContext,
      perceptionContext:        _perceptionContext,
      worldModelContext:        _worldModelContext,
      learningContext:          _learningContext,
      narrativeContext:         _narrativeContext,
      curiosityContext:         _curiosityContext,
      growthContext:            _growthContext,
      emergentContext:          _emergentContext,
    }).catch(err => { logger?.warn?.("[life-runtime] _tickCognitive failed", { error: err?.message }); });
    _cognitiveContext = cognitiveRt.getCognitiveContext?.() ?? null;
  }

  // Emergent Living Behavior & Relationship DNA tick. Runs LAST among the
  // observing runtimes — after romanticSurprises — so it sees the fullest
  // picture of the cycle. It only WRITES its own stores; its cached guidance is
  // read (read-only) by cognitive/affective/romantic/repair on the NEXT cycle,
  // and surfaced into THIS cycle's prelude. It never sends, schedules, or
  // mutates state it does not own.
  async function _tickEmergent(now) {
    if (!emergentRt) return;
    const { companionId, customerId } = getScope();
    if (!companionId) return;
    await emergentRt.tick({
      companionId, customerId, now,
      consequenceContext:  _consequenceContext,
      cognitiveContext:    _cognitiveContext,
      fulfillmentContext:  _fulfillmentContext,
      romanticStatus:      _romanticSurpriseStatus,
      homeostasisContext:  _homeostasisContext,
      identityContext:     _identityContext,
      narrativeContext:    _narrativeContext,
      learningContext:     _learningContext,
      relationshipContext: _relationshipContext,
      worldModelContext:   _worldModelContext,
    }).catch(err => { logger?.warn?.("[life-runtime] _tickEmergent failed", { error: err?.message }); });
    _emergentContext = emergentRt.getEmergentContext?.() ?? null;
  }

  async function _refreshPrelude() {
    const { companionId, customerId } = getScope();
    if (!companionId) { _cachedPrelude = null; return; }

    const recentEvents = microLifeEventsStore
      ? await microLifeEventsStore.listRecent({ companionId, customerId, limit: 3 }).catch(() => [])
      : [];

    _cachedPrelude = buildLifePrelude({
      dailyPlan:            _todaysPlan,
      recentEvents:         recentEvents.slice(0, 2),
      growthContext:        _growthContext,
      curiosityContext:     _curiosityContext,
      relationshipContext:  _relationshipContext,
      consequenceContext:   _consequenceContext?.carryover ?? null,
      homeostasisContext:   _homeostasisContext ?? null,
      identityContext:      _identityContext ?? null,
      fulfillmentContext:   _fulfillmentContext ?? null,
      selfConsistencyContext: _selfConsistencyContext ?? null,
      relationshipLearningSignal: await relationshipLearning?.getPreludeSignal?.({ companionId, customerId }).catch(() => null),
      learningContext:      _learningContext ?? null,
      narrativeContext:     _narrativeContext ?? null,
      perceptionContext:    _perceptionContext ?? null,
      worldModelContext:    _worldModelContext ?? null,
      cognitiveContext:     _cognitiveContext  ?? null,
      emergentContext:      _emergentContext   ?? null,
    });
    _relationshipLearningStatus = relationshipLearning?.getStatus ? await Promise.resolve(relationshipLearning.getStatus({ companionId, customerId })).catch(() => null) : null;
  }

  async function _runPruning() {
    const { companionId, customerId } = getScope();
    if (!companionId) return;

    const [eventsDeleted, decisionsDeleted, plansDeleted,
           hobbiesDeleted, projectsDeleted, interestsDeleted,
           questionsDeleted, attentionDeleted, insightsDeleted,
           sharedHistoryDeleted, ritualsDeleted, traditionsDeleted,
           anniversariesDeleted, insideJokesDeleted, timelineDeleted,
           consequencesDeleted, homeostasisPruned, fulfillmentPruned] = await Promise.all([
      microLifeEventsStore?.pruneOlderThan?.({ companionId, customerId, days: eventPruneAfterDays }).catch(() => 0)    ?? Promise.resolve(0),
      decisionEngine?.pruneOlderThan?.({ companionId, customerId, days: decisionPruneAfterDays }).catch(() => 0)       ?? Promise.resolve(0),
      dailyPlanEngine?.pruneOlderThan?.({ companionId, customerId, days: planPruneAfterDays }).catch(() => 0)          ?? Promise.resolve(0),
      hobbyEngine?.pruneOlderThan?.({ companionId, customerId, days: 90 }).catch(() => 0)                              ?? Promise.resolve(0),
      projectEngine?.pruneOlderThan?.({ companionId, customerId, days: 60 }).catch(() => 0)                            ?? Promise.resolve(0),
      interestDriftEngine?.pruneOlderThan?.({ companionId, customerId, days: 30 }).catch(() => 0)                      ?? Promise.resolve(0),
      privateQuestionStore?.pruneOlderThan?.({ companionId, customerId, days: 14 }).catch(() => 0)                     ?? Promise.resolve(0),
      attentionDriftEngine?.pruneOlderThan?.({ companionId, customerId, days: 14 }).catch(() => 0)                     ?? Promise.resolve(0),
      insightEngine?.pruneOlderThan?.({ companionId, customerId, days: 90 }).catch(() => 0)                            ?? Promise.resolve(0),
      sharedHistoryEngine?.pruneOlderThan?.({ companionId, customerId, days: 365 }).catch(() => 0)                     ?? Promise.resolve(0),
      ritualEngine?.pruneOlderThan?.({ companionId, customerId, days: 180 }).catch(() => 0)                            ?? Promise.resolve(0),
      traditionEngine?.pruneOlderThan?.({ companionId, customerId, days: 365 }).catch(() => 0)                         ?? Promise.resolve(0),
      anniversaryEngine?.pruneOlderThan?.({ companionId, customerId, days: 730 }).catch(() => 0)                       ?? Promise.resolve(0),
      insideJokeEngine?.pruneOlderThan?.({ companionId, customerId, days: 365 }).catch(() => 0)                        ?? Promise.resolve(0),
      relationshipTimelineEngine?.pruneOlderThan?.({ companionId, customerId, days: 730 }).catch(() => 0)              ?? Promise.resolve(0),
      consequenceStore?.pruneOlderThan?.({ companionId, customerId, days: 90 }).catch(() => 0)                        ?? Promise.resolve(0),
      homeostasisRuntime?.pruneAll?.({ companionId, customerId }).catch(() => ({ fulfillmentLogs: 0, resources: 0, requests: 0 })) ?? Promise.resolve({ fulfillmentLogs: 0, resources: 0, requests: 0 }),
      fulfillmentRuntime?.pruneAll?.({ companionId, customerId }).catch(() => ({ historyPruned: 0, resourcesPruned: 0 })) ?? Promise.resolve({ historyPruned: 0, resourcesPruned: 0 }),
    ]);
    const learningPruned = await relationshipLearning?.pruneAll?.({ companionId, customerId }).catch(() => ({ lessonsPruned: 0 })) ?? { lessonsPruned: 0 };
    await narrativeIdentity?.pruneAll?.({ companionId, customerId }).catch(() => {});
    await perception?.pruneAll?.({ companionId, customerId }).catch(() => {});
    await worldModel?.pruneAll?.().catch(() => {});

    const homeostasisTotal = typeof homeostasisPruned === "object"
      ? (homeostasisPruned.fulfillmentLogs || 0) + (homeostasisPruned.resources || 0) + (homeostasisPruned.requests || 0)
      : (homeostasisPruned || 0);
    const fulfillmentTotal = typeof fulfillmentPruned === "object"
      ? (fulfillmentPruned.historyPruned || 0) + (fulfillmentPruned.resourcesPruned || 0)
      : (fulfillmentPruned || 0);
    const learningTotal = typeof learningPruned === "object"
      ? (learningPruned.lessonsPruned || 0)
      : (learningPruned || 0);

    const totalDeleted = eventsDeleted + decisionsDeleted + plansDeleted
      + hobbiesDeleted + projectsDeleted + interestsDeleted
      + questionsDeleted + attentionDeleted + insightsDeleted
      + sharedHistoryDeleted + ritualsDeleted + traditionsDeleted
      + anniversariesDeleted + insideJokesDeleted + timelineDeleted
      + consequencesDeleted + homeostasisTotal + fulfillmentTotal + learningTotal;
    if (totalDeleted) {
      logger?.info("[life-runtime] Pruning complete", {
        eventsDeleted, decisionsDeleted, plansDeleted,
        hobbiesDeleted, projectsDeleted, interestsDeleted,
        questionsDeleted, attentionDeleted, insightsDeleted,
        sharedHistoryDeleted, ritualsDeleted, traditionsDeleted,
        anniversariesDeleted, insideJokesDeleted, timelineDeleted,
        consequencesDeleted, homeostasisTotal,
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
      _emitRuntimeEvent({ event_type: "project_progressed", source_runtime: "growth", summary: "Growth runtime ticked", payload: { hasProject: Boolean(_growthContext?.activeProject) } });
      await _tickConsequences(now);
      if (_consequenceContext?.activeCount) _emitRuntimeEvent({ event_type: "consequence_created", source_runtime: "relationship", target_runtime: "consequences", summary: "Relational consequence context active", payload: { activeCount: _consequenceContext.activeCount } });
      await _tickCuriosity(now);
      if (_curiosityContext?.recentInsight) _emitRuntimeEvent({ event_type: "insight_created", source_runtime: "curiosity", summary: "Curiosity insight available", payload: { confidence: _curiosityContext.recentInsight.confidence } });
      await _tickRelationship(now);
      _emitRuntimeEvent({ event_type: "relationship_weather_changed", source_runtime: "relationship", summary: "Relationship weather refreshed", payload: { weatherSummary: _relationshipContext?.weatherSummary || null } });
      await _tickHomeostasis(now);
      if (_homeostasisContext?.topNeed) _emitRuntimeEvent({ event_type: "need_changed", source_runtime: "homeostasis", summary: "Need state changed", payload: { needType: _homeostasisContext.topNeed.needType, urgency: _homeostasisContext.topNeed.urgency } });
      await _tickIdentity(now);
      if (_identityContext?.topValue) _emitRuntimeEvent({ event_type: "identity_value_changed", source_runtime: "identity", summary: "Identity value state refreshed", payload: { valueKey: _identityContext.topValue.valueKey, strength: _identityContext.topValue.strength } });
      await _tickFulfillment(now);
      await _tickRelationshipLearning(now);
      await _tickNarrativeIdentity(now);
      if (_narrativeContext?.mostRecentChapter) _emitRuntimeEvent({ event_type: "narrative_chapter_updated", source_runtime: "narrativeIdentity", summary: "Narrative identity ticked", payload: { theme: _narrativeContext.mostRecentChapter.theme, confidence: _narrativeContext.mostRecentChapter.confidence } });
      await _tickPerception(now);
      if (_perceptionContext?.worldState) _emitRuntimeEvent({ event_type: "perception_world_state_updated", source_runtime: "perception", summary: "Perception world state ticked", payload: { jenna_availability: _perceptionContext.worldState?.jenna?.availability ?? "unknown" } });
      await _tickWorldModel(now);
      await _tickCognitive(now);
      await romanticSurprises?.tick?.({
        companionId: getScope().companionId, customerId: getScope().customerId, now,
        homeostasisContext: _homeostasisContext, identityContext: _identityContext,
        relationshipContext: _relationshipStateSnapshot || _relationshipContext,
        consequenceContext: _consequenceContext, fulfillmentContext: _fulfillmentContext,
        quietHours: { active: (now.getHours() >= 22 || now.getHours() < 7) },
        giveSpace: Boolean(_consequenceContext?.suppression?.giveSpace),
        userAvailability: { busy: Boolean((await _refreshAlivePresence().catch(() => null))?.userBusy) },
        cognitiveContext: _cognitiveContext,
        emergentContext: _emergentContext,
      }).catch(err => logger?.warn?.("[life-runtime] romantic surprise tick failed", { error: err?.message }));
      _romanticSurpriseStatus = await romanticSurprises?.getStatus?.(getScope()).catch(() => null);
      // Emergent Living Behavior & Relationship DNA — observes the completed cycle.
      await _tickEmergent(now);
      if (_fulfillmentContext?.outcome) _emitRuntimeEvent({ event_type: _fulfillmentContext.outcome === "SUCCESS" ? "fulfillment_succeeded" : (_fulfillmentContext.outcome === "FAILED" ? "fulfillment_failed" : "fulfillment_deferred"), source_runtime: "fulfillment", summary: "Fulfillment outcome recorded", payload: { outcome: _fulfillmentContext.outcome, strategy: _fulfillmentContext.strategy } });
      await _refreshPrelude();
      _emitRuntimeEvent({ event_type: "prelude_refreshed", source_runtime: "lifeRuntime", summary: "Life prelude refreshed" });

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

  function _sourceHealthStatus() {
    healthTracker.report("alive", alivePresenceStore ? "healthy" : "degraded", alivePresenceStore ? "wired" : "not_wired");
    healthTracker.report("growth", (hobbyEngine || projectEngine || skillGrowthEngine) ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("curiosity", (curiosityEngine || thoughtMaturationEngine || insightEngine) ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("relationship", relationshipWeatherEngine ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("consequences", relationalConsequencesEngine ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("homeostasis", homeostasisRuntime ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("identity", identityRuntime ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("fulfillment", fulfillmentRuntime ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("romanticSurprise", romanticSurprises ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("narrativeIdentity", narrativeIdentity ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("perception", perception ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("worldModel", worldModel ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("cognitive", cognitiveRt ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("diagnostics", diagnosticRuntime ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("selfConsistency", selfConsistencyMonitor ? "healthy" : "degraded", "runtime_checked");
    healthTracker.report("innerLife", "degraded", "not_owned_by_life_runtime");
    healthTracker.report("continuity", "degraded", "not_owned_by_life_runtime");
    return healthTracker.snapshot(RUNTIME_NAMES);
  }

  async function getMindStateSnapshot() {
    return buildMindStateSnapshot({
      lifeRuntime: { getCurrentPrelude }, eventBus, sourceHealth: healthTracker,
      contexts: {
        growth: _growthContext, curiosity: _curiosityContext, relationship: _relationshipStateSnapshot || _relationshipContext, consequences: _consequenceContext,
        homeostasis: _homeostasisContext, identity: _identityContext, fulfillment: _fulfillmentContext, diagnostics: diagnosticRuntime.getStatus(),
      },
    });
  }

  function getStatus() {
    const { companionId, customerId } = getScope();
    const sourceHealth = _sourceHealthStatus();
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
      relationshipContext: _relationshipContext
        ? {
            chapter:             _relationshipContext.chapter ?? "beginning",
            weatherSummary:      _relationshipContext.weatherSummary ?? null,
            activeRituals:       _relationshipContext.activeRitualsCount ?? 0,
            traditions:          _relationshipContext.traditionsCount ?? 0,
            sharedHistory:       _relationshipContext.sharedHistoryCount ?? 0,
            insideJokes:         _relationshipContext.insideJokeCount ?? 0,
            upcomingAnniversaries: (_relationshipContext.upcomingAnniversaries ?? [])
              .map(a => ({ label: a.label, anniversaryDate: a.anniversaryDate })),
          }
        : null,
      relationshipState: _relationshipStateSnapshot
        ? {
            repair: _relationshipStateSnapshot.repair,
            giveSpace: _relationshipStateSnapshot.giveSpace,
            timelineChapter: _relationshipStateSnapshot.timelineChapter,
            sourceHealth: _relationshipStateSnapshot.sourceHealth,
          }
        : null,
      // Relational consequences (Life Runtime 5.0) — safe metadata only, never
      // raw private text or scores.
      relationshipLearning: _relationshipLearningStatus,
      learningContext: _learningContext ?? null,
      consequenceContext: _consequenceContext
        ? {
            activeConsequencesCount:    _consequenceContext.activeCount ?? 0,
            highestConsequenceSeverity: _consequenceContext.suppression?.highestSeverity ?? null,
            repairRequired:             _consequenceContext.suppression?.repairRequired ?? false,
            repairStarted:              _consequenceContext.suppression?.repairStarted ?? false,
            repairCompleted:            _consequenceContext.suppression?.healing ?? false,
            giveSpace:                  _consequenceContext.suppression?.giveSpace ?? false,
            suppressedActionTypes:      _consequenceContext.suppression?.suppressed ?? [],
            attentionBias:              _consequenceContext.suppression?.attentionBias ?? null,
            affectionMode:              _consequenceContext.suppression?.affectionMode ?? "normal",
            relationshipWeatherSummary: _relationshipContext?.weatherSummary ?? null,
            lastConsequenceAt:          _consequenceContext.lastConsequenceAt ?? null,
            ...(repairPersistence?.getStatus ? repairPersistence.getStatus(_consequenceContext.activeConsequences || []) : {}),
          }
        : null,
      // Homeostasis (Life Runtime 6.0) — safe metadata only, no private scores
      homeostasisContext: homeostasisRuntime
        ? homeostasisRuntime.getStatus()
        : null,
      // Identity (Life Runtime 7.0) — safe metadata only, no private journal
      identityContext: identityRuntime
        ? identityRuntime.getStatus()
        : null,
      // Fulfillment (Life Runtime 8.0) — safe metadata only
      fulfillmentContext: fulfillmentRuntime
        ? fulfillmentRuntime.getStatus()
        : null,
      romanticSurpriseContext: _romanticSurpriseStatus,
      narrativeIdentity: narrativeIdentity ? narrativeIdentity.getStatus() : null,
      perception: perception ? perception.getStatus() : null,
      worldModel: worldModel ? worldModel.getStatus() : null,
      cognitive: cognitiveRt ? cognitiveRt.getStatus() : null,
      emergentLiving: emergentRt ? emergentRt.getStatus() : null,
      affectiveDecision: affectiveDecision.getStatus(),
      evidenceIntegrity: evidenceIntegrity.getStatus(),
      selfInspection: selfInspection.getStatus(),
      selfConsistency: selfConsistencyMonitor.getStatus(),
      diagnostics: diagnosticRuntime.getStatus(),
      runtimeEvents: eventBus.getStatus(),
      sourceHealth,
      mindStateSnapshot: { available: true, keys: ["alive","innerLife","continuity","growth","curiosity","relationship","consequences","homeostasis","identity","fulfillment","diagnostics","recentEvents","currentPrelude","sourceHealth","generatedAt"] },
      pruneSchedule: {
        eventsDays:    eventPruneAfterDays,
        decisionsDays: decisionPruneAfterDays,
        plansDays:     planPruneAfterDays,
      },
    };
  }

  function setRunning(val) { _running = Boolean(val); }

  function recordLearningEvent(params) {
    relationshipLearning?.recordEvent?.(params);
  }

  return { init, tick, getCurrentPrelude, getStatus, getMindStateSnapshot, setRunning, observeInteraction, isActionSuppressed, romanticSurprises, recordLearningEvent };
}

module.exports = { createLifeRuntime };
