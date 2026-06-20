"use strict";

/**
 * Provider content-filter refusal detection.
 *
 * Two distinct jobs, two distinct strictnesses:
 *
 * 1. isStandaloneProviderRefusal — TIGHT. Used on the model's freshly produced
 *    VISIBLE reply text. Must only fire on a short, standalone refusal template
 *    so a legitimate reply that merely mentions these phrases is never replaced.
 *
 * 2. containsProviderRefusalText / sanitizeStoredText — "contains anywhere".
 *    Used to scrub ALREADY-STORED history and memory before they are re-injected
 *    into a new request. A refusal that was persisted (e.g. as a poisoned image
 *    description or as a leaked assistant reply, before this guard existed) will
 *    otherwise be re-sent verbatim every turn and make the provider reject every
 *    subsequent request — including plain text. Scrubbing it at the injection
 *    boundary recovers bricked conversations without database surgery.
 */

const STANDALONE_PROVIDER_REFUSAL_PATTERN =
  /^\s*(the |this |your )?request (was|is|has been) rejected|^\s*rejected because|considered high risk|flagged (by the safety system|as high risk)/i;

// Broader "contains anywhere" markers, including this app's own neutral fallback
// strings, so previously-stored refusals/placeholders are scrubbed from context.
const PROVIDER_REFUSAL_MARKERS =
  /(request (was|is|has been) rejected|rejected because it was considered|considered high risk|flagged (by the safety system|as high risk)|the model provider declined this request)/i;

const SCRUBBED_PLACEHOLDER = "(An earlier message was unavailable and has been omitted.)";

function isStandaloneProviderRefusal(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length > 320) return false;
  return STANDALONE_PROVIDER_REFUSAL_PATTERN.test(trimmed);
}

function containsProviderRefusalText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  return PROVIDER_REFUSAL_MARKERS.test(raw);
}

function sanitizeStoredText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return raw;
  if (containsProviderRefusalText(raw)) {
    return SCRUBBED_PLACEHOLDER;
  }
  return raw;
}

module.exports = {
  STANDALONE_PROVIDER_REFUSAL_PATTERN,
  PROVIDER_REFUSAL_MARKERS,
  SCRUBBED_PLACEHOLDER,
  isStandaloneProviderRefusal,
  containsProviderRefusalText,
  sanitizeStoredText,
};
