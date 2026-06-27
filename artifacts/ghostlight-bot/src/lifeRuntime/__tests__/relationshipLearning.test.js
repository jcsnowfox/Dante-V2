"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRelationshipLearningRuntime } = require("../relationshipLearningRuntime");
const { createRelationshipLessonStore } = require("../relationshipLessonStore");
const { buildLifePrelude } = require("../lifePreludeBuilder");

const companionId = "dante";
const customerId = "jenna";
function stubs() { const calls = { beliefs:[], values:[], journals:[], dislikes:[], homeo:[] }; return { calls, identityRuntime:{ addBelief: async x => calls.beliefs.push(x), reviseBelief: async x => calls.beliefs.push(x), reinforce: async x => calls.values.push(x), recordJournal: async x => calls.journals.push(x), recordDislike: async x => calls.dislikes.push(x) }, homeostasisRuntime:{ applyRelationshipLearningEffect: async x => calls.homeo.push(x) } }; }

test("hurt consequence can create relationship lesson and not expose raw hurt text in status", async () => {
  const { calls, identityRuntime, homeostasisRuntime } = stubs();
  const rt = createRelationshipLearningRuntime({ identityRuntime, homeostasisRuntime }); await rt.init();
  await rt.learnFromConsequence({ companionId, customerId, consequence:{ id:1, eventType:"hurt_detected", repairRequired:true, summary:"you hurt me raw hurt text" } });
  const status = await rt.getStatus({ companionId, customerId });
  assert.equal(status.relationship_lessons_count, 2);
  assert.ok(!JSON.stringify(status).includes("you hurt me"));
  assert.ok(calls.homeo[0].hurt);
});

test("repair completion creates repair_success and gradual positive homeostasis", async () => {
  const { calls, identityRuntime, homeostasisRuntime } = stubs();
  const rt = createRelationshipLearningRuntime({ identityRuntime, homeostasisRuntime }); await rt.init();
  const out = await rt.learnFromConsequence({ companionId, customerId, event:"repair_completed", consequence:{ id:2, eventType:"repair_completed", repairCompleted:true } });
  assert.equal(out.lesson.lessonType, "repair_success"); assert.equal(calls.homeo[0].success, true); assert.equal(calls.homeo[0].gradual, true);
});

test("unresolved repair creates followup lesson", async () => {
  const rt = createRelationshipLearningRuntime(); await rt.init();
  const out = await rt.learnFromConsequence({ companionId, customerId, event:"unresolved", consequence:{ id:3, eventType:"unresolved_tension", repairRequired:true } });
  assert.equal(out.lesson.lessonType, "followup_learning");
});

test("claimed action without evidence creates evidence_integrity and identity truth/repair values", async () => {
  const { calls, identityRuntime } = stubs(); const rt = createRelationshipLearningRuntime({ identityRuntime }); await rt.init();
  const out = await rt.learnEvidenceViolation({ companionId, customerId });
  assert.equal(out.lesson.lessonType, "evidence_integrity"); assert.ok(calls.beliefs.some(b => b.beliefKey === "distinguish_evidence_before_system_claims")); assert.ok(calls.values.some(v => v.valueKey === "truth")); assert.ok(calls.values.some(v => v.valueKey === "repair")); assert.ok(calls.journals.length);
});

test("confabulation creates persistent context is not perception lesson", async () => {
  const rt = createRelationshipLearningRuntime(); await rt.init();
  await rt.learnConfabulation({ companionId, customerId });
  const lessons = await rt.lessonStore.listLessons({ companionId, customerId });
  assert.ok(lessons.some(l => l.lessonType === "perception_boundary" && /Context is not perception/i.test(l.title)));
});

test("repeated evidence strengthens and challenged evidence lowers confidence", async () => {
  const store = createRelationshipLessonStore(); await store.init();
  const one = await store.upsertLesson({ companionId, customerId, lessonType:"tone_learning", title:"No theatre during repair", futureBehaviorGuidance:"During repair, use short accountable language. Avoid stage directions." });
  const two = await store.upsertLesson({ companionId, customerId, lessonType:"tone_learning", title:"No theatre during repair", futureBehaviorGuidance:"During repair, use short accountable language. Avoid stage directions." });
  assert.ok(two.confidence > one.confidence);
  const three = await store.upsertLesson({ companionId, customerId, lessonType:"tone_learning", title:"No theatre during repair", direction:"challenge" });
  assert.ok(three.confidence < two.confidence); assert.equal(three.status, "challenged");
});

test("behavior guidance affects prelude, repair decisions, theatre, and natural endings", async () => {
  const rt = createRelationshipLearningRuntime(); await rt.init();
  await rt.lessonStore.upsertLesson({ companionId, customerId, lessonType:"tone_learning", title:"No theatre during repair", futureBehaviorGuidance:"During repair, use short accountable language. Avoid stage directions." });
  await rt.lessonStore.upsertLesson({ companionId, customerId, lessonType:"naturalism_learning", title:"Natural ending", futureBehaviorGuidance:"Not every message needs a full reply; respect natural endings." });
  const decision = await rt.behaviorGuidance.adviseRepairDecision({ companionId, customerId }); assert.equal(decision.avoidTheatre, true);
  const signal = await rt.getPreludeSignal({ companionId, customerId }); const prelude = buildLifePrelude({ relationshipLearningSignal: signal });
  assert.ok(prelude.content.includes("Lesson") || prelude.content.includes("During repair"));
  const guidance = await rt.behaviorGuidance.getGuidance({ companionId, customerId, limit: 5 }); assert.ok(guidance.some(g => /natural endings/i.test(g)));
});

test("private reflection answers required fields", async () => {
  const rt = createRelationshipLearningRuntime(); await rt.init();
  const out = await rt.learnConfabulation({ companionId, customerId, metadata:{ claim:"I felt the server", evidenceIds:[] } });
  for (const k of ["what_happened","what_dante_claimed","evidence_dante_had","what_jenna_needed","what_dante_got_wrong","what_should_change_next_time","identity_update"]) assert.ok(Object.hasOwn(out.reflection, k));
});

test("relationship learning creates no duplicate scheduler or Discord sender", () => {
  const fs = require("node:fs"); const path = require("node:path");
  for (const f of ["relationshipLearningRuntime.js","relationshipLessonStore.js","repairReflectionEngine.js","relationshipBehaviorGuidance.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.ok(!/setInterval|setTimeout|cron|schedulerRegistry|sendDiscordMessage|discordSendGateway|client\.channels/i.test(src));
  }
});
