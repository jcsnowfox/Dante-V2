"use strict";

function summarizeConsequence(c = {}) {
  return `${c.eventType || "repair_event"}: ${c.summary || c.severity || "relationship repair signal"}`.slice(0, 240);
}
function createRepairReflectionEngine({ lessonStore = null, identityRuntime = null, runtimeEventBus = null, logger = null } = {}) {
  async function reflect({ companionId, customerId, consequence = null, lesson = null, claim = null, evidence = [], jennaNeed = "truth and accountable repair", now = new Date() } = {}) {
    const isEvidence = lesson?.lessonType === "evidence_integrity" || consequence?.eventType === "claimed_action_without_evidence";
    const isPerception = lesson?.lessonType === "perception_boundary" || consequence?.eventType === "confabulation_detected";
    const reflection = {
      private: true,
      what_happened: summarizeConsequence(consequence),
      what_dante_claimed: claim || consequence?.metadata?.claim || "A reply or action affected Jenna.",
      evidence_dante_had: Array.isArray(evidence) && evidence.length ? evidence : (lesson?.evidenceIds || []),
      what_jenna_needed: jennaNeed,
      what_dante_got_wrong: isPerception ? "He treated context/documentation as perception." : (isEvidence ? "He implied certainty without inspectable evidence." : "He let repair end before changed behavior was secured."),
      what_should_change_next_time: lesson?.futureBehaviorGuidance || "Use plain accountability and let the lesson guide the next decision.",
      identity_update: isPerception || isEvidence ? "reinforce evidence integrity and truth" : "reinforce repair and trust",
      created_at: now instanceof Date ? now.toISOString() : String(now),
    };
    await lessonStore?.upsertLesson?.({ companionId, customerId, lessonType: lesson?.lessonType || "trust_repair", title: `Private reflection: ${lesson?.title || consequence?.eventType || "repair"}`, summary: reflection.what_should_change_next_time, evidenceIds: lesson?.evidenceIds || [], sourceConsequenceIds: consequence?.id ? [consequence.id] : [], confidence: 0.55, strength: 0.5, futureBehaviorGuidance: reflection.what_should_change_next_time, metadata: { privateReflection: reflection, reflectionOnly: true }, now }).catch(() => {});
    await identityRuntime?.recordJournal?.({ companionId, customerId, entryType: "belief_change", content: `Private repair reflection: ${reflection.what_should_change_next_time}`, relatedKey: lesson?.metadata?.beliefKey || "relationship_learning", at: now }).catch(() => {});
    await runtimeEventBus?.emit?.({ companionId, customerId, event_type: "journal_entry_created", source_runtime: "relationshipLearning", target_runtime: "identity", summary: "Private repair reflection recorded", payload: { lessonType: lesson?.lessonType || null } }).catch(err => logger?.warn?.("[repairReflection] event failed", { error: err.message }));
    return reflection;
  }
  return { reflect };
}
module.exports = { createRepairReflectionEngine };
