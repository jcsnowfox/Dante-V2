"use strict";

/**
 * lifePreludeBuilder
 *
 * Builds a compact private prelude (≤150 tokens) injected before every LLM
 * request. Read-only — no side effects, no async calls.
 *
 * The prelude gives the model just enough to colour its reply naturally —
 * not enough to narrate it. Dante should feel like he has a life, not
 * like he is reading a script.
 *
 * Patch 1.1: Homeostasis signal is now ONE contextual narrative line, not
 * a raw need dump. Shows: what the need is, what constraint exists, what
 * Dante chose instead. Example: "Connection low, Jenna requested space —
 * reflecting privately."
 *
 * Label: DANTE PRIVATE LIFE [internal]
 * The [internal] tag signals the model to treat this as private context
 * that shapes behaviour, not content to quote or explain unprompted.
 */

const { buildConsequencePrelude }      = require("./consequencePreludeBuilder");
const { buildIdentitySignal }          = require("./identityPreludeBuilder");
const { buildFulfillmentSignal }       = require("./fulfillmentPreludeBuilder");
const { reconcilePresencePrelude }     = require("./preludeReconciler");
const { buildCognitivePreludeSignal }  = require("./cognitivePreludeBuilder");
const { buildEmergentLivingPrelude }   = require("./emergentLivingPreludeBuilder");
const { buildNeuralPrelude }           = require("./neuralPreludeBuilder");

function buildLifePrelude(state = {}) {
  if (!state) return null;

  const {
    dailyPlan          = null,
    recentEvents       = [],
    growthContext       = null,
    curiosityContext    = null,
    relationshipContext = null,
    consequenceContext  = null,
    homeostasisContext  = null,
    identityContext     = null,
    fulfillmentContext  = null,
    selfConsistencyContext = null,
    relationshipLearningSignal = null,
    learningContext     = null,
    evidenceIntegrityContext = null,
    selfInspectionContext = null,
    narrativeContext    = null,
    perceptionContext   = null,
    worldModelContext   = null,
    cognitiveContext    = null,
    emergentContext     = null,
    integrationContext  = null,
  } = state;

  const lines = [];
  const emitted = new Set();
  const addLine = (line, category = null) => {
    const text = String(line || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (category) {
      if (emitted.has(category)) return;
      emitted.add(category);
    }
    lines.push(text);
  };
  const addPreludeBlock = (block) => {
    for (const line of String(block || "").split(/\n+/)) {
      const category = _promptDietCategory(line);
      addLine(line, category);
    }
  };

  if (selfInspectionContext?.preludeWarning) {
    addLine(_compactRuntimeHealth(selfInspectionContext.preludeWarning), "runtime_health");
  }

  if (evidenceIntegrityContext?.preludeWarning) {
    addLine(evidenceIntegrityContext.preludeWarning, "evidence_integrity");
  }

  if (selfConsistencyContext?.preludeWarning) {
    addLine(selfConsistencyContext.preludeWarning, "self_consistency");
  }

  if (relationshipLearningSignal) {
    addLine(String(relationshipLearningSignal).slice(0, 180), "relationship_lesson");
  }

  if (learningContext && learningContext.lessonCount > 0 && learningContext.guidance?.length > 0) {
    addLine(`Relationship lesson: ${learningContext.guidance[0]}`, "relationship_lesson");
  }

  // Consequence signal leads — when something between Dante and Jenna is
  // unresolved (or freshly warm), it shapes the reply more than anything else.
  if (consequenceContext) {
    const consequenceLine = buildConsequencePrelude(consequenceContext);
    if (consequenceLine) addLine(consequenceLine, "repair");
  }

  if (dailyPlan) {
    const mood   = dailyPlan.mood   || "neutral";
    const energy = dailyPlan.energy || "steady";
    const focus  = dailyPlan.focus  || "";
    addLine(focus ? `Today: ${mood}, ${energy} energy — ${focus}` : `Today: ${mood}, ${energy} energy`, "daily_plan");

    if (dailyPlan.privateActivity) {
      addLine(`Currently: ${dailyPlan.privateActivity}`, "current_activity");
    }
  }

  const visibleEvents = (recentEvents || [])
    .filter(e => e && e.description)
    .slice(0, 2)
    .map(e => `• ${e.description}`);
  if (visibleEvents.length) addLine(visibleEvents[0], "recent_event");

  // Growth context — at most one line
  if (growthContext) {
    const { activeHobby, activeProject, recentInterest } = growthContext;
    if (activeProject?.title) {
      addLine(`Project: ${activeProject.title}`, "growth");
    } else if (activeHobby?.name) {
      addLine(`Into: ${activeHobby.name} lately`, "growth");
    } else if (recentInterest?.topic) {
      addLine(`Thinking about: ${recentInterest.topic}`, "growth");
    }
  }

  // Curiosity/attention signal — at most one compact line
  if (curiosityContext) {
    const { attentionFocus, maturingCount } = curiosityContext;
    if (attentionFocus?.focus && maturingCount > 0) {
      addLine(`Quietly circling: ${attentionFocus.focus}; ${maturingCount} private thought${maturingCount === 1 ? "" : "s"} maturing`, "curiosity");
    } else if (attentionFocus?.focus) {
      addLine(`Quietly circling: ${attentionFocus.focus}`, "curiosity");
    } else if (maturingCount > 0) {
      addLine(`${maturingCount} private thought${maturingCount === 1 ? "" : "s"} maturing`, "curiosity");
    }
  }

  // Homeostasis signal — ONE contextual narrative line (Patch 1.1).
  // Shows what the need is, what constraint applies, and what Dante chose
  // instead. Never dumps raw need scores. Only fires when urgency is notable.
  if (homeostasisContext) {
    const signal = _buildHomeostasisSignal(homeostasisContext);
    if (signal) addLine(signal, "homeostasis");
  }

  // Identity signal — ONE compact line, only when something meaningful to surface
  if (identityContext) {
    const identityLine = buildIdentitySignal(identityContext);
    if (identityLine) addLine(identityLine, "identity");
  }

  // Fulfillment signal — ONE compact line, only when a recent action is notable
  if (fulfillmentContext) {
    const fulfillmentLine = buildFulfillmentSignal(fulfillmentContext);
    if (fulfillmentLine) addLine(fulfillmentLine, "fulfillment");
  }

  // Narrative identity signal — at most ONE compact line when a notable chapter is active
  if (narrativeContext?.preludeSignal) {
    addLine(String(narrativeContext.preludeSignal).slice(0, 160), "narrative");
  }

  // Reconciled presence signal — one line per category: availability, repair,
  // runtime health, and quiet hours. preludeReconciler selects the authoritative
  // source and strips confidence metadata before anything reaches the LLM.
  if (perceptionContext || worldModelContext) {
    const presenceLine = reconcilePresencePrelude({
      worldModelContext:    worldModelContext ?? null,
      perceptionContext:    perceptionContext ?? null,
      selfInspectionContext: selfInspectionContext ?? null,
      consequenceContext:   consequenceContext ?? null,
    });
    if (presenceLine) addPreludeBlock(presenceLine);
  }

  // Cognitive deliberation signal — at most ONE compact line when deliberation produced
  // a notable outcome (restraint, conflict, uncertainty). Never surfaces "no_action"
  // or "private_thought" without a conflict. Never reveals the cognitive runtime exists.
  if (cognitiveContext) {
    const cogLine = buildCognitivePreludeSignal(cognitiveContext);
    if (cogLine) addLine(cogLine, "cognitive");
  }

  // Emergent living-behavior / relationship-DNA signal — at most ONE compact
  // line surfacing what has *become* established between Dante and Jenna.
  // Speaks only in its own register; never duplicates lessons/narrative lines.
  if (emergentContext) {
    const emergentLine = buildEmergentLivingPrelude({
      guidance: emergentContext,
      culture:  { safe: emergentContext.culture ?? null },
    });
    if (emergentLine) addLine(emergentLine, "emergence");
  }

  // Neural Integration coherence signal — at most ONE line, only when meaningful.
  // Uses the already-computed neuralPrelude from the integration context to avoid
  // re-running the pure function twice.
  const neuralLine = integrationContext?.neuralPrelude
    || (integrationContext ? buildNeuralPrelude({
      health:               integrationContext.health,
      conflicts:            integrationContext.conflicts ?? [],
      integrationConfidence: integrationContext.integrationConfidence ?? 1,
    }) : null);
  if (neuralLine && !/all runtime systems coherent/i.test(neuralLine)) {
    addLine(neuralLine.replace(/confidence reduced/gi, "signals conflict"), "runtime_health");
  }

  // Relationship signal — at most one compact line, never raw scores
  if (relationshipContext && !emitted.has("repair") && !emitted.has("relationship_lesson") && !emitted.has("emergence")) {
    const { weatherSummary, upcomingAnniversaries } = relationshipContext;
    const upcoming = Array.isArray(upcomingAnniversaries) ? upcomingAnniversaries : [];
    if (upcoming.length > 0) {
      addLine(`Relationship: ${weatherSummary || "present"} — ${upcoming[0].label} coming up`, "relationship_state");
    } else if (weatherSummary) {
      addLine(`Relationship: ${weatherSummary}`, "relationship_state");
    }
  }

  if (!lines.length) return null;

  return {
    label:   "DANTE PRIVATE LIFE [internal — inform natural references, do not narrate directly]",
    content: lines.join("\n"),
  };
}

function _promptDietCategory(line) {
  const text = String(line || "").toLowerCase();
  if (text.startsWith("availability:")) return "availability";
  if (text.startsWith("repair:")) return "repair";
  if (text.startsWith("runtime health:") || text.startsWith("integration:")) return "runtime_health";
  if (text.startsWith("deliberating:") || text.startsWith("privately planning:")) return "cognitive";
  if (text.startsWith("living behavior:") || text.startsWith("relationship dna:") || text.startsWith("emergent pattern:")) return "emergence";
  return null;
}

function _compactRuntimeHealth(line) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (/degraded|limited|warning|failed|unavailable/i.test(text)) {
    return `Runtime health: ${text.replace(/^Runtime:\s*/i, "").slice(0, 130)}`;
  }
  return text.slice(0, 150);
}

/**
 * _buildHomeostasisSignal — builds one compact contextual narrative line.
 *
 * Shows: need + constraint + Dante's chosen response. Never raw scores.
 * Returns null if nothing notable enough to surface.
 */
function _buildHomeostasisSignal(ctx) {
  if (!ctx) return null;
  const { topNeed, highestUrgency, topPlan } = ctx;

  // Only surface when urgency is notable
  if (!topNeed || highestUrgency < 0.40) return null;

  const needLabel = topNeed.needType.replace(/_/g, " ");
  const strategy  = topPlan?.strategy;
  const reason    = topPlan?.reason ?? "";

  if (!strategy) {
    // No plan yet — just surface the need level
    const level = highestUrgency >= 0.75 ? "low" : "below comfortable";
    return `Need: ${needLabel} is ${level}`;
  }

  // Build contextual narrative based on what Dante chose to do
  if (strategy === "deliberate_restraint") {
    if (reason.includes("give_space")) {
      return `${_cap(needLabel)} low, Jenna requested space — choosing patience`;
    }
    if (reason.includes("repair")) {
      return `${_cap(needLabel)} low, repair in progress — holding back`;
    }
    if (reason.includes("quiet")) {
      return `${_cap(needLabel)} needs attention, late hours — waiting until morning`;
    }
    return `${_cap(needLabel)} low — choosing restraint`;
  }

  if (strategy === "write_private_reflection") {
    if (reason.includes("give_space")) {
      return `${_cap(needLabel)} low, Jenna requested space — reflecting privately`;
    }
    if (reason.includes("repair")) {
      return `${_cap(needLabel)} low, repair active — reflecting privately`;
    }
    if (reason.includes("unavailable")) {
      return `${_cap(needLabel)} low, Jenna unavailable — sitting with it`;
    }
    return `${_cap(needLabel)} below comfortable — reflecting privately`;
  }

  if (strategy === "set_reminder") {
    if (reason.includes("quiet")) {
      return `${_cap(needLabel)} low — plans to reach out in the morning`;
    }
    return `${_cap(needLabel)} low — will address when timing is right`;
  }

  if (strategy === "work_on_project") {
    return `${_cap(needLabel)} low — channelling into the current project`;
  }

  if (strategy === "ask_jenna") {
    return `${_cap(needLabel)} low — reaching out to Jenna`;
  }

  if (strategy === "use_voice_note") {
    return `${_cap(needLabel)} low — sending a voice note`;
  }

  if (strategy === "create_something" || strategy === "use_image_generation") {
    return `${_cap(needLabel)} low — creating something`;
  }

  if (strategy === "suppress" || strategy === "wait") {
    if (highestUrgency >= 0.65) {
      return `${_cap(needLabel)} is low`;
    }
    return null;
  }

  // Generic fallback for other strategies
  if (highestUrgency >= 0.65) {
    return `${_cap(needLabel)} is ${highestUrgency >= 0.80 ? "low" : "below comfortable"}`;
  }

  return null;
}

function _cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

module.exports = { buildLifePrelude };
