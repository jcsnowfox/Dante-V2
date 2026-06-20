/**
 * secondLife/slCommandRegistry
 *
 * Phase 9 — UI-backed command registry.
 *
 * Commands are configurable from the dashboard and persisted in
 * `second_life_commands`. This module owns:
 *   - DEFAULT_COMMANDS: the spec's generic default command set (no
 *     customer-specific triggers; all owner-safe defaults).
 *   - resolveCommand: trigger -> definition + a permission decision.
 *   - seedDefaults / listForCopy helpers for boot and the dashboard.
 *
 * Command-type semantics (resolved by later phases / the adapter):
 *   movement — follow / come / stand / sit / wander
 *   teleport — landmark teleport (e.g. !home)
 *   object   — furniture / dance-pad interaction (resolves object registry)
 *   outfit   — maps to the outfit registry
 *   system   — mode toggles (sleep, quiet, autonomy, local on/off)
 *   custom   — anything user-defined
 *
 * Owner commands have the highest priority. With no database resolveCommand
 * still answers from DEFAULT_COMMANDS so the bridge degrades safely.
 */

const CLOSE_TIERS = ["owner", "family", "friend", "trusted"];

/**
 * Generic default commands from the spec. `payload.action` is a stable machine
 * key the relay/later phases dispatch on; triggers and names stay generic.
 */
const DEFAULT_COMMANDS = [
  { commandTrigger: "!follow", commandType: "movement", description: "Follow the requester.", payload: { action: "follow" }, requiresOwnerPermission: true },
  { commandTrigger: "!stopfollow", commandType: "movement", description: "Stop following.", payload: { action: "stop_follow" }, requiresOwnerPermission: true },
  { commandTrigger: "!comehere", commandType: "movement", description: "Move to the requester.", payload: { action: "come_here" }, requiresOwnerPermission: true },
  { commandTrigger: "!stand", commandType: "movement", description: "Stand up.", payload: { action: "stand" }, requiresOwnerPermission: true },
  { commandTrigger: "!sit", commandType: "object", description: "Sit on the nearest known object.", payload: { action: "sit" }, requiresOwnerPermission: true },
  { commandTrigger: "!dance", commandType: "object", description: "Use a dance pad / dance object.", payload: { action: "dance" }, allowedRelationships: CLOSE_TIERS },
  { commandTrigger: "!home", commandType: "teleport", description: "Teleport to the home landmark.", payload: { action: "teleport_home" }, requiresOwnerPermission: true },
  { commandTrigger: "!wander", commandType: "movement", description: "Wander within the allowed radius.", payload: { action: "wander" }, requiresOwnerPermission: true },
  { commandTrigger: "!sleep", commandType: "system", description: "Force sleep/away mode now.", payload: { action: "sleep", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!wake", commandType: "system", description: "Leave sleep/away mode.", payload: { action: "wake" }, requiresOwnerPermission: true },
  { commandTrigger: "!stop", commandType: "system", description: "Emergency stop: pause autonomy and clear the command queue.", payload: { action: "emergency_stop", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!returnhome", commandType: "teleport", description: "Force teleport to the home landmark now.", payload: { action: "return_home", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!quiet", commandType: "system", description: "Enter quiet mode (no local replies).", payload: { action: "quiet", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!localoff", commandType: "system", description: "Disable local chat replies.", payload: { action: "local_off", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!localon", commandType: "system", description: "Enable local chat replies.", payload: { action: "local_on" }, requiresOwnerPermission: true },
  { commandTrigger: "!autonomyoff", commandType: "system", description: "Disable autonomous behaviour.", payload: { action: "autonomy_off", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!autonomyon", commandType: "system", description: "Enable autonomous behaviour.", payload: { action: "autonomy_on" }, requiresOwnerPermission: true },
  { commandTrigger: "!strangersoff", commandType: "system", description: "Disable replies to strangers.", payload: { action: "strangers_off", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!strangerson", commandType: "system", description: "Enable replies to strangers.", payload: { action: "strangers_on" }, requiresOwnerPermission: true },
  { commandTrigger: "!clearqueue", commandType: "system", description: "Clear the pending command queue now.", payload: { action: "clear_queue", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!block", commandType: "system", description: "Block the current avatar (no further replies).", payload: { action: "block_avatar", emergency: true }, requiresOwnerPermission: true },
  { commandTrigger: "!formal", commandType: "outfit", description: "Wear the formal outfit.", payload: { outfitTrigger: "!formal" }, allowedRelationships: CLOSE_TIERS },
  { commandTrigger: "!beachwear", commandType: "outfit", description: "Wear the beachwear outfit.", payload: { outfitTrigger: "!beachwear" }, allowedRelationships: CLOSE_TIERS },
  { commandTrigger: "!casual", commandType: "outfit", description: "Wear the casual outfit.", payload: { outfitTrigger: "!casual" }, allowedRelationships: CLOSE_TIERS },
  { commandTrigger: "!clubwear", commandType: "outfit", description: "Wear the clubwear outfit.", payload: { outfitTrigger: "!clubwear" }, allowedRelationships: CLOSE_TIERS },
  { commandTrigger: "!sleepwear", commandType: "outfit", description: "Wear the sleepwear outfit.", payload: { outfitTrigger: "!sleepwear" }, allowedRelationships: CLOSE_TIERS },
  { commandTrigger: "!date-night", commandType: "outfit", description: "Wear the date-night outfit.", payload: { outfitTrigger: "!date-night" }, allowedRelationships: CLOSE_TIERS },
];

function asText(value) {
  return value == null ? "" : String(value);
}

/**
 * Extract a leading command trigger from a raw message, e.g. "!dance please" ->
 * "!dance". Returns "" when the message does not start with a command token.
 */
function parseTrigger(messageText) {
  const text = asText(messageText).trim();
  if (!text.startsWith("!")) return "";
  const token = text.split(/\s+/)[0];
  return token.toLowerCase();
}

function createCommandRegistry({ secondLife = null, config = null, logger = null } = {}) {
  function defaultByTrigger(trigger) {
    const t = asText(trigger).toLowerCase();
    const found = DEFAULT_COMMANDS.find((c) => c.commandTrigger === t);
    if (!found) return null;
    return {
      ...found,
      allowedRelationships: Array.isArray(found.allowedRelationships) ? found.allowedRelationships : [],
      payload: found.payload || {},
      enabled: true,
      isDefault: true,
    };
  }

  /**
   * Resolve a trigger to a command definition and decide whether `relationship`
   * (a resolved identity from slIdentityResolver, carrying { tier, isOwner }) is
   * allowed to run it.
   *
   * Returns { command, allowed, reason }. Unknown triggers return
   * { command: null, allowed: false, reason: "unknown" } so the caller can fall
   * back to a natural reply or ignore per policy.
   */
  async function resolveCommand({ companionId, trigger, relationship = null } = {}) {
    const t = asText(trigger).toLowerCase();
    if (!t) return { command: null, allowed: false, reason: "no_trigger" };

    let command = null;
    if (secondLife && typeof secondLife.getCommandDefinitionByTrigger === "function") {
      try {
        command = await secondLife.getCommandDefinitionByTrigger({ companionId, trigger: t });
      } catch (error) {
        logger?.warn?.("[second-life] command lookup failed; using defaults.", {
          error: error.message,
        });
        command = null;
      }
    }
    if (!command) command = defaultByTrigger(t);
    if (!command) return { command: null, allowed: false, reason: "unknown" };

    if (command.enabled === false) {
      return { command, allowed: false, reason: "disabled" };
    }

    const tier = asText(relationship?.tier) || (relationship?.isOwner ? "owner" : "stranger");
    const isOwner = relationship?.isOwner === true || tier === "owner";

    if (tier === "blocked") {
      return { command, allowed: false, reason: "blocked" };
    }
    if (command.requiresOwnerPermission && !isOwner) {
      return { command, allowed: false, reason: "owner_only" };
    }
    const allowedRelationships = Array.isArray(command.allowedRelationships) ? command.allowedRelationships : [];
    if (allowedRelationships.length > 0 && !isOwner && !allowedRelationships.includes(tier)) {
      return { command, allowed: false, reason: "relationship_not_allowed" };
    }

    return { command, allowed: true, reason: "ok" };
  }

  async function seedDefaults({ companionId }) {
    if (!secondLife || typeof secondLife.seedDefaultCommands !== "function") return 0;
    try {
      return await secondLife.seedDefaultCommands({ companionId, defaults: DEFAULT_COMMANDS });
    } catch (error) {
      logger?.warn?.("[second-life] seedDefaultCommands failed.", { error: error.message });
      return 0;
    }
  }

  /**
   * Build a copy/paste block of the enabled command triggers for pasting into the
   * Second Life object's instructions. Falls back to the defaults with no DB.
   */
  async function listForCopy({ companionId } = {}) {
    let commands = [];
    if (secondLife && typeof secondLife.listCommandDefinitions === "function") {
      try {
        commands = await secondLife.listCommandDefinitions({ companionId });
      } catch (error) {
        logger?.warn?.("[second-life] listCommandDefinitions failed; using defaults.", {
          error: error.message,
        });
        commands = [];
      }
    }
    if (!commands.length) commands = DEFAULT_COMMANDS;
    return commands
      .filter((c) => c.enabled !== false)
      .map((c) => `${c.commandTrigger} — ${c.description || c.commandType || "custom"}`)
      .join("\n");
  }

  return { resolveCommand, seedDefaults, listForCopy, parseTrigger, DEFAULT_COMMANDS };
}

module.exports = {
  createCommandRegistry,
  DEFAULT_COMMANDS,
  parseTrigger,
};
