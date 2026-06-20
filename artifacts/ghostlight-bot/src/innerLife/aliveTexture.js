"use strict";

const { isAliveTextureAllowed } = require("./alivenessSafety");

// Alive texture mutations — subtle, natural, never applied to safety-critical content
// Each has a weight (higher = more likely) and a condition function

const TEXTURE_OPERATIONS = [
  {
    id: "self-correction",
    weight: 3,
    apply(text) {
      // Find a long word and add a brief self-correction before a key line
      const sentences = text.split(/(?<=[.!?])\s+/);
      if (sentences.length < 3) return null;
      const idx = 1 + Math.floor(Math.random() * Math.min(2, sentences.length - 2));
      const target = sentences[idx];
      if (!target || target.length < 30 || /^[*#\-`]/.test(target)) return null;
      sentences[idx] = `Actually — ${target.charAt(0).toLowerCase()}${target.slice(1)}`;
      return sentences.join(" ");
    },
  },
  {
    id: "shorter-opener",
    weight: 4,
    apply(text) {
      // Trim a verbose opener ("I would suggest that" → direct)
      return text
        .replace(/^(I would suggest that |I think that |It seems like |It appears that |It's worth noting that )/i, "")
        .replace(/^(In terms of |With regard to |When it comes to )/i, "")
        .trim() || null;
    },
  },
  {
    id: "dry-aside",
    weight: 2,
    apply(text) {
      const asides = [
        "(which is a choice)",
        "(classic)",
        "(not for the first time)",
        "(this again)",
        "(naturally)",
      ];
      const sentences = text.split(/(?<=[.!?])\s+/);
      if (sentences.length < 4) return null;
      const idx = Math.floor(Math.random() * Math.min(3, sentences.length));
      const s = sentences[idx];
      if (!s || s.length < 20 || /^[*#\-`]/.test(s)) return null;
      const aside = asides[Math.floor(Math.random() * asides.length)];
      sentences[idx] = s.replace(/[.!?]$/, "") + ` ${aside}.`;
      return sentences.join(" ");
    },
  },
  {
    id: "warmth-callback",
    weight: 2,
    apply(text) {
      // Add a single warm closing word before the final line
      const ending = text.slice(-100);
      if (ending.includes("—") || ending.includes("...")) return null;
      const closings = ["That matters.", "Worth keeping.", "Noted.", "Good.", "That's real."];
      const pick = closings[Math.floor(Math.random() * closings.length)];
      return `${text.trimEnd()}\n\n${pick}`;
    },
  },
];

function pickTextureOp() {
  const total = TEXTURE_OPERATIONS.reduce((s, op) => s + op.weight, 0);
  let roll = Math.random() * total;
  for (const op of TEXTURE_OPERATIONS) {
    roll -= op.weight;
    if (roll <= 0) return op;
  }
  return TEXTURE_OPERATIONS[0];
}

function applyAliveTexture({ text, config, contextType = "", logger } = {}) {
  if (!config?.alive_texture_enabled) {
    return { text, applied: false, reason: "disabled" };
  }

  // Safety check FIRST — always blocks regardless of length
  const safety = isAliveTextureAllowed(text, contextType);
  if (!safety) {
    logger?.debug("[inner-life] alive texture blocked", { contextType });
    return { text, applied: false, reason: "safety_blocked" };
  }

  if (!text || text.length < 50) {
    return { text, applied: false, reason: "too_short" };
  }

  // Only apply texture ~30% of the time — rare, not constant
  if (Math.random() > 0.3) {
    return { text, applied: false, reason: "probability_skip" };
  }

  const op = pickTextureOp();
  const result = op.apply(text);

  if (!result || result === text) {
    return { text, applied: false, reason: "no_change" };
  }

  logger?.debug("[inner-life] alive texture applied", { operation: op.id });
  return { text: result, applied: true, operation: op.id };
}

module.exports = { applyAliveTexture, TEXTURE_OPERATIONS };
