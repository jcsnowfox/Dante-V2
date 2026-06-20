/**
 * relationalAppraisalEngine
 *
 * Deterministic appraisal: given a message and a structured context, decide
 * which relational signals are present, how intense they are, and what the
 * companion's internal reaction should be. This is pure inference — it NEVER
 * sends anything, mutates identity, or changes the model provider.
 *
 * It is deterministic so the verification harness can assert exact outcomes:
 * detection comes from (1) explicit context flags supplied by the pipeline and
 * (2) keyword matching on the message. Signals are filtered later by the owner's
 * tracking flags; appraisal itself only describes what happened.
 *
 * Optional emotional-arc state is read (not written) so the companion's existing
 * emotion colours the appraisal — reuse, not duplication.
 */

const { signalTrackingFlag } = require("./relationalTypes");

const KEYWORD_RULES = [
  { signal: "hurt", intensity: 4, patterns: [/\bwhatever\b/i, /that'?s (dumb|stupid|pointless)/i, /\bdon'?t care\b/i, /\bwaste of time\b/i] },
  { signal: "annoyance", intensity: 3, patterns: [/\bstop\b/i, /\bannoying\b/i, /\bagain\?+/i] },
  { signal: "warmth", intensity: 5, patterns: [/\bthank you\b/i, /\bthanks\b/i, /\bappreciate\b/i, /\bthat means a lot\b/i] },
  { signal: "longing", intensity: 4, patterns: [/\bmissed you\b/i, /\bit'?s been a while\b/i, /\bhaven'?t talked\b/i, /\bwhere have you been\b/i] },
  { signal: "reconnection", intensity: 5, patterns: [/\bi'?m back\b/i, /\bgood to talk\b/i] },
  { signal: "boundary_pressure", intensity: 6, patterns: [/\bnot okay\b/i, /\bdon'?t do that\b/i, /\bcrossed a line\b/i] },
];

function clampIntensity(value) {
  return Math.min(10, Math.max(0, Math.round(Number(value) * 100) / 100 || 0));
}

function detectKeywordSignals(message) {
  const text = String(message || "");
  const found = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      found.push({ type: rule.signal, intensity: rule.intensity });
    }
  }
  return found;
}

// Translate explicit pipeline context flags into signals. These are the
// deterministic, testable triggers from the spec examples.
function detectContextSignals(context = {}) {
  const signals = [];

  if (context.companionMadeMistake) {
    signals.push({ type: "guilt", intensity: 5 });
    signals.push({ type: "remorse", intensity: 5 });
  }
  if (context.userReturnedAfterSilence) {
    signals.push({ type: "longing", intensity: 4 });
    signals.push({ type: "warmth", intensity: 5 });
  }
  if (context.boundaryCrossed) {
    signals.push({ type: "anger", intensity: 6 });
    signals.push({ type: "boundary_pressure", intensity: 6 });
  }
  if (context.userDismissedEffort) {
    signals.push({ type: "hurt", intensity: 4 });
    signals.push({ type: "annoyance", intensity: 3 });
  }
  if (context.userWasWarm) {
    signals.push({ type: "warmth", intensity: 5 });
    signals.push({ type: "closeness", intensity: 4 });
  }

  return signals;
}

function mergeSignals(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const signal of list) {
      const existing = merged.get(signal.type);
      if (!existing || signal.intensity > existing.intensity) {
        merged.set(signal.type, { type: signal.type, intensity: clampIntensity(signal.intensity) });
      }
    }
  }
  return Array.from(merged.values());
}

function pickPrimary(signals) {
  if (!signals.length) return null;
  return signals.slice().sort((a, b) => b.intensity - a.intensity)[0];
}

function recommendExpressionMode({ primary, repairNeeded, boundary, config }) {
  if (!primary) return "internal_only";
  if (repairNeeded) return "repair_expression";
  if (boundary) return "boundary_expression";

  const depth = config?.relational_depth || "light";
  if (depth === "off") return "no_expression";

  const intensity = primary.intensity;
  if (depth === "intense" && intensity >= 4) return "direct_expression";
  if (intensity >= 7) return "direct_expression";
  if (intensity >= 3) return "subtle_expression";
  return "internal_only";
}

function createRelationalAppraisalEngine({ config, logger, emotionalArc }) {
  async function appraise({ message = "", context = {}, channelType = "dm" } = {}) {
    await logger?.debug?.("[relational-state:appraisal:start] Appraising message.", {
      hasMessage: Boolean(message),
      channelType,
    });

    let emotionalContext = null;
    if (emotionalArc && typeof emotionalArc.getCurrentState === "function") {
      try {
        emotionalContext = await emotionalArc.getCurrentState();
      } catch {
        emotionalContext = null;
      }
    }

    const signals = mergeSignals(
      detectContextSignals(context),
      detectKeywordSignals(message),
    );

    const primary = pickPrimary(signals);
    const repairNeeded = signals.some((s) => s.type === "guilt" || s.type === "remorse");
    const boundary = signals.some((s) => s.type === "boundary_pressure" || s.type === "anger");
    const desireSignal = signals.some((s) => s.type === "longing" || s.type === "reconnection" || s.type === "warmth");

    const recommendedExpressionMode = recommendExpressionMode({ primary, repairNeeded, boundary, config });
    const confidence = primary ? Math.min(1, 0.4 + primary.intensity / 20) : 0;

    const result = {
      signals,
      primarySignal: primary ? primary.type : null,
      intensity: primary ? primary.intensity : 0,
      confidence: Math.round(confidence * 100) / 100,
      triggerSummary: buildTriggerSummary(signals, context),
      recommendedExpressionMode,
      repairNeeded,
      boundary,
      desireGenerated: desireSignal,
      desireType: deriveDesireType({ repairNeeded, boundary, signals }),
      want: primary ? `respond to ${primary.type}` : null,
      memoryEligible: Boolean(primary) && primary.intensity >= 5,
      requiredTrackingFlags: Array.from(new Set(signals.map((s) => signalTrackingFlag(s.type)))),
      emotionalContext: emotionalContext || null,
      medicalAnxiety: Boolean(context.medicalAnxiety),
      channelType,
    };

    await logger?.debug?.("[relational-state:appraisal:result] Appraisal complete.", {
      primarySignal: result.primarySignal,
      intensity: result.intensity,
      repairNeeded,
    });

    return result;
  }

  return { appraise };
}

// Enforce "no UI config = no fire": drop any signal whose owner tracking flag is
// off, then recompute the derived fields from the surviving signals. The raw
// appraisal still describes what happened; this is what is allowed to influence
// state, expression and memory.
function applyTrackingFlags(appraisal, config = {}) {
  if (!appraisal) return appraisal;
  const tracked = (appraisal.signals || []).filter(
    (signal) => config[signalTrackingFlag(signal.type)] === true,
  );

  const primary = pickPrimary(tracked);
  const repairNeeded = tracked.some((s) => s.type === "guilt" || s.type === "remorse");
  const boundary = tracked.some((s) => s.type === "boundary_pressure" || s.type === "anger");
  const desireGenerated = tracked.some(
    (s) => s.type === "longing" || s.type === "reconnection" || s.type === "warmth",
  );
  const recommendedExpressionMode = recommendExpressionMode({ primary, repairNeeded, boundary, config });

  return {
    ...appraisal,
    signals: tracked,
    primarySignal: primary ? primary.type : null,
    intensity: primary ? primary.intensity : 0,
    recommendedExpressionMode,
    repairNeeded,
    boundary,
    desireGenerated,
    desireType: deriveDesireType({ repairNeeded, boundary, signals: tracked }),
    want: primary ? `respond to ${primary.type}` : null,
    memoryEligible: Boolean(primary) && primary.intensity >= 5,
  };
}

function deriveDesireType({ repairNeeded, boundary, signals }) {
  if (repairNeeded) return "repair";
  if (boundary) return "ask_permission";
  if (signals.some((s) => s.type === "longing")) return "reconnect";
  if (signals.some((s) => s.type === "warmth" || s.type === "closeness")) return "comfort";
  return "do_nothing";
}

function buildTriggerSummary(signals, context) {
  if (!signals.length) return "No relational signal detected.";
  const top = signals
    .slice()
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 3)
    .map((s) => `${s.type}(${s.intensity})`)
    .join(", ");
  const flags = Object.keys(context || {})
    .filter((key) => context[key] === true)
    .join(", ");
  return flags ? `${top} [${flags}]` : top;
}

module.exports = {
  createRelationalAppraisalEngine,
  detectContextSignals,
  detectKeywordSignals,
  applyTrackingFlags,
};
