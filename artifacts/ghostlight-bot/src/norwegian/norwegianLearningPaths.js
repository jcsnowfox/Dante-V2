// Norwegian Learning Paths - Lightweight structural guidance
// Metadata only, no giant curriculum

const LEARNING_PATHS = [
  {
    id: 'survival_norwegian',
    title: 'Survival Norwegian',
    description: 'Essential phrases for basic communication',
    levelRange: 'A1',
    skillAreas: ['vocabulary', 'pronunciation', 'speaking_confidence'],
    taskTypes: ['phrase', 'vocabulary', 'pronunciation'],
    suggestedTopics: ['greetings', 'basic_needs', 'thanks', 'help'],
  },
  {
    id: 'everyday_home',
    title: 'Everyday Home Norwegian',
    description: 'Daily life at home, family, routines',
    levelRange: 'A1-A2',
    skillAreas: ['vocabulary', 'grammar', 'listening', 'sentence_building'],
    taskTypes: ['vocabulary', 'correction', 'media_listening', 'phrase'],
    suggestedTopics: ['family', 'home', 'routines', 'daily_activities'],
  },
  {
    id: 'food_shopping',
    title: 'Food and Shopping',
    description: 'Markets, restaurants, food vocabulary',
    levelRange: 'A1-A2',
    skillAreas: ['vocabulary', 'word_order', 'listening', 'reading'],
    taskTypes: ['vocabulary', 'media_listening', 'media_reading', 'phrase'],
    suggestedTopics: ['food', 'shopping', 'restaurants', 'numbers'],
  },
  {
    id: 'feelings_relationships',
    title: 'Feelings and Relationships',
    description: 'Emotions, relationships, social communication',
    levelRange: 'A2-B1',
    skillAreas: ['vocabulary', 'grammar', 'sentence_building', 'speaking_confidence'],
    taskTypes: ['vocabulary', 'correction', 'sentence_fix', 'free_response'],
    suggestedTopics: ['emotions', 'relationships', 'opinions', 'expressions'],
  },
  {
    id: 'travel_directions',
    title: 'Travel and Directions',
    description: 'Getting around, asking for help, transportation',
    levelRange: 'A2-B1',
    skillAreas: ['vocabulary', 'prepositions', 'listening', 'pronunciation'],
    taskTypes: ['vocabulary', 'media_listening', 'phrase', 'pronunciation'],
    suggestedTopics: ['transportation', 'directions', 'places', 'locations'],
  },
  {
    id: 'media_listening',
    title: 'Media Listening',
    description: 'News, podcasts, and authentic Norwegian content',
    levelRange: 'A2-B2',
    skillAreas: ['listening', 'vocabulary', 'media_comprehension', 'reading'],
    taskTypes: ['media_listening', 'media_reading', 'vocabulary'],
    suggestedTopics: ['news', 'podcasts', 'media', 'listening_practice'],
  },
  {
    id: 'oslo_speaking',
    title: 'Oslo-style Speaking Practice',
    description: 'Pronunciation and speaking confidence with Eastern Norwegian focus',
    levelRange: 'A1-B2',
    skillAreas: ['pronunciation', 'speaking_confidence', 'listening'],
    taskTypes: ['pronunciation', 'media_listening', 'phrase'],
    suggestedTopics: ['oslo_pronunciation', 'spoken_norwegian', 'rhythm'],
  },
  {
    id: 'grammar_repair',
    title: 'Grammar Repair Path',
    description: 'Focus on weak grammar areas identified from corrections',
    levelRange: 'A2-B2',
    skillAreas: ['grammar', 'word_order', 'verb_forms', 'noun_gender'],
    taskTypes: ['correction', 'sentence_fix', 'grammar'],
    suggestedTopics: ['verb_forms', 'word_order', 'cases', 'prepositions'],
  },
];

// Get path by ID
function getPath(pathId) {
  return LEARNING_PATHS.find((p) => p.id === pathId);
}

// Get all paths
function getAllPaths() {
  return LEARNING_PATHS;
}

// Get paths for user level
function getPathsForLevel(estimatedLevel) {
  const levelMap = {
    estimated_beginner: ['A1', 'A1-A2'],
    estimated_A1: ['A1', 'A1-A2'],
    estimated_A2: ['A1-A2', 'A2-B1'],
    estimated_B1: ['A2-B1', 'B1-B2'],
    estimated_B2: ['B1-B2', 'B2'],
    unknown: ['A1', 'A1-A2', 'A2-B1'],
  };

  const ranges = levelMap[estimatedLevel] || levelMap.unknown;
  return LEARNING_PATHS.filter((p) => ranges.includes(p.levelRange));
}

// Recommend path based on profile
function recommendPath(profile) {
  if (!profile || !profile.skillScores) {
    return LEARNING_PATHS[0]; // Default to Survival
  }

  // If low listening, recommend media
  if (profile.skillScores.listening.score < 50) {
    return getPath('media_listening');
  }

  // If grammar weak, recommend grammar repair
  if (profile.skillScores.grammar.score < 60 && profile.correctionsReceived > 5) {
    return getPath('grammar_repair');
  }

  // If pronunciation low, recommend Oslo speaking
  if (profile.skillScores.pronunciation.score < 60) {
    return getPath('oslo_speaking');
  }

  // Default based on level
  const paths = getPathsForLevel(profile.estimatedLevel);
  return paths[Math.floor(Math.random() * paths.length)] || LEARNING_PATHS[0];
}

module.exports = {
  LEARNING_PATHS,
  getPath,
  getAllPaths,
  getPathsForLevel,
  recommendPath,
};
