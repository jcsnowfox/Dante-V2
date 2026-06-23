const NORWEGIAN_LEVELS = Object.freeze(['beginner', 'A1', 'A2', 'B1', 'B2']);
const NORWEGIAN_WRITTEN_STANDARDS = Object.freeze(['bokmal']);
const NORWEGIAN_SPOKEN_TARGETS = Object.freeze(['oslo_standard_eastern']);
const NORWEGIAN_CORRECTION_STYLES = Object.freeze(['gentle', 'direct', 'strict']);
const NORWEGIAN_DAILY_LESSON_LENGTHS = Object.freeze([3, 5, 10]);

const DEFAULT_NORWEGIAN_SETTINGS = Object.freeze({
  enabled: false,
  level: 'A1',
  writtenStandard: 'bokmal',
  spokenTarget: 'oslo_standard_eastern',
  correctionStyle: 'gentle',
  dailyLessonLengthMinutes: 5,
  mediaRecommendationsEnabled: false,
  newsRecommendationsEnabled: false,
  youtubeRecommendationsEnabled: false,
  tvRecommendationsEnabled: false,
  voicePracticeEnabled: false,
  requireSourceCheck: true,
  allowUnverifiedPracticeHelp: false,
});

function validateNorwegianSettings(settings) {
  const errors = [];
  const s = settings || {};

  if (typeof s.enabled !== 'boolean') errors.push('enabled must be a boolean');
  if (!NORWEGIAN_LEVELS.includes(s.level)) errors.push(`level must be one of: ${NORWEGIAN_LEVELS.join(', ')}`);
  if (!NORWEGIAN_WRITTEN_STANDARDS.includes(s.writtenStandard)) errors.push(`writtenStandard must be one of: ${NORWEGIAN_WRITTEN_STANDARDS.join(', ')}`);
  if (!NORWEGIAN_SPOKEN_TARGETS.includes(s.spokenTarget)) errors.push(`spokenTarget must be one of: ${NORWEGIAN_SPOKEN_TARGETS.join(', ')}`);
  if (!NORWEGIAN_CORRECTION_STYLES.includes(s.correctionStyle)) errors.push(`correctionStyle must be one of: ${NORWEGIAN_CORRECTION_STYLES.join(', ')}`);
  if (!NORWEGIAN_DAILY_LESSON_LENGTHS.includes(s.dailyLessonLengthMinutes)) errors.push(`dailyLessonLengthMinutes must be one of: ${NORWEGIAN_DAILY_LESSON_LENGTHS.join(', ')}`);
  if (typeof s.requireSourceCheck !== 'boolean') errors.push('requireSourceCheck must be a boolean');
  if (typeof s.allowUnverifiedPracticeHelp !== 'boolean') errors.push('allowUnverifiedPracticeHelp must be a boolean');

  if (errors.length > 0) {
    throw new Error(`[norwegian] Invalid settings: ${errors.join('; ')}`);
  }

  return true;
}

function normalizeNorwegianSettings(input) {
  const base = { ...DEFAULT_NORWEGIAN_SETTINGS };
  const raw = input || {};

  if (typeof raw.enabled === 'boolean') base.enabled = raw.enabled;
  if (NORWEGIAN_LEVELS.includes(raw.level)) base.level = raw.level;
  if (NORWEGIAN_WRITTEN_STANDARDS.includes(raw.writtenStandard)) base.writtenStandard = raw.writtenStandard;
  if (NORWEGIAN_SPOKEN_TARGETS.includes(raw.spokenTarget)) base.spokenTarget = raw.spokenTarget;
  if (NORWEGIAN_CORRECTION_STYLES.includes(raw.correctionStyle)) base.correctionStyle = raw.correctionStyle;
  if (NORWEGIAN_DAILY_LESSON_LENGTHS.includes(raw.dailyLessonLengthMinutes)) base.dailyLessonLengthMinutes = raw.dailyLessonLengthMinutes;
  if (typeof raw.mediaRecommendationsEnabled === 'boolean') base.mediaRecommendationsEnabled = raw.mediaRecommendationsEnabled;
  if (typeof raw.newsRecommendationsEnabled === 'boolean') base.newsRecommendationsEnabled = raw.newsRecommendationsEnabled;
  if (typeof raw.youtubeRecommendationsEnabled === 'boolean') base.youtubeRecommendationsEnabled = raw.youtubeRecommendationsEnabled;
  if (typeof raw.tvRecommendationsEnabled === 'boolean') base.tvRecommendationsEnabled = raw.tvRecommendationsEnabled;
  if (typeof raw.voicePracticeEnabled === 'boolean') base.voicePracticeEnabled = raw.voicePracticeEnabled;
  if (typeof raw.requireSourceCheck === 'boolean') base.requireSourceCheck = raw.requireSourceCheck;
  if (typeof raw.allowUnverifiedPracticeHelp === 'boolean') base.allowUnverifiedPracticeHelp = raw.allowUnverifiedPracticeHelp;

  return base;
}

module.exports = {
  NORWEGIAN_LEVELS,
  NORWEGIAN_WRITTEN_STANDARDS,
  NORWEGIAN_SPOKEN_TARGETS,
  NORWEGIAN_CORRECTION_STYLES,
  NORWEGIAN_DAILY_LESSON_LENGTHS,
  DEFAULT_NORWEGIAN_SETTINGS,
  validateNorwegianSettings,
  normalizeNorwegianSettings,
};
