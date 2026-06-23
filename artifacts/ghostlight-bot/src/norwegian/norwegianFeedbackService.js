function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:\-—–()]/g, '')
    .replace(/\s+/g, ' ');
}

function calculateStringDistance(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return 1.0 - editDistance / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function assignGrade(match, confidence, transcript) {
  let score = null;

  if (!transcript || transcript.length === 0) {
    return { grade: 'Retry', score, reason: 'Audio unclear or not detected' };
  }

  if (confidence !== null && confidence !== undefined && confidence < 0.65) {
    // When confidence is low, we do not assign a numeric score
    score = null;
    return { grade: 'Retry', score, reason: 'STT confidence too low' };
  }

  if (match >= 0.95) {
    return { grade: 'A', score: 95 + Math.random() * 5, reason: 'Excellent match' };
  }

  if (match >= 0.85) {
    return { grade: 'B', score: 80 + Math.random() * 15, reason: 'Good match with minor differences' };
  }

  if (match >= 0.70) {
    return { grade: 'C', score: 70 + Math.random() * 10, reason: 'Understandable but notable differences' };
  }

  if (match >= 0.50) {
    // When match is low, we do not assign a numeric score
    score = null;
    return { grade: 'D', score, reason: 'Significant differences' };
  }

  score = null;
  return { grade: 'Retry', score, reason: 'Does not match target phrase' };
}

function findCorrectionFocus(target, transcript) {
  const targetWords = normalizeText(target).split(' ').filter(w => w.length > 0);
  const transcriptWords = normalizeText(transcript).split(' ').filter(w => w.length > 0);

  if (transcriptWords.length === 0) return 'Listen and try again';
  if (targetWords.length === 0) return 'No target phrase';

  const missingWords = targetWords.filter(w => !transcriptWords.includes(w));
  if (missingWords.length > 0) {
    return `Missing: ${missingWords[0]}`;
  }

  const extraWords = transcriptWords.filter(w => !targetWords.includes(w));
  if (extraWords.length > 0) {
    return `Extra: ${extraWords[0]}`;
  }

  const targetStr = normalizeText(target);
  const transcriptStr = normalizeText(transcript);

  const distance = getEditDistance(targetStr, transcriptStr);
  if (distance <= 2) {
    return 'Pronunciation rhythm - try again for natural pacing';
  }

  return 'Compare closely with the example';
}

function generateFeedback({
  targetPhrase = '',
  transcript = '',
  grade = 'Retry',
  match = 0,
  confidence = null,
  attemptNumber = 1,
}) {
  const target = String(targetPhrase || '').trim();
  const heard = String(transcript || '').trim() || '(unclear)';
  const correctionFocus = findCorrectionFocus(target, transcript);

  let goodMessage = '';
  let fixMessage = '';
  let tryMessage = '';

  if (grade === 'A') {
    goodMessage = 'Excellent! Your pronunciation was very clear.';
    fixMessage = 'Nothing to fix.';
    tryMessage = 'Try the next phrase!';
  } else if (grade === 'B') {
    goodMessage = 'Very good! You matched the target closely.';
    fixMessage = 'Minor pronunciation adjustments possible.';
    tryMessage = `Focus on: ${correctionFocus}`;
  } else if (grade === 'C') {
    goodMessage = 'Good effort. The meaning came through.';
    fixMessage = correctionFocus;
    tryMessage = 'Repeat focusing on clarity and pacing.';
  } else if (grade === 'D') {
    goodMessage = 'I could hear you, but it was quite different.';
    fixMessage = correctionFocus;
    tryMessage = 'Listen to the example again and repeat slowly.';
  } else {
    goodMessage = 'I had trouble understanding the audio.';
    fixMessage = 'Make sure the audio is clear and loud enough.';
    tryMessage = 'Try recording again.';
  }

  return {
    target,
    heard,
    grade,
    score: null,
    good: goodMessage,
    fix: fixMessage,
    tryThis: tryMessage,
    correctionFocus,
  };
}

function createFeedbackMessage({
  targetPhrase,
  transcript,
  grade,
  score,
  sourceStatus,
  confidence,
  attemptNumber,
}) {
  const feedback = generateFeedback({
    targetPhrase,
    transcript,
    grade,
    confidence,
    attemptNumber,
  });

  let scoreText = '';
  if (score !== null && score !== undefined && confidence !== null && confidence >= 0.65) {
    scoreText = `Score: ${Math.round(score)}/100`;
  } else {
    scoreText = 'Score: not scored';
  }

  return `
**Target:**
${feedback.target}

**I heard:**
${feedback.heard}

**Grade:**
${feedback.grade}

${scoreText}

**Good:**
${feedback.good}

**Fix:**
${feedback.fix}

**Try this:**
${feedback.tryThis}

**Source status:**
${sourceStatus}
`.trim();
}

module.exports = {
  normalizeText,
  calculateStringDistance,
  assignGrade,
  findCorrectionFocus,
  generateFeedback,
  createFeedbackMessage,
};
