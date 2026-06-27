"use strict";

function health(value) { return value ? "ok" : "missing"; }

function createRelationshipStateRuntime({ logger = null } = {}) {
  function buildSnapshot({ relationshipContext = null, consequenceContext = null, legacy = {} } = {}) {
    try {
      const suppression = consequenceContext?.suppression || {};
      return {
        weather: relationshipContext?.weather || (relationshipContext?.weatherSummary ? { summary: relationshipContext.weatherSummary } : null),
        consequences: {
          activeCount: consequenceContext?.activeCount || 0,
          lastConsequenceAt: consequenceContext?.lastConsequenceAt || null,
          suppressed: suppression.suppressed || [],
        },
        repair: {
          required: Boolean(suppression.repairRequired),
          started: Boolean(suppression.repairStarted),
          healing: Boolean(suppression.healing),
          attentionBias: suppression.attentionBias || null,
        },
        giveSpace: Boolean(suppression.giveSpace),
        rituals: relationshipContext?.activeRitualsCount || 0,
        traditions: relationshipContext?.traditionsCount || 0,
        milestones: relationshipContext?.upcomingAnniversaries || [],
        promises: legacy.promises || null,
        timelineChapter: relationshipContext?.chapter || "beginning",
        insideJokes: relationshipContext?.insideJokeCount || 0,
        sourceHealth: {
          relationshipContext: health(relationshipContext),
          consequenceContext: health(consequenceContext),
          legacyPromises: legacy.promises ? "ok" : "not_wired",
        },
      };
    } catch (error) {
      logger?.warn?.("[relationship-state-runtime] snapshot failed", { error: error?.message });
      return { weather: null, consequences: { activeCount: 0, suppressed: [] }, repair: { required: false, started: false, healing: false, attentionBias: null }, giveSpace: false, rituals: 0, traditions: 0, milestones: [], promises: null, timelineChapter: "beginning", insideJokes: 0, sourceHealth: { relationshipContext: "degraded", consequenceContext: "degraded" } };
    }
  }
  return { buildSnapshot };
}

module.exports = { createRelationshipStateRuntime };
