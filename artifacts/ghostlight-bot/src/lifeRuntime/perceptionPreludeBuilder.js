"use strict";

/**
 * perceptionPreludeBuilder
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Builds a compact prelude signal (≤200 chars) from the current world state.
 * Injected before every LLM request so Dante knows who is available, what the
 * relationship state is, and what is uncertain — without dumping raw data.
 *
 * Label: Perception: <signal>
 * The [internal] label is applied by lifePreludeBuilder, not here.
 */

const { AVAILABILITY } = require("./presenceInterpreter");

const MAX_SIGNAL_LENGTH = 200;

// Build a single compact perception line from perceptionContext
function buildPerceptionSignal(perceptionContext = null) {
  if (!perceptionContext) return null;

  const { worldState, uncertainty = [] } = perceptionContext;
  if (!worldState) return null;

  const { jenna, dante, environment } = worldState;
  const parts = [];

  // ─── Jenna availability ──────────────────────────────────────────────────────
  if (jenna?.availability && jenna.availability !== AVAILABILITY.UNKNOWN) {
    const conf = Math.round((jenna._confidence || 0) * 100);
    if (jenna.availability === AVAILABILITY.GIVE_SPACE) {
      parts.push("Jenna: space requested");
    } else if (jenna.availability === AVAILABILITY.ASLEEP) {
      parts.push("Jenna: likely asleep");
    } else if (jenna.availability === AVAILABILITY.UNAVAILABLE) {
      parts.push("Jenna: offline");
    } else if (jenna.availability === AVAILABILITY.BUSY && conf >= 55) {
      parts.push(`Jenna: likely busy (${conf}%)`);
    } else if (jenna.availability === AVAILABILITY.LIKELY_BUSY && conf >= 45) {
      parts.push(`Jenna: might be busy`);
    } else if (jenna.availability === AVAILABILITY.AVAILABLE && conf >= 60) {
      parts.push("Jenna: available");
    }
  }

  // ─── Repair state ────────────────────────────────────────────────────────────
  if (jenna?.repair_state && jenna.repair_state !== "none") {
    if (jenna.repair_state === "needed") {
      parts.push("repair: needed");
    } else if (jenna.repair_state === "started") {
      parts.push("repair: started");
    } else if (jenna.repair_state === "healing") {
      parts.push("repair: healing");
    }
    // give_space already covered in availability block
  }

  // ─── Runtime health ──────────────────────────────────────────────────────────
  if (dante?.runtime_health === "degraded") {
    const src = dante.degraded_sources?.[0];
    parts.push(`runtime: degraded${src ? " (" + src + ")" : ""}`);
  }

  // ─── Environment ─────────────────────────────────────────────────────────────
  if (environment?.quiet_hours) {
    parts.push("quiet hours");
  }

  // ─── Primary uncertainty — only when nothing else was surfaced ────────────────
  if (!parts.length && uncertainty.length > 0) {
    const first = uncertainty[0];
    if (first && first.length <= 100) parts.push(first);
  }

  if (!parts.length) return null;

  const signal = "Perception: " + parts.join("; ");
  return signal.length <= MAX_SIGNAL_LENGTH
    ? signal
    : signal.slice(0, MAX_SIGNAL_LENGTH);
}

// Alias for callers that use the "prelude" naming convention
function buildPerceptionPrelude(perceptionContext = null) {
  return buildPerceptionSignal(perceptionContext);
}

module.exports = { buildPerceptionSignal, buildPerceptionPrelude };
