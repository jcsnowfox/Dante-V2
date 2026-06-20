/**
 * secondLife/slObjectInteractionEngine
 *
 * Phase 12 (object-interaction half) — natural-language object use.
 *
 * Recognises conversational requests to use furniture / objects ("sit on the
 * couch", "go to the bar", "dance with me", "sit beside me") and resolves them
 * to a registered object. Resolution order:
 *   1. The registry of known objects (`second_life_objects`) — exact/keyword
 *      match on name, use_type, object_type, or room label.
 *   2. The live nearby-objects scan from world state (objects seen this session
 *      but not yet registered).
 * When more than one object matches, the engine returns a single clarification
 * request (the spec's "ask ONE clarifying question") rather than guessing.
 *
 * The engine only resolves + describes the intent; the adapter queues a durable
 * command. With no database object resolution falls back to the nearby scan (or
 * returns not-found) so the bridge degrades safely.
 */

function asText(value) {
  return value == null ? "" : String(value);
}

/**
 * Object-use intents. `target` extraction pulls the noun phrase after the verb so
 * "sit on the big red couch" resolves the object name "big red couch". Patterns
 * with a capture group surface that group as the target; pattern-only intents use
 * a fixed useType.
 */
const OBJECT_INTENTS = [
  {
    action: "dance",
    commandType: "object",
    requiresOwner: false,
    useType: "dance",
    patterns: [/\bdance with me\b/i, /\blet'?s dance\b/i, /\bdance with us\b/i],
  },
  {
    action: "sit_beside",
    commandType: "object",
    requiresOwner: false,
    useType: "seat",
    patterns: [/\bsit (beside|next to|with) me\b/i, /\bcome sit (beside|next to|with) me\b/i, /\bsit by me\b/i],
  },
  {
    action: "sit",
    commandType: "object",
    requiresOwner: false,
    // capture the object phrase after "sit on/in/at the ..."
    capture: /\bsit (?:on|in|at|down on)\s+(?:the\s+|a\s+|an\s+|your\s+|my\s+)?([a-z0-9 '\-]+?)(?:\s+(?:please|now))?[.!?]*$/i,
    patterns: [/\bsit (on|in|at|down on)\b/i],
  },
  {
    action: "go_to",
    commandType: "object",
    requiresOwner: false,
    capture: /\bgo (?:to|over to|stand (?:by|at|near))\s+(?:the\s+|a\s+|an\s+|your\s+|my\s+)?([a-z0-9 '\-]+?)(?:\s+(?:please|now))?[.!?]*$/i,
    patterns: [/\bgo (to|over to)\b/i, /\bstand (by|at|near)\b/i, /\bhead (to|over to)\b/i],
  },
  {
    action: "use",
    commandType: "object",
    requiresOwner: false,
    capture: /\b(?:use|interact with|touch|activate)\s+(?:the\s+|a\s+|an\s+|your\s+|my\s+)?([a-z0-9 '\-]+?)(?:\s+(?:please|now))?[.!?]*$/i,
    patterns: [/\b(use|interact with|touch|activate)\b/i],
  },
];

/**
 * Match a free-text message to an object-use intent. Returns null when the
 * message is not an object request. On a match returns:
 *   { kind: "object", action, commandType, requiresOwner, useType, targetName }
 * where targetName is the extracted object phrase ("" when the intent has a fixed
 * useType such as "dance").
 */
function matchIntent(messageText) {
  const text = asText(messageText).trim();
  if (!text) return null;
  for (const intent of OBJECT_INTENTS) {
    if (!intent.patterns.some((re) => re.test(text))) continue;
    let targetName = "";
    if (intent.capture) {
      const m = text.match(intent.capture);
      if (m && m[1]) targetName = m[1].trim();
    }
    return {
      kind: "object",
      action: intent.action,
      commandType: intent.commandType,
      requiresOwner: Boolean(intent.requiresOwner),
      useType: intent.useType || "",
      targetName,
    };
  }
  return null;
}

function scoreMatch(object, name, useType) {
  const objName = asText(object.objectName).toLowerCase();
  const objUse = asText(object.useType).toLowerCase();
  const objType = asText(object.objectType).toLowerCase();
  const objRoom = asText(object.roomLabel).toLowerCase();
  const n = asText(name).toLowerCase().trim();
  const u = asText(useType).toLowerCase().trim();
  let score = 0;
  if (u && objUse === u) score += 4;
  if (n) {
    if (objName === n) score += 10;
    else if (objName.includes(n) || n.includes(objName)) score += 5;
    if (objUse.includes(n) || objType.includes(n)) score += 3;
    if (objRoom.includes(n)) score += 2;
  } else if (u) {
    // No explicit name: a use-type match alone is enough to be a candidate.
    score += 1;
  }
  return score;
}

function createObjectInteractionEngine({ secondLife = null, config = null, logger = null } = {}) {
  /**
   * Resolve an object-use intent to a concrete object. Tries the registered
   * object registry first, then the live nearby-objects scan from world state.
   * Returns one of:
   *   { status: "resolved", object, source }
   *   { status: "needs_clarification", options }  (2+ near-equal matches)
   *   { status: "not_found" }
   */
  async function resolveObject({ companionId, targetName = "", useType = "", worldState = null } = {}) {
    const name = asText(targetName).trim();
    const use = asText(useType).trim();

    // 1) Registered objects.
    let registered = [];
    if (secondLife && typeof secondLife.findObjects === "function") {
      try {
        registered = await secondLife.findObjects({
          companionId,
          name,
          useType: use,
          limit: 10,
        });
      } catch (error) {
        logger?.warn?.("[second-life] findObjects failed.", { error: error.message });
        registered = [];
      }
    }

    let candidates = registered
      .map((object) => ({ object, source: "registry", score: scoreMatch(object, name, use) }))
      .filter((c) => c.score > 0);

    // 2) Fall back to the live nearby scan when nothing is registered.
    if (candidates.length === 0) {
      const nearby = Array.isArray(worldState?.nearbyObjects) ? worldState.nearbyObjects : [];
      candidates = nearby
        .map((object) => ({ object, source: "nearby", score: scoreMatch(object, name, use) }))
        .filter((c) => c.score > 0);
    }

    if (candidates.length === 0) return { status: "not_found" };

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    // Ambiguous when two distinct candidates share the top score.
    const tied = candidates.filter((c) => c.score === top.score);
    if (tied.length > 1) {
      return {
        status: "needs_clarification",
        options: tied.slice(0, 5).map((c) => ({
          objectUuid: c.object.objectUuid,
          objectName: c.object.objectName || c.object.useType || c.object.objectType || "object",
          roomLabel: c.object.roomLabel || "",
          source: c.source,
        })),
      };
    }

    return { status: "resolved", object: top.object, source: top.source };
  }

  return { matchIntent, resolveObject, OBJECT_INTENTS };
}

module.exports = {
  createObjectInteractionEngine,
  matchIntent,
  OBJECT_INTENTS,
};
