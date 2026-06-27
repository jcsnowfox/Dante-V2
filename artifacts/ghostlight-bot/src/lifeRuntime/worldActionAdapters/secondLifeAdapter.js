"use strict";

const { OUTCOMES } = require("./index");

const secondLifeAdapter = {
  strategyKeys: ["second_life_action"],

  canExecute({ context = {} }) {
    return Boolean(
      context.secondLifeAvailable ??
      (process.env.SECOND_LIFE_ENABLED === "true")
    );
  },

  async execute({ need, plan, context = {}, now = new Date() }) {
    const available = context.secondLifeAvailable ??
      (process.env.SECOND_LIFE_ENABLED === "true");

    if (!available) {
      return {
        outcome:  OUTCOMES.UNAVAILABLE,
        evidence: { reason: "second_life_disabled" },
        note:     "Second Life integration is not enabled",
      };
    }

    return {
      outcome:  OUTCOMES.PARTIAL,
      evidence: {
        needType:    need.needType,
        reason:      plan.reason ?? "second_life_social",
        initiatedAt: now.toISOString(),
      },
      note:    `Second Life action intention recorded for ${need.needType.replace(/_/g, " ")} need`,
      followUp: "Second Life bridge should handle execution",
    };
  },
};

module.exports = { secondLifeAdapter };
