"use strict";
const state = {
  startupAt: new Date().toISOString(),
  llm: {}, audio: {}, image: {}, memory: {}, continuity: {}, norwegian: {}, privacy: {}, errors: {}
};
function updateSystemTruth(section, patch = {}) { if (!state[section]) state[section] = {}; Object.assign(state[section], patch); }
function getRuntimeState() { return state; }
function mask(value) { const s = String(value || ""); if (!s) return "not_configured"; if (s.length <= 6) return "***"; return `${s.slice(0,2)}…${s.slice(-2)}`; }
module.exports = { updateSystemTruth, getRuntimeState, mask };
