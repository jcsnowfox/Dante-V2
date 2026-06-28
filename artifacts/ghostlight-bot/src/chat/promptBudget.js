"use strict";

/**
 * promptBudget
 *
 * Enforces char-count budgets on context sections before they reach the LLM.
 * Prevents context overload that causes MiMo-class model corruption.
 *
 * Env vars (all optional, sane defaults):
 *   DANTE_MAX_CONTEXT_CHARS   — total budget for all contextSections (default: 24000)
 *   DANTE_MAX_SECTION_CHARS   — max chars for any single section (default: 2500)
 *   DANTE_MAX_PRELUDE_CHARS   — max chars for life/cognitive prelude sections (default: 1800)
 *   DANTE_MAX_MEMORY_CHARS    — max chars for memory content (default: 6000)
 *
 * Priority order (highest first — survive pruning longest):
 *   1. system_core         — backbone, voice rules, adult mode system prompt
 *   2. repair_safety       — repair prelude, open promises, voice guard violations
 *   3. life_prelude        — life runtime prelude, cognitive prelude signal
 *   4. world_model         — world context, cross-channel, attachment, web results
 *   5. identity_signal     — continuity prelude, emotional arc, relational state
 *   6. relationship_learn  — feedback learning, emotional beats, human simulation
 *   7. memory              — memories (capped at DANTE_MAX_MEMORY_CHARS)
 *   8. awareness           — situational awareness, reaction context, inner life
 *   9. meta                — tone mode, response intent, speaker identity, image ctx
 *  10. debug_status        — excluded entirely (status dumps never reach LLM)
 */

const MAX_CONTEXT_CHARS = Math.max(4000, Number(process.env.DANTE_MAX_CONTEXT_CHARS) || 24000);
const MAX_SECTION_CHARS = Math.max(200,  Number(process.env.DANTE_MAX_SECTION_CHARS) || 2500);
const MAX_PRELUDE_CHARS = Math.max(200,  Number(process.env.DANTE_MAX_PRELUDE_CHARS) || 1800);
const MAX_MEMORY_CHARS  = Math.max(500,  Number(process.env.DANTE_MAX_MEMORY_CHARS)  || 6000);

// Labels whose sections are always excluded (debug/status artifacts)
const EXCLUDED_LABELS = new Set([
  "DEBUG",
  "STATUS",
  "DIAGNOSTIC",
  "AUDIT",
  "VERIFY",
  "TEST OUTPUT",
  "SCHEMA",
  "SQL",
  "STACK TRACE",
  "RUNTIME STATUS",
  "SYSTEM STATUS",
]);

// Priority tiers by label substring match (case-insensitive). Lower tier = pruned first.
const TIER_MAP = [
  // Tier 1 — never pruned unless catastrophically over budget
  { tier: 1, matches: ["BACKBONE", "VOICE RULES", "ADULT MODE", "HARD LIMIT", "SAFEWORD"] },
  // Tier 2 — repair and safety
  { tier: 2, matches: ["REPAIR", "OPEN PROMISES", "SAFETY", "WARNING"] },
  // Tier 3 — life/cognitive prelude (bounded tightly)
  { tier: 3, matches: ["LIFE PRELUDE", "COGNITIVE", "DELIBERATING", "PRIVATELY PLANNING"] },
  // Tier 4 — world model signals
  { tier: 4, matches: ["WORLD CONTEXT", "WORLD MODEL", "CROSS-CHANNEL", "ATTACHMENT", "WEB SEARCH", "URL"] },
  // Tier 5 — identity / continuity signals
  { tier: 5, matches: ["CONTINUITY", "EMOTIONAL ARC", "RELATIONAL STATE", "IDENTITY", "PROMISE", "TONE MODE"] },
  // Tier 6 — relationship learning
  { tier: 6, matches: ["FEEDBACK", "EMOTIONAL BEAT", "HUMAN SIMULATION", "LEARNING", "MICRO-PREFER"] },
  // Tier 7 — memories (managed separately with MEMORY budget)
  { tier: 7, matches: ["MEMORIES", "MEMORY", "RECALL", "LONG-TERM", "RECENT MEMORY"] },
  // Tier 8 — awareness
  { tier: 8, matches: ["AWARENESS", "INNER LIFE", "REACTION", "ALIVE", "INTENTION"] },
  // Tier 9 — meta
  { tier: 9, matches: ["SPEAKER", "IMAGE", "PRESENCE", "INTENT", "MIRROR"] },
];

function _getTier(label) {
  const up = String(label || "").toUpperCase();
  for (const { tier, matches } of TIER_MAP) {
    if (matches.some(m => up.includes(m))) return tier;
  }
  return 6; // default mid-tier
}

function _isExcluded(label) {
  const up = String(label || "").toUpperCase();
  return [...EXCLUDED_LABELS].some(ex => up.includes(ex));
}

function _isMemorySection(label) {
  const up = String(label || "").toUpperCase();
  return up.includes("MEMOR") || up.includes("RECALL") || up.includes("LONG-TERM");
}

function _isPreludeSection(label) {
  const up = String(label || "").toUpperCase();
  return up.includes("PRELUDE") || up.includes("COGNITIVE") || up.includes("DELIBERAT");
}

/**
 * applyPromptBudget
 *
 * @param {Array<{label:string,content:string}>} contextSections
 * @param {{ logger?: object, messageId?: string }} [opts]
 * @returns {Array<{label:string,content:string}>}
 */
function applyPromptBudget(contextSections, { logger, messageId } = {}) {
  if (!Array.isArray(contextSections) || !contextSections.length) return [];

  const tagged = contextSections
    .filter(s => s?.label && String(s.content || "").trim())
    .filter(s => !_isExcluded(s.label))
    .map(s => {
      const content = String(s.content || "");
      const isMemory  = _isMemorySection(s.label);
      const isPrelude = _isPreludeSection(s.label);
      const maxChars  = isPrelude ? MAX_PRELUDE_CHARS : (isMemory ? MAX_MEMORY_CHARS : MAX_SECTION_CHARS);
      const trimmed   = content.length > maxChars ? content.slice(0, maxChars - 1) + "…" : content;
      return {
        label:    s.label,
        content:  trimmed,
        chars:    trimmed.length,
        originalChars: content.length,
        estimatedTokens: Math.ceil(trimmed.length / 4),
        tier:     _getTier(s.label),
        isMemory,
        isPrelude,
      };
    });

  const totalRequestedChars = tagged.reduce((sum, item) => sum + item.chars, 0);

  // Sort by tier ascending (tier 1 kept first)
  tagged.sort((a, b) => a.tier - b.tier);

  // Accumulate up to MAX_CONTEXT_CHARS
  let total = 0;
  const kept = [];
  const dropped = [];

  for (const item of tagged) {
    if (total + item.chars <= MAX_CONTEXT_CHARS) {
      kept.push({ label: item.label, content: item.content });
      total += item.chars;
    } else {
      dropped.push(item);
    }
  }

  if (dropped.length && logger?.warn) {
    logger.warn("[prompt-budget] sections dropped to stay within budget", {
      messageId: messageId || "",
      dropped: dropped.map((item) => item.label),
      droppedChars: dropped.reduce((sum, item) => sum + item.chars, 0),
      totalRequestedChars,
      totalKeptChars: total,
      budget: MAX_CONTEXT_CHARS,
    });
  }

  return kept;
}

module.exports = { applyPromptBudget, MAX_CONTEXT_CHARS, MAX_SECTION_CHARS, MAX_PRELUDE_CHARS, MAX_MEMORY_CHARS };
