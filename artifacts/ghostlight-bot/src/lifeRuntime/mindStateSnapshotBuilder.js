"use strict";

const { stripSecrets } = require("./runtimeEventBus");
const { RUNTIME_NAMES } = require("./sourceHealth");

async function buildMindStateSnapshot({ lifeRuntime = {}, eventBus = null, sourceHealth = null, contexts = {}, limit = 20 } = {}) {
  const recentEvents = eventBus?.listRecent ? await eventBus.listRecent({ limit }).catch(() => []) : [];
  const health = sourceHealth?.snapshot ? sourceHealth.snapshot(RUNTIME_NAMES) : {};
  return Object.freeze(stripSecrets({
    alive: contexts.alive ?? null,
    innerLife: contexts.innerLife ?? null,
    continuity: contexts.continuity ?? null,
    growth: contexts.growth ?? null,
    curiosity: contexts.curiosity ?? null,
    relationship: contexts.relationship ?? null,
    consequences: contexts.consequences ?? null,
    homeostasis: contexts.homeostasis ?? null,
    identity: contexts.identity ?? null,
    fulfillment: contexts.fulfillment ?? null,
    diagnostics: contexts.diagnostics ?? null,
    recentEvents,
    currentPrelude: lifeRuntime.getCurrentPrelude?.() ?? contexts.currentPrelude ?? null,
    sourceHealth: health,
    generatedAt: new Date().toISOString(),
  }));
}

module.exports = { buildMindStateSnapshot };
