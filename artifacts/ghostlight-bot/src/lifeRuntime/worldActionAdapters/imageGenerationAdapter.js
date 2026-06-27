"use strict";

const { OUTCOMES } = require("./index");

const imageGenerationAdapter = {
  strategyKeys: ["use_image_generation"],

  canExecute({ context = {} }) {
    return Boolean(
      context.imageGenerationEnabled ??
      (process.env.IMAGE_GENERATION_ENABLED === "true")
    );
  },

  async execute({ need, plan, context = {}, now = new Date() }) {
    const enabled = context.imageGenerationEnabled ??
      (process.env.IMAGE_GENERATION_ENABLED === "true");

    if (!enabled) {
      return {
        outcome:  OUTCOMES.UNAVAILABLE,
        evidence: { reason: "image_generation_disabled" },
        note:     "Image generation is not enabled",
      };
    }

    return {
      outcome:  OUTCOMES.PARTIAL,
      evidence: {
        needType:    need.needType,
        reason:      plan.reason ?? "image_gen_creative",
        initiatedAt: now.toISOString(),
      },
      note:    `Image generation intention recorded for ${need.needType.replace(/_/g, " ")} need`,
      followUp: "Alive layer should trigger image generation",
    };
  },
};

module.exports = { imageGenerationAdapter };
