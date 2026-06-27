#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
function exists(p){ return fs.existsSync(path.join(root,p)); }
function read(p){ return fs.readFileSync(path.join(root,p),"utf8"); }
(async () => {
  assert.ok(exists("src/lifeRuntime/relationshipLearningRuntime.js"));
  assert.ok(exists("src/lifeRuntime/relationshipLessonStore.js"));
  assert.ok(exists("src/lifeRuntime/repairReflectionEngine.js"));
  assert.ok(exists("src/lifeRuntime/relationshipBehaviorGuidance.js"));
  const { createRelationshipLearningRuntime } = require("../src/lifeRuntime/relationshipLearningRuntime");
  const calls = { beliefs:[], values:[], journals:[], homeo:[] };
  const identityRuntime = { addBelief: async x=>calls.beliefs.push(x), reviseBelief: async x=>calls.beliefs.push(x), reinforce: async x=>calls.values.push(x), recordJournal: async x=>calls.journals.push(x), recordDislike: async()=>{} };
  const homeostasisRuntime = { applyRelationshipLearningEffect: async x=>calls.homeo.push(x) };
  const rt = createRelationshipLearningRuntime({ identityRuntime, homeostasisRuntime }); await rt.init();
  const companionId="dante", customerId="jenna";
  await rt.learnConfabulation({ companionId, customerId, metadata:{ claim:"I felt the system", rawHurtText:"you hurt me deeply" } });
  await rt.learnEvidenceViolation({ companionId, customerId });
  const success = await rt.learnFromConsequence({ companionId, customerId, event:"repair_completed", consequence:{ id:"r1", eventType:"repair_completed", repairCompleted:true } });
  const lessons = await rt.lessonStore.listLessons({ companionId, customerId });
  assert.ok(lessons.length >= 3, "relationshipLessonStore persists lessons");
  assert.ok(lessons.some(l => l.lessonType === "perception_boundary" && /Context is not perception/i.test(l.title)), "context-not-perception lesson");
  assert.ok(lessons.some(l => l.lessonType === "evidence_integrity"), "evidence integrity lesson");
  assert.ok(success.reflection.private && success.reflection.what_should_change_next_time, "private reflection");
  assert.ok(calls.beliefs.some(b => /context_is_not_perception|distinguish_evidence/.test(b.beliefKey || "")), "identity belief update");
  assert.ok(calls.values.some(v => ["truth","repair","evidence_integrity"].includes(v.valueKey)), "identity value update");
  assert.ok(calls.journals.length, "identity journal entry");
  const guidance = await rt.behaviorGuidance.getGuidance({ companionId, customerId });
  assert.ok(guidance.some(g => /context with perception|verified runtime evidence|repair/i.test(g)), "behavior guidance");
  const decision = await rt.behaviorGuidance.adviseRepairDecision({ companionId, customerId });
  assert.ok(decision.requireEvidence || decision.repairAware, "future repair decision guidance");
  const signal = await rt.getPreludeSignal({ companionId, customerId });
  assert.ok(signal && !/you hurt me deeply/.test(signal), "safe prelude");
  const status = await rt.getStatus({ companionId, customerId });
  assert.ok(status.relationship_lessons_count >= 3 && status.behavior_guidance_active, "safe status");
  assert.ok(!JSON.stringify(status).includes("you hurt me deeply"), "raw hurt text not exposed");
  for (const f of ["src/lifeRuntime/relationshipLearningRuntime.js","src/lifeRuntime/relationshipLessonStore.js","src/lifeRuntime/repairReflectionEngine.js","src/lifeRuntime/relationshipBehaviorGuidance.js"]) {
    const src = read(f); assert.ok(!/setInterval|setTimeout|cron|schedulerRegistry/i.test(src), "no duplicate scheduler"); assert.ok(!/sendDiscordMessage|discordSendGateway|client\.channels/i.test(src), "no duplicate sender");
  }
  assert.ok(!read("src/http/createHealthServer.js").includes("relationshipLearningRuntime"), "dashboard untouched");
  console.log("RELATIONSHIP_LEARNING_PASS");
})();
