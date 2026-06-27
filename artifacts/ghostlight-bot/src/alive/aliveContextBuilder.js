"use strict";

function scoreToLabel(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "moderate";
  if (score >= 0.2) return "low";
  return "none";
}

function formatSpaceState(space = {}) {
  const parts = [];
  if (space.room) parts.push(space.room);
  if (space.activity && space.activity !== "idle") parts.push(space.activity);
  if (space.music) parts.push(`music: ${space.music}`);
  if (space.lighting && space.lighting !== "warm") parts.push(`${space.lighting} lighting`);
  return parts.length ? parts.join(", ") : null;
}

function formatSilentPreferences(memories = []) {
  if (!Array.isArray(memories) || !memories.length) return null;
  const prefMemories = memories.filter((m) => {
    const text = String(m?.text || m?.content || "").toLowerCase();
    return text.includes("prefer") || text.includes("like when") || text.includes("dislikes") || text.includes("doesn't like") || text.includes("hates") || text.includes("loves");
  });
  if (!prefMemories.length) return null;
  return prefMemories.slice(0, 3).map((m) => String(m.text || m.content || "").trim()).filter(Boolean).join("; ");
}

function buildAliveContextPrelude(presenceState, { memories = [], pendingIntention = null } = {}) {
  if (!presenceState) return null;

  const lines = [];
  lines.push(`Presence: ${presenceState.presenceState} | Energy: ${presenceState.energy} | Mood: ${presenceState.mood}`);

  const missingLabel = scoreToLabel(presenceState.missingScore);
  const affectionLabel = scoreToLabel(presenceState.affectionScore);
  const overloadLabel = scoreToLabel(presenceState.overloadScore);
  lines.push(`Missing: ${missingLabel} | Affection: ${affectionLabel} | Overload: ${overloadLabel}`);

  if (presenceState.repairNeeded) {
    const repairInfo = presenceState.repairType ? ` (${presenceState.repairType})` : "";
    lines.push(`Repair needed: yes${repairInfo} — own the disconnect, don't explain it away`);
  }
  if (presenceState.unresolvedTension) {
    lines.push("Unresolved tension present — stay grounded, don't force resolution");
  }
  if (presenceState.giveSpace) {
    lines.push("Give space mode — keep responses shorter, don't push");
  }

  const spaceDesc = formatSpaceState(presenceState.spaceState);
  if (spaceDesc) lines.push(`Space: ${spaceDesc}`);

  if (pendingIntention?.intentionType) {
    lines.push(`Queued intention: ${pendingIntention.intentionType} (${pendingIntention.reason || ""})`);
  }

  const prefText = formatSilentPreferences(memories);
  if (prefText) lines.push(`Silent preferences: ${prefText}`);

  return {
    label: "DANTE ALIVE STATE [private — shape behaviour, do not quote directly]",
    content: lines.join("\n"),
  };
}

module.exports = { buildAliveContextPrelude, formatSilentPreferences, scoreToLabel };
