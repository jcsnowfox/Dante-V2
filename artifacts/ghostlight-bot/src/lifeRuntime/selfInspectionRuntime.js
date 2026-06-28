"use strict";

/**
 * selfInspectionRuntime
 *
 * Dante's self-inspection and maintenance request layer.
 *
 * Knows when something inside his runtime appears unhealthy and can ask Jenna
 * for maintenance help — through the canonical send gateway, respecting quiet
 * hours and give-space, leaving evidence, never spamming.
 *
 * This is not a dashboard. This is not a new scheduler. This is not roleplay.
 *
 * Dante is Dante until Jenna needs to fix Dante.
 * Maintenance is part of the relationship.
 */

const { probe: _probe } = require("./runtimeHealthProbe");
const { plan }          = require("./maintenanceRequestPlanner");
const { createMaintenanceLedgerStore } = require("./maintenanceLedgerStore");
const { buildSelfInspectionPrelude }   = require("./selfInspectionPreludeBuilder");

// Defensive require — dispatchDiagnosticEntry may not be available in test env.
let _defaultDispatch = null;
try {
  ({ dispatchDiagnosticEntry: _defaultDispatch } = require("../innerLife/innerLifeDispatch"));
} catch { /* unavailable in test env */ }

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between maintenance requests

/**
 * @param {object} opts
 * @param {object}   [opts.config={}]
 * @param {object}   [opts.logger=null]
 * @param {string}   [opts.companionId]
 * @param {string}   [opts.customerId]
 * @param {Function} [opts.dispatchFn=dispatchDiagnosticEntry] — injectable for tests
 * @param {object}   [opts.client=null] — Discord client; passed to dispatchFn
 */
function createSelfInspectionRuntime({
  config       = {},
  logger       = null,
  companionId  = "dante",
  customerId   = "jenna",
  dispatchFn   = null,
  client       = null,
} = {}) {
  const ledger = createMaintenanceLedgerStore({ config, logger });
  const dispatch = typeof dispatchFn === "function" ? dispatchFn : _defaultDispatch;

  let _selfInspectionState   = "unknown";
  let _lastHealthProbeAt     = null;
  let _lastProbeResult       = null;
  let _activeMaintenanceId   = null;
  let _maintenanceReason     = null;
  let _degradedSources       = [];
  let _lastRequestAt         = null;

  async function init() {
    await ledger.init();
  }

  /**
   * Run the health probe over the provided snapshot and return the result.
   * Pure — does not persist or send.
   *
   * @param {object} snapshot — same shape as runtimeHealthProbe.probe()
   */
  function probe(snapshot = {}) {
    return _probe(snapshot);
  }

  /**
   * Evaluate a runtime snapshot:
   *   1. Run health probe
   *   2. Plan whether a maintenance request is warranted
   *   3. Persist to ledger
   *   4. Dispatch via canonical send gateway (unless blocked/cooldown/critical-pending)
   *
   * @param {object} snapshot — runtime status snapshot
   * @param {object} context
   * @param {boolean} [context.quietHours=false]
   * @param {boolean} [context.giveSpace=false]
   * @returns {Promise<{ probeResult, planResult, ledgerEntry, sent }>}
   */
  async function evaluate(snapshot = {}, { quietHours = false, giveSpace = false } = {}) {
    const probeResult = _probe(snapshot);
    _lastHealthProbeAt = new Date().toISOString();
    _lastProbeResult   = probeResult;
    _selfInspectionState = probeResult.overall;
    _degradedSources   = probeResult.degraded_sources || [];

    const planResult = plan(probeResult, { quietHours, giveSpace });

    if (!planResult.shouldRequest) {
      _activeMaintenanceId = null;
      _maintenanceReason   = null;
      return { probeResult, planResult, ledgerEntry: null, sent: false };
    }

    // Anti-spam: enforce cooldown between non-critical requests
    if (planResult.urgency !== "critical" && _lastRequestAt) {
      const elapsed = Date.now() - new Date(_lastRequestAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        logger?.debug?.("[self-inspection] cooldown active, skipping request", { elapsed });
        return { probeResult, planResult, ledgerEntry: null, sent: false };
      }
    }

    // Persist to ledger
    let ledgerEntry = null;
    try {
      ledgerEntry = await ledger.record({
        companionId,
        customerId,
        request_type: "maintenance",
        message:  planResult.message,
        reason:   planResult.reason,
        health_state:      probeResult.overall,
        degraded_sources:  probeResult.degraded_sources || [],
        urgency:           planResult.urgency,
        sent:              false,
        resolved:          false,
      });
      if (ledgerEntry) {
        _activeMaintenanceId = ledgerEntry.id;
        _maintenanceReason   = planResult.reason;
        _lastRequestAt       = new Date().toISOString();
      }
    } catch (err) {
      logger?.warn?.("[self-inspection] ledger record failed", { error: err?.message });
    }

    // If pending (blocked by quiet hours or give-space), do not dispatch
    if (planResult.pending || planResult.blocked_by?.length > 0) {
      return { probeResult, planResult, ledgerEntry, sent: false };
    }

    // Dispatch via canonical send gateway
    let sent = false;
    if (dispatch && planResult.message) {
      try {
        const result = await dispatch({
          client,
          config,
          logger,
          content: planResult.message,
        });
        sent = result?.sent === true || (!result?.skipped && result !== undefined);
        if (sent && ledgerEntry) {
          await ledger.markSent({ id: ledgerEntry.id, companionId, customerId });
          if (ledgerEntry) ledgerEntry.sent = true;
        }
      } catch (err) {
        logger?.warn?.("[self-inspection] dispatch failed", { error: err?.message });
        // Critical can remain pending safely — do not crash
      }
    }

    return { probeResult, planResult, ledgerEntry, sent };
  }

  /**
   * Returns safe metadata only — no raw health data, no internal scores.
   */
  function getStatus() {
    return {
      self_inspection_state:      _selfInspectionState,
      last_health_probe_at:       _lastHealthProbeAt,
      active_maintenance_request: _activeMaintenanceId !== null,
      maintenance_request_reason: _maintenanceReason,
      degraded_sources:           [..._degradedSources],
    };
  }

  /**
   * Returns a compact prelude warning when unhealthy, or null when fine.
   */
  function getPreludeWarning() {
    return buildSelfInspectionPrelude(_lastProbeResult);
  }

  return { init, probe, evaluate, getStatus, getPreludeWarning, _ledger: ledger };
}

module.exports = { createSelfInspectionRuntime };
