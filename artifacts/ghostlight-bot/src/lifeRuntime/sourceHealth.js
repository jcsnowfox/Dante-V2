"use strict";

function createSourceHealthTracker({ now = () => new Date() } = {}) {
  const states = new Map();
  function iso() { return now().toISOString(); }
  function report(runtime, status = "healthy", reason = "ok") {
    const prev = states.get(runtime) || { runtime, status: "unavailable", reason: "not_reported", last_ok_at: null, last_error_at: null };
    const next = { ...prev, runtime, status, reason };
    if (status === "healthy") next.last_ok_at = iso();
    if (status !== "healthy") next.last_error_at = iso();
    states.set(runtime, next);
    return { ...next };
  }
  function healthy(runtime, reason = "ok") { return report(runtime, "healthy", reason); }
  function degraded(runtime, reason = "degraded") { return report(runtime, "degraded", reason); }
  function unavailable(runtime, reason = "unavailable") { return report(runtime, "unavailable", reason); }
  function get(runtime) { return { ...(states.get(runtime) || unavailable(runtime, "not_reported")) }; }
  function snapshot(expected = []) {
    for (const runtime of expected) if (!states.has(runtime)) unavailable(runtime, "not_wired");
    return Object.fromEntries([...states.entries()].map(([k, v]) => [k, { ...v }]));
  }
  return { report, healthy, degraded, unavailable, get, snapshot };
}

const RUNTIME_NAMES = ["alive","innerLife","continuity","growth","curiosity","relationship","consequences","homeostasis","identity","fulfillment","diagnostics","selfConsistency"];
module.exports = { createSourceHealthTracker, RUNTIME_NAMES };
