const { CLAIM_SOURCES } = require('./claimClassifier');

const PERCEPTION_KINDS = Object.freeze({
  PERSONALLY_PERCEIVED: 'personally_perceived',
  USER_DESCRIBED: 'user_described',
  CONTEXT_INJECTED: 'context_injected',
  IMAGINED: 'imagined',
  INFERRED: 'inferred',
  UNKNOWN: 'unknown',
});

function perceptionKindForSource(source) {
  switch (source) {
    case CLAIM_SOURCES.DIRECT_OBSERVATION:
    case CLAIM_SOURCES.TOOL_RESULT:
      return PERCEPTION_KINDS.PERSONALLY_PERCEIVED;
    case CLAIM_SOURCES.USER_EXPLICITLY_STATED:
      return PERCEPTION_KINDS.USER_DESCRIBED;
    case CLAIM_SOURCES.LONG_TERM_MEMORY:
    case CLAIM_SOURCES.SHORT_TERM_MEMORY:
      return PERCEPTION_KINDS.CONTEXT_INJECTED;
    case CLAIM_SOURCES.HIGH_CONFIDENCE_INFERENCE:
    case CLAIM_SOURCES.LOW_CONFIDENCE_INFERENCE:
      return PERCEPTION_KINDS.INFERRED;
    case CLAIM_SOURCES.IMAGINATION:
    case CLAIM_SOURCES.ROLEPLAY:
      return PERCEPTION_KINDS.IMAGINED;
    default:
      return PERCEPTION_KINDS.UNKNOWN;
  }
}

function enforcePerceptionBoundary(claim) {
  const perceptionKind = perceptionKindForSource(claim.source);
  const personallyPerceived = perceptionKind === PERCEPTION_KINDS.PERSONALLY_PERCEIVED;
  return {
    ...claim,
    perceptionKind,
    personallyPerceived,
    contextIsPerception: false,
    violation: claimsPersonalPerception(claim.text) && !personallyPerceived,
  };
}

function claimsPersonalPerception(text = '') {
  return /\b(i\s+(can\s+)?(see|feel|notice|noticed|watch|watched|hear|heard|sense|sensed)|i['’]ve\s+(noticed|watched|been experiencing|started)|i\s+received)\b/i.test(text);
}

module.exports = { PERCEPTION_KINDS, enforcePerceptionBoundary, claimsPersonalPerception };
