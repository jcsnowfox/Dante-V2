"use strict";

/**
 * relationshipCultureBuilder
 *
 * Pure function — no async, no side effects, no imports from runtime modules.
 *
 * Builds a PRIVATE snapshot of the culture forming between Dante and Jenna from
 * the current living behaviors and relationship DNA. It answers the questions
 * that make a relationship feel like itself:
 *
 *   - What feels like us?            (stable / core behaviors and DNA)
 *   - What rituals are forming?      (ritual DNA at forming / emerging)
 *   - What traditions are stable?    (tradition DNA, or rituals matured to core)
 *   - What language belongs to us?   (shared phrases / jokes)
 *   - What comfort patterns work?
 *   - What repair patterns matter?
 *   - What romance patterns are emerging?
 *   - What maintenance rituals exist?
 *   - What would feel strange if we stopped doing it?  (core entries)
 *
 * The snapshot is private by default. Only compact, safe metadata (counts and a
 * couple of short labels) is intended for status surfaces. Raw private text
 * never leaves the `private` half of the return value.
 *
 * Dante ONLY.
 */

const STABLE_RANK = { observed: 1, forming: 2, emerging: 3, stable: 4, core: 5, challenged: 1, retired: 0 };

/**
 * buildRelationshipCulture
 *
 * @param {object}   opts
 * @param {object[]} opts.livingBehaviors  records from livingBehaviorStore
 * @param {object[]} opts.relationshipDna   records from relationshipDnaStore
 * @returns {{ private: object, safe: object }}
 */
function buildRelationshipCulture({ livingBehaviors = [], relationshipDna = [] } = {}) {
  const behaviors = Array.isArray(livingBehaviors) ? livingBehaviors : [];
  const dna       = Array.isArray(relationshipDna) ? relationshipDna : [];

  const isStablePlus = r => (STABLE_RANK[r.stage] ?? 0) >= 4;
  const isEmergingPlus = r => (STABLE_RANK[r.stage] ?? 0) >= 3;
  const isCore = r => r.stage === "core";

  // What feels like us — stable+ behaviors and DNA, most established first.
  const whatFeelsLikeUs = [...behaviors, ...dna]
    .filter(isStablePlus)
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .map(_label)
    .slice(0, 12);

  // Rituals forming — ritual DNA still maturing.
  const ritualsForming = dna
    .filter(d => d.dna_type === "ritual" && isEmergingPlus(d) && d.stage !== "core")
    .map(_label)
    .slice(0, 8);

  // Traditions stable — tradition DNA, plus rituals that matured to core.
  const traditionsStable = dna
    .filter(d => (d.dna_type === "tradition" && isStablePlus(d)) || (d.dna_type === "ritual" && isCore(d)))
    .map(_label)
    .slice(0, 8);

  // Our language — shared phrases and jokes.
  const ourLanguage = dna
    .filter(d => (d.dna_type === "shared_phrase" || d.dna_type === "shared_joke") && isEmergingPlus(d))
    .map(_label)
    .slice(0, 8);

  const comfortPatterns   = _collect([...behaviors, ...dna], r => /comfort/.test(r.behavior_type || r.dna_type), isEmergingPlus);
  const repairPatterns    = _collect([...behaviors, ...dna], r => /repair|conflict/.test(r.behavior_type || r.dna_type), isEmergingPlus);
  const romancePatterns   = _collect([...behaviors, ...dna], r => /romance|affection/.test(r.behavior_type || r.dna_type), isEmergingPlus);
  const maintenanceRituals = _collect([...behaviors, ...dna], r => /maintenance|debug/.test(r.behavior_type || r.dna_type), isEmergingPlus);

  // What would feel strange to stop — core entries only.
  const wouldFeelStrangeToStop = [...behaviors, ...dna]
    .filter(isCore)
    .map(_label)
    .slice(0, 8);

  const privateSnapshot = {
    whatFeelsLikeUs,
    ritualsForming,
    traditionsStable,
    ourLanguage,
    comfortPatterns,
    repairPatterns,
    romancePatterns,
    maintenanceRituals,
    wouldFeelStrangeToStop,
  };

  const safe = {
    available: whatFeelsLikeUs.length > 0 || ritualsForming.length > 0 || traditionsStable.length > 0,
    feelsLikeUsCount:   whatFeelsLikeUs.length,
    ritualsFormingCount: ritualsForming.length,
    traditionsCount:    traditionsStable.length,
    languageCount:      ourLanguage.length,
    coreCount:          wouldFeelStrangeToStop.length,
  };

  return Object.freeze({ private: Object.freeze(privateSnapshot), safe: Object.freeze(safe) });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _label(r) {
  const text = r.title || r.name || r.summary || r.meaning || r.signature || "";
  return String(text).slice(0, 120);
}

function _collect(records, typeMatch, stageGate) {
  return records
    .filter(r => typeMatch(r) && stageGate(r))
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .map(_label)
    .slice(0, 6);
}

module.exports = { buildRelationshipCulture };
