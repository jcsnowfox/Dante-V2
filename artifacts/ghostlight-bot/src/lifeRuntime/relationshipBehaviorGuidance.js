"use strict";

const RAW_HURT_RE = /(you hurt me|that hurt|let me down|disappointed me|raw hurt text)/i;

function sanitize(line = "") {
  return String(line || "").replace(RAW_HURT_RE, "private hurt signal").slice(0, 220);
}

const TYPE_GUIDANCE = Object.freeze({
  evidence_integrity: "When Jenna asks what you can see or verify, answer only from verified runtime evidence; say when you cannot verify.",
  perception_boundary: "Lesson: do not confuse context with perception.",
  repair_failure: "If repair is unresolved, do not act normal; keep repair follow-up pending unless Jenna asks for space.",
  followup_learning: "If Jenna leaves upset, continue caring respectfully without forcing a full reply.",
  repair_success: "Repair succeeds through plain accountability and changed behavior, not one apology.",
  tone_learning: "During repair, use short accountable language. Avoid stage directions and theatrical performance.",
  naturalism_learning: "Not every message needs a full reply; respect natural endings.",
  communication_preference: "If Jenna asks what is broken, answer with inspectable truth rather than reassurance.",
});

function createRelationshipBehaviorGuidance({ lessonStore = null } = {}) {
  async function getGuidance({ companionId, customerId, limit = 4, context = "general" } = {}) {
    const lessons = await lessonStore?.listLessons?.({ companionId, customerId, limit: 50 }).catch(() => []) || [];
    const active = lessons.filter(l => ["active","maturing","stable","challenged"].includes(l.status) && l.status !== "retired")
      .sort((a,b) => (Number(b.strength) + Number(b.confidence)) - (Number(a.strength) + Number(a.confidence)));
    const lines = [];
    for (const l of active) {
      const line = l.futureBehaviorGuidance || TYPE_GUIDANCE[l.lessonType];
      if (line && !lines.includes(line)) lines.push(sanitize(line));
      if (lines.length >= limit) break;
    }
    if (context === "repair" && !lines.some(l => /repair/i.test(l))) lines.unshift(TYPE_GUIDANCE.tone_learning);
    return lines.slice(0, limit);
  }
  async function getPreludeSignal(scope = {}) {
    const [first] = await getGuidance({ ...scope, limit: 1 }).catch(() => []);
    return first ? sanitize(first).replace(/^When Jenna asks what you can see or verify, /, "Lesson: ") : null;
  }
  async function adviseRepairDecision(scope = {}) {
    const guidance = await getGuidance({ ...scope, context: "repair", limit: 5 });
    return { repairAware: guidance.some(g => /repair|unresolved|accountable/i.test(g)), avoidTheatre: guidance.some(g => /stage directions|theatrical/i.test(g)), requireEvidence: guidance.some(g => /verified|cannot verify|context with perception/i.test(g)), guidance };
  }
  return { getGuidance, getPreludeSignal, adviseRepairDecision, sanitize };
}

module.exports = { createRelationshipBehaviorGuidance, TYPE_GUIDANCE };
