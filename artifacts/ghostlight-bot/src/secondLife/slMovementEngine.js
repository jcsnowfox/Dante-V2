/**
 * secondLife/slMovementEngine
 *
 * Phase 12 (movement half) — natural-language movement intents.
 *
 * The command registry already handles explicit "!" triggers (!follow, !home,
 * etc). This engine recognises the *natural language* equivalents inside ordinary
 * chat ("follow me", "come here", "go home", "wander around") so the owner can
 * direct the companion conversationally. It returns a normalized intent the
 * adapter turns into a durable queued command; it never executes movement itself.
 *
 * Each intent declares whether it requires owner permission. Movement that moves
 * the avatar around the world is owner-gated by default; benign "stay" style
 * intents are not. The adapter still applies the relationship/permission gate.
 *
 * With no database this engine is fully self-contained (pure text matching) and
 * therefore always safe.
 */

function asText(value) {
  return value == null ? "" : String(value);
}

/**
 * Ordered list of movement intents. The first whose pattern matches wins, so
 * more specific patterns (e.g. "stop following") are listed before looser ones
 * (e.g. "follow"). `commandType` + `payload.action` mirror the registry's
 * movement command vocabulary so the relay dispatches identically.
 */
const MOVEMENT_INTENTS = [
  {
    action: "stop_follow",
    commandType: "movement",
    requiresOwner: true,
    patterns: [/\bstop following\b/i, /\bstop follow(ing)? me\b/i, /\bdon'?t follow me\b/i, /\bquit following\b/i],
  },
  {
    action: "follow",
    commandType: "movement",
    requiresOwner: true,
    patterns: [/\bfollow me\b/i, /\bcome with me\b/i, /\bstay with me\b/i, /\bwalk with me\b/i],
  },
  {
    action: "come_here",
    commandType: "movement",
    requiresOwner: true,
    patterns: [/\bcome here\b/i, /\bcome to me\b/i, /\bcome over here\b/i, /\bget over here\b/i, /\bcome closer\b/i],
  },
  {
    action: "stand",
    commandType: "movement",
    requiresOwner: true,
    patterns: [/\bstand up\b/i, /\bget up\b/i, /\bstand over there\b/i, /\bstand here\b/i],
  },
  {
    action: "wander",
    commandType: "movement",
    requiresOwner: true,
    patterns: [/\bwander around\b/i, /\bwalk around\b/i, /\broam around\b/i, /\bexplore (the area|around)\b/i],
  },
  {
    action: "teleport_home",
    commandType: "teleport",
    requiresOwner: true,
    patterns: [/\bgo home\b/i, /\bhead home\b/i, /\bteleport home\b/i, /\btake yourself home\b/i, /\bgo back home\b/i],
  },
  {
    action: "choose_destination",
    commandType: "teleport",
    requiresOwner: true,
    // Autonomy: let the companion pick a place to go from its allowed landmarks.
    patterns: [/\bchoose somewhere to go\b/i, /\bpick a place to go\b/i, /\bgo somewhere\b/i, /\bgo wherever you (want|like)\b/i],
  },
  {
    action: "stay",
    commandType: "movement",
    requiresOwner: false,
    patterns: [/\bstay here\b/i, /\bstay put\b/i, /\bwait for me\b/i, /\bwait here\b/i, /\bdon'?t move\b/i, /\bhold still\b/i],
  },
];

/**
 * Match a free-text message to a movement intent. Returns null when the message
 * is not a movement request (so the adapter falls through to other engines or the
 * brain). On a match returns:
 *   { kind: "movement", action, commandType, requiresOwner, payload }
 */
function matchIntent(messageText) {
  const text = asText(messageText).trim();
  if (!text) return null;
  for (const intent of MOVEMENT_INTENTS) {
    if (intent.patterns.some((re) => re.test(text))) {
      return {
        kind: "movement",
        action: intent.action,
        commandType: intent.commandType,
        requiresOwner: Boolean(intent.requiresOwner),
        payload: { action: intent.action },
      };
    }
  }
  return null;
}

function createMovementEngine({ secondLife = null, config = null, logger = null } = {}) {
  return { matchIntent, MOVEMENT_INTENTS };
}

module.exports = {
  createMovementEngine,
  matchIntent,
  MOVEMENT_INTENTS,
};
