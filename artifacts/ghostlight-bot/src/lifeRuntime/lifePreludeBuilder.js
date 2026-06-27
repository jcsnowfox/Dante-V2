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
 * Label: DANTE PRIVATE LIFE [internal]
 * The [internal] tag signals the model to treat this as private context
 * that shapes behaviour, not content to quote or explain unprompted.
 */

const { buildConsequencePrelude } = require("./consequencePreludeBuilder");

function buildLifePrelude(state = {}) {
  if (!state) return null;

  const { dailyPlan = null, recentEvents = [], growthContext = null, curiosityContext = null, relationshipContext = null, consequenceContext = null, homeostasisContext = null } = state;

  const lines = [];

  // Consequence signal leads — when something between Dante and Jenna is
  // unresolved (or freshly warm), it shapes the reply more than anything else.
  if (consequenceContext) {
    const consequenceLine = buildConsequencePrelude(consequenceContext);
    if (consequenceLine) lines.push(consequenceLine);
  }

  if (dailyPlan) {
    const mood = dailyPlan.mood || "neutral";
    const energy = dailyPlan.energy || "steady";
    const focus = dailyPlan.focus || "";
    const header = focus
      ? `Today: ${mood}, ${energy} energy — ${focus}`
      : `Today: ${mood}, ${energy} energy`;
    lines.push(header);

    if (dailyPlan.privateActivity) {
      lines.push(`Currently: ${dailyPlan.privateActivity}`);
    }
  }

  const visibleEvents = (recentEvents || [])
    .filter((e) => e && e.description)
    .slice(0, 2)
    .map((e) => `• ${e.description}`);

  if (visibleEvents.length) {
    lines.push(...visibleEvents);
  }

  // Growth context — at most one line to stay within token budget
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

  // Homeostasis signal — one compact line when a need is pressured enough to shape tone
  if (homeostasisContext && homeostasisContext.topNeed && homeostasisContext.highestUrgency >= 0.50) {
    const { needType, urgency } = homeostasisContext.topNeed;
    const level = urgency >= 0.75 ? "low" : "below comfortable";
    lines.push(`Need: ${needType.replace(/_/g, " ")} is ${level}`);
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
    label: "DANTE PRIVATE LIFE [internal — inform natural references, do not narrate directly]",
    content: lines.join("\n"),
  };
}

module.exports = { buildLifePrelude };
