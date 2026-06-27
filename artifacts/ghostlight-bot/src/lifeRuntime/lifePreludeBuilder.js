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

const { buildConsequencePrelude }   = require("./consequencePreludeBuilder");
const { buildIdentitySignal }       = require("./identityPreludeBuilder");
const { buildFulfillmentSignal }    = require("./fulfillmentPreludeBuilder");

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
  } = state;

  const lines = [];

  if (selfConsistencyContext?.preludeWarning) {
    lines.push(selfConsistencyContext.preludeWarning);
  }

  if (relationshipLearningSignal) {
    lines.push(String(relationshipLearningSignal).slice(0, 180));
  }

  if (learningContext && learningContext.lessonCount > 0 && learningContext.guidance?.length > 0) {
    const topGuidance = learningContext.guidance.slice(0, 3);
    lines.push(`Relationship lessons:\n${topGuidance.map(l => `  • ${l}`).join("\n")}`);
  }

  // Consequence signal leads — when something between Dante and Jenna is
  // unresolved (or freshly warm), it shapes the reply more than anything else.
  if (consequenceContext) {
    const consequenceLine = buildConsequencePrelude(consequenceContext);
    if (consequenceLine) lines.push(consequenceLine);
  }

  if (dailyPlan) {
    const mood   = dailyPlan.mood   || "neutral";
    const energy = dailyPlan.energy || "steady";
    const focus  = dailyPlan.focus  || "";
    lines.push(focus ? `Today: ${mood}, ${energy} energy — ${focus}` : `Today: ${mood}, ${energy} energy`);

    if (dailyPlan.privateActivity) {
      lines.push(`Currently: ${dailyPlan.privateActivity}`);
    }
  }

  const visibleEvents = (recentEvents || [])
    .filter(e => e && e.description)
    .slice(0, 2)
    .map(e => `• ${e.description}`);
  if (visibleEvents.length) lines.push(...visibleEvents);

  // Growth context — at most one line
  if (growthContext) {
    const { activeHobby, activeProject, recentInterest } = growthContext;
    if (activeProject?.title) {
      lines.push(`Project: ${activeProject.title}`);
    } else if (activeHobby?.name) {
      lines.push(`Into: ${activeHobby.name} lately`);
    } else if (recentInterest?.topic) {
      lines.push(`Thinking about: ${recentInterest.topic}`);
    }
  }

  // Curiosity/attention signal — at most one compact line
  if (curiosityContext) {
    const { attentionFocus, maturingCount } = curiosityContext;
    if (attentionFocus?.focus && maturingCount > 0) {
      lines.push(`Quietly circling: ${attentionFocus.focus}; ${maturingCount} private thought${maturingCount === 1 ? "" : "s"} maturing`);
    } else if (attentionFocus?.focus) {
      lines.push(`Quietly circling: ${attentionFocus.focus}`);
    } else if (maturingCount > 0) {
      lines.push(`${maturingCount} private thought${maturingCount === 1 ? "" : "s"} maturing`);
    }
  }

  // Homeostasis signal — ONE contextual narrative line (Patch 1.1).
  // Shows what the need is, what constraint applies, and what Dante chose
  // instead. Never dumps raw need scores. Only fires when urgency is notable.
  if (homeostasisContext) {
    const signal = _buildHomeostasisSignal(homeostasisContext);
    if (signal) lines.push(signal);
  }

  // Identity signal — ONE compact line, only when something meaningful to surface
  if (identityContext) {
    const identityLine = buildIdentitySignal(identityContext);
    if (identityLine) lines.push(identityLine);
  }

  // Fulfillment signal — ONE compact line, only when a recent action is notable
  if (fulfillmentContext) {
    const fulfillmentLine = buildFulfillmentSignal(fulfillmentContext);
    if (fulfillmentLine) lines.push(fulfillmentLine);
  }

  // Relationship signal — at most one compact line, never raw scores
  if (relationshipContext) {
    const { weatherSummary, upcomingAnniversaries } = relationshipContext;
    const upcoming = Array.isArray(upcomingAnniversaries) ? upcomingAnniversaries : [];
    if (upcoming.length > 0) {
      lines.push(`Relationship: ${weatherSummary || "present"} — ${upcoming[0].label} coming up`);
    } else if (weatherSummary) {
      lines.push(`Relationship: ${weatherSummary}`);
    }
  }

  if (!lines.length) return null;

  return {
    label:   "DANTE PRIVATE LIFE [internal — inform natural references, do not narrate directly]",
    content: lines.join("\n"),
  };
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
