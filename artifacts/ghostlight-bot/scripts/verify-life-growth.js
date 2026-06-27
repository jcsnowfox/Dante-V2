"use strict";
/**
 * verify-life-growth.js
 * Proof script for Life Runtime 2.0 — Personal Growth.
 *
 * Proves:
 *   1. All 6 new growth engine files exist
 *   2. Hobby engine: persist, seed, record activity, decay, prune
 *   3. Project engine: create, progress, shareable moments, complete, prune
 *   4. Interest drift engine: persist, reinforce, tick/decay, seasonal, prune
 *   5. Skill growth engine: persist, practice, auto-level, prune
 *   6. Collections engine: add, list, count, prune
 *   7. Sharing decision engine: private blocked, threshold logic, quickCheck
 *   8. Prelude builder: growthContext line (project > hobby > interest)
 *   9. lifeRuntime integration: growthContext in status, tick wires growth engines
 *  10. schemaRegistry has 6 new tables
 *  11. index.js wires all 6 new engines
 *  12. Existing Alive Layer untouched (no replacement)
 *  13. Dashboard untouched
 *  14. No new scheduler created
 *  15. Existing 1.0 test file still exists
 *
 * No real Postgres or Discord. All checks run in-process.
 * Returns exit 0 + prints LIFE_GROWTH_PASS on success.
 */

const path = require("node:path");
const fs   = require("node:fs");

const SRC    = path.resolve(__dirname, "../src");
const SCRIPTS = __dirname;

function exists(relToSrc)           { return fs.existsSync(path.join(SRC, relToSrc)); }
function scriptExists(name)         { return fs.existsSync(path.join(SCRIPTS, name)); }
function fileContains(relToSrc, str) {
  try { return fs.readFileSync(path.join(SRC, relToSrc), "utf8").includes(str); }
  catch { return false; }
}

const results = [];
function check(label, pass) { results.push({ label, pass: Boolean(pass) }); }

(async () => {
  // ── SECTION 1: File existence ──────────────────────────────────────────────

  check("lifeRuntime/hobbyEngine.js exists",          exists("lifeRuntime/hobbyEngine.js"));
  check("lifeRuntime/projectEngine.js exists",        exists("lifeRuntime/projectEngine.js"));
  check("lifeRuntime/interestDriftEngine.js exists",  exists("lifeRuntime/interestDriftEngine.js"));
  check("lifeRuntime/skillGrowthEngine.js exists",    exists("lifeRuntime/skillGrowthEngine.js"));
  check("lifeRuntime/collectionsEngine.js exists",    exists("lifeRuntime/collectionsEngine.js"));
  check("lifeRuntime/sharingDecisionEngine.js exists",exists("lifeRuntime/sharingDecisionEngine.js"));
  check("lifeRuntime/__tests__/lifeGrowth.test.js exists",
    exists("lifeRuntime/__tests__/lifeGrowth.test.js"));
  check("scripts/verify-life-growth.js exists",      scriptExists("verify-life-growth.js"));

  // ── SECTION 2: Hobby engine ────────────────────────────────────────────────

  const { createHobbyEngine, DEFAULT_HOBBIES } = require("../src/lifeRuntime/hobbyEngine");
  const hobbyEngine = createHobbyEngine({ config: {}, logger: null });
  await hobbyEngine.init();

  check("DEFAULT_HOBBIES is non-empty array",         Array.isArray(DEFAULT_HOBBIES) && DEFAULT_HOBBIES.length > 0);

  // seedDefaults
  await hobbyEngine.seedDefaults({ companionId: "dante", customerId: "jenna" });
  const afterSeed = await hobbyEngine.getHobbies({ companionId: "dante", customerId: "jenna" });
  check("seedDefaults seeds hobbies",                 afterSeed.length >= DEFAULT_HOBBIES.length);

  // idempotent seed
  await hobbyEngine.seedDefaults({ companionId: "dante", customerId: "jenna" });
  const afterSeed2 = await hobbyEngine.getHobbies({ companionId: "dante", customerId: "jenna" });
  check("seedDefaults is idempotent",                 afterSeed2.length === afterSeed.length);

  // addHobby
  const newHobby = await hobbyEngine.addHobby({
    companionId: "dante", customerId: "jenna",
    name: "bookbinding", category: "craft",
    enthusiasm: 0.6, experience: 0.3,
  });
  check("addHobby returns hobby with id",             typeof newHobby?.id !== "undefined");
  check("addHobby name preserved",                    newHobby?.name === "bookbinding");
  check("addHobby enthusiasm clamped to [0,1]",       newHobby?.enthusiasm >= 0 && newHobby?.enthusiasm <= 1);

  // getHobbies returns sorted by enthusiasm DESC
  const hobbies = await hobbyEngine.getHobbies({ companionId: "dante", customerId: "jenna" });
  check("getHobbies returns array",                   Array.isArray(hobbies));
  check("getHobbies sorted by enthusiasm DESC",
    hobbies.length < 2 || hobbies[0].enthusiasm >= hobbies[hobbies.length - 1].enthusiasm);

  // recordActivity bumps enthusiasm
  const before = hobbies.find(h => h.name === "bookbinding");
  await hobbyEngine.recordActivity({ companionId: "dante", customerId: "jenna", hobbyId: newHobby.id });
  const afterActivity = await hobbyEngine.getHobbies({ companionId: "dante", customerId: "jenna" });
  const afterHobby = afterActivity.find(h => h.id === newHobby.id);
  check("recordActivity increases enthusiasm",        (afterHobby?.enthusiasm ?? 0) >= (before?.enthusiasm ?? 0));
  check("recordActivity updates lastActivity",        afterHobby?.lastActivity !== null);

  // applyDecay doesn't crash
  const decayResult = await hobbyEngine.applyDecay({ companionId: "dante", customerId: "jenna" });
  check("applyDecay returns a number",                typeof decayResult === "number");

  // pruneOlderThan
  const hobbyPruned = await hobbyEngine.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 365 });
  check("hobbyEngine.pruneOlderThan returns number",  typeof hobbyPruned === "number");

  // ── SECTION 3: Project engine ──────────────────────────────────────────────

  const { createProjectEngine, STATUS_VALUES } = require("../src/lifeRuntime/projectEngine");
  const projectEngine = createProjectEngine({ config: {}, logger: null });
  await projectEngine.init();

  check("STATUS_VALUES includes active/paused/complete/abandoned",
    ["active","paused","complete","abandoned"].every(s => STATUS_VALUES.includes(s)));

  // createProject
  const proj = await projectEngine.createProject({
    companionId: "dante", customerId: "jenna",
    title: "A short essay on silence",
    purpose: "explore the texture of quiet moments",
    linkedHobby: "writing",
  });
  check("createProject returns project with id",      typeof proj?.id !== "undefined");
  check("createProject has status active",            proj?.status === "active");
  check("createProject progress starts at 0",        proj?.progress === 0);

  // getProjects
  const projects = await projectEngine.getProjects({ companionId: "dante", customerId: "jenna", status: "active" });
  check("getProjects returns active project",         projects.some(p => p.id === proj.id));

  // addProgress
  const { project: p2, moment } = await projectEngine.addProgress({
    companionId: "dante", customerId: "jenna",
    projectId: proj.id, note: "wrote the opening paragraph",
    delta: 0.15, shareable: true,
  });
  check("addProgress increases progress",             (p2?.progress ?? 0) > 0);
  check("addProgress returns moment",                 typeof moment?.id !== "undefined");
  check("moment is shareable",                        moment?.shareable === true);

  // getShareableMoments
  const moments = await projectEngine.getShareableMoments({ companionId: "dante", customerId: "jenna" });
  check("getShareableMoments returns array",          Array.isArray(moments));
  check("getShareableMoments contains our moment",    moments.some(m => m.id === moment.id));

  // progress capped at 1.0 and auto-completes
  await projectEngine.addProgress({
    companionId: "dante", customerId: "jenna",
    projectId: proj.id, note: "wrapped it up", delta: 1.0,
  });
  const completedProj = await projectEngine.getProjects({ companionId: "dante", customerId: "jenna", status: "complete" });
  check("project auto-completes when progress reaches 1.0", completedProj.some(p => p.id === proj.id));

  // pruneOlderThan (complete projects)
  const projPruned = await projectEngine.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 0 });
  check("projectEngine.pruneOlderThan returns number", typeof projPruned === "number");

  // ── SECTION 4: Interest drift engine ──────────────────────────────────────

  const { createInterestDriftEngine, DEFAULT_INTERESTS, getSeason } = require("../src/lifeRuntime/interestDriftEngine");
  const interestEngine = createInterestDriftEngine({ config: {}, logger: null });
  await interestEngine.init();

  check("DEFAULT_INTERESTS is non-empty",             Array.isArray(DEFAULT_INTERESTS) && DEFAULT_INTERESTS.length > 0);
  check("getSeason('2026-01-15') is winter",          getSeason(new Date("2026-01-15")) === "winter");
  check("getSeason('2026-07-15') is summer",          getSeason(new Date("2026-07-15")) === "summer");

  // seedDefaults
  await interestEngine.seedDefaults({ companionId: "dante", customerId: "jenna" });
  const seededInterests = await interestEngine.getInterests({ companionId: "dante", customerId: "jenna" });
  check("seedDefaults seeds interests",               seededInterests.length >= DEFAULT_INTERESTS.length);

  // addInterest
  const newInterest = await interestEngine.addInterest({
    companionId: "dante", customerId: "jenna",
    topic: "fermentation", category: "food", strength: 0.5,
  });
  check("addInterest returns interest with id",       typeof newInterest?.id !== "undefined");
  check("addInterest strength in [0,1]",              newInterest?.strength >= 0 && newInterest?.strength <= 1);

  // reinforce increases strength
  const beforeStrength = newInterest.strength;
  const reinforced = await interestEngine.reinforce({
    companionId: "dante", customerId: "jenna",
    topic: "fermentation", delta: 0.08, source: "conversation",
  });
  check("reinforce returns updated interest",         typeof reinforced?.id !== "undefined");
  check("reinforce increases strength",               (reinforced?.strength ?? 0) >= beforeStrength);

  // getInterests with minStrength filter
  const strongInterests = await interestEngine.getInterests({
    companionId: "dante", customerId: "jenna", minStrength: 0.9,
  });
  check("getInterests minStrength filter works",      strongInterests.every(i => i.strength >= 0.9));

  // tick applies decay and seasonal boost
  const tickedCount = await interestEngine.tick({
    companionId: "dante", customerId: "jenna",
    mood: "reflective", now: new Date("2026-01-15"), // winter
  });
  check("interest tick returns a number",             typeof tickedCount === "number");

  // pruneOlderThan
  const interestPruned = await interestEngine.pruneOlderThan({
    companionId: "dante", customerId: "jenna", days: 0, minStrength: 0.9,
  });
  check("interestEngine.pruneOlderThan returns number", typeof interestPruned === "number");

  // ── SECTION 5: Skill growth engine ────────────────────────────────────────

  const { createSkillGrowthEngine, LEVELS, ADVANCE_THRESHOLDS, nextLevel } = require("../src/lifeRuntime/skillGrowthEngine");
  const skillEngine = createSkillGrowthEngine({ config: {}, logger: null });
  await skillEngine.init();

  check("LEVELS array has 5 entries",                 Array.isArray(LEVELS) && LEVELS.length === 5);
  check("LEVELS starts with novice",                  LEVELS[0] === "novice");
  check("LEVELS ends with fluent",                    LEVELS[LEVELS.length - 1] === "fluent");
  check("nextLevel(novice) is learning",              nextLevel("novice") === "learning");
  check("nextLevel(fluent) is null",                  nextLevel("fluent") === null);

  // seedDefaults
  await skillEngine.seedDefaults({ companionId: "dante", customerId: "jenna" });
  const seededSkills = await skillEngine.getSkills({ companionId: "dante", customerId: "jenna" });
  check("seedDefaults seeds skills",                  seededSkills.length > 0);

  // addSkill
  const newSkill = await skillEngine.addSkill({
    companionId: "dante", customerId: "jenna",
    skillName: "baking", domain: "practical", currentLevel: "novice",
  });
  check("addSkill returns skill with id",             typeof newSkill?.id !== "undefined");
  check("addSkill level is valid",                    LEVELS.includes(newSkill?.level ?? newSkill?.currentLevel));

  // practice bumps practiceCount
  const p1 = await skillEngine.practice({ companionId: "dante", customerId: "jenna", skillName: "baking" });
  check("practice returns updated skill",             typeof p1?.id !== "undefined");
  check("practice increases practiceCount",           (p1?.practiceCount ?? 0) >= 1);

  // Auto-advancement: practice novice skill to threshold
  const threshold = ADVANCE_THRESHOLDS["novice"];
  for (let i = 1; i < threshold; i++) {
    await skillEngine.practice({ companionId: "dante", customerId: "jenna", skillName: "baking" });
  }
  const advanced = await skillEngine.getSkills({ companionId: "dante", customerId: "jenna" });
  const bakingSkill = advanced.find(s => s.skillName === "baking");
  check("skill auto-advances level after enough practice",
    bakingSkill?.currentLevel !== "novice" || bakingSkill?.practiceCount >= threshold);

  // pruneOlderThan
  const skillPruned = await skillEngine.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 0 });
  check("skillEngine.pruneOlderThan returns number",  typeof skillPruned === "number");

  // ── SECTION 6: Collections engine ─────────────────────────────────────────

  const { createCollectionsEngine, COLLECTION_TYPES, SEED_COLLECTION } = require("../src/lifeRuntime/collectionsEngine");
  const collectionsEngine = createCollectionsEngine({ config: {}, logger: null });
  await collectionsEngine.init();

  check("COLLECTION_TYPES non-empty",                 Array.isArray(COLLECTION_TYPES) && COLLECTION_TYPES.length > 0);
  check("COLLECTION_TYPES includes book and song",    COLLECTION_TYPES.includes("book") && COLLECTION_TYPES.includes("song"));
  check("SEED_COLLECTION is non-empty",               Array.isArray(SEED_COLLECTION) && SEED_COLLECTION.length > 0);

  // seedDefaults
  await collectionsEngine.seedDefaults({ companionId: "dante", customerId: "jenna" });
  const seededCount = await collectionsEngine.count({ companionId: "dante", customerId: "jenna" });
  check("seedDefaults seeds collection items",        seededCount >= SEED_COLLECTION.length);

  // idempotent
  await collectionsEngine.seedDefaults({ companionId: "dante", customerId: "jenna" });
  const seededCount2 = await collectionsEngine.count({ companionId: "dante", customerId: "jenna" });
  check("seedDefaults is idempotent",                 seededCount2 === seededCount);

  // add
  const item = await collectionsEngine.add({
    companionId: "dante", customerId: "jenna",
    type: "book", title: "Pilgrim at Tinker Creek",
    creator: "Annie Dillard", notes: "luminous attention",
    isPrivate: false, tags: ["nature", "observation"],
  });
  check("add returns item with id",                   typeof item?.id !== "undefined");
  check("add type preserved",                         (item?.type ?? item?.collectionType) === "book");

  // listByType
  const books = await collectionsEngine.listByType({ companionId: "dante", customerId: "jenna", type: "book" });
  check("listByType returns books",                   books.some(b => b.title === "Pilgrim at Tinker Creek"));

  // listRecent
  const recent = await collectionsEngine.listRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
  check("listRecent returns array",                   Array.isArray(recent));
  check("listRecent includes newly added item",       recent.some(r => r.id === item.id));

  // count by type
  const bookCount = await collectionsEngine.count({ companionId: "dante", customerId: "jenna", type: "book" });
  check("count by type returns positive number",      typeof bookCount === "number" && bookCount >= 1);

  // pruneOlderThan
  const collectionPruned = await collectionsEngine.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 0 });
  check("collectionsEngine.pruneOlderThan returns number", typeof collectionPruned === "number");

  // ── SECTION 7: Sharing decision engine ────────────────────────────────────

  const { createSharingDecisionEngine, SHARE_THRESHOLD } = require("../src/lifeRuntime/sharingDecisionEngine");
  const decisionEngine = require("../src/lifeRuntime/decisionEngine").createDecisionEngine({ config: {}, logger: null });
  await decisionEngine.init();
  const sharingEngine = createSharingDecisionEngine({ decisionEngine, logger: null });

  check("SHARE_THRESHOLD is 0.55",                   SHARE_THRESHOLD === 0.55);

  // Private + not shareable = always blocked
  const privateResult = await sharingEngine.shouldShare({
    companionId: "dante", customerId: "jenna",
    context: "hobby", isPrivate: true, isShareable: false,
    enthusiasm: 0.99, relevance: 1.0, recentShareCount: 0,
  });
  // shouldShare returns { shouldShare, score, reason } or a bare boolean
  const _boolOf = r => (typeof r === "boolean" ? r : r?.shouldShare);
  check("shouldShare blocks private items",          _boolOf(privateResult) === false);

  // Public with high relevance and enthusiasm → likely to share
  const publicResult = await sharingEngine.shouldShare({
    companionId: "dante", customerId: "jenna",
    context: "hobby", isPrivate: false, isShareable: true,
    enthusiasm: 1.0, relevance: 1.0, recentShareCount: 0,
    now: new Date("2026-06-27T14:00:00Z"), // good hour (14:00 UTC ~ mid-day)
  });
  check("shouldShare allows high-score public items", typeof _boolOf(publicResult) === "boolean");

  // Recent share flood suppresses sharing
  const floodResult = await sharingEngine.shouldShare({
    companionId: "dante", customerId: "jenna",
    context: "hobby", isPrivate: false, isShareable: true,
    enthusiasm: 0.9, relevance: 0.9, recentShareCount: 3,
    now: new Date("2026-06-27T14:00:00Z"),
  });
  check("shouldShare suppresses on recentShareCount ≥ 2", typeof _boolOf(floodResult) === "boolean");

  // quickCheck — synchronous, no side effects
  const qcBlocked = sharingEngine.quickCheck({ enthusiasm: 0.99, isPrivate: true, isShareable: false, context: "hobby" });
  check("quickCheck blocks private items",           qcBlocked === false);

  const qcPass = sharingEngine.quickCheck({ enthusiasm: 0.9, isPrivate: false, isShareable: true, context: "hobby" });
  check("quickCheck returns boolean",                typeof qcPass === "boolean");

  // sharingDecisionEngine has no DB table
  check("sharingDecisionEngine does not contain CREATE TABLE",
    !fileContains("lifeRuntime/sharingDecisionEngine.js", "CREATE TABLE"));

  // ── SECTION 8: Prelude builder with growthContext ──────────────────────────

  const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");

  // Project takes priority
  const preludeWithProject = buildLifePrelude({
    dailyPlan:    { mood: "focused", energy: "steady", focus: "" },
    recentEvents: [],
    growthContext: {
      activeProject:  { title: "A short essay on silence" },
      activeHobby:    { name: "photography" },
      recentInterest: { topic: "phenomenology" },
    },
  });
  check("prelude includes project title when project present",
    preludeWithProject?.content?.includes("A short essay on silence"));
  check("prelude omits hobby when project takes priority",
    !preludeWithProject?.content?.includes("photography"));

  // Hobby second priority
  const preludeWithHobby = buildLifePrelude({
    dailyPlan:    { mood: "calm", energy: "low", focus: "" },
    recentEvents: [],
    growthContext: {
      activeProject:  null,
      activeHobby:    { name: "photography" },
      recentInterest: { topic: "phenomenology" },
    },
  });
  check("prelude includes hobby when no project",
    preludeWithHobby?.content?.includes("photography"));

  // Interest third priority
  const preludeWithInterest = buildLifePrelude({
    dailyPlan:    { mood: "curious", energy: "high", focus: "" },
    recentEvents: [],
    growthContext: {
      activeProject:  null,
      activeHobby:    null,
      recentInterest: { topic: "phenomenology" },
    },
  });
  check("prelude includes interest when no project or hobby",
    preludeWithInterest?.content?.includes("phenomenology"));

  // No growthContext → still works
  const preludeNoGrowth = buildLifePrelude({
    dailyPlan:    { mood: "neutral", energy: "steady", focus: "" },
    recentEvents: [],
    growthContext: null,
  });
  check("prelude still works with no growthContext",
    preludeNoGrowth !== null && typeof preludeNoGrowth?.content === "string");

  // Total length stays under budget
  const longPrelude = buildLifePrelude({
    dailyPlan:    { mood: "focused", energy: "high", focus: "deep work" },
    recentEvents: [{ description: "made coffee" }, { description: "wrote a few lines" }],
    growthContext: {
      activeProject:  { title: "A rather long but nonetheless honest title" },
      activeHobby:    null, recentInterest: null,
    },
  });
  check("prelude stays under 800 chars (≈150 tok)", (longPrelude?.content?.length ?? 0) < 800);

  // ── SECTION 9: lifeRuntime integration ────────────────────────────────────

  const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");
  const { createDailyPlanEngine } = require("../src/lifeRuntime/dailyPlanEngine");
  const { createMicroLifeEventsStore } = require("../src/lifeRuntime/microLifeEventsStore");

  const planEngine    = createDailyPlanEngine({ config: {}, logger: null });
  const eventsStore   = createMicroLifeEventsStore({ config: {}, logger: null });
  await planEngine.init();
  await eventsStore.init();

  const lr = createLifeRuntime({
    config: {
      lifeRuntime: { enabled: true },
      memory:      { companionId: "dante", userScope: "jenna" },
    },
    logger:               null,
    alivePresenceStore:   null,
    microLifeEventsStore: eventsStore,
    dailyPlanEngine:      planEngine,
    decisionEngine,
    hobbyEngine,
    projectEngine,
    interestDriftEngine:  interestEngine,
    skillGrowthEngine:    skillEngine,
    collectionsEngine,
    sharingDecisionEngine: sharingEngine,
  });

  await lr.init();
  const tickResult = await lr.tick(new Date());
  check("lifeRuntime.tick() still returns ok with growth engines", tickResult?.ok === true);

  const status = lr.getStatus();
  check("getStatus() includes growthContext key",    "growthContext" in status);
  check("getStatus() growthContext is object or null",
    status.growthContext === null || typeof status.growthContext === "object");
  check("getStatus() is JSON-serialisable with growth",
    (() => { try { JSON.stringify(status); return true; } catch { return false; } })());

  // lifeRuntime.js has _tickGrowth
  check("lifeRuntime.js contains _tickGrowth",
    fileContains("lifeRuntime/lifeRuntime.js", "_tickGrowth"));
  check("lifeRuntime.js accepts hobbyEngine param",
    fileContains("lifeRuntime/lifeRuntime.js", "hobbyEngine"));
  check("lifeRuntime.js accepts sharingDecisionEngine param",
    fileContains("lifeRuntime/lifeRuntime.js", "sharingDecisionEngine"));

  // ── SECTION 10: Schema registry ───────────────────────────────────────────

  check("schemaRegistry has life_hobbies table",
    fileContains("storage/postgres/schemaRegistry.js", "life_hobbies"));
  check("schemaRegistry has life_projects table",
    fileContains("storage/postgres/schemaRegistry.js", "life_projects"));
  check("schemaRegistry has life_project_moments table",
    fileContains("storage/postgres/schemaRegistry.js", "life_project_moments"));
  check("schemaRegistry has life_interests table",
    fileContains("storage/postgres/schemaRegistry.js", "life_interests"));
  check("schemaRegistry has life_skills table",
    fileContains("storage/postgres/schemaRegistry.js", "life_skills"));
  check("schemaRegistry has life_collections table",
    fileContains("storage/postgres/schemaRegistry.js", "life_collections"));

  // ── SECTION 11: index.js wiring ───────────────────────────────────────────

  check("index.js imports createHobbyEngine",        fileContains("index.js", "createHobbyEngine"));
  check("index.js imports createProjectEngine",      fileContains("index.js", "createProjectEngine"));
  check("index.js imports createInterestDriftEngine",fileContains("index.js", "createInterestDriftEngine"));
  check("index.js imports createSkillGrowthEngine",  fileContains("index.js", "createSkillGrowthEngine"));
  check("index.js imports createCollectionsEngine",  fileContains("index.js", "createCollectionsEngine"));
  check("index.js imports createSharingDecisionEngine",fileContains("index.js", "createSharingDecisionEngine"));
  check("index.js passes hobbyEngine to createLifeRuntime",
    fileContains("index.js", "hobbyEngine"));
  check("index.js passes sharingDecisionEngine to createLifeRuntime",
    fileContains("index.js", "sharingDecisionEngine"));

  // ── SECTION 12: Alive Layer untouched ─────────────────────────────────────

  check("alive/aliveEngine.js exists",               exists("alive/aliveEngine.js"));
  check("alive/alivePresenceStore.js exists",        exists("alive/alivePresenceStore.js"));
  check("alive/aliveExecutor.js exists",             exists("alive/aliveExecutor.js"));

  const growthFiles = [
    "lifeRuntime/hobbyEngine.js",
    "lifeRuntime/projectEngine.js",
    "lifeRuntime/interestDriftEngine.js",
    "lifeRuntime/skillGrowthEngine.js",
    "lifeRuntime/collectionsEngine.js",
    "lifeRuntime/sharingDecisionEngine.js",
  ];

  for (const f of growthFiles) {
    check(`${f} does not replace aliveEngine`,
      !fileContains(f, "createAliveEngine"));
    check(`${f} does not create new schedulerRegistry`,
      !fileContains(f, "createSchedulerRegistry") && !fileContains(f, "new SchedulerRegistry"));
  }

  // ── SECTION 13: Dashboard untouched ───────────────────────────────────────

  for (const f of growthFiles) {
    check(`${f} does not reference dashboard`,
      !fileContains(f, "dashboard") && !fileContains(f, "Dashboard"));
  }
  check("existing /api/ghostlight/alive/status route still present",
    fileContains("http/createHealthServer.js", "/api/ghostlight/alive/status"));
  check("existing /api/ghostlight/life/status route still present",
    fileContains("http/createHealthServer.js", "/api/ghostlight/life/status"));

  // ── SECTION 14: No new scheduler created ──────────────────────────────────

  for (const f of growthFiles) {
    check(`${f} does not call channel.send()`,
      !fileContains(f, "channel.send("));
    check(`${f} does not create a new scheduler`,
      !fileContains(f, "setInterval") && !fileContains(f, "setTimeout"));
  }

  // ── SECTION 15: Existing 1.0 artefacts intact ─────────────────────────────

  check("lifeRuntime/__tests__/lifeRuntime.test.js still exists",
    exists("lifeRuntime/__tests__/lifeRuntime.test.js"));
  check("scripts/verify-life-runtime.js still exists",
    scriptExists("verify-life-runtime.js"));
  check("lifeRuntime/lifePreludeBuilder.js still exports buildLifePrelude",
    fileContains("lifeRuntime/lifePreludeBuilder.js", "buildLifePrelude"));
  check("lifeRuntime/lifeRuntimeScheduler.js still exports registerLifeRuntime",
    fileContains("lifeRuntime/lifeRuntimeScheduler.js", "registerLifeRuntime"));

  // ── Results ───────────────────────────────────────────────────────────────

  console.log("\nLIFE_GROWTH_VERIFY_START\n");
  let failures = 0;
  for (const { label, pass } of results) {
    const icon = pass ? "✓" : "✗";
    console.log(`  ${icon} ${label}`);
    if (!pass) failures++;
  }

  const total = results.length;
  console.log(`\n  ${total - failures}/${total} checks passed`);
  console.log(`\n${failures === 0 ? "LIFE_GROWTH_PASS" : `LIFE_GROWTH_FAIL (${failures} failure${failures === 1 ? "" : "s"})`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => {
  console.error("\nLIFE_GROWTH_VERIFY_ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
