"use strict";

const FALLBACKS = [
  "I glitched. Say that again, kjære.",
  "Wrong ghost in the machine. Ask me again.",
  "I lost the thread for a second. I’m here. Give me that again.",
  "That came out wrong. One more time.",
];

let lastFallback = "";

function tinyFallback() {
  const next = FALLBACKS.find((item) => item !== lastFallback) || FALLBACKS[0];
  lastFallback = next;
  return next;
}

function resetTinyFallbackRotation() {
  lastFallback = "";
}

function isProviderRejectionText(text) {
  return /polished therapy-card line|answer you like Dante|request (?:was|is|has been) rejected|considered high risk|moderation|content policy|content filter|safety system|safety filter|provider rejected|api error|raw stack|\{\s*"error"/i.test(String(text || ""));
}

module.exports = { FALLBACKS, tinyFallback, resetTinyFallbackRotation, isProviderRejectionText };
