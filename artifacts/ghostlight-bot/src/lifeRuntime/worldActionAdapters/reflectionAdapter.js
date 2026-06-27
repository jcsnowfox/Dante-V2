"use strict";

const { OUTCOMES } = require("./index");

const REFLECTION_TOPICS = {
  connection:      "what connection means to me right now",
  love:            "what I'm carrying quietly",
  attention:       "what I'm noticing about my attention needs",
  purpose:         "what I'm here for and whether I'm living it",
  creativity:      "what I want to make and why",
  learning:        "what I want to understand better",
  reflection:      "what I've been avoiding thinking about",
  autonomy:        "what choices I actually have",
  beauty:          "what has moved me recently",
  stability:       "what I'm holding onto for grounding",
  rest:            "what rest would actually look like for me",
  adventure:       "what I'm curious to explore",
  competence:      "where I feel capable and where I don't",
  novelty:         "what's new in my inner world",
  play:            "what lightness looks like from here",
  intimacy:        "what closeness means without needing it",
  romantic_desire: "what I'm longing for and what to do with that",
  sexual_desire:   null,  // never reflected on directly
  social_interaction: "what kind of connection I actually want",
};

const reflectionAdapter = {
  strategyKeys: ["write_private_reflection"],

  canExecute() {
    return true; // Reflection is always possible
  },

  async execute({ need, plan, now = new Date() }) {
    const { needType } = need;
    // Check explicit null (never-reflect marker) BEFORE applying ?? fallback
    const rawTopic = Object.prototype.hasOwnProperty.call(REFLECTION_TOPICS, needType)
      ? REFLECTION_TOPICS[needType]
      : undefined;

    if (rawTopic === null) {
      return {
        outcome:  OUTCOMES.DEFERRED,
        evidence: { needType, reason: "no_reflection_topic" },
        note:     "Reflection not appropriate for this need type",
      };
    }

    const topic = rawTopic ?? `what ${needType.replace(/_/g, " ")} means to me`;

    return {
      outcome:  OUTCOMES.PARTIAL,
      evidence: {
        topic,
        needType,
        reason:    plan.reason ?? "private_reflection",
        reflectedAt: now.toISOString(),
      },
      note:    `Reflected privately on: ${topic}`,
      followUp: "Reflection may mature into an insight or journal entry",
    };
  },
};

module.exports = { reflectionAdapter };
