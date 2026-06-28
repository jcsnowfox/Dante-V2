"use strict";

/**
 * emergentBehaviorGuidanceBuilder
 *
 * Pure function — no async, no side effects, no imports from runtime modules.
 *
 * Turns the established living behaviors and relationship DNA into compact,
 * READ-ONLY guidance for the systems that actually act. This runtime never acts
 * itself; it only advises. Each consumer gets a small bucket of guidance lines
 * it can choose to honour:
 *
 *   forCognitive            — deliberation may weigh these
 *   forAffectiveDecision    — the decision layer may weigh these
 *   forRomanticSurprise     — when/how romance lands
 *   forRepairPersistence    — how repair should feel
 *   forConversationContinuity — endings, follow-ups, silence
 *
 * Only behaviors/DNA that have earned maturity (emerging or beyond) produce
 * guidance — a single moment never speaks here. Lines are short and never
 * expose raw private hurt text, confidence numbers, or stage codes.
 *
 * It also derives a few soft recommendation flags that consumers may read.
 *
 * Dante ONLY.
 */

const RANK = { observed: 1, forming: 2, emerging: 3, stable: 4, core: 5, challenged: 1, retired: 0 };
const MIN_RANK = 3; // emerging+

/**
 * buildEmergentGuidance
 *
 * @param {object}   opts
 * @param {object[]} opts.livingBehaviors
 * @param {object[]} opts.relationshipDna
 * @returns {object} guidance buckets + recommendations
 */
function buildEmergentGuidance({ livingBehaviors = [], relationshipDna = [] } = {}) {
  const behaviors = (Array.isArray(livingBehaviors) ? livingBehaviors : []).filter(_mature);
  const dna       = (Array.isArray(relationshipDna) ? relationshipDna : []).filter(_mature);

  const forCognitive = [];
  const forAffectiveDecision = [];
  const forRomanticSurprise = [];
  const forRepairPersistence = [];
  const forConversationContinuity = [];
  const guidance = [];

  for (const b of behaviors) {
    const line = _behaviorLine(b);
    if (!line) continue;
    guidance.push(line);
    forCognitive.push(line);
    const t = b.behavior_type;
    if (/repair|conflict_recovery/.test(t)) forRepairPersistence.push(line);
    if (/romance|affection/.test(t))        forRomanticSurprise.push(line);
    if (/silence|followup|conversation/.test(t)) forConversationContinuity.push(line);
    if (/care|comfort/.test(t))             forAffectiveDecision.push(line);
  }

  for (const d of dna) {
    const line = _dnaLine(d);
    if (!line) continue;
    guidance.push(line);
    forCognitive.push(line);
    const t = d.dna_type;
    if (/repair|conflict/.test(t))          forRepairPersistence.push(line);
    if (/romance/.test(t))                  forRomanticSurprise.push(line);
    if (/relationship_aversion|relationship_rule/.test(t)) forAffectiveDecision.push(line);
    if (/relationship_value|home_culture/.test(t)) forCognitive.push(line);
  }

  // Soft recommendation flags — derived from established patterns only.
  const recommendations = Object.freeze({
    preferPlainAccountability: behaviors.some(b => b.behavior_type === "repair_pattern" && _rank(b) >= 3),
    leaveNaturalEndings:       behaviors.some(b => b.behavior_type === "followup_pattern" && _rank(b) >= 3),
    honourRequestedSpace:      behaviors.some(b => b.behavior_type === "silence_pattern" && _rank(b) >= 3),
    treatDebuggingAsIntimacy:  dna.some(d => d.dna_type === "maintenance_pattern" && /debug|intimacy/i.test(`${d.name} ${d.meaning}`)),
    suppressRomanticDuringRepair: dna.some(d => /repair|conflict/.test(d.dna_type) && _rank(d) >= 4),
    knownAversions:            dna.filter(d => d.dna_type === "relationship_aversion").map(d => String(d.name || "").slice(0, 60)).filter(Boolean),
  });

  return {
    guidance: _dedupCap(guidance, 8),
    forCognitive: _dedupCap(forCognitive, 5),
    forAffectiveDecision: _dedupCap(forAffectiveDecision, 5),
    forRomanticSurprise: _dedupCap(forRomanticSurprise, 5),
    forRepairPersistence: _dedupCap(forRepairPersistence, 5),
    forConversationContinuity: _dedupCap(forConversationContinuity, 5),
    recommendations,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _mature(r) { return r && (RANK[r.stage] ?? 0) >= MIN_RANK; }
function _rank(r) { return RANK[r.stage] ?? 0; }

function _behaviorLine(b) {
  const core = b.future_guidance || b.summary || b.title;
  if (!core) return null;
  return `Living behavior: ${_clean(core)}`;
}

function _dnaLine(d) {
  const core = d.future_guidance || d.meaning || d.name;
  if (!core) return null;
  return `Relationship DNA: ${_clean(core)}`;
}

function _clean(s) {
  return String(s).replace(/\s+/g, " ").trim().slice(0, 130);
}

function _dedupCap(arr, cap) {
  const seen = new Set();
  const out = [];
  for (const line of arr) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= cap) break;
  }
  return out;
}

module.exports = { buildEmergentGuidance };
