"use strict";

/**
 * outputCorruptionDetector
 *
 * Pure function — no async, no side effects.
 *
 * Inspects a raw LLM reply for signs of model output corruption before it
 * reaches Discord. Corruption patterns observed with MiMo 2.5 Pro include:
 *   - camelCase/internal tokens leaking (printStats, contentassist, constructor)
 *   - Unrelated noun cluster dumps (Maritime Boundaries, Cluster, MIT, EA, Passport)
 *   - Mixed language fragments mid-reply
 *   - Incoherent tail after a coherent romantic/conversational prefix
 *   - JSON/SQL fragments appearing in natural-language replies
 *   - Provider debug text or tool function names surfacing in chat replies
 *
 * Contract:
 *   - Returns { corrupted, severity, reasons, safePrefix, recommendation }
 *   - severity: "none" | "watch" | "block"
 *   - recommendation: "send" | "trim_to_safe_prefix" | "regenerate" | "block"
 *   - Never throws — always returns a valid result object
 *   - Never reads from or writes to external state
 */

// ── Token patterns ─────────────────────────────────────────────────────────────

// Known leaked internal identifiers (seen in real corrupted output).
// No trailing \b — compound tokens like "printStatsYour" must still match.
const KNOWN_INTERNAL_TOKENS_RE = /\b(printStats|contentassist|constructor|getPrototypeOf|hasOwnProperty|__proto__|Object\.keys|Array\.from|JSON\.parse|JSON\.stringify|console\.log|process\.env|require\(|module\.exports|Promise\.all|async function|await Promise)/i;

// camelCase cluster — 3+ consecutive camelCase words not typical in conversation
// e.g. "printStatsYourAss", "buildChatRequestShapeSummary"
const CAMEL_CASE_TOKEN_RE = /\b[a-z][a-zA-Z]{2,}[A-Z][a-zA-Z]{2,}[A-Z]?[a-zA-Z]*\b/g;

// snake_case cluster — programming style snake_case words
const SNAKE_CASE_TOKEN_RE = /\b[a-z]{2,}_[a-z]{2,}(_[a-z]{2,})?\b/g;

// JSON-like fragments
const JSON_FRAGMENT_RE = /[{}\[\]"]{3,}|"[a-z_]+"\s*:/i;

// SQL-like keywords in suspicious clusters
const SQL_CLUSTER_RE = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|GROUP BY|ORDER BY|CREATE TABLE|DROP TABLE|ALTER TABLE)\b/i;

// Unrelated proper-noun pileup detector — many consecutive distinct capitalized
// words that don't form a sentence (no verb)
const PROPER_NOUN_CLUSTER_RE = /(?:[A-Z][a-zA-Z]{2,}\s+){4,}/;

// Known geographic/institutional noun clusters seen in real corrupted output
const KNOWN_NOUN_DUMPS = [
  /Maritime\s+Boundaries/i,
  /Cluster\s+(?:exercises|analysis|mapping|model)/i,
  /MIT\s+(?:License|Press|Media|School)/i,
  /EA\s+(?:Sports|Games|Origin)/i,
  /Passport\s+(?:js|strategy|token)/i,
];

// Provider/debug text patterns
const PROVIDER_DEBUG_RE = /\b(OPENROUTER|openrouter\.ai|anthropic\.com|x-request-id|cf-ray|x-ratelimit|rate.?limit|usage\.total_tokens|prompt_tokens|completion_tokens|finish_reason|stop_sequence)\b/i;

// Source/artifact URL leaks from retrieval or file systems should not reach chat.
const SOURCE_URL_LEAK_RE = /https?:\/\/[^\s]*(?:files-albert\.thesnowwolf\.com|localhost|127\.0\.0\.1|railway\.internal|postgres\.railway\.internal)[^\s]*/i;

// Long strings of topic words with little grammar, often produced when a model derails.
const LOW_GRAMMAR_WORD_RE = /\b(?:upload|preset|replication|layer|facility|computer|grid|strategy|helicopter|hardship|lymph|defense|mount|generation|receipt|limit|player|acoustic|trivia|pitches|visible|powerpoint|database|schema|query|token|router|endpoint|variable|extracted|cartoon|toolbox|bibliography|tickets|resize|patterns|teamwork|scheme)\b/i;

// Fragmented model sludge often arrives as short English-looking shards mixed
// with unrelated retrieval/UI terms. These are not normal bot replies, but they
// may not contain code tokens, JSON, SQL, or provider debug headers.
const KNOWN_FRAGMENT_DUMP_RE = /\b(?:Dating\s+toolbox|NewReader|feed\s+tickets|arc\s+question|resize\s+patterns|cartoon\s+elbows|magic\s+model|regime\s+clouds)\b/i;
const STANDALONE_LETTER_FRAGMENT_RE = /(?:^|\s)(?:[a-z]\s+){2,}[a-z](?=\s|$)/i;

// Tool/function name patterns (from Dante's tool schema — should never appear in chat)
const TOOL_NAME_RE = /\b(create_image|generate_image|search_memories|store_memory|web_search|list_memories|delete_memory|play_music|spotify_search|fetch_url|run_tool|call_function|tool_call|function_call|tool_result)\b/i;

// Code fence / stack trace indicators
const CODE_ARTIFACT_RE = /```|<\/?code>|Error:\s+at\s+\w+|TypeError:|ReferenceError:|SyntaxError:|at Object\.<anonymous>|at Module\._compile|at Function\.Module/i;

// Abrupt language shift — presence of non-Latin scripts mixed with Latin text
const NON_LATIN_RE = /[Ѐ-ӿ一-鿿぀-ゟ゠-ヿ가-힯]/;

// Repeated malformed token — same 3–10 char fragment repeated 3+ times
function findRepeatedMalformedToken(text) {
  const tokens = text.match(/\b\w{3,10}\b/g) || [];
  const counts = new Map();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  for (const [token, count] of counts) {
    if (count >= 4 && !/^(that|this|with|have|from|your|what|when|just|been|will|they|were|there|then|than|like|love|know|into|some|more|also|about|would|could|should|after|again|still|right|here|want|said|even|only|ever|each|very|kind|feel|look|time|need|good|come|back|away|down|yeah|okay|sure|does|didn't|hasn't|isn't|aren't|couldn't|wouldn't|shouldn't|something|everything|nothing|anything|someone|everyone)$/i.test(token)) {
      return token;
    }
  }
  return null;
}

// ── Sentence-quality heuristics ───────────────────────────────────────────────

// A "coherent sentence" ends in punctuation and has a verb-like word.
// Very rough — good enough for corruption triage.
const SENTENCE_END_RE = /[.!?…]["']?\s*$/;
const VERB_PATTERN_RE = /\b(is|are|was|were|have|has|had|do|does|did|will|would|could|should|can|may|might|feel|think|know|want|love|need|miss|hope|wish|mean|say|tell|ask|go|come|see|hear|get|take|make|let|try|stay|keep|give|find|look|wait|remember|forget|wonder|worry|care|trust|laugh|smile|cry|hurt|help|show|send|hold|reach|touch|start|stop|run|walk|write|read|play|work|eat|sleep|dream|wake|breathe|happen|matter|change|move|turn|fall|rise|break|fix|open|close|leave|return|believe|understand|feel like|sounds like)\b/i;

function findSafePrefix(text, maxLength = 800) {
  if (!text || text.length === 0) return "";
  const sentences = text.match(/[^.!?…]+[.!?…]["']?/g) || [];
  let safe = "";
  for (const sentence of sentences) {
    const candidate = (safe + sentence).trim();
    if (candidate.length > maxLength) break;
    if (VERB_PATTERN_RE.test(sentence)) {
      safe = candidate;
    }
  }
  return safe.trim();
}

// ── Main analysis ─────────────────────────────────────────────────────────────

/**
 * detectOutputCorruption
 *
 * @param {string} text  — raw reply from LLM (after buildReply cleaning)
 * @param {{ intent?: string, channelType?: string }} [context]
 * @returns {{ corrupted: boolean, severity: "none"|"watch"|"block", reasons: string[], safePrefix: string, recommendation: "send"|"trim_to_safe_prefix"|"regenerate"|"block" }}
 */
function detectOutputCorruption(text, context = {}) {
  try {
    return _analyse(text, context);
  } catch (_) {
    return _safe("none", []);
  }
}

function _analyse(rawText, context) {
  const text = String(rawText || "").trim();
  if (!text) return _safe("none", []);

  const reasons = [];
  let blockScore = 0;
  let watchScore = 0;

  // ── Hard-block signals ─────────────────────────────────────────────────────

  if (KNOWN_INTERNAL_TOKENS_RE.test(text)) {
    reasons.push("known_internal_token");
    blockScore += 3;
  }

  if (CODE_ARTIFACT_RE.test(text)) {
    reasons.push("code_artifact");
    blockScore += 3;
  }

  if (SQL_CLUSTER_RE.test(text)) {
    reasons.push("sql_fragment");
    blockScore += 3;
  }

  if (JSON_FRAGMENT_RE.test(text)) {
    reasons.push("json_fragment");
    blockScore += 3;
  }

  if (PROVIDER_DEBUG_RE.test(text)) {
    reasons.push("provider_debug_text");
    blockScore += 3;
  }

  if (SOURCE_URL_LEAK_RE.test(text)) {
    reasons.push("source_url_leak");
    blockScore += 3;
  }

  if (TOOL_NAME_RE.test(text)) {
    reasons.push("tool_name_leak");
    blockScore += 2;
  }

  for (const pattern of KNOWN_NOUN_DUMPS) {
    if (pattern.test(text)) {
      reasons.push("known_noun_dump");
      blockScore += 3;
      break;
    }
  }

  if (KNOWN_FRAGMENT_DUMP_RE.test(text)) {
    reasons.push("known_fragment_dump");
    blockScore += 3;
  }

  if (STANDALONE_LETTER_FRAGMENT_RE.test(text)) {
    reasons.push("standalone_letter_fragment");
    watchScore += 2;
  }

  // ── camelCase cluster ──────────────────────────────────────────────────────
  const camelMatches = text.match(CAMEL_CASE_TOKEN_RE) || [];
  const camelCount = camelMatches.filter(w => w.length >= 8).length;
  if (camelCount >= 4) {
    reasons.push("camelcase_cluster");
    blockScore += 3;
  } else if (camelCount >= 3) {
    reasons.push("camelcase_cluster");
    blockScore += 2;
  } else if (camelCount >= 2) {
    reasons.push("camelcase_pair");
    watchScore += 1;
  }

  // ── snake_case cluster ─────────────────────────────────────────────────────
  const snakeMatches = text.match(SNAKE_CASE_TOKEN_RE) || [];
  const snakeCount = snakeMatches.filter(w => {
    // Exclude common English contractions tokenized as snake ("didn_t" etc.) and timestamps
    return !/^\d/.test(w) && w.length >= 6;
  }).length;
  if (snakeCount >= 3) {
    reasons.push("snake_case_cluster");
    blockScore += 2;
  } else if (snakeCount >= 2) {
    reasons.push("snake_case_pair");
    watchScore += 1;
  }

  // ── Proper-noun pileup ─────────────────────────────────────────────────────
  if (PROPER_NOUN_CLUSTER_RE.test(text)) {
    reasons.push("proper_noun_pileup");
    watchScore += 2;
    // Upgrade to block if the nouns span more than 6 consecutive caps words
    const caps6 = /(?:[A-Z][a-zA-Z]{2,}\s+){6,}/;
    if (caps6.test(text)) blockScore += 1;
  }

  // ── Non-Latin script mixed in ──────────────────────────────────────────────
  if (NON_LATIN_RE.test(text)) {
    const hasLatin = /[a-zA-Z]{10,}/.test(text);
    if (hasLatin) {
      reasons.push("mixed_script");
      watchScore += 2;
    }
  }

  // ── Low-grammar topic dump ────────────────────────────────────────────────
  const words = text.match(/\b[\p{L}][\p{L}'’.-]*\b/gu) || [];
  const longWords = words.filter((word) => word.length >= 6);
  const punctuationCount = (text.match(/[.!?…,:;]/g) || []).length;
  const grammarAnchors = (text.match(/\b(?:I|you|we|me|my|your|our|the|a|an|and|but|because|that|this|it|is|are|was|were|feel|think|want|need|love|miss)\b/gi) || []).length;
  const suspiciousLongWords = longWords.filter((word) => LOW_GRAMMAR_WORD_RE.test(word)).length;
  const shortFragments = words.filter((word) => word.length <= 3 && !/^(i|a|an|the|and|but|you|we|me|my|our|it|is|are|was|to|of|in|on|for|not|yes|no|hey|hi|so)$/i.test(word)).length;
  const fragmentRatio = words.length ? shortFragments / words.length : 0;
  if (words.length >= 35 && longWords.length >= 14 && punctuationCount <= 3 && grammarAnchors < Math.max(8, words.length * 0.18)) {
    reasons.push("low_grammar_word_dump");
    blockScore += 3;
  } else if (words.length >= 35 && fragmentRatio >= 0.2 && grammarAnchors < Math.max(10, words.length * 0.25)) {
    reasons.push("fragmented_word_dump");
    blockScore += 3;
  } else if (suspiciousLongWords >= 4 && punctuationCount <= 4) {
    reasons.push("suspicious_topic_dump");
    blockScore += 2;
  }

  // ── Repeated malformed token ───────────────────────────────────────────────
  const repeatedToken = findRepeatedMalformedToken(text);
  if (repeatedToken) {
    reasons.push("repeated_token");
    watchScore += 2;
  }

  // ── Incoherent tail: coherent prefix followed by noise ────────────────────
  if (text.length > 200) {
    const firstHalf = text.slice(0, Math.floor(text.length / 2));
    const secondHalf = text.slice(Math.floor(text.length / 2));
    const firstHalfCamel = (firstHalf.match(CAMEL_CASE_TOKEN_RE) || []).filter(w => w.length >= 8).length;
    const secondHalfCamel = (secondHalf.match(CAMEL_CASE_TOKEN_RE) || []).filter(w => w.length >= 8).length;
    if (secondHalfCamel >= 3 && secondHalfCamel > firstHalfCamel + 2) {
      reasons.push("incoherent_tail");
      blockScore += 2;
    }
  }

  // ── Determine severity and recommendation ─────────────────────────────────
  const dedupedReasons = [...new Set(reasons)];

  if (blockScore >= 3) {
    const safePrefix = findSafePrefix(text);
    return {
      corrupted: true,
      severity: "block",
      reasons: dedupedReasons,
      safePrefix,
      recommendation: safePrefix.length > 30 ? "trim_to_safe_prefix" : "regenerate",
    };
  }

  if (watchScore >= 2 || blockScore >= 1) {
    return {
      corrupted: false,
      severity: "watch",
      reasons: dedupedReasons,
      safePrefix: "",
      recommendation: "send",
    };
  }

  return _safe("none", dedupedReasons);
}

function _safe(severity, reasons) {
  return {
    corrupted: false,
    severity,
    reasons,
    safePrefix: "",
    recommendation: "send",
  };
}

module.exports = { detectOutputCorruption };
