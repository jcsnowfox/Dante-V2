const CLAIM_SOURCES = Object.freeze({
  DIRECT_OBSERVATION: 'DIRECT_OBSERVATION',
  RUNTIME_STATE: 'RUNTIME_STATE',
  TOOL_RESULT: 'TOOL_RESULT',
  USER_EXPLICITLY_STATED: 'USER_EXPLICITLY_STATED',
  LONG_TERM_MEMORY: 'LONG_TERM_MEMORY',
  SHORT_TERM_MEMORY: 'SHORT_TERM_MEMORY',
  VERIFIED_DATABASE: 'VERIFIED_DATABASE',
  HIGH_CONFIDENCE_INFERENCE: 'HIGH_CONFIDENCE_INFERENCE',
  LOW_CONFIDENCE_INFERENCE: 'LOW_CONFIDENCE_INFERENCE',
  IMAGINATION: 'IMAGINATION',
  ROLEPLAY: 'ROLEPLAY',
  UNKNOWN: 'UNKNOWN',
});

const FACT_SOURCES = new Set([
  CLAIM_SOURCES.DIRECT_OBSERVATION,
  CLAIM_SOURCES.RUNTIME_STATE,
  CLAIM_SOURCES.TOOL_RESULT,
  CLAIM_SOURCES.USER_EXPLICITLY_STATED,
  CLAIM_SOURCES.VERIFIED_DATABASE,
]);

const MEMORY_SOURCES = new Set([
  CLAIM_SOURCES.LONG_TERM_MEMORY,
  CLAIM_SOURCES.SHORT_TERM_MEMORY,
]);

function normalizeSource(source) {
  return Object.prototype.hasOwnProperty.call(CLAIM_SOURCES, source) ? source : CLAIM_SOURCES.UNKNOWN;
}

function classifyClaim(claim = {}) {
  const source = normalizeSource(claim.source);
  return {
    id: claim.id || `claim_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    text: String(claim.text || '').trim(),
    source,
    evidence: claim.evidence || null,
    confidence: typeof claim.confidence === 'number' ? Math.max(0, Math.min(1, claim.confidence)) : defaultConfidence(source),
    mayStateAsFact: canStateAsFact(source, claim.evidence),
    presentation: presentationForSource(source, claim.evidence),
  };
}

function classifyClaims(claims = []) {
  return claims.map(classifyClaim);
}

function defaultConfidence(source) {
  if (FACT_SOURCES.has(source)) return 0.95;
  if (MEMORY_SOURCES.has(source)) return 0.8;
  if (source === CLAIM_SOURCES.HIGH_CONFIDENCE_INFERENCE) return 0.7;
  if (source === CLAIM_SOURCES.LOW_CONFIDENCE_INFERENCE) return 0.35;
  if (source === CLAIM_SOURCES.UNKNOWN) return 0;
  return 0.2;
}

function canStateAsFact(source, evidence) {
  if (source === CLAIM_SOURCES.RUNTIME_STATE) return Boolean(evidence && evidence.kind === 'runtime_state');
  if (MEMORY_SOURCES.has(source)) return Boolean(evidence && evidence.kind === 'memory');
  return FACT_SOURCES.has(source);
}

function presentationForSource(source, evidence) {
  if (canStateAsFact(source, evidence)) return 'fact';
  if (MEMORY_SOURCES.has(source)) return 'referenced_memory_only';
  if (source === CLAIM_SOURCES.HIGH_CONFIDENCE_INFERENCE) return 'possibility';
  if (source === CLAIM_SOURCES.LOW_CONFIDENCE_INFERENCE) return 'uncertainty';
  if (source === CLAIM_SOURCES.UNKNOWN) return 'must_remain_unknown';
  return 'do_not_present_as_observation';
}

module.exports = { CLAIM_SOURCES, classifyClaim, classifyClaims, canStateAsFact };
