/**
 * companion/resolveCompanionId
 *
 * Derives a stable companion id from the configured persona name (never
 * hardcoded). Shared by the Second Life store/API modules.
 */

function resolveCompanionId(config) {
  const personaName = config?.chat?.promptBlocks?.personaName
    || config?.chat?.promptBlocks?.persona_name
    || config?.companionId
    || "companion";
  return String(personaName).trim().toLowerCase().replace(/\s+/g, "_") || "companion";
}

module.exports = { resolveCompanionId };
