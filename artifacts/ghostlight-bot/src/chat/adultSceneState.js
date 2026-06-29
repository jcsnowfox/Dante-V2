const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const scenes = new Map();

const CONTINUATION_PATTERNS = [
  /^(?:and\s+)?then what\??$/i,
  /^(?:keep going|more|more detail|full detail|don'?t stop|try again|yes|please|baby|harder|right there|continue)\b/i,
];
const EXIT_PATTERNS = [
  /\b(stop|pause|slow down|no|aftercare|boundary|uncomfortable|discomfort|not tonight|too much|back off)\b/i,
];

function keyFor({ channelId = '', conversationId = '', userId = '' } = {}) {
  return [channelId || conversationId || 'unknown', userId || 'unknown'].join(':');
}
function isContinuationPhrase(text = '') { return CONTINUATION_PATTERNS.some((re) => re.test(String(text || '').trim())); }
function isExitPhrase(text = '', safeword = 'red') {
  const value = String(text || '').trim().toLowerCase();
  if (safeword && value === String(safeword).trim().toLowerCase()) return 'safeword';
  return EXIT_PATTERNS.some((re) => re.test(value)) ? 'boundary_or_aftercare' : '';
}
function getAdultScene({ channelId, conversationId, userId, now = Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const key = keyFor({ channelId, conversationId, userId });
  const scene = scenes.get(key);
  if (!scene?.active) return { active: false, key };
  if (timeoutMs > 0 && now - scene.lastActivity > timeoutMs) {
    scenes.set(key, { ...scene, active: false, exitReason: 'timeout', exitedAt: now });
    return { active: false, key, exitReason: 'timeout', lastActivity: scene.lastActivity };
  }
  return { ...scene, key };
}
function setAdultSceneActive({ channelId, conversationId, userId, now = Date.now(), reason = 'adult_route_selected' } = {}) {
  const key = keyFor({ channelId, conversationId, userId });
  const scene = { active: true, startedAt: scenes.get(key)?.startedAt || now, lastActivity: now, reason, exitReason: null };
  scenes.set(key, scene);
  return { ...scene, key };
}
function keepAdultSceneAlive({ channelId, conversationId, userId, now = Date.now(), reason = 'continuation' } = {}) {
  return setAdultSceneActive({ channelId, conversationId, userId, now, reason });
}
function exitAdultScene({ channelId, conversationId, userId, now = Date.now(), reason = 'manual_exit' } = {}) {
  const key = keyFor({ channelId, conversationId, userId });
  const previous = scenes.get(key) || {};
  const scene = { ...previous, active: false, lastActivity: previous.lastActivity || now, exitReason: reason, exitedAt: now };
  scenes.set(key, scene);
  return { ...scene, key };
}
function clearAdultScenes() { scenes.clear(); }

module.exports = { DEFAULT_TIMEOUT_MS, isContinuationPhrase, isExitPhrase, getAdultScene, setAdultSceneActive, keepAdultSceneAlive, exitAdultScene, clearAdultScenes };
