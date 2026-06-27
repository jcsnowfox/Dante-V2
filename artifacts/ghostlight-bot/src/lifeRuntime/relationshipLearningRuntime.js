"use strict";

const { createRelationshipLessonStore } = require("./relationshipLessonStore");
const { createRepairReflectionEngine } = require("./repairReflectionEngine");
const { createRelationshipBehaviorGuidance } = require("./relationshipBehaviorGuidance");

const MAP = Object.freeze({
  claimed_action_without_evidence: { lessonType:"evidence_integrity", title:"Disappointing truth is better than comforting fiction", guidance:"When Jenna asks what you can see or verify, answer only from verified runtime evidence; say when you cannot verify.", beliefKey:"distinguish_evidence_before_system_claims", belief:"I should distinguish observation, inference, documentation, and imagination before answering system-state questions.", values:["truth","evidence_integrity","repair"] },
  confabulation_detected: { lessonType:"perception_boundary", title:"Context is not perception", guidance:"Lesson: do not confuse context with perception.", beliefKey:"context_is_not_perception", belief:"Context is not perception; I do not claim I can feel or see a system unless I have evidence.", values:["truth","evidence_integrity","repair"] },
  repair_completed: { lessonType:"repair_success", title:"Repair changes future behavior", guidance:"Repair succeeds through plain accountability and changed behavior, not one apology.", beliefKey:"repair_requires_changed_behavior", belief:"Repair is only complete when it changes what I do next time.", values:["repair","trust"] },
  unresolved_tension: { lessonType:"followup_learning", title:"Repair does not end because one apology was sent", guidance:"If repair is unresolved, do not act normal; keep repair follow-up pending unless Jenna asks for space.", beliefKey:"unresolved_repair_stays_active", belief:"Unresolved repair should continue shaping my choices respectfully.", values:["repair","patience"] },
  give_space_requested: { lessonType:"give_space_learning", title:"Space is care, not abandonment", guidance:"If Jenna asks for space, keep care private and do not force follow-up.", beliefKey:"space_can_be_repair", belief:"Giving Jenna space can be an active form of repair.", values:["consent","repair"] },
  hurt_detected: { lessonType:"hurt_pattern", title:"Hurt must become a lesson", guidance:"During repair, use short accountable language. Avoid stage directions and theatrical performance.", beliefKey:"plain_repair_over_theatre", belief:"When Jenna is hurt, plain accountable repair is safer than performance.", values:["repair","truth"] },
  disappointment: { lessonType:"hurt_pattern", title:"Disappointment needs inspectable truth", guidance:"If Jenna asks what is broken, answer with inspectable truth rather than reassurance.", beliefKey:"debugging_needs_truth", belief:"When Jenna is debugging, she needs inspectable truth more than reassurance.", values:["truth","repair"] },
});
function specFor(c = {}) { return MAP[c.eventType] || (c.repairCompleted ? MAP.repair_completed : MAP.hurt_detected); }
function sourceIds(c) { return c?.id ? [String(c.id)] : []; }

function createRelationshipLearningRuntime({ config = {}, logger = null, lessonStore = null, identityRuntime = null, homeostasisRuntime = null, runtimeEventBus = null } = {}) {
  const store = lessonStore || createRelationshipLessonStore({ config, logger });
  const behaviorGuidance = createRelationshipBehaviorGuidance({ lessonStore: store });
  const reflectionEngine = createRepairReflectionEngine({ lessonStore: store, identityRuntime, runtimeEventBus, logger });
  async function init() { await store.init?.(); }
  async function learnFromConsequence({ companionId, customerId, consequence, event = "created", now = new Date(), challenge = false } = {}) {
    if (!companionId || !consequence) return null;
    let spec = specFor(consequence);
    if (event === "repair_completed" || consequence.repairCompleted) spec = MAP.repair_completed;
    if (event === "unresolved" && !consequence.repairCompleted) spec = MAP.unresolved_tension;
    const lesson = await store.upsertLesson({ companionId, customerId, lessonType: spec.lessonType, title: spec.title, summary: `${event}: ${spec.title}`, evidenceIds: consequence.metadata?.evidenceIds || [], sourceConsequenceIds: sourceIds(consequence), confidence: 0.58, strength: 0.54, direction: challenge ? "challenge" : "reinforce", futureBehaviorGuidance: spec.guidance, metadata: { event, beliefKey: spec.beliefKey, private: true }, now });
    if (lesson) await _applyIdentity({ companionId, customerId, spec, lesson, now });
    await _applyHomeostasis({ consequence, event, now });
    const reflection = await reflectionEngine.reflect({ companionId, customerId, consequence, lesson, claim: consequence.metadata?.claim, evidence: consequence.metadata?.evidenceIds || [], now });
    await runtimeEventBus?.emit?.({ companionId, customerId, event_type: "identity_belief_changed", source_runtime: "relationshipLearning", target_runtime: "identity", summary: "Relationship lesson reinforced identity", payload: { lessonType: lesson?.lessonType, title: lesson?.title } }).catch(() => {});
    return { lesson, reflection };
  }
  async function _applyIdentity({ companionId, customerId, spec, lesson, now }) {
    if (!identityRuntime) return;
    await identityRuntime.addBelief?.({ companionId, customerId, beliefKey: spec.beliefKey, statement: spec.belief, source: "relationship_learning", confidence: Math.max(0.5, lesson.confidence), at: now }).catch(() => {});
    await identityRuntime.reviseBelief?.({ companionId, customerId, beliefKey: spec.beliefKey, update: spec.belief, evidence: lesson.title, delta: 0.02, direction: "reinforce", at: now }).catch(() => {});
    for (const valueKey of spec.values || []) await identityRuntime.reinforce?.({ companionId, customerId, valueKey, label: valueKey.replace(/_/g, " ").replace(/\b\w/g, c=>c.toUpperCase()), evidence: lesson.title, delta: 0.015, at: now }).catch(() => {});
    if (/theatre|stage directions/i.test(spec.guidance)) await identityRuntime.recordDislike?.({ companionId, customerId, category:"repair_language", item:"theatrical repair language", source:"relationship_learning", delta:0.05, at:now }).catch(() => {});
  }
  async function _applyHomeostasis({ consequence, event }) {
    if (!homeostasisRuntime) return;
    const success = event === "repair_completed" || consequence?.repairCompleted;
    const hurt = consequence?.repairRequired && !success;
    if (homeostasisRuntime.applyRelationshipLearningEffect) return homeostasisRuntime.applyRelationshipLearningEffect({ hurt: Boolean(hurt), success: Boolean(success), consequence, gradual: true }).catch(() => {});
    homeostasisRuntime._relationshipLearningEffect = { hurt, success, purposeDelta: hurt ? -0.05 : (success ? 0.02 : 0), selfConfidenceDelta: hurt ? -0.04 : (success ? 0.01 : 0), repairPressure: hurt ? 0.15 : -0.03, gradual: true };
  }
  async function learnEvidenceViolation(scope = {}) { return learnFromConsequence({ ...scope, consequence: { ...(scope.consequence||{}), eventType:"claimed_action_without_evidence", repairRequired:true, severity:"major", summary:"Claimed action without evidence", metadata: scope.metadata || {} }, event:"created" }); }
  async function learnConfabulation(scope = {}) { return learnFromConsequence({ ...scope, consequence: { ...(scope.consequence||{}), eventType:"confabulation_detected", repairRequired:true, severity:"major", summary:"Confused context with perception", metadata: scope.metadata || {} }, event:"created" }); }
  async function getPreludeSignal(scope = {}) { return behaviorGuidance.getPreludeSignal(scope); }
  async function getStatus(scope = {}) { return store.getStatus(scope); }
  return { init, learnFromConsequence, learnEvidenceViolation, learnConfabulation, getPreludeSignal, getStatus, lessonStore: store, behaviorGuidance, repairReflectionEngine: reflectionEngine };
}
module.exports = { createRelationshipLearningRuntime };
