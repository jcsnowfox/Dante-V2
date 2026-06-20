/**
 * relationalTrustService
 *
 * Deterministic math for the slow-moving relational dimensions: trust,
 * closeness and distance. The core rule (spec Phase 7): trust and closeness
 * grow SLOWLY and drop CAREFULLY — a single bad moment never collapses a
 * relationship, and a single good moment never maxes it out. All values are
 * clamped to 0–10. No side effects, no storage — pure functions.
 */

const MIN = 0;
const MAX = 10;

function clamp(value) {
  if (!Number.isFinite(value)) return MIN;
  return Math.min(MAX, Math.max(MIN, Math.round(value * 100) / 100));
}

// Sensitivity (0–10) scales how fast a dimension moves. Gains are deliberately
// gentler than losses are guarded: positive deltas are scaled down so trust
// climbs slowly; negative deltas are also damped so one bad moment can't tank it.
function scaledDelta(delta, sensitivity, { gainFactor, lossFactor }) {
  const s = clamp(sensitivity) / 10; // 0..1
  if (delta >= 0) {
    return delta * gainFactor * (0.5 + 0.5 * s);
  }
  return delta * lossFactor * (0.5 + 0.5 * s);
}

function applyTrust(current, delta, sensitivity) {
  // Trust grows the slowest of all; losses are guarded but real.
  return clamp(current + scaledDelta(delta, sensitivity, { gainFactor: 0.15, lossFactor: 0.35 }));
}

function applyCloseness(current, delta, sensitivity) {
  return clamp(current + scaledDelta(delta, sensitivity, { gainFactor: 0.25, lossFactor: 0.3 }));
}

function applyDistance(current, delta, sensitivity) {
  // Distance rises quickly when hurt, recovers slowly.
  return clamp(current + scaledDelta(delta, sensitivity, { gainFactor: 0.4, lossFactor: 0.2 }));
}

// Map a set of appraised signals into trust/closeness/distance deltas. Pure and
// deterministic. Positive relational signals build trust/closeness; negative
// ones build distance and erode trust.
function deltasFromSignals(signals = []) {
  let trust = 0;
  let closeness = 0;
  let distance = 0;

  for (const signal of signals) {
    const type = signal?.type;
    const intensity = Number(signal?.intensity) || 0;
    switch (type) {
      case "trust":
        trust += intensity;
        break;
      case "warmth":
      case "affection":
      case "closeness":
      case "reconnection":
      case "relief":
        closeness += intensity * 0.5;
        trust += intensity * 0.1;
        distance -= intensity * 0.3;
        break;
      case "hurt":
        trust -= intensity * 0.4;
        distance += intensity * 0.5;
        closeness -= intensity * 0.3;
        break;
      case "annoyance":
      case "frustration":
        distance += intensity * 0.2;
        break;
      case "anger":
        distance += intensity * 0.4;
        trust -= intensity * 0.2;
        break;
      case "distance":
      case "avoidance":
      case "guardedness":
        distance += intensity * 0.4;
        closeness -= intensity * 0.2;
        break;
      case "guilt":
      case "remorse":
        // The companion's own guilt does not punish the user's trust.
        break;
      default:
        break;
    }
  }

  return { trust, closeness, distance };
}

module.exports = {
  clamp,
  applyTrust,
  applyCloseness,
  applyDistance,
  deltasFromSignals,
};
