const { SOURCE_STATUS } = require('./norwegianSourceStatus');

const POLICY = Object.freeze({
  vocabulary: Object.freeze({
    allowedStatuses: Object.freeze([SOURCE_STATUS.verified, SOURCE_STATUS.unverified_practice]),
    requiredForFactClaim: SOURCE_STATUS.verified,
    rule: 'Vocabulary and inflection must be verified or labelled unverified_practice.',
  }),
  grammar: Object.freeze({
    allowedStatuses: Object.freeze([
      SOURCE_STATUS.verified,
      SOURCE_STATUS.partial,
      SOURCE_STATUS.unverified_practice,
    ]),
    requiredForFactClaim: SOURCE_STATUS.verified,
    rule: 'Grammar explanations must be verified, partial, or labelled unverified_practice.',
  }),
  pronunciation: Object.freeze({
    allowedStatuses: Object.freeze([
      SOURCE_STATUS.verified,
      SOURCE_STATUS.stt_based_practice,
      SOURCE_STATUS.low_confidence,
      SOURCE_STATUS.unverified_practice,
    ]),
    sttPracticeStatus: SOURCE_STATUS.stt_based_practice,
    lowConfidenceStatus: SOURCE_STATUS.low_confidence,
    rule: 'Pronunciation feedback based only on STT must be stt_based_practice. Low STT confidence must be low_confidence.',
  }),
  mediaLinks: Object.freeze({
    allowedStatuses: Object.freeze([SOURCE_STATUS.verified]),
    rule: 'Media links must be verified real URLs or not returned.',
  }),
  dialectClaims: Object.freeze({
    allowedStatuses: Object.freeze([SOURCE_STATUS.verified, SOURCE_STATUS.partial]),
    rule: 'Dialect and accent claims must be verified or partial. Do not claim a dialect is the only correct Norwegian.',
    writtenStandard: 'bokmal',
    spokenTarget: 'oslo_standard_eastern',
    note: 'Bokmål is the written standard. Oslo-region / Standard Eastern Norwegian is the spoken target. These are practical choices, not claims of universal correctness.',
  }),
  sourceConflict: Object.freeze({
    rule: 'If source and LLM disagree, source wins.',
    resolution: 'source_wins',
  }),
  uncertainty: Object.freeze({
    rule: 'If not verified, Dante must say he needs to verify or label the help as unverified practice.',
    requiredLabel: SOURCE_STATUS.unverified_practice,
  }),
  subtitleAvailability: Object.freeze({
    allowedStatuses: Object.freeze([SOURCE_STATUS.verified]),
    rule: 'Subtitle availability must not be claimed unless verified.',
  }),
});

function getPolicy() {
  return POLICY;
}

function checkVocabularyAllowed(status) {
  return POLICY.vocabulary.allowedStatuses.includes(status);
}

function checkGrammarAllowed(status) {
  return POLICY.grammar.allowedStatuses.includes(status);
}

function checkPronunciationAllowed(status) {
  return POLICY.pronunciation.allowedStatuses.includes(status);
}

function checkMediaLinkAllowed(status) {
  return POLICY.mediaLinks.allowedStatuses.includes(status);
}

function resolveConflict() {
  return POLICY.sourceConflict.resolution;
}

console.log('[norwegian] source policy loaded');

module.exports = {
  POLICY,
  getPolicy,
  checkVocabularyAllowed,
  checkGrammarAllowed,
  checkPronunciationAllowed,
  checkMediaLinkAllowed,
  resolveConflict,
};
