// Norwegian Review Engine - Simple scheduler using saved learning data

// Review scheduling defaults (configurable later)
const REVIEW_SCHEDULE = {
  A: 7, // days
  B: 3,
  C: 1,
  D: 1,
  Retry: 0, // next session
  low_confidence: 0, // next session
};

// Priority calculation
function calculatePriority({ grade, overdueDays, retryCount, sourceStatus }) {
  let score = 0;

  // Overdue items get high priority
  if (overdueDays > 0) {
    score += overdueDays * 2;
  }

  // Grade impacts priority
  const gradeScore = { Retry: 5, D: 4, C: 3, B: 2, A: 1 };
  score += gradeScore[grade] || 0;

  // Multiple retries increase priority
  if (retryCount > 0) {
    score += retryCount * 1.5;
  }

  // Not yet verified items are lower priority
  if (sourceStatus === 'not_checked') {
    score *= 0.8;
  }

  if (score > 5) return 'high';
  if (score > 2) return 'medium';
  return 'low';
}

// Calculate next due date based on result
function calculateNextDueDate(result, currentGrade) {
  const today = new Date();
  let daysUntilDue = REVIEW_SCHEDULE[result] || 1;

  const nextDue = new Date(today.getTime() + daysUntilDue * 24 * 60 * 60 * 1000);
  return nextDue;
}

// Generate daily practice from saved items
async function generateDailyPractice(store, userScope, logger) {
  if (!store.available) {
    logger?.warn('[norwegian-review] Store not available');
    return { tasks: [] };
  }

  try {
    // Get due items across all types
    const dueItems = await store.getDueReviewItems(userScope, 5);

    if (!dueItems || dueItems.length === 0) {
      // If no due items, suggest basic practice
      logger?.info('[norwegian-review] No due items, suggesting starter set', { userScope });
      return {
        tasks: [
          {
            type: 'starter',
            content: 'Practice one new Norwegian word today.',
            sourceStatus: 'unverified_practice',
          },
        ],
      };
    }

    // Organize by type for variety
    const byType = {};
    dueItems.forEach((item) => {
      byType[item.item_type] = byType[item.item_type] || [];
      byType[item.item_type].push(item);
    });

    // Build daily practice: vocab, correction, sentence, pronunciation, media
    const tasks = [];

    if (byType.vocabulary && byType.vocabulary.length > 0) {
      tasks.push({
        ...byType.vocabulary[0],
        type: 'vocabulary',
      });
    }

    if ((byType.correction || byType.phrase) && (byType.correction || byType.phrase).length > 0) {
      const corrItem = (byType.correction || [])[0] || (byType.phrase || [])[0];
      tasks.push(corrItem);
    }

    if (byType.pronunciation && byType.pronunciation.length > 0) {
      tasks.push({
        ...byType.pronunciation[0],
        type: 'pronunciation',
      });
    }

    if ((byType.media_listening || byType.media_reading) && (byType.media_listening || byType.media_reading).length > 0) {
      const mediaItem = (byType.media_listening || [])[0] || (byType.media_reading || [])[0];
      tasks.push(mediaItem);
    }

    // Limit to 5 items
    const dailyTasks = tasks.slice(0, 5);

    logger?.info('[norwegian-review] daily practice generated', {
      userScope,
      itemCount: dailyTasks.length,
    });

    return { tasks: dailyTasks };
  } catch (error) {
    logger?.error('[norwegian-review] Error generating daily practice', { error: error.message });
    return { tasks: [], error: error.message };
  }
}

// Analyze weak spots from saved corrections and pronunciation
async function analyzeWeakSpots(store, userScope, logger) {
  if (!store.available) {
    return { spots: [] };
  }

  try {
    const summary = await store.getWeakSpotSummary(userScope);

    logger?.info('[norwegian-review] weakspots calculated', {
      userScope,
      categoryCount: summary?.categories?.length || 0,
    });

    return summary || { spots: [] };
  } catch (error) {
    logger?.error('[Norwegian-review] Error analyzing weak spots', { error: error.message });
    return { spots: [], error: error.message };
  }
}

// Generate weekly summary from saved data
async function generateWeeklySummary(store, userScope, logger) {
  if (!store.available) {
    return { summary: null };
  }

  try {
    const summary = await store.getWeeklyNorwegianSummary(userScope);

    logger?.info('[norwegian-review] weekly summary generated', { userScope });

    return { summary };
  } catch (error) {
    logger?.error('[norwegian-review] Error generating weekly summary', {
      error: error.message,
    });
    return { summary: null, error: error.message };
  }
}

// Update review result and reschedule
async function recordReviewResult(store, userScope, itemId, result, logger) {
  if (!store.available) {
    return null;
  }

  try {
    const nextDueAt = calculateNextDueDate(result);

    await store.updateReviewResult(userScope, itemId, {
      result,
      nextDueAt,
    });

    logger?.info('[norwegian-review] result saved', {
      itemId,
      result,
      nextDueAt: nextDueAt.toISOString(),
    });

    return { success: true, nextDueAt };
  } catch (error) {
    logger?.error('[norwegian-review] Error recording result', { error: error.message });
    return null;
  }
}

module.exports = {
  calculatePriority,
  calculateNextDueDate,
  generateDailyPractice,
  analyzeWeakSpots,
  generateWeeklySummary,
  recordReviewResult,
  REVIEW_SCHEDULE,
};
