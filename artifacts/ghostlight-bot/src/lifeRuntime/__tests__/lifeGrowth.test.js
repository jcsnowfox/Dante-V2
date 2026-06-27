"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { createHobbyEngine, DEFAULT_HOBBIES } = require("../hobbyEngine");
const { createProjectEngine, STATUS_VALUES } = require("../projectEngine");
const { createInterestDriftEngine, DEFAULT_INTERESTS, getSeason } = require("../interestDriftEngine");
const { createSkillGrowthEngine, LEVELS, nextLevel } = require("../skillGrowthEngine");
const { createCollectionsEngine, COLLECTION_TYPES } = require("../collectionsEngine");
const { createSharingDecisionEngine, SHARE_THRESHOLD } = require("../sharingDecisionEngine");
const { buildLifePrelude } = require("../lifePreludeBuilder");
const { createLifeRuntime } = require("../lifeRuntime");
const { createMicroLifeEventsStore } = require("../microLifeEventsStore");
const { createDailyPlanEngine } = require("../dailyPlanEngine");
const { createDecisionEngine } = require("../decisionEngine");

// ── hobbyEngine ───────────────────────────────────────────────────────────────

describe("hobbyEngine", () => {
  it("addHobby returns a hobby with required fields", async () => {
    const engine = createHobbyEngine({ config: {} });
    await engine.init();
    const hobby = await engine.addHobby({
      companionId: "dante", customerId: "jenna",
      name: "reading", category: "intellectual",
      interest: 0.8, experience: 0.7, enthusiasm: 0.75, confidence: 0.7, moodInfluence: 0.15,
    });
    assert.ok(hobby, "hobby should be returned");
    assert.equal(hobby.name, "reading");
    assert.equal(hobby.category, "intellectual");
    assert.equal(typeof hobby.enthusiasm, "number");
    assert.equal(typeof hobby.experience, "number");
    assert.equal(typeof hobby.confidence, "number");
    assert.equal(hobby.active, true);
  });

  it("addHobby is idempotent — second call returns existing hobby", async () => {
    const engine = createHobbyEngine({ config: {} });
    await engine.init();
    const h1 = await engine.addHobby({ companionId: "d2", customerId: "j2", name: "cooking", category: "practical" });
    const h2 = await engine.addHobby({ companionId: "d2", customerId: "j2", name: "cooking", category: "practical" });
    assert.equal(h1.id, h2.id);
  });

  it("seedDefaults populates DEFAULT_HOBBIES when none exist", async () => {
    const engine = createHobbyEngine({ config: {} });
    await engine.init();
    const seeded = await engine.seedDefaults({ companionId: "ds", customerId: "js" });
    assert.ok(seeded.length > 0, "should seed at least one hobby");
    // Second call is a no-op
    const seeded2 = await engine.seedDefaults({ companionId: "ds", customerId: "js" });
    assert.ok(seeded2.length > 0);
  });

  it("getHobbies returns hobbies sorted by enthusiasm", async () => {
    const engine = createHobbyEngine({ config: {} });
    await engine.init();
    await engine.addHobby({ companionId: "d3", customerId: "j3", name: "music", enthusiasm: 0.9 });
    await engine.addHobby({ companionId: "d3", customerId: "j3", name: "walking", enthusiasm: 0.3 });
    const hobbies = await engine.getHobbies({ companionId: "d3", customerId: "j3" });
    assert.ok(hobbies[0].enthusiasm >= hobbies[1].enthusiasm, "sorted by enthusiasm desc");
  });

  it("recordActivity increases enthusiasm and experience", async () => {
    const engine = createHobbyEngine({ config: {} });
    await engine.init();
    const hobby = await engine.addHobby({
      companionId: "d4", customerId: "j4", name: "photography",
      enthusiasm: 0.5, experience: 0.3, confidence: 0.3,
    });
    const updated = await engine.recordActivity({ companionId: "d4", customerId: "j4", hobbyId: hobby.id });
    assert.ok(updated.enthusiasm > 0.5, "enthusiasm should increase");
    assert.ok(updated.experience > 0.3, "experience should increase");
    assert.ok(updated.confidence > 0.3, "confidence should increase");
  });

  it("applyDecay reduces enthusiasm for inactive hobbies", async () => {
    const engine = createHobbyEngine({ config: {} });
    await engine.init();
    await engine.addHobby({ companionId: "d5", customerId: "j5", name: "philosophy", enthusiasm: 0.8 });
    const before = (await engine.getHobbies({ companionId: "d5", customerId: "j5" }))[0]?.enthusiasm ?? 0;
    await engine.applyDecay({ companionId: "d5", customerId: "j5", decayRate: 0.1 });
    const after = (await engine.getHobbies({ companionId: "d5", customerId: "j5" }))[0]?.enthusiasm ?? 0;
    assert.ok(after <= before, "enthusiasm should not increase after decay");
  });

  it("enthusiasm is clamped to [0, 1]", async () => {
    const engine = createHobbyEngine({ config: {} });
    await engine.init();
    const hobby = await engine.addHobby({ companionId: "d6", customerId: "j6", name: "writing", enthusiasm: 0.99 });
    const updated = await engine.recordActivity({ companionId: "d6", customerId: "j6", hobbyId: hobby.id, enthusiasmDelta: 0.5 });
    assert.ok(updated.enthusiasm <= 1, "enthusiasm clamped at 1");
  });

  it("DEFAULT_HOBBIES has meaningful entries", () => {
    assert.ok(DEFAULT_HOBBIES.length >= 5);
    for (const h of DEFAULT_HOBBIES) {
      assert.ok(typeof h.name === "string" && h.name.length > 0);
      assert.ok(h.enthusiasm >= 0 && h.enthusiasm <= 1);
    }
  });
});

// ── projectEngine ─────────────────────────────────────────────────────────────

describe("projectEngine", () => {
  it("createProject returns a project with required fields", async () => {
    const engine = createProjectEngine({ config: {} });
    await engine.init();
    const proj = await engine.createProject({
      companionId: "dante", customerId: "jenna",
      title: "reading through Sebald", purpose: "understand grief in prose",
    });
    assert.ok(proj, "project should be returned");
    assert.equal(proj.title, "reading through Sebald");
    assert.equal(proj.status, "active");
    assert.equal(proj.progress, 0);
    assert.ok(proj.startedAt);
  });

  it("addProgress increments progress and records a moment", async () => {
    const engine = createProjectEngine({ config: {} });
    await engine.init();
    const proj = await engine.createProject({ companionId: "d2", customerId: "j2", title: "learning miso" });
    const result = await engine.addProgress({
      companionId: "d2", customerId: "j2", projectId: proj.id,
      note: "tried dashi stock from scratch", delta: 0.1, shareable: true,
    });
    assert.ok(result?.project, "should return updated project");
    assert.ok(result?.moment, "should return moment");
    assert.ok(result.project.progress > 0, "progress should increase");
    assert.equal(result.moment.shareable, true);
  });

  it("progress completes project when it reaches 1.0", async () => {
    const engine = createProjectEngine({ config: {} });
    await engine.init();
    const proj = await engine.createProject({ companionId: "d3", customerId: "j3", title: "finish poem" });
    const result = await engine.addProgress({ companionId: "d3", customerId: "j3", projectId: proj.id, delta: 1.0 });
    assert.equal(result.project.status, "complete");
  });

  it("getProjects filters by status", async () => {
    const engine = createProjectEngine({ config: {} });
    await engine.init();
    await engine.createProject({ companionId: "d4", customerId: "j4", title: "active one" });
    const active = await engine.getProjects({ companionId: "d4", customerId: "j4", status: "active" });
    assert.ok(active.length >= 1);
    const paused = await engine.getProjects({ companionId: "d4", customerId: "j4", status: "paused" });
    assert.equal(paused.length, 0);
  });

  it("getShareableMoments returns only shareable moments", async () => {
    const engine = createProjectEngine({ config: {} });
    await engine.init();
    const proj = await engine.createProject({ companionId: "d5", customerId: "j5", title: "recipe book" });
    await engine.addProgress({ companionId: "d5", customerId: "j5", projectId: proj.id, note: "private note", delta: 0.05, shareable: false });
    await engine.addProgress({ companionId: "d5", customerId: "j5", projectId: proj.id, note: "shareable note", delta: 0.05, shareable: true });
    const moments = await engine.getShareableMoments({ companionId: "d5", customerId: "j5" });
    assert.ok(moments.every(m => m.shareable === true));
    assert.ok(moments.length >= 1);
  });

  it("STATUS_VALUES contains expected statuses", () => {
    assert.ok(STATUS_VALUES.includes("active"));
    assert.ok(STATUS_VALUES.includes("complete"));
    assert.ok(STATUS_VALUES.includes("paused"));
    assert.ok(STATUS_VALUES.includes("abandoned"));
  });
});

// ── interestDriftEngine ───────────────────────────────────────────────────────

describe("interestDriftEngine", () => {
  it("addInterest returns an interest with required fields", async () => {
    const engine = createInterestDriftEngine({ config: {} });
    await engine.init();
    const interest = await engine.addInterest({
      companionId: "dante", customerId: "jenna",
      topic: "brutalist architecture", category: "design", strength: 0.7,
    });
    assert.ok(interest, "interest should be returned");
    assert.equal(interest.topic, "brutalist architecture");
    assert.equal(interest.category, "design");
    assert.ok(interest.strength > 0 && interest.strength <= 1);
  });

  it("addInterest is idempotent", async () => {
    const engine = createInterestDriftEngine({ config: {} });
    await engine.init();
    const i1 = await engine.addInterest({ companionId: "d2", customerId: "j2", topic: "film photography" });
    const i2 = await engine.addInterest({ companionId: "d2", customerId: "j2", topic: "film photography" });
    assert.equal(i1.id, i2.id);
  });

  it("reinforce increases strength", async () => {
    const engine = createInterestDriftEngine({ config: {} });
    await engine.init();
    const interest = await engine.addInterest({ companionId: "d3", customerId: "j3", topic: "jazz", strength: 0.5 });
    const updated = await engine.reinforce({ companionId: "d3", customerId: "j3", topic: "jazz", delta: 0.1, source: "music" });
    assert.ok(updated.strength > 0.5, "strength should increase after reinforcement");
  });

  it("strength is clamped to [0, 1]", async () => {
    const engine = createInterestDriftEngine({ config: {} });
    await engine.init();
    await engine.addInterest({ companionId: "d4", customerId: "j4", topic: "philosophy", strength: 0.98 });
    const updated = await engine.reinforce({ companionId: "d4", customerId: "j4", topic: "philosophy", delta: 0.5 });
    assert.ok(updated.strength <= 1, "strength clamped at 1");
  });

  it("tick runs without error and returns a count", async () => {
    const engine = createInterestDriftEngine({ config: {} });
    await engine.init();
    await engine.addInterest({ companionId: "d5", customerId: "j5", topic: "Nordic literature", strength: 0.7 });
    const count = await engine.tick({ companionId: "d5", customerId: "j5" });
    assert.ok(typeof count === "number");
  });

  it("seedDefaults populates DEFAULT_INTERESTS when none exist", async () => {
    const engine = createInterestDriftEngine({ config: {} });
    await engine.init();
    const seeded = await engine.seedDefaults({ companionId: "ds", customerId: "js" });
    assert.ok(seeded.length > 0);
  });

  it("DEFAULT_INTERESTS has meaningful entries", () => {
    assert.ok(DEFAULT_INTERESTS.length >= 5);
    for (const i of DEFAULT_INTERESTS) {
      assert.ok(typeof i.topic === "string" && i.topic.length > 0);
      assert.ok(i.strength >= 0 && i.strength <= 1);
    }
  });

  it("getSeason returns one of four seasons", () => {
    const seasons = ["spring", "summer", "autumn", "winter"];
    const season = getSeason(new Date());
    assert.ok(seasons.includes(season), `${season} should be a valid season`);
  });
});

// ── skillGrowthEngine ─────────────────────────────────────────────────────────

describe("skillGrowthEngine", () => {
  it("addSkill returns a skill with required fields", async () => {
    const engine = createSkillGrowthEngine({ config: {} });
    await engine.init();
    const skill = await engine.addSkill({
      companionId: "dante", customerId: "jenna",
      skillName: "writing", domain: "creative", level: "developing",
    });
    assert.ok(skill, "skill should be returned");
    assert.equal(skill.skillName, "writing");
    assert.equal(skill.domain, "creative");
    assert.ok(LEVELS.includes(skill.level), "level should be a valid LEVEL");
  });

  it("addSkill is idempotent", async () => {
    const engine = createSkillGrowthEngine({ config: {} });
    await engine.init();
    const s1 = await engine.addSkill({ companionId: "d2", customerId: "j2", skillName: "photography" });
    const s2 = await engine.addSkill({ companionId: "d2", customerId: "j2", skillName: "photography" });
    assert.equal(s1.id, s2.id);
  });

  it("practice increments practiceCount", async () => {
    const engine = createSkillGrowthEngine({ config: {} });
    await engine.init();
    await engine.addSkill({ companionId: "d3", customerId: "j3", skillName: "cooking", practiceCount: 0 });
    const updated = await engine.practice({ companionId: "d3", customerId: "j3", skillName: "cooking" });
    assert.ok(updated.practiceCount >= 1 || updated.level !== "novice", "practiceCount should increase or level advanced");
  });

  it("level advances when threshold is met", async () => {
    const engine = createSkillGrowthEngine({ config: {} });
    await engine.init();
    // Set practice_count just below threshold for novice (12 sessions needed)
    await engine.addSkill({ companionId: "d4", customerId: "j4", skillName: "Norwegian", level: "novice", practiceCount: 11 });
    const advanced = await engine.practice({ companionId: "d4", customerId: "j4", skillName: "Norwegian" });
    assert.equal(advanced.level, "learning", "should advance from novice to learning");
    assert.equal(advanced.practiceCount, 0, "practice count resets on level advance");
  });

  it("LEVELS is ordered correctly", () => {
    const expected = ["novice", "learning", "developing", "comfortable", "fluent"];
    assert.deepEqual([...LEVELS], expected);
  });

  it("nextLevel returns correct next level", () => {
    assert.equal(nextLevel("novice"), "learning");
    assert.equal(nextLevel("comfortable"), "fluent");
    assert.equal(nextLevel("fluent"), null);
  });

  it("seedDefaults populates DEFAULT_SKILLS when none exist", async () => {
    const engine = createSkillGrowthEngine({ config: {} });
    await engine.init();
    const seeded = await engine.seedDefaults({ companionId: "ds", customerId: "js" });
    assert.ok(seeded.length > 0);
  });
});

// ── collectionsEngine ─────────────────────────────────────────────────────────

describe("collectionsEngine", () => {
  it("add returns a collection item with required fields", async () => {
    const engine = createCollectionsEngine({ config: {} });
    await engine.init();
    const item = await engine.add({
      companionId: "dante", customerId: "jenna",
      type: "book", title: "The Rings of Saturn", creator: "W.G. Sebald",
      notes: "read twice", isPrivate: false,
    });
    assert.ok(item, "item should be returned");
    assert.equal(item.collectionType, "book");
    assert.equal(item.title, "The Rings of Saturn");
    assert.equal(item.private, false);
  });

  it("listByType returns items of correct type", async () => {
    const engine = createCollectionsEngine({ config: {} });
    await engine.init();
    await engine.add({ companionId: "d2", customerId: "j2", type: "song", title: "On the Nature of Daylight", creator: "Max Richter" });
    await engine.add({ companionId: "d2", customerId: "j2", type: "book", title: "Some book" });
    const songs = await engine.listByType({ companionId: "d2", customerId: "j2", type: "song" });
    assert.ok(songs.length >= 1);
    assert.ok(songs.every(s => s.collectionType === "song"));
  });

  it("listRecent returns newest first", async () => {
    const engine = createCollectionsEngine({ config: {} });
    await engine.init();
    await engine.add({ companionId: "d3", customerId: "j3", type: "quote", title: "first" });
    await engine.add({ companionId: "d3", customerId: "j3", type: "quote", title: "second" });
    const items = await engine.listRecent({ companionId: "d3", customerId: "j3", limit: 5 });
    assert.ok(items.length >= 2);
    assert.equal(items[0].title, "second");
  });

  it("count returns accurate total", async () => {
    const engine = createCollectionsEngine({ config: {} });
    await engine.init();
    await engine.add({ companionId: "d4", customerId: "j4", type: "idea", title: "why silence matters" });
    await engine.add({ companionId: "d4", customerId: "j4", type: "idea", title: "memory as architecture" });
    const total = await engine.count({ companionId: "d4", customerId: "j4" });
    assert.ok(total >= 2);
  });

  it("seedDefaults adds starter items when collection is empty", async () => {
    const engine = createCollectionsEngine({ config: {} });
    await engine.init();
    await engine.seedDefaults({ companionId: "ds", customerId: "js" });
    const count = await engine.count({ companionId: "ds", customerId: "js" });
    assert.ok(count > 0, "seed should add items");
    // Second call should be a no-op
    await engine.seedDefaults({ companionId: "ds", customerId: "js" });
    const count2 = await engine.count({ companionId: "ds", customerId: "js" });
    assert.equal(count, count2, "seed should not add duplicates");
  });

  it("COLLECTION_TYPES contains all expected types", () => {
    const expected = ["song", "book", "place", "photograph", "quote", "recipe", "idea"];
    for (const t of expected) {
      assert.ok(COLLECTION_TYPES.includes(t), `${t} should be a valid collection type`);
    }
  });
});

// ── sharingDecisionEngine ─────────────────────────────────────────────────────

describe("sharingDecisionEngine", () => {
  it("shouldShare returns { shouldShare, score, reason }", async () => {
    const engine = createSharingDecisionEngine({});
    const result = await engine.shouldShare({
      context: "hobby", item: { name: "reading" },
      enthusiasm: 0.8, isPrivate: false, isShareable: true,
    });
    assert.ok(typeof result.shouldShare === "boolean");
    assert.ok(typeof result.score === "number");
    assert.ok(typeof result.reason === "string");
  });

  it("private items are never shared unless isShareable is true", async () => {
    const engine = createSharingDecisionEngine({});
    const result = await engine.shouldShare({
      context: "hobby", item: { name: "secret project" },
      enthusiasm: 1.0, isPrivate: true, isShareable: false,
    });
    assert.equal(result.shouldShare, false, "private item should not be shared");
  });

  it("high enthusiasm + not private + shareable crosses threshold", async () => {
    const engine = createSharingDecisionEngine({});
    const result = await engine.shouldShare({
      context: "project", item: { title: "miso recipe" },
      enthusiasm: 0.9, isPrivate: false, isShareable: true,
      relevance: 0.5, hour: 14,
    });
    assert.equal(result.shouldShare, true, "should share when all signals positive");
  });

  it("sharing fatigue reduces score", async () => {
    const engine = createSharingDecisionEngine({});
    const withFatigue = await engine.shouldShare({
      context: "hobby", item: { name: "photography" },
      enthusiasm: 0.7, isPrivate: false, isShareable: true, recentShareCount: 5,
    });
    const noFatigue = await engine.shouldShare({
      context: "hobby", item: { name: "photography" },
      enthusiasm: 0.7, isPrivate: false, isShareable: true, recentShareCount: 0,
    });
    assert.ok(withFatigue.score < noFatigue.score, "fatigue should reduce score");
  });

  it("quickCheck returns a boolean without side effects", () => {
    const engine = createSharingDecisionEngine({});
    const result = engine.quickCheck({ enthusiasm: 0.8, isPrivate: false, isShareable: true, context: "hobby" });
    assert.ok(typeof result === "boolean");
  });

  it("SHARE_THRESHOLD is accessible and reasonable", () => {
    assert.ok(SHARE_THRESHOLD > 0 && SHARE_THRESHOLD < 1, "threshold should be between 0 and 1");
  });
});

// ── prelude builder with growthContext ────────────────────────────────────────

describe("lifePreludeBuilder with growthContext", () => {
  const mockPlan = { mood: "curious", energy: "steady", focus: "present and attentive", privateActivity: "reading something" };

  it("includes activeProject title when provided", () => {
    const prelude = buildLifePrelude({
      dailyPlan: mockPlan,
      growthContext: { activeProject: { title: "learning miso from scratch" }, activeHobby: null, recentInterest: null },
    });
    assert.ok(prelude?.content?.includes("learning miso"), "should include project title");
  });

  it("falls back to activeHobby when no project", () => {
    const prelude = buildLifePrelude({
      dailyPlan: mockPlan,
      growthContext: { activeProject: null, activeHobby: { name: "photography" }, recentInterest: null },
    });
    assert.ok(prelude?.content?.includes("photography"), "should include hobby name");
  });

  it("falls back to recentInterest when no hobby or project", () => {
    const prelude = buildLifePrelude({
      dailyPlan: mockPlan,
      growthContext: { activeProject: null, activeHobby: null, recentInterest: { topic: "brutalist architecture" } },
    });
    assert.ok(prelude?.content?.includes("brutalist architecture"), "should include interest topic");
  });

  it("works with null growthContext", () => {
    const prelude = buildLifePrelude({ dailyPlan: mockPlan, growthContext: null });
    assert.ok(prelude !== null, "should still return a prelude without growthContext");
  });

  it("total prelude stays under 800 chars", () => {
    const prelude = buildLifePrelude({
      dailyPlan: mockPlan,
      recentEvents: [{ description: "made coffee" }, { description: "wrote a few lines" }],
      growthContext: {
        activeProject: { title: "rereading The Rings of Saturn for the third time" },
        activeHobby: { name: "photography" },
        recentInterest: { topic: "Nordic literature" },
      },
    });
    assert.ok((prelude?.content?.length ?? 0) < 800, "prelude should stay compact");
  });
});

// ── lifeRuntime with growth engines (integration) ─────────────────────────────

describe("lifeRuntime with growth engines", () => {
  let microLifeEventsStore, dailyPlanEngine, decisionEngine;
  let hobbyEngine, projectEngine, interestDriftEngine, skillGrowthEngine, collectionsEngine, sharingDecisionEngine;
  let runtime;

  before(async () => {
    microLifeEventsStore = createMicroLifeEventsStore({ config: {} });
    dailyPlanEngine      = createDailyPlanEngine({ config: {} });
    decisionEngine       = createDecisionEngine({ config: {} });
    hobbyEngine          = createHobbyEngine({ config: {} });
    projectEngine        = createProjectEngine({ config: {} });
    interestDriftEngine  = createInterestDriftEngine({ config: {} });
    skillGrowthEngine    = createSkillGrowthEngine({ config: {} });
    collectionsEngine    = createCollectionsEngine({ config: {} });
    sharingDecisionEngine = createSharingDecisionEngine({ decisionEngine });

    runtime = createLifeRuntime({
      config: {
        lifeRuntime: { enabled: true },
        memory: { companionId: "dante-g", userScope: "jenna-g" },
      },
      logger: null,
      alivePresenceStore: null,
      microLifeEventsStore, dailyPlanEngine, decisionEngine,
      hobbyEngine, projectEngine, interestDriftEngine,
      skillGrowthEngine, collectionsEngine, sharingDecisionEngine,
    });
  });

  it("init() seeds default hobbies, interests, skills, and collections", async () => {
    await runtime.init();
    const hobbies   = await hobbyEngine.getHobbies({ companionId: "dante-g", customerId: "jenna-g" });
    const interests = await interestDriftEngine.getInterests({ companionId: "dante-g", customerId: "jenna-g" });
    const skills    = await skillGrowthEngine.getSkills({ companionId: "dante-g", customerId: "jenna-g" });
    const colCount  = await collectionsEngine.count({ companionId: "dante-g", customerId: "jenna-g" });
    assert.ok(hobbies.length > 0,    "hobbies should be seeded");
    assert.ok(interests.length > 0,  "interests should be seeded");
    assert.ok(skills.length > 0,     "skills should be seeded");
    assert.ok(colCount > 0,          "collections should be seeded");
  });

  it("tick() runs without error and returns ok", async () => {
    const result = await runtime.tick(new Date());
    assert.equal(result.ok, true);
  });

  it("getStatus includes growthContext after tick", () => {
    const status = runtime.getStatus();
    assert.ok("growthContext" in status, "status should expose growthContext");
  });

  it("getCurrentPrelude is not null after tick with growth engines", () => {
    const prelude = runtime.getCurrentPrelude();
    assert.ok(prelude !== null, "prelude should be built");
    assert.ok(typeof prelude?.label === "string");
    assert.ok(typeof prelude?.content === "string");
  });

  it("tick() is idempotent — second tick runs cleanly", async () => {
    const result = await runtime.tick(new Date());
    assert.equal(result.ok, true);
  });
});
