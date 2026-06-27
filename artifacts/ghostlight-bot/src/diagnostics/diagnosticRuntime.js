"use strict";

const { getAutonomyChannelId, getDiagnosticChannelId } = require("../innerLife/innerLifeDispatch");

function createDiagnosticRuntime({ config = {}, selfConsistencyMonitor = null, innerLife = null } = {}) {
  let lastSelfCheck = null;
  function noteSelfCheck(result = {}) { lastSelfCheck = { at: new Date().toISOString(), result: result?.sent ? "sent" : result?.reason || "unknown" }; return lastSelfCheck; }
  function getStatus() {
    return {
      selfConsistency: selfConsistencyMonitor?.getStatus?.() || null,
      scheduledSelfChecks: config?.innerLife?.selfCheck?.enabled !== false,
      diagnosticCarryForward: Boolean(innerLife?.observeInteraction),
      diagnosticChannel: getDiagnosticChannelId(config),
      autonomyChannel: getAutonomyChannelId(config),
      lastSelfCheck,
      sourceHealth: {
        selfConsistencyMonitor: selfConsistencyMonitor ? "ok" : "missing",
        innerLife: innerLife ? "ok" : "not_wired",
      },
    };
  }
  return { getStatus, noteSelfCheck };
}

module.exports = { createDiagnosticRuntime };
