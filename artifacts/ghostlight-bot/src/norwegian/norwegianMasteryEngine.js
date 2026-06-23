// Norwegian Mastery Layer - Evidence-based progress analysis
// Uses stored learning data only, no hallucination

const SKILL_AREAS = [
  'vocabulary',
  'grammar',
  'word_order',
  'verb_forms',
  'noun_gender',
  'prepositions',
  'sentence_building',
  'listening',
  'reading',
  'pronunciation',
  'speaking_confidence',
  'media_comprehension',
  'review_consistency',
];

// Source status weighting for mastery calculations
const SOURCE_WEIGHTS = {
  verified: 1.0,
  partial: 0.7,
  stt_based_practice: 0.6,
  low_confidence: 0.4,
  unverified_practice: 0.5,
  not_checked: 0.3,
};

// Grade to score multiplier
const GRADE_SCORES = {
  A: 95,
  B: 80,
  C: 60,
  D: 40,
  Retry: 20,
};

// Calculate mastery profile from stored data
async function calculateMasteryProfile(store, userScope, logger) {
  if (!store.available) {
    return { profile: null };
  }

  try {
    // Fetch all learning data for this user
    const [profile, lessons, corrections, vocabulary, pronunciationAttempts, mediaLinks, reviewItems] =
      await Promise.all([
        store.getProfile(userScope),
        store.listNorwegianLessons(userScope, 100),
        store.listNorwegianCorrections(userScope, 100),
        store.listNorwegianVocabulary(userScope, 200),
        store.listNorwegianPronunciationAttempts(userScope, 100),
        store.listNorwegianMediaLinks(userScope, 50),
        store.getDueReviewItems(userScope, 200),
      ]);

    if (!lessons || (lessons.length === 0 && corrections.length === 0 && vocabulary.length === 0)) {
      logger?.info('[norwegian-mastery] Not enough data for profile', { userScope });
      return { profile: null, message: 'Not enough data yet. Keep practicing and I will map this properly.' };
    }

    // Calculate skill scores
    const skillScores = calculateSkillScores({
      corrections: corrections || [],
      vocabulary: vocabulary || [],
      pronunciationAttempts: pronunciationAttempts || [],
      mediaLinks: mediaLinks || [],
      reviewItems: reviewItems || [],
    });

    // Estimate level from skill scores and lesson completion
    const level = estimateLevel(skillScores, lessons ? lessons.length : 0);

    // Identify weak spots
    const weakSpots = identifyWeakSpots({
      corrections: corrections || [],
      pronunciationAttempts: pronunciationAttempts || [],
      reviewItems: reviewItems || [],
      skillScores,
    });

    // Identify strengths
    const strengths = identifyStrengths(skillScores);

    logger?.info('[norwegian-mastery] profile calculated', {
      userScope,
      estimatedLevel: level.level,
      confidence: level.confidence,
    });

    return {
      profile: {
        estimatedLevel: level.level,
        levelConfidence: level.confidence,
        levelBasis: level.basis,
        lastLevelUpdate: new Date(),
        skillScores,
        weakSpots,
        strengths,
        lessonsCompleted: lessons ? lessons.length : 0,
        correctionsReceived: corrections ? corrections.length : 0,
        vocabularyItems: vocabulary ? vocabulary.length : 0,
      },
    };
  } catch (error) {
    logger?.error('[norwegian-mastery] Error calculating profile', { error: error.message });
    return { profile: null };
  }
}

function calculateSkillScores(data) {
  const scores = {};

  // Initialize all skills
  SKILL_AREAS.forEach((skill) => {
    scores[skill] = { score: 0, confidence: 'low', evidenceCount: 0, weight: 0 };
  });

  // Score from corrections (weighted by sourceStatus)
  if (data.corrections && data.corrections.length > 0) {
    const grammarSkills = ['grammar', 'word_order', 'verb_forms', 'noun_gender', 'prepositions', 'sentence_building'];
    data.corrections.forEach((correction) => {
      const weight = SOURCE_WEIGHTS[correction.source_status] || 0.5;
      // Each correction suggests an area that needs work
      const skillArea = correction.explanation ? 'grammar' : 'general';
      grammarSkills.forEach((skill) => {
        scores[skill].score += 30 * weight;
        scores[skill].evidenceCount += 1;
        scores[skill].weight += weight;
      });
    });
  }

  // Score from vocabulary (by review results)
  if (data.vocabulary && data.vocabulary.length > 0) {
    const baseScore = Math.min(70, 20 + data.vocabulary.length);
    scores.vocabulary.score = baseScore;
    scores.vocabulary.evidenceCount = data.vocabulary.length;
    scores.vocabulary.confidence = 'medium';
    scores.vocabulary.weight += 1;
  }

  // Score from pronunciation attempts
  if (data.pronunciationAttempts && data.pronunciationAttempts.length > 0) {
    let totalScore = 0;
    let count = 0;
    data.pronunciationAttempts.forEach((attempt) => {
      const weight = SOURCE_WEIGHTS[attempt.source_status] || 0.5;
      // Only count high-confidence attempts toward speaking confidence
      if (attempt.stt_confidence && attempt.stt_confidence >= 0.65) {
        totalScore += (GRADE_SCORES[attempt.grade] || 50) * weight;
        count += 1;
      }
    });
    if (count > 0) {
      scores.pronunciation.score = Math.round(totalScore / count);
      scores.pronunciation.evidenceCount = count;
      scores.pronunciation.confidence = 'medium';
      scores.speaking_confidence.score = Math.round(totalScore / count) - 10;
      scores.speaking_confidence.confidence = 'medium';
    }
  }

  // Score from media links watched
  if (data.mediaLinks && data.mediaLinks.length > 0) {
    const watched = data.mediaLinks.filter((m) => m.watch_status === 'watched' || m.watch_status === 'read').length;
    if (watched > 0) {
      scores.listening.score = Math.min(75, 40 + watched * 5);
      scores.reading.score = Math.min(75, 40 + watched * 5);
      scores.media_comprehension.score = Math.min(75, 40 + watched * 5);
      scores.listening.confidence = 'medium';
      scores.reading.confidence = 'medium';
      scores.media_comprehension.confidence = 'medium';
    }
  }

  // Score from review items (consistency)
  if (data.reviewItems && data.reviewItems.length > 0) {
    const reviewCount = data.reviewItems.length;
    const correctCount = data.reviewItems.filter((r) => ['A', 'B'].includes(r.last_result)).length;
    const percentage = reviewCount > 0 ? Math.round((correctCount / reviewCount) * 100) : 0;
    scores.review_consistency.score = Math.max(30, Math.min(95, percentage));
    scores.review_consistency.confidence = reviewCount > 5 ? 'medium' : 'low';
    scores.review_consistency.evidenceCount = reviewCount;
  }

  // Normalize scores to 0-100 and set confidence
  Object.keys(scores).forEach((skill) => {
    const s = scores[skill];
    if (s.score === 0 && s.evidenceCount === 0) {
      s.confidence = 'low';
    } else if (s.weight >= 2 || s.evidenceCount >= 5) {
      s.confidence = 'high';
    } else if (s.evidenceCount >= 2) {
      s.confidence = 'medium';
    }
    // Cap scores at 100
    s.score = Math.min(100, Math.max(0, s.score));
  });

  return scores;
}

function estimateLevel(skillScores, lessonsCompleted) {
  // Average score across key skills
  const avgScore = (skillScores.vocabulary.score + skillScores.grammar.score + skillScores.listening.score) / 3;

  let level = 'estimated_beginner';
  let confidence = 'low';

  if (lessonsCompleted >= 10 && avgScore >= 50) {
    level = 'estimated_A1';
    confidence = 'medium';
  }
  if (lessonsCompleted >= 20 && avgScore >= 65) {
    level = 'estimated_A2';
    confidence = 'medium';
  }
  if (lessonsCompleted >= 40 && avgScore >= 75) {
    level = 'estimated_B1';
    confidence = 'medium';
  }
  if (lessonsCompleted >= 60 && avgScore >= 85) {
    level = 'estimated_B2';
    confidence = 'high';
  }

  return {
    level,
    confidence,
    basis: `${lessonsCompleted} lessons, ${Math.round(avgScore)}% skill average`,
  };
}

function identifyWeakSpots(data) {
  const spots = {};

  // Find weak spots from corrections
  if (data.corrections && data.corrections.length > 0) {
    // Group by correction focus if available
    const byFocus = {};
    data.corrections.forEach((corr) => {
      if (corr.correction_focus) {
        byFocus[corr.correction_focus] = (byFocus[corr.correction_focus] || 0) + 1;
      }
    });

    Object.entries(byFocus)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([focus, count]) => {
        spots[focus] = {
          skillArea: focus,
          evidenceCount: count,
          type: 'correction',
          priority: count >= 3 ? 'high' : 'medium',
        };
      });
  }

  // Add weak spots from low pronunciation confidence
  if (data.pronunciationAttempts && data.pronunciationAttempts.length > 0) {
    const lowConfidence = data.pronunciationAttempts.filter((p) => p.source_status === 'low_confidence');
    if (lowConfidence.length >= 2) {
      spots.pronunciation_clarity = {
        skillArea: 'pronunciation',
        evidenceCount: lowConfidence.length,
        type: 'pronunciation',
        priority: 'medium',
      };
    }
  }

  // Add weak spots from review retries
  if (data.reviewItems && data.reviewItems.length > 0) {
    const retries = data.reviewItems.filter((r) => r.last_result === 'Retry' || r.last_result === 'D').length;
    if (retries >= 2) {
      spots.review_consistency = {
        skillArea: 'review_consistency',
        evidenceCount: retries,
        type: 'review',
        priority: 'high',
      };
    }
  }

  return Object.values(spots).slice(0, 5);
}

function identifyStrengths(skillScores) {
  return Object.entries(skillScores)
    .filter(([_, s]) => s.score >= 70 && s.evidenceCount > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(([skill, s]) => ({
      skill,
      score: s.score,
      evidenceCount: s.evidenceCount,
    }));
}

// Get next focus recommendation
async function getNextFocus(store, userScope, logger) {
  if (!store.available) {
    return { nextFocus: null };
  }

  try {
    const [dueItems, profile] = await Promise.all([store.getDueReviewItems(userScope, 10), store.getProfile(userScope)]);

    if (dueItems && dueItems.length > 0) {
      const retryItem = dueItems.find((i) => i.last_result === 'Retry');
      if (retryItem) {
        return {
          nextFocus: `Retry ${retryItem.item_type}`,
          reason: 'You have a due retry item',
          evidenceIds: [retryItem.id],
          sourceStatus: retryItem.source_status,
          suggestedCommand: '/norwegian review',
        };
      }
    }

    // Default recommendation
    return {
      nextFocus: 'Review due items',
      reason: 'Keep your review queue current',
      evidenceIds: [],
      sourceStatus: 'unverified_practice',
      suggestedCommand: '/norwegian daily',
    };
  } catch (error) {
    logger?.error('[norwegian-mastery] Error getting next focus', { error: error.message });
    return { nextFocus: null };
  }
}

module.exports = {
  calculateMasteryProfile,
  getNextFocus,
  SKILL_AREAS,
  SOURCE_WEIGHTS,
  GRADE_SCORES,
};
