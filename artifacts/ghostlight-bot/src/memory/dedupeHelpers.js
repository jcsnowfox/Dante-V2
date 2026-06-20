const DUPLICATE_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "based",
  "been",
  "being",
  "but",
  "can",
  "clear",
  "context",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "his",
  "into",
  "its",
  "new",
  "not",
  "now",
  "ongoing",
  "rather",
  "real",
  "recent",
  "she",
  "that",
  "the",
  "their",
  "them",
  "this",
  "users",
  "was",
  "were",
  "which",
  "will",
  "with",
]);

function tokenizeForDuplicateCheck(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !DUPLICATE_STOP_WORDS.has(token));
}

function getTokenOverlapScore(left = "", right = "") {
  const leftTokens = new Set(tokenizeForDuplicateCheck(left));
  const rightTokens = new Set(tokenizeForDuplicateCheck(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function getSharedDuplicateTokenCount(left = "", right = "") {
  const leftTokens = new Set(tokenizeForDuplicateCheck(left));
  const rightTokens = new Set(tokenizeForDuplicateCheck(right));
  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function getLeadingDuplicateTokenOverlapScore(left = "", right = "", leadingTokenCount = 8) {
  const leftTokens = tokenizeForDuplicateCheck(left).slice(0, leadingTokenCount);
  const rightTokens = new Set(tokenizeForDuplicateCheck(right).slice(0, leadingTokenCount));

  if (!leftTokens.length || !rightTokens.size) {
    return 0;
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(leftTokens.length, rightTokens.size);
}

function normalizeDuplicateToken(token = "") {
  const value = String(token || "").toLowerCase().trim();

  if (value === "sim") {
    return "simulator";
  }

  return value;
}

function getSmallEditDistance(left = "", right = "", maxDistance = 1) {
  const leftValue = normalizeDuplicateToken(left);
  const rightValue = normalizeDuplicateToken(right);

  if (leftValue === rightValue) {
    return 0;
  }

  if (Math.abs(leftValue.length - rightValue.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: rightValue.length + 1 }, (_item, index) => index);

  for (let leftIndex = 1; leftIndex <= leftValue.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];

    for (let rightIndex = 1; rightIndex <= rightValue.length; rightIndex += 1) {
      const substitutionCost = leftValue[leftIndex - 1] === rightValue[rightIndex - 1] ? 0 : 1;
      const distance = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      current[rightIndex] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[rightValue.length];
}

function tokensAreNearDuplicate(left = "", right = "") {
  const leftValue = normalizeDuplicateToken(left);
  const rightValue = normalizeDuplicateToken(right);

  if (!leftValue || !rightValue) {
    return false;
  }

  if (leftValue === rightValue) {
    return true;
  }

  if (
    Math.min(leftValue.length, rightValue.length) >= 5
    && (leftValue.startsWith(rightValue) || rightValue.startsWith(leftValue))
  ) {
    return true;
  }

  if (Math.min(leftValue.length, rightValue.length) >= 4) {
    return getSmallEditDistance(leftValue, rightValue, 1) <= 1;
  }

  return false;
}

function getNearDuplicateTokenOverlap(left = "", right = "") {
  const leftTokens = Array.from(new Set(tokenizeForDuplicateCheck(left).map(normalizeDuplicateToken)));
  const rightTokens = Array.from(new Set(tokenizeForDuplicateCheck(right).map(normalizeDuplicateToken)));

  if (!leftTokens.length || !rightTokens.length) {
    return {
      count: 0,
      score: 0,
    };
  }

  const usedRightIndexes = new Set();
  let count = 0;

  for (const leftToken of leftTokens) {
    const matchingIndex = rightTokens.findIndex((rightToken, index) => (
      !usedRightIndexes.has(index) && tokensAreNearDuplicate(leftToken, rightToken)
    ));

    if (matchingIndex >= 0) {
      usedRightIndexes.add(matchingIndex);
      count += 1;
    }
  }

  return {
    count,
    score: count / Math.min(leftTokens.length, rightTokens.length),
  };
}

function buildCandidateDuplicateText(candidate = {}) {
  return [
    candidate.subject,
    candidate.query,
    candidate.evidence,
    ...(Array.isArray(candidate.evidenceExcerpt) ? candidate.evidenceExcerpt : []),
  ].filter(Boolean).join(" ");
}

function getCandidateRelatedMemoryDuplicateMatch(candidate = {}, memory = {}, { strict = false } = {}) {
  const candidateText = buildCandidateDuplicateText(candidate);
  const candidateSignalText = [
    candidate.query,
    candidate.evidence,
    ...(Array.isArray(candidate.evidenceExcerpt) ? candidate.evidenceExcerpt : []),
  ].filter(Boolean).join(" ");
  const relatedText = `${memory.title || ""} ${memory.content || ""}`;
  const overlapScore = getTokenOverlapScore(candidateText, relatedText);
  const subjectTitleOverlapScore = getTokenOverlapScore(candidate.subject || "", memory.title || "");
  const queryContentOverlapScore = getTokenOverlapScore(candidate.query || "", memory.content || "");
  const signalContentOverlapScore = getTokenOverlapScore(candidateSignalText, memory.content || "");
  const sharedSignalTokenCount = getSharedDuplicateTokenCount(candidateSignalText, memory.content || "");
  const sharedCandidateTokenCount = getSharedDuplicateTokenCount(candidateText, relatedText);
  const leadingSignalContentOverlapScore = getLeadingDuplicateTokenOverlapScore(candidateSignalText, memory.content || "");
  const titleQueryOverlapScore = getTokenOverlapScore(candidate.query || "", memory.title || "");
  const nearSubjectRelatedOverlap = getNearDuplicateTokenOverlap(candidate.subject || "", relatedText);
  const nearSubjectTitleOverlap = getNearDuplicateTokenOverlap(candidate.subject || "", memory.title || "");
  const nearQueryRelatedOverlap = getNearDuplicateTokenOverlap(candidate.query || "", relatedText);
  const nearSignalContentOverlap = getNearDuplicateTokenOverlap(candidateSignalText, memory.content || "");
  const continuityType = String(candidate.continuityType || "").trim().toLowerCase();

  let matchKind = "";

  if (overlapScore >= 0.82) {
    matchKind = "candidate_high_text_overlap";
  } else if (subjectTitleOverlapScore >= 0.95 && signalContentOverlapScore >= 0.4) {
    matchKind = "candidate_same_title_subject";
  } else if (
    signalContentOverlapScore >= 0.4
    && sharedSignalTokenCount >= 7
    && leadingSignalContentOverlapScore >= 0.6
  ) {
    matchKind = "candidate_same_leading_context";
  } else if (strict && subjectTitleOverlapScore >= 0.86 && signalContentOverlapScore >= 0.45 && sharedSignalTokenCount >= 6) {
    matchKind = "candidate_strict_same_subject";
  } else if (strict && queryContentOverlapScore >= 0.62 && sharedSignalTokenCount >= 7) {
    matchKind = "candidate_strict_same_query";
  } else if (strict && overlapScore >= 0.7 && sharedCandidateTokenCount >= 9) {
    matchKind = "candidate_strict_same_text";
  } else if (strict && titleQueryOverlapScore >= 0.86 && signalContentOverlapScore >= 0.42 && sharedSignalTokenCount >= 6) {
    matchKind = "candidate_strict_title_query";
  } else if (
    strict
    && nearSubjectRelatedOverlap.count >= 3
    && nearQueryRelatedOverlap.count >= 4
    && sharedCandidateTokenCount >= 6
  ) {
    matchKind = "candidate_strict_named_subject";
  } else if (
    strict
    && ["person", "place"].includes(continuityType)
    && (
      subjectTitleOverlapScore >= 0.9
      || nearSubjectTitleOverlap.score >= 0.9
      || (
        nearSubjectRelatedOverlap.count >= 2
        && nearQueryRelatedOverlap.count >= 3
        && sharedCandidateTokenCount >= 5
      )
    )
  ) {
    matchKind = "candidate_strict_named_person_place";
  } else if (
    strict
    && ["preference", "routine", "pattern"].includes(continuityType)
    && nearSubjectRelatedOverlap.count >= 2
    && nearSignalContentOverlap.count >= 4
    && sharedSignalTokenCount >= 4
  ) {
    matchKind = "candidate_strict_named_preference";
  }

  if (!matchKind) {
    return null;
  }

  return {
    memoryId: memory.memoryId,
    title: memory.title,
    memoryType: memory.memoryType,
    domain: memory.domain,
    contentPreview: String(memory.content || "").slice(0, 240),
    matchKind,
    overlapScore,
    subjectTitleOverlapScore,
    queryContentOverlapScore,
    signalContentOverlapScore,
    sharedSignalTokenCount,
    sharedCandidateTokenCount,
    leadingSignalContentOverlapScore,
    titleQueryOverlapScore,
    nearSubjectRelatedTokenCount: nearSubjectRelatedOverlap.count,
    nearSubjectRelatedOverlapScore: nearSubjectRelatedOverlap.score,
    nearSubjectTitleTokenCount: nearSubjectTitleOverlap.count,
    nearSubjectTitleOverlapScore: nearSubjectTitleOverlap.score,
    nearQueryRelatedTokenCount: nearQueryRelatedOverlap.count,
    nearQueryRelatedOverlapScore: nearQueryRelatedOverlap.score,
    nearSignalContentTokenCount: nearSignalContentOverlap.count,
    nearSignalContentOverlapScore: nearSignalContentOverlap.score,
  };
}

function buildRelatedMemoryIndex(relatedMemoriesBySubject = {}) {
  const index = new Map();

  for (const memories of Object.values(relatedMemoriesBySubject)) {
    for (const memory of Array.isArray(memories) ? memories : []) {
      if (memory?.memoryId) {
        index.set(String(memory.memoryId), memory);
      }
    }
  }

  return index;
}

function findDuplicateRelatedMemory(suggestion, relatedMemoryIndex = new Map()) {
  const relatedIds = Array.isArray(suggestion.relatedMemoryIds) ? suggestion.relatedMemoryIds : [];
  const relatedMemories = relatedIds.length
    ? relatedIds
      .map((id) => relatedMemoryIndex.get(String(id || "").trim()))
      .filter(Boolean)
    : Array.from(relatedMemoryIndex.values());
  const proposedText = `${suggestion.title} ${suggestion.content}`;

  for (const memory of relatedMemories) {
    const relatedText = `${memory.title || ""} ${memory.content || ""}`;
    const overlapScore = getTokenOverlapScore(proposedText, relatedText);
    const titleOverlapScore = getTokenOverlapScore(suggestion.title, memory.title || "");
    const contentOverlapScore = getTokenOverlapScore(suggestion.content, memory.content || "");
    const sharedContentTokenCount = getSharedDuplicateTokenCount(suggestion.content, memory.content || "");
    const leadingContentOverlapScore = getLeadingDuplicateTokenOverlapScore(suggestion.content, memory.content || "");

    if (
      overlapScore >= 0.82
      || (titleOverlapScore >= 0.95 && contentOverlapScore >= 0.4)
      || (contentOverlapScore >= 0.4 && sharedContentTokenCount >= 7 && leadingContentOverlapScore >= 0.6)
    ) {
      return {
        memoryId: memory.memoryId,
        title: memory.title,
        overlapScore,
      };
    }
  }

  return null;
}

function findDuplicateCandidateMemory(candidate, relatedMemories = [], options = {}) {
  for (const memory of Array.isArray(relatedMemories) ? relatedMemories : []) {
    const duplicate = getCandidateRelatedMemoryDuplicateMatch(candidate, memory, options);

    if (duplicate) {
      return duplicate;
    }
  }

  return null;
}

function isNearIdenticalUpdateSuggestion(suggestion, targetMemory) {
  if (suggestion.action !== "update_existing" || !targetMemory) {
    return false;
  }

  if (suggestion.lane === "resolved_context") {
    return false;
  }

  const proposedText = `${suggestion.title || ""} ${suggestion.content || ""}`;
  const existingText = `${targetMemory.title || ""} ${targetMemory.content || ""}`;
  const proposedTokens = tokenizeForDuplicateCheck(proposedText);
  const existingTokens = tokenizeForDuplicateCheck(existingText);
  const tokenDelta = Math.abs(proposedTokens.length - existingTokens.length);
  const contentDelta = Math.abs(String(suggestion.content || "").length - String(targetMemory.content || "").length);
  const overlapScore = getTokenOverlapScore(proposedText, existingText);
  const contentOverlapScore = getTokenOverlapScore(suggestion.content || "", targetMemory.content || "");
  const sharedContentTokenCount = getSharedDuplicateTokenCount(suggestion.content || "", targetMemory.content || "");

  return (overlapScore >= 0.92 && tokenDelta <= 10 && contentDelta <= 140)
    || (overlapScore >= 0.78 && contentOverlapScore >= 0.6 && sharedContentTokenCount >= 10 && tokenDelta <= 22);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function dotProduct(left = [], right = []) {
  let total = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    total += left[index] * right[index];
  }

  return total;
}

function vectorMagnitude(vector = []) {
  return Math.sqrt(dotProduct(vector, vector));
}

function cosineSimilarity(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) {
    return 0;
  }

  if (!left.every(isFiniteNumber) || !right.every(isFiniteNumber)) {
    return 0;
  }

  const magnitude = vectorMagnitude(left) * vectorMagnitude(right);

  return magnitude > 0 ? dotProduct(left, right) / magnitude : 0;
}

module.exports = {
  buildRelatedMemoryIndex,
  buildCandidateDuplicateText,
  cosineSimilarity,
  dotProduct,
  findDuplicateCandidateMemory,
  findDuplicateRelatedMemory,
  getCandidateRelatedMemoryDuplicateMatch,
  getLeadingDuplicateTokenOverlapScore,
  getNearDuplicateTokenOverlap,
  getSharedDuplicateTokenCount,
  getTokenOverlapScore,
  isFiniteNumber,
  isNearIdenticalUpdateSuggestion,
  tokenizeForDuplicateCheck,
  vectorMagnitude,
};
