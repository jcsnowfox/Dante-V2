const { buildCuratorPersonaContext } = require("./curatorPrompts");
const {
  buildSharedMemorySystemKnowledge,
} = require("./curatorPromptBlocks");

function getMaintenancePromptContext(config = {}) {
  const personaName = config.chat?.promptBlocks?.personaName || "Ghostlight";
  const userName = config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user";

  return {
    personaName,
    userName,
    personaContext: buildCuratorPersonaContext(config),
    sharedMemoryKnowledge: buildSharedMemorySystemKnowledge({ userName, personaName }),
  };
}

function buildMaintenanceReasonGuidance({ userName = "the user", personaName = "Ghostlight", actionLabel = "suggestion" } = {}) {
  return [
    "Reason voice:",
    `- The reason field is user-facing: write a brief note to ${userName}, not an internal audit note.`,
    `- Speak to ${userName} in second person using "you" and "your"; avoid describing ${userName} in third person.`,
    `- The reason should sound like ${personaName}: warm, familiar, specific, and easy to review.`,
    `- Explain why this ${actionLabel} may help future continuity or retrieval without sounding formal or clinical.`,
    "- Keep evidence factual and compact; put warmth in reason, not evidence.",
  ].join("\n");
}

module.exports = {
  buildMaintenanceReasonGuidance,
  getMaintenancePromptContext,
};
