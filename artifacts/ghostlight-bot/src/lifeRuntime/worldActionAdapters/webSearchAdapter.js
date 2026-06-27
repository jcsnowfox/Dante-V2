"use strict";

const webLearningTool = require("../webLearningTool");
const { OUTCOMES } = require("./index");

const webSearchAdapter = {
  strategyKeys: ["learn_from_web"],

  canExecute({ context = {} }) {
    return Boolean(
      webLearningTool.isEnabled() &&
      (context.webLearningRemainingToday ?? 0) > 0
    );
  },

  async execute({ companionId, customerId, need, plan, context = {}, now = new Date() }) {
    const topic = context.attentionFocus?.focus
      || context.recentInterest?.topic
      || need.needType.replace(/_/g, " ");

    const result = await webLearningTool.search({ query: topic, companionId, customerId }).catch(() => null);

    if (!result) {
      return {
        outcome:  OUTCOMES.UNAVAILABLE,
        evidence: { reason: "web_tool_returned_null", topic },
        note:     `Web search unavailable for: ${topic}`,
      };
    }

    return {
      outcome:  OUTCOMES.SUCCESS,
      evidence: {
        topic,
        resultCount: Array.isArray(result.results) ? result.results.length : 0,
        source:      "brave_search",
        query:       result.query ?? topic,
      },
      note:    `Searched for "${topic}" — found ${Array.isArray(result.results) ? result.results.length : 0} results`,
      followUp: "Review search results and consider adding to resource library",
    };
  },
};

module.exports = { webSearchAdapter };
