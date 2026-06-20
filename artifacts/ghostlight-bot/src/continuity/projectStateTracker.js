"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Project State Tracker
 *
 * Tracks long-running build state so the companion doesn't lose the thread
 * across multi-session work.
 *
 * Fields in metadata:
 *   project_name, current_phase, last_completed_phase, next_phase,
 *   blocked_by, latest_proof, latest_failure, repo_branch,
 *   latest_uploaded_zip, known_gaps, next_action
 */

const PROJECT_SIGNALS = [
  /\b(building|built|finished|completed|working on|stuck on|blocked|next step|phase)\b/i,
  /\b(repo|branch|commit|push|deploy|upload|zip)\b/i,
  /\b(engine|module|feature|system|pipeline|scheduler|store|handler)\b/i,
  /\b(verify|test|verify|pass|fail|boot|crash|error)\b/i,
];

const PHASE_PATTERNS = [
  { re: /\b(planning|design|spec|architecture)\b/i, phase: "planning" },
  { re: /\b(build|building|implement|coding|writing)\b/i, phase: "implementation" },
  { re: /\b(testing|verifying|verify|test)\b/i, phase: "testing" },
  { re: /\b(deploying|deployment|deploy|launch|production)\b/i, phase: "deployment" },
  { re: /\b(done|complete|finished|shipped)\b/i, phase: "complete" },
  { re: /\b(blocked|stuck|error|fail)\b/i, phase: "blocked" },
];

function detectProjectSignal(text) {
  return PROJECT_SIGNALS.some((re) => re.test(text));
}

function detectPhase(text) {
  for (const p of PHASE_PATTERNS) {
    if (p.re.test(text)) return p.phase;
  }
  return null;
}

async function updateProjectState({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.project_state_enabled) return null;
  if (!message || !detectProjectSignal(message)) return null;

  try {
    // Find an existing open project state item to update, or create one
    const existing = await store.list({ type: ITEM_TYPES.PROJECT_STATE, status: ITEM_STATUSES.OPEN, limit: 3 });
    const currentPhase = detectPhase(message);

    if (existing.length > 0) {
      // Update the most recent project state item
      const item = existing[0];
      const updates = {
        lastTouchedAt: new Date(),
        summary: message.slice(0, 300),
        sourceMessageId,
        sourceText: message.slice(0, 500),
      };
      if (currentPhase) {
        updates.metadata = {
          ...(item.metadata || {}),
          last_completed_phase: item.metadata?.current_phase || currentPhase,
          current_phase: currentPhase,
          last_message: message.slice(0, 200),
        };
      }
      const updated = await store.update(item.id, updates);
      logger?.debug?.("[continuity] project state updated", { id: item.id, phase: currentPhase });
      return updated;
    }

    // Create new project state item
    const item = await store.create({
      type: ITEM_TYPES.PROJECT_STATE,
      title: "Active project",
      summary: message.slice(0, 300),
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 500),
      status: ITEM_STATUSES.OPEN,
      priority: "medium",
      certainty: CERTAINTY_LEVELS.DEFINITE,
      createdBy: "system",
      metadata: {
        current_phase: currentPhase || "implementation",
        last_message: message.slice(0, 200),
      },
    });

    if (item) {
      logger?.debug?.("[continuity] created project_state", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] projectStateTracker error", { error: err?.message });
    return null;
  }
}

module.exports = { updateProjectState, detectProjectSignal, detectPhase };
