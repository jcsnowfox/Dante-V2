/**
 * emotionalPreludeBuilder — Phase B implementation
 *
 * Creates a small, human-readable context block for the LLM that
 * communicates the companion's current emotional state and expression
 * directives without dumping raw database JSON.
 *
 * Rules:
 *   - Keep it short (< 120 words)
 *   - Do not use raw JSON or field names
 *   - Do not guilt-trip, punish, or overexplain
 *   - Supplement identity prompt — do not replace it
 */

const MAX_PRELUDE_WORDS = 120;

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function buildEmotionalPrelude({
  appraisalResult,
  gateResult,
  profile,
  logger,
  companionId,
}) {
  if (!profile || !profile.persisted || !profile.enabled || profile.emotionalDepth === "off") {
    return null;
  }

  if (!gateResult || !gateResult.allowExpression) {
    return null;
  }

  if (!appraisalResult || !appraisalResult.primaryEmotion) {
    return null;
  }

  const emotion = appraisalResult.primaryEmotion;
  const intensity = appraisalResult.intensity || 0;
  const triggerSummary = appraisalResult.triggerSummary || "";
  const mode = gateResult.expressionMode || "internal_only";
  const toneDirectives = gateResult.toneDirectives || [];
  const safetyDirectives = gateResult.safetyDirectives || [];

  const intensityWord = intensity >= 8
    ? "strong"
    : intensity >= 5
      ? "moderate"
      : intensity >= 3
        ? "mild"
        : "faint";

  const lines = [
    `Current emotional state:`,
    `The companion feels ${intensityWord} ${emotion}${triggerSummary ? ` because ${triggerSummary}` : ""}.`,
    `Expression gate: ${mode.replace(/_/g, " ")}.`,
  ];

  if (toneDirectives.length > 0) {
    lines.push(`Tone: ${toneDirectives.join("; ")}.`);
  }

  const profileStyle = profile.expressionStyle?.[emotion];
  if (profileStyle) {
    lines.push(`Expression style: ${profileStyle}.`);
  }

  if (appraisalResult.repairNeeded) {
    lines.push("Repair needed: admit fault directly, do not over-grovel, do not center companion pain.");
  }

  if (safetyDirectives.length > 0) {
    lines.push(safetyDirectives.join(" "));
  }

  lines.push("Do not guilt-trip. Do not punish. Do not overexplain.");

  const prelude = lines.join("\n");

  if (countWords(prelude) > MAX_PRELUDE_WORDS) {
    logger.warn("[emotional-arc:prelude:built] Prelude exceeded word limit, truncating context.", {
      companionId,
      wordCount: countWords(prelude),
    });
  }

  logger.debug("[emotional-arc:prelude:built] Emotional prelude built.", {
    companionId,
    emotion,
    mode,
    wordCount: countWords(prelude),
  });

  return {
    label: "Emotional State",
    content: prelude,
  };
}

module.exports = { buildEmotionalPrelude, countWords };
