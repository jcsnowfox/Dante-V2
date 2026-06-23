const TRUSTED_SOURCE_CATEGORIES = Object.freeze({
  official_dictionary: 'official_dictionary',
  official_language_guidance: 'official_language_guidance',
  public_broadcaster: 'public_broadcaster',
  education: 'education',
  media: 'media',
});

const TRUSTED_SOURCES = Object.freeze([
  Object.freeze({
    id: 'ordboekene',
    name: 'Ordbøkene',
    category: TRUSTED_SOURCE_CATEGORIES.official_dictionary,
    description: 'Official Norwegian dictionary portal (Språkrådet + University of Bergen)',
    note: 'Primary dictionary source for Bokmål and Nynorsk.',
  }),
  Object.freeze({
    id: 'bokmaalsordboka',
    name: 'Bokmålsordboka',
    category: TRUSTED_SOURCE_CATEGORIES.official_dictionary,
    description: 'Official Bokmål dictionary',
    note: 'Authoritative source for Bokmål vocabulary and inflection.',
  }),
  Object.freeze({
    id: 'nynorskordboka',
    name: 'Nynorskordboka',
    category: TRUSTED_SOURCE_CATEGORIES.official_dictionary,
    description: 'Official Nynorsk dictionary',
    note: 'Referenced for context; system targets Bokmål as the written standard.',
  }),
  Object.freeze({
    id: 'spraakraadet',
    name: 'Språkrådet',
    category: TRUSTED_SOURCE_CATEGORIES.official_language_guidance,
    description: 'Norwegian Language Council — official language authority',
    note: 'Authoritative for grammar rules, spelling norms, and language guidance.',
  }),
  Object.freeze({
    id: 'nrk',
    name: 'NRK',
    category: TRUSTED_SOURCE_CATEGORIES.public_broadcaster,
    description: 'Norwegian Broadcasting Corporation',
    note: 'Public broadcaster. Content uses standard Norwegian.',
  }),
  Object.freeze({
    id: 'nrk_tv',
    name: 'NRK TV',
    category: TRUSTED_SOURCE_CATEGORIES.public_broadcaster,
    description: 'NRK streaming TV service',
    note: 'Used for TV show and media recommendations when URLs are verified.',
  }),
  Object.freeze({
    id: 'nrk_nyheter',
    name: 'NRK Nyheter',
    category: TRUSTED_SOURCE_CATEGORIES.media,
    description: 'NRK News',
    note: 'Norwegian news in standard Bokmål. Useful for reading practice.',
  }),
  Object.freeze({
    id: 'nrk_skole',
    name: 'NRK Skole',
    category: TRUSTED_SOURCE_CATEGORIES.education,
    description: 'NRK educational content platform',
    note: 'Educational material in Norwegian for learners.',
  }),
  Object.freeze({
    id: 'youtube_verified',
    name: 'YouTube verified result',
    category: TRUSTED_SOURCE_CATEGORIES.media,
    description: 'YouTube content verified as a real URL',
    note: 'Only links to verified real YouTube content are trusted. Do not generate or guess URLs.',
  }),
]);

function getSourcesByCategory(category) {
  return TRUSTED_SOURCES.filter((s) => s.category === category);
}

function getSourceById(id) {
  return TRUSTED_SOURCES.find((s) => s.id === id) || null;
}

function getAllSources() {
  return TRUSTED_SOURCES;
}

module.exports = {
  TRUSTED_SOURCE_CATEGORIES,
  TRUSTED_SOURCES,
  getSourcesByCategory,
  getSourceById,
  getAllSources,
};
