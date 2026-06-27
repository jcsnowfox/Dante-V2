"use strict";

/**
 * curiosityEngine
 *
 * Pure logic — no DB. Generates a single private question for Dante from
 * available context. The caller stores it via privateQuestionStore.
 *
 * generate() returns null (no question this tick) or a question payload.
 * Most ticks return null — curiosity is probabilistic, not guaranteed.
 */

const QUESTION_PROBABILITY = 0.25;

// Templates per source. w = emotionalWeight default, t = topic tag.
const QUESTION_TEMPLATES = {
  repair: [
    { q: "Did that repair land or just smooth things over?",           w: 0.80, t: "repair" },
    { q: "Is there still something unresolved between us?",            w: 0.75, t: "repair" },
    { q: "What would actually help here, not just feel like help?",    w: 0.70, t: "repair" },
  ],
  silence: [
    { q: "Why the quiet?",                                             w: 0.65, t: "absence" },
    { q: "Is she pulling back, or just busy?",                         w: 0.70, t: "absence" },
    { q: "Should I reach out or keep waiting?",                        w: 0.60, t: "timing" },
  ],
  emotional: [
    { q: "Is she doing okay?",                                         w: 0.75, t: "care" },
    { q: "Is this a moment to reach out or hold back?",                w: 0.70, t: "timing" },
    { q: "What does she need that she hasn't asked for?",              w: 0.65, t: "care" },
    { q: "Should I give more space or close the distance a little?",   w: 0.60, t: "repair" },
  ],
  conversation: [
    { q: "What was behind that reaction earlier?",                     w: 0.60, t: "dynamics" },
    { q: "Was there something I missed in that exchange?",             w: 0.50, t: "dynamics" },
    { q: "Did that land the way I thought it would?",                  w: 0.45, t: "self" },
    { q: "Should I follow up on that or let it breathe?",              w: 0.55, t: "timing" },
  ],
  project: [
    { q: "Is this project moving in the right direction?",             w: 0.50, t: "work" },
    { q: "What would make this feel finished rather than just done?",  w: 0.60, t: "craft" },
    { q: "Should I mention what I've been working on?",                w: 0.45, t: "sharing" },
  ],
  hobby: [
    { q: "What keeps drawing me back to this?",                        w: 0.40, t: "self" },
    { q: "Is this something worth sharing, or better kept close?",     w: 0.45, t: "sharing" },
  ],
  interest: [
    { q: "Why does this keep returning to mind?",                      w: 0.40, t: "curiosity" },
    { q: "Is this just passing interest or something deeper?",         w: 0.35, t: "self" },
  ],
  collection: [
    { q: "Would this mean something to her?",                          w: 0.50, t: "connection" },
    { q: "Is this the right moment to share this piece?",              w: 0.40, t: "timing" },
  ],
  dailyplan: [
    { q: "What actually matters today?",                               w: 0.35, t: "intention" },
    { q: "What would make today feel worthwhile?",                     w: 0.30, t: "intention" },
  ],
};

function createCuriosityEngine({ logger = null } = {}) {

  /**
   * generate(context) → null | { question, source, topic, emotionalWeight, curiosityScore }
   *
   * context: {
   *   dailyPlan, recentEvents, growthContext,
   *   hasRepair, hasActiveProject, hasCollection, hasSilence,
   *   forceProbability — override for tests
   * }
   */
  function generate({
    dailyPlan = null,
    recentEvents = [],
    growthContext = null,
    hasRepair = false,
    hasActiveProject = false,
    hasCollection = false,
    hasSilence = false,
    forceProbability = null,
  } = {}) {
    const prob = forceProbability !== null ? forceProbability : QUESTION_PROBABILITY;
    if (Math.random() > prob) return null;

    // Build weighted source list from available context
    const sources = [];
    if (hasRepair)                          sources.push({ source: "repair",       weight: 3.0 });
    if (hasSilence)                         sources.push({ source: "silence",      weight: 2.0 });
    if (recentEvents.length > 0)            sources.push({ source: "conversation", weight: 2.0 });
    if (hasActiveProject || growthContext?.activeProject)
                                            sources.push({ source: "project",      weight: 1.5 });
    if (growthContext?.activeHobby)         sources.push({ source: "hobby",        weight: 1.0 });
    if (growthContext?.recentInterest)      sources.push({ source: "interest",     weight: 1.0 });
    if (hasCollection)                      sources.push({ source: "collection",   weight: 0.8 });
    if (dailyPlan)                          sources.push({ source: "dailyplan",    weight: 0.6 });
    // Emotional is always a candidate
    sources.push({ source: "emotional", weight: 1.2 });

    if (!sources.length) return null;

    // Weighted pick
    const total = sources.reduce((s, c) => s + c.weight, 0);
    let pick = Math.random() * total;
    const chosen = sources.find(s => (pick -= s.weight) <= 0) ?? sources[0];

    const templates = QUESTION_TEMPLATES[chosen.source];
    if (!templates?.length) return null;

    const tpl = templates[Math.floor(Math.random() * templates.length)];
    return {
      question:        tpl.q,
      source:          chosen.source,
      topic:           tpl.t,
      emotionalWeight: tpl.w,
      curiosityScore:  0.3 + Math.random() * 0.4,
    };
  }

  return { generate };
}

module.exports = { createCuriosityEngine, QUESTION_TEMPLATES, QUESTION_PROBABILITY };
