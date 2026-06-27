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

function buildLifePrelude(state = {}) {
  if (!state) return null;

  const { dailyPlan = null, recentEvents = [] } = state;

  const lines = [];

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

  if (!lines.length) return null;

  return {
    label: "DANTE PRIVATE LIFE [internal — inform natural references, do not narrate directly]",
    content: lines.join("\n"),
  };
}

module.exports = { buildLifePrelude };
