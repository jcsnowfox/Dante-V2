"use strict";

/**
 * worldActionAdapters/index.js
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Registry of all world-action adapters. Each adapter wraps a real runtime
 * tool and returns a standardised four-outcome result:
 *   SUCCESS    — a real action occurred
 *   PARTIAL    — some progress occurred
 *   DEFERRED   — action should happen later
 *   UNAVAILABLE — action could not happen
 *
 * No adapter may fabricate SUCCESS.
 */

const OUTCOMES = Object.freeze({
  SUCCESS:     "SUCCESS",
  PARTIAL:     "PARTIAL",
  DEFERRED:    "DEFERRED",
  UNAVAILABLE: "UNAVAILABLE",
});

/**
 * Adapter interface (each adapter must implement both methods):
 *
 *   canExecute({ context }) → boolean
 *   execute({ companionId, customerId, need, plan, context, now }) → Promise<AdapterResult>
 *
 * AdapterResult = { outcome, evidence, note, followUp? }
 */

function createAdapterRegistry(adapters = []) {
  const _byStrategy = new Map();
  for (const adapter of adapters) {
    for (const key of (adapter.strategyKeys || [])) {
      _byStrategy.set(key, adapter);
    }
  }

  function getAdapter(strategyKey) {
    return _byStrategy.get(strategyKey) ?? null;
  }

  function listAdapters() {
    return adapters.map(a => ({ strategyKeys: a.strategyKeys }));
  }

  return { getAdapter, listAdapters, OUTCOMES };
}

module.exports = { createAdapterRegistry, OUTCOMES };
