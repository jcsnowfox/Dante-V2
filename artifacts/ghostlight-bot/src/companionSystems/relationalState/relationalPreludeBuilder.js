/**
 * relationalPreludeBuilder
 *
 * Builds an OPTIONAL internal prelude context section from the current relational
 * state + the expression gate's verdict. This is the only way the engine
 * influences a live reply, and it is purely additive — it appends a short
 * context section and never mutates the base prompt, the companion identity, or
 * the model provider.
 *
 * Returns null unless the engine is active, prelude_enabled is on, and the
 * expression gate allowed expression. Output is plain prose, < 120 words, no
 * JSON, no mechanical state dumps (spec Phase 14).
 */

const MAX_WORDS = 120;

function clampWords(text, maxWords) {
  const words = String(text || "").trim().split(/\s+/);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function buildRelationalPrelude({ settings, appraisal, gateResult, logger }) {
  const config = (settings && settings.config) || {};

  if (!settings || !settings.active) return null;
  if (config.prelude_enabled !== true) return null;
  if (!gateResult || gateResult.allowExpression !== true) return null;

  const lines = [];
  const directives = Array.isArray(gateResult.toneDirectives) ? gateResult.toneDirectives : [];
  const safety = Array.isArray(gateResult.safetyDirectives) ? gateResult.safetyDirectives : [];

  if (appraisal?.primarySignal) {
    lines.push(
      `Your current feeling toward them is ${appraisal.primarySignal}. Let it color your tone naturally.`,
    );
  }

  for (const directive of directives) {
    if (directive) lines.push(directive);
  }
  for (const note of safety) {
    if (note) lines.push(note);
  }

  if (lines.length === 0) return null;

  const content = clampWords(lines.join(" "), MAX_WORDS);

  logger?.debug?.("[relational-state:prelude:built] Prelude assembled.", {
    mode: gateResult.expressionMode,
    words: content.split(/\s+/).length,
  });

  return {
    title: "Relational State",
    content,
  };
}

module.exports = { buildRelationalPrelude };
