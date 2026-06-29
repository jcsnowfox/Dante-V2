const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldUseAdultModel } = require('../createChatPipeline');
const { clearAdultScenes, setAdultSceneActive, getAdultScene, isContinuationPhrase, isExitPhrase, exitAdultScene } = require('../adultSceneState');

test('explicit adult message enters adult route and continuation stays adult', () => {
  clearAdultScenes();
  const explicit = shouldUseAdultModel({ adultPermission: true, messageText: 'explicit adult scene please' });
  assert.equal(explicit.useAdultModel, true);
  setAdultSceneActive({ channelId: 'c', userId: 'u', now: 1 });
  for (const phrase of ['then what', 'and then what', 'try again']) {
    assert.equal(isContinuationPhrase(phrase), true);
    const routed = shouldUseAdultModel({ adultPermission: true, messageText: phrase, adultSceneActive: true, adultSceneContinuation: true });
    assert.equal(routed.useAdultModel, true);
    assert.equal(routed.reason, 'adult_scene_continuation');
  }
});

test('safeword and timeout exit adult scene', () => {
  clearAdultScenes();
  setAdultSceneActive({ channelId: 'c', userId: 'u', now: 1000 });
  assert.equal(isExitPhrase('red', 'red'), 'safeword');
  exitAdultScene({ channelId: 'c', userId: 'u', now: 2000, reason: 'safeword' });
  assert.equal(getAdultScene({ channelId: 'c', userId: 'u', now: 2000 }).active, false);
  setAdultSceneActive({ channelId: 'c', userId: 'u', now: 1000 });
  const timedOut = getAdultScene({ channelId: 'c', userId: 'u', now: 5000, timeoutMs: 1000 });
  assert.equal(timedOut.active, false);
  assert.equal(timedOut.exitReason, 'timeout');
});
