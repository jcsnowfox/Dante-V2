/**
 * companion/assembleCompanionPrompt
 *
 * The ONE persona builder shared by Discord and Second Life. Personality never
 * forks per channel: it always comes from config.chat.promptBlocks (the single
 * source of truth). Prompt profiles are a Second-Life-only OVERLAY — their two
 * fields (secondLifeBehaviorPrompt + secondLifeLocalChatPrompt) are appended
 * only when channelType is "second_life".
 *
 * Pure and side-effect free: no DB, no logging, no customer-specific defaults.
 */

function addSection(sections, label, value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    return;
  }
  sections.push(`${label}\n${text}`);
}

/**
 * Build the persona block from config prompt blocks, plus the Second Life
 * overlay from the active prompt profile when in-world.
 *
 * @param {object} params
 * @param {object} params.config        full bot config (persona lives here)
 * @param {object} [params.profile]     active prompt profile (SL overlay only)
 * @param {string} [params.channelType] "discord" | "second_life" | ...
 * @returns {string} assembled persona prompt
 */
function assembleCompanionPrompt({
  config = {},
  profile = null,
  channelType = "discord",
} = {}) {
  const promptBlocks = config?.chat?.promptBlocks || {};
  const personaName = promptBlocks.personaName || "Ghostlight";
  const userName = promptBlocks.userName || "the user";

  const sections = [`You are ${personaName}, ${userName}'s AI companion.`];

  addSection(sections, "Persona Details", promptBlocks.personaProfile);
  addSection(sections, "What we do here", promptBlocks.companionPurpose);
  addSection(sections, "Tone Guidance", promptBlocks.toneGuidelines);
  addSection(sections, "User Details", promptBlocks.userProfile);
  addSection(sections, "Boundaries", promptBlocks.boundaryRules);

  if (profile && String(channelType || "").trim().toLowerCase() === "second_life") {
    addSection(sections, "Second Life Behaviour", profile.secondLifeBehaviorPrompt);
    addSection(sections, "Second Life Local Chat", profile.secondLifeLocalChatPrompt);
  }

  return sections.join("\n\n");
}

module.exports = {
  assembleCompanionPrompt,
};
