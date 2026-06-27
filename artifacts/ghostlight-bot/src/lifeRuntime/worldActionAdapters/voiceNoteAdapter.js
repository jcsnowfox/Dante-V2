"use strict";

const { OUTCOMES } = require("./index");

const voiceNoteAdapter = {
  strategyKeys: ["use_voice_note"],

  canExecute({ context = {} }) {
    return Boolean(
      context.voiceNoteEnabled ??
      (process.env.AUDIO_GENERATION_ENABLED === "true")
    );
  },

  async execute({ need, plan, context = {}, now = new Date() }) {
    const enabled = context.voiceNoteEnabled ??
      (process.env.AUDIO_GENERATION_ENABLED === "true");

    if (!enabled) {
      return {
        outcome:  OUTCOMES.UNAVAILABLE,
        evidence: { reason: "audio_generation_disabled" },
        note:     "Voice note generation is not enabled",
      };
    }

    return {
      outcome:  OUTCOMES.PARTIAL,
      evidence: {
        needType:    need.needType,
        reason:      plan.reason ?? "voice_note_connection",
        initiatedAt: now.toISOString(),
      },
      note:    `Voice note intention recorded for ${need.needType.replace(/_/g, " ")} need`,
      followUp: "Alive layer should generate and queue the voice note",
    };
  },
};

module.exports = { voiceNoteAdapter };
