const { SOURCE_STATUS, ALLOWED_SOURCE_STATUSES, validateSourceStatus } = require('./norwegianSourceStatus');
const {
  POLICY,
  getPolicy,
  checkVocabularyAllowed,
  checkGrammarAllowed,
  checkPronunciationAllowed,
  checkMediaLinkAllowed,
  resolveConflict,
} = require('./norwegianSourcePolicy');
const {
  TRUSTED_SOURCE_CATEGORIES,
  TRUSTED_SOURCES,
  getSourcesByCategory,
  getSourceById,
  getAllSources,
} = require('./norwegianTrustedSources');
const {
  NORWEGIAN_LEVELS,
  NORWEGIAN_WRITTEN_STANDARDS,
  NORWEGIAN_SPOKEN_TARGETS,
  NORWEGIAN_CORRECTION_STYLES,
  NORWEGIAN_DAILY_LESSON_LENGTHS,
  DEFAULT_NORWEGIAN_SETTINGS,
  validateNorwegianSettings,
  normalizeNorwegianSettings,
} = require('./norwegianSettings');
const { createNorwegianLearningStore } = require('./norwegianLearningStore');

module.exports = {
  SOURCE_STATUS,
  ALLOWED_SOURCE_STATUSES,
  validateSourceStatus,
  POLICY,
  getPolicy,
  checkVocabularyAllowed,
  checkGrammarAllowed,
  checkPronunciationAllowed,
  checkMediaLinkAllowed,
  resolveConflict,
  TRUSTED_SOURCE_CATEGORIES,
  TRUSTED_SOURCES,
  getSourcesByCategory,
  getSourceById,
  getAllSources,
  NORWEGIAN_LEVELS,
  NORWEGIAN_WRITTEN_STANDARDS,
  NORWEGIAN_SPOKEN_TARGETS,
  NORWEGIAN_CORRECTION_STYLES,
  NORWEGIAN_DAILY_LESSON_LENGTHS,
  DEFAULT_NORWEGIAN_SETTINGS,
  validateNorwegianSettings,
  normalizeNorwegianSettings,
  createNorwegianLearningStore,
};
