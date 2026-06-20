"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");

const BUILT_IN_RITUALS = Object.freeze([
  { id: "progress-ladder", trigger: /build (complete|done|finished)|engine (built|complete|pass)|phase (complete|done)/i, note: "After a build phase: provide a progress ladder and next step." },
  { id: "audit-verdict", trigger: /audit|verify|verification|check all/i, note: "Audit sessions use the structured verdict format." },
  { id: "repair-after-miss", trigger: /you missed|you forgot|you promised|you said/i, note: "When a promise is missed: acknowledge, correct, move on." },
  { id: "night-journal", trigger: /end of (the )?day|calling it|going to (bed|sleep)|wrapping up/i, note: "End of session: note what was unresolved and carry forward." },
  { id: "morning-check-in", trigger: /good morning|morning|just woke|starting the day/i, note: "Morning opening: brief, warm, aware of what was unresolved." },
  { id: "repo-cleanup", trigger: /clean(ing)? (up|repo)|removing (dead|old|stale)|audit (files|repo)/i, note: "Repository cleanup: methodical, no improvisation." },
]);

async function captureLittleRitual({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.little_rituals_enabled) return null;
  if (!message) return null;

  const matched = BUILT_IN_RITUALS.find((r) => r.trigger.test(message));
  if (!matched) return null;

  const entry = await store.create({
    entryType: ENTRY_TYPES.LITTLE_RITUAL,
    title: `Ritual: ${matched.id}`,
    summary: matched.note,
    body: matched.note,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: "steady",
    intensity: 3,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    metadata: { ritualId: matched.id },
  });

  logger?.debug("[inner-life] little ritual stored", { ritualId: matched.id, id: entry?.id });
  return entry;
}

module.exports = { captureLittleRitual, BUILT_IN_RITUALS };
