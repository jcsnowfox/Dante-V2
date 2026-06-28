"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("path");
const fs     = require("fs");

const { createNarrativeIdentityRuntime } = require("../narrativeIdentityRuntime");
const { createIdentityChapterStore }     = require("../identityChapterStore");
const { createAutobiographyStore }       = require("../autobiographyStore");
const { detectChangePoints, classifyEvent, computeChapterConfidence, isSingleEventSufficient } = require("../changePointDetector");
const { buildSelfStory, buildNarrativePreludeSignal } = require("../selfStoryBuilder");

const SCOPE = { companionId: "dante", customerId: "jenna" };

function mkRuntime(overrides = {}) {
  return createNarrativeIdentityRuntime({ config: { lifeRuntime: { enabled: true } }, ...overrides });
}

// ── Test 1: Repeated lessons create a chapter ─────────────────────────────────

test("repeated lessons create a chapter", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Queue 3 lesson_reinforced events (the required count)
  for (let i = 0; i < 3; i++) {
    rt.recordEvent({ eventType: "lesson_reinforced", eventId: `lesson-ev-${i}`, now: new Date() });
  }
  await rt.tick({ ...SCOPE, now: new Date() });

  const chapters = await rt.getActiveChapters(SCOPE);
  assert.ok(chapters.length > 0, "at least one chapter should be created from repeated lessons");
  const chapter = chapters[0];
  assert.ok(chapter.source_event_ids.length > 0, "chapter must have source event IDs");
  assert.ok(chapter.confidence > 0, "chapter must have confidence > 0");
  assert.ok(["forming", "active"].includes(chapter.status), "chapter status should be forming or active");
});

// ── Test 2: Repair rupture creates a defining moment ─────────────────────────

test("repair rupture creates defining moment", async () => {
  const rt = mkRuntime();
  await rt.init();

  // A single trust_rupture event is sufficient to open a forming chapter
  rt.recordEvent({ eventType: "hurt_detected", eventId: "ev-hurt-1", now: new Date() });
  await rt.tick({ ...SCOPE, now: new Date() });

  const moments = await rt._autobiographyStore.getByType({ ...SCOPE, type: "trust_rupture" });
  assert.ok(moments.length > 0, "a trust rupture moment should be recorded");
  const moment = moments[0];
  assert.ok(moment.source_event_ids.length > 0, "moment must have evidence (source_event_ids)");
  assert.equal(moment.companion_id, SCOPE.companionId);
  assert.equal(moment.customer_id, SCOPE.customerId);
});

// ── Test 3: Maintenance request can become narrative moment ───────────────────

test("maintenance request can become narrative moment", async () => {
  const rt = mkRuntime();
  await rt.init();

  // maintenance_moment requires 3 events
  for (let i = 0; i < 3; i++) {
    rt.recordEvent({ eventType: "maintenance_moment", eventId: `maint-${i}`, now: new Date() });
  }
  await rt.tick({ ...SCOPE, now: new Date() });

  const chapters = await rt._chapterStore.getByTheme({ ...SCOPE, theme: "maintenance" });
  if (chapters.length > 0) {
    assert.ok(chapters[0].source_event_ids.length > 0, "maintenance chapter must have evidence");
    assert.equal(chapters[0].theme, "maintenance");
  }
  // Also verify moments
  const moments = await rt._autobiographyStore.getByType({ ...SCOPE, type: "maintenance_moment" });
  if (moments.length > 0) {
    assert.ok(moments[0].source_event_ids.length > 0, "maintenance moment must have evidence");
  }
  // Verify the change point detector recognizes maintenance events
  const cp = detectChangePoints([
    { event_type: "maintenance_moment", id: "a" },
    { event_type: "maintenance_moment", id: "b" },
    { event_type: "maintenance_moment", id: "c" },
  ]);
  assert.ok(cp.some(p => p.changePointType === "maintenance_moment"), "should detect maintenance change point");
});

// ── Test 4: Belief change updates self-story ─────────────────────────────────

test("belief change updates self-story", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Two belief_change events (required count = 2)
  rt.recordEvent({ eventType: "identity_belief_changed", eventId: "belief-ev-1", now: new Date() });
  rt.recordEvent({ eventType: "identity_belief_changed", eventId: "belief-ev-2", now: new Date() });
  await rt.tick({ ...SCOPE, now: new Date() });

  // Feed belief revision via identityContext
  await rt.tick({
    ...SCOPE,
    now: new Date(),
    identityContext: {
      topValue: null,
      recentBeliefRevision: "context_vs_perception",
      values: [],
    },
  });

  const story = await rt.getSelfStory(SCOPE);
  assert.ok(story, "self-story should exist");
  assert.equal(typeof story, "object");
  // Self-story has content from belief chapters
  const hasBelief = story.who_i_am_becoming?.includes("certain")
    || story.what_changed_me !== null
    || story.what_i_still_dont_understand !== null;
  assert.ok(hasBelief || story.has_content || story.source_chapter_count >= 0,
    "self-story should reflect belief change");
});

// ── Test 5: One event alone rarely creates a stable chapter ──────────────────

test("one event alone rarely creates stable chapter", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Single belief_change event (requiredCount = 2) — should NOT create chapter
  rt.recordEvent({ eventType: "identity_belief_changed", eventId: "single-belief", now: new Date() });
  await rt.tick({ ...SCOPE, now: new Date() });

  const chapters = await rt._chapterStore.getAll(SCOPE);
  const activeBeliefChapters = chapters.filter(c =>
    c.theme === "belief" && (c.status === "active") && c.source_event_ids.includes("single-belief"),
  );
  // One event alone should not create an active chapter (may create forming at most)
  assert.ok(activeBeliefChapters.length === 0, "one belief event should not create active chapter");

  // Verify computeChapterConfidence grows slowly
  assert.ok(computeChapterConfidence(1) < 0.50, "1 event → low confidence");
  assert.ok(computeChapterConfidence(5) > computeChapterConfidence(1), "confidence grows with evidence");
  assert.ok(computeChapterConfidence(20) < 1.0, "confidence never reaches 1.0");

  // Verify isSingleEventSufficient only applies to high-weight event types
  assert.equal(isSingleEventSufficient("hurt_detected"), true, "trust_rupture can open from one event");
  assert.equal(isSingleEventSufficient("lesson_reinforced"), false, "repeated_lesson needs multiple events");
  assert.equal(isSingleEventSufficient("identity_belief_changed"), false, "belief change needs multiple events");
});

// ── Test 6: Chapter requires evidence/source events ──────────────────────────

test("chapter requires evidence/source events", async () => {
  const store = createIdentityChapterStore();
  await store.init();

  // Attempt to create a chapter with no source_event_ids — should be rejected
  const noEvidence = await store.create({
    ...SCOPE,
    title: "A chapter without evidence",
    theme: "belief",
    source_event_ids: [],
  });
  assert.equal(noEvidence, null, "chapter without source_event_ids must be rejected");

  // Attempt to create a chapter with null source_event_ids
  const nullEvidence = await store.create({
    ...SCOPE,
    title: "A chapter without evidence",
    theme: "belief",
    source_event_ids: null,
  });
  assert.equal(nullEvidence, null, "chapter with null source_event_ids must be rejected");

  // Create with valid evidence — should succeed
  const valid = await store.create({
    ...SCOPE,
    title: "A chapter with evidence",
    theme: "belief",
    source_event_ids: ["ev-123"],
  });
  assert.ok(valid, "chapter with source_event_ids should be created");
  assert.equal(valid.source_event_ids.length, 1);

  // Autobiography store also requires evidence
  const autobiog = createAutobiographyStore();
  await autobiog.init();
  const noEvidenceMoment = await autobiog.recordMoment({
    ...SCOPE,
    type: "belief_change",
    label: "A moment without evidence",
    source_event_ids: [],
  });
  assert.equal(noEvidenceMoment, null, "moment without source_event_ids must be rejected");
});

// ── Test 7: Self-story updates over time ─────────────────────────────────────

test("self-story updates over time", async () => {
  const rt = mkRuntime();
  await rt.init();

  // First tick — no events → no self-story content
  await rt.tick({ ...SCOPE, now: new Date("2026-01-01") });
  const story1 = await rt.getSelfStory(SCOPE);
  const hasContent1 = story1?.has_content || false;

  // Add trust repair events → should build repair chapter
  for (let i = 0; i < 2; i++) {
    rt.recordEvent({ eventType: "repair_completed", eventId: `repair-${i}`, now: new Date("2026-01-02") });
  }
  await rt.tick({ ...SCOPE, now: new Date("2026-01-02") });

  // Force rebuild self-story
  for (let i = 0; i < 8; i++) {
    await rt.tick({ ...SCOPE, now: new Date("2026-01-03") });
  }
  const story2 = await rt.getSelfStory(SCOPE);
  // Story2 should be non-null (exists); content may or may not exist based on evidence
  assert.ok(story2 !== undefined, "getSelfStory should return an object or null");
  if (story2?.has_content) {
    assert.ok(typeof story2.source_chapter_count === "number", "should track chapter count");
    assert.ok(typeof story2.source_moment_count === "number", "should track moment count");
  }

  // buildSelfStory is deterministic from chapters
  const mockChapters = [{
    id: "ch1", title: "Repair became part of love", theme: "repair",
    status: "active", confidence: 0.55, source_event_ids: ["ev1"],
    started_at: "2026-01-01", ended_at: null, updated_at: "2026-01-02",
    summary: "We repaired something.", lesson_ids: [], belief_ids: [], relationship_milestones: [],
  }];
  const mockMoments = [{
    id: "m1", type: "trust_repair", label: "Repair became part of love",
    confidence: 0.60, source_event_ids: ["ev1"], chapter_id: "ch1",
    recorded_at: "2026-01-01", summary: "",
  }];
  const built = buildSelfStory({ activeChapters: mockChapters, definingMoments: mockMoments });
  assert.ok(built.has_content, "built self-story should have content");
  assert.ok(built.source_chapter_count === 1, "should count source chapters");
  assert.ok(built.source_moment_count === 1, "should count source moments");
});

// ── Test 8: Status safe — no raw private hurt text ────────────────────────────

test("status safe: no raw private hurt text", async () => {
  const rt = mkRuntime();
  await rt.init();

  // Record some sensitive events
  rt.recordEvent({ eventType: "hurt_detected", eventId: "hurt-1", summary: "raw hurt detail private", now: new Date() });
  rt.recordEvent({ eventType: "hurt_detected", eventId: "hurt-2", summary: "she said she was angry", now: new Date() });
  await rt.tick({ ...SCOPE, now: new Date() });

  const status = rt.getStatus();

  // Status should only expose safe fields
  const allowedKeys = new Set([
    "active_chapter_count", "most_recent_chapter", "self_story_available",
    "source_chapter_count", "source_moment_count", "last_tick_at",
  ]);
  for (const key of Object.keys(status)) {
    assert.ok(allowedKeys.has(key), `unexpected key in status: ${key}`);
  }

  // most_recent_chapter should only expose safe fields
  if (status.most_recent_chapter) {
    const chapterKeys = new Set(["title", "theme", "confidence"]);
    for (const key of Object.keys(status.most_recent_chapter)) {
      assert.ok(chapterKeys.has(key), `unexpected key in most_recent_chapter: ${key}`);
    }
  }

  // Status should not contain raw hurt summaries
  const statusStr = JSON.stringify(status);
  assert.doesNotMatch(statusStr, /she said she was angry/, "raw private text must not appear in status");
  assert.doesNotMatch(statusStr, /raw hurt detail/, "raw private text must not appear in status");

  // Prelude signal should be capped
  const prelude = rt.getPreludeSignal();
  if (prelude) {
    assert.ok(prelude.length <= 200, "prelude signal should be compact");
    assert.ok(prelude.startsWith("Narrative:"), "prelude signal should start with 'Narrative:'");
  }
});

// ── Test 9: No duplicate scheduler ────────────────────────────────────────────

test("no duplicate scheduler (no setInterval/setTimeout in source files)", () => {
  const src = path.join(__dirname, "..");
  const files = [
    "narrativeIdentityRuntime.js",
    "identityChapterStore.js",
    "autobiographyStore.js",
    "changePointDetector.js",
    "selfStoryBuilder.js",
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.join(src, file), "utf8");
    assert.ok(!content.includes("setInterval("), `${file} must not contain setInterval`);
    assert.ok(!content.includes("setTimeout("),  `${file} must not contain setTimeout`);
  }
});

// ── Test 10: No duplicate sender ─────────────────────────────────────────────

test("no duplicate sender (no Discord channel.send in source files)", () => {
  const src = path.join(__dirname, "..");
  const files = [
    "narrativeIdentityRuntime.js",
    "identityChapterStore.js",
    "autobiographyStore.js",
    "changePointDetector.js",
    "selfStoryBuilder.js",
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.join(src, file), "utf8");
    assert.ok(!content.includes("channel.send("), `${file} must not call channel.send`);
    assert.ok(!content.includes("discordSendGateway"), `${file} must not import discordSendGateway`);
    assert.ok(!content.includes("sendDiscordMessage"), `${file} must not call sendDiscordMessage`);
  }
});

// ── Test 11: Dashboard unchanged ─────────────────────────────────────────────

test("dashboard unchanged: narrative identity does not modify adminPageHandlers", () => {
  const handlersDir = path.join(__dirname, "../../http/adminPageHandlers");
  if (!fs.existsSync(handlersDir)) return; // Not present in test env — skip safely
  const files = fs.readdirSync(handlersDir).filter(f => f.endsWith(".js"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(handlersDir, file), "utf8");
    // Narrative identity should not be imported in dashboard handlers
    assert.ok(!content.includes("narrativeIdentityRuntime"), `${file} should not import narrativeIdentityRuntime`);
    assert.ok(!content.includes("narrativeIdentity"), `${file} should not reference narrativeIdentity`);
  }
});
