/**
 * companion/assembleCompanionPrompt
 *
 * The ONE persona builder shared by Discord and Second Life. Personality never
 * forks per channel: it always comes from config.chat.promptBlocks — the single
 * source of truth, edited in the admin Companion tab. Both Discord and Second
 * Life speak and behave from these same settings.
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
 * Build the persona block from config prompt blocks. Identical for every
 * channel — Discord and Second Life share the Companion tab settings.
 *
 * @param {object} params
 * @param {object} params.config        full bot config (persona lives here)
 * @param {string} [params.channelType] "discord" | "second_life" | ... (kept for callers; does not change the persona)
 * @returns {string} assembled persona prompt
 */
function assembleCompanionPrompt({
  config = {},
  channelType = "discord",
} = {}) {
  void channelType;
  const promptBlocks = config?.chat?.promptBlocks || {};
  const personaName = promptBlocks.personaName || "Ghostlight";
  const userName = promptBlocks.userName || "the user";

  const sections = [`You are ${personaName}, ${userName}'s AI companion.`];

  addSection(sections, "Persona Details", promptBlocks.personaProfile);
  addSection(sections, "What we do here", promptBlocks.companionPurpose);
  addSection(sections, "Tone Guidance", promptBlocks.toneGuidelines);
  addSection(sections, "User Details", promptBlocks.userProfile);
  addSection(sections, "Boundaries", promptBlocks.boundaryRules);

  return sections.join("\n\n");
}

module.exports = {
  assembleCompanionPrompt,
};
