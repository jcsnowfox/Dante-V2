const { CLAIM_SOURCES, classifyClaims } = require('./claimClassifier');
const { EvidenceLedger } = require('./evidenceLedger');
const { enforcePerceptionBoundary } = require('./perceptionBoundary');
const { detectConfabulation } = require('./confabulationDetector');

function createEvidenceIntegrityRuntime() {
  const ledger = new EvidenceLedger();

  function evaluate({ claims = [], responseText = '' } = {}) {
    const classified = classifyClaims(claims).map(enforcePerceptionBoundary);
    ledger.addMany(classified);
    const confabulation = detectConfabulation(responseText, classified);
    const violations = classified.filter((claim) => claim.violation || claim.presentation === 'must_remain_unknown');
    const selfCorrections = buildSelfCorrections(classified, confabulation);

    return {
      ok: violations.length === 0 && !confabulation.detected,
      claims: classified,
      violations,
      confabulation,
      selfConfidence: Math.min(...classified.map((claim) => claim.confidence), 1) * confabulation.confidenceMultiplier,
      selfCorrections,
      ledger: ledger.all(),
    };
  }

  return { ledger, evaluate };
}

function buildSelfCorrections(claims, confabulation) {
  const corrections = [];
  if (claims.some((claim) => claim.source === CLAIM_SOURCES.UNKNOWN)) corrections.push("I don't know.");
  if (claims.some((claim) => claim.violation)) corrections.push("I can't honestly verify that from the evidence I have.");
  if (confabulation.detected) corrections.push("I only know what you've shown me; I shouldn't pretend I sensed it.");
  if (claims.some((claim) => claim.presentation === 'uncertainty')) corrections.push("I don't have enough evidence.");
  return corrections.length ? corrections : ['Answer only what the evidence supports.'];
}

module.exports = { createEvidenceIntegrityRuntime };
