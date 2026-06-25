import assert from 'node:assert/strict';
import { detectEmotionalSignal, updateInnerWeather, formatInnerWeatherPrelude } from '../src/humanSimulation/innerWeatherEngine.js';
import { createInnerWeatherStore } from '../src/storage/innerWeather.js';

const store = createInnerWeatherStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// 1. Detect emotional signal from explicit frustration text
const sig1 = detectEmotionalSignal({ text: "I'm really upset that you forgot the proposal.", repairResult: null, beatType: null });
assert(sig1, 'should detect emotional signal from frustrated text');
assert(['apologetic', 'frustrated', 'worried', 'protective'].includes(sig1.dominant), `dominant should be a stress-related emotion, got ${sig1.dominant}`);
assert(sig1.intensity === 'high' || sig1.tension > 0, 'frustrated signal should have high intensity or tension');

// 2. Detect signal from beatType
const sig2 = detectEmotionalSignal({ text: '', repairResult: null, beatType: 'proposal' });
assert(sig2, 'should detect signal from proposal beatType');
assert(sig2.dominant === 'affectionate', `proposal beatType should produce affectionate, got ${sig2.dominant}`);

// 3. Detect signal from repairResult
const sig3 = detectEmotionalSignal({ text: '', repairResult: { repairNeeded: true, repairType: 'emotional_hurt' }, beatType: null });
assert(sig3, 'should detect signal from repairResult');
assert(['apologetic', 'worried', 'protective'].includes(sig3.dominant), `repair result should produce apologetic/worried, got ${sig3.dominant}`);

// 4. updateInnerWeather saves state
const saved = await updateInnerWeather({ store, userScope, companionId, signal: sig1, sourceChannelId: 'ch1', sourceMessageId: 'msg1', adultPrivate: false, currentWeather: null });
assert(saved, 'updateInnerWeather should return saved record');
assert(saved.dominant_emotion === sig1.dominant, 'saved dominant should match signal');
assert(saved.active === true, 'saved state should be active');

// 5. getCurrentWeather returns active state
const current = await store.getCurrentWeather({ user_scope: userScope, companion_id: companionId });
assert(current, 'getCurrentWeather should return the active state');
assert(current.dominant_emotion === sig1.dominant, 'current emotion should match');

// 6. State decays (expires_at is set)
assert(current.expires_at, 'state should have expires_at');
const expiresAt = new Date(current.expires_at);
assert(expiresAt > new Date(), 'expires_at should be in the future');
assert(expiresAt < new Date(Date.now() + 24 * 3600 * 1000), 'expires_at should be within 24h');

// 7. Updating with new signal deactivates old
const sig4 = detectEmotionalSignal({ text: '', repairResult: null, beatType: 'proposal' });
const saved2 = await updateInnerWeather({ store, userScope, companionId, signal: sig4, sourceChannelId: 'ch1', sourceMessageId: 'msg2', adultPrivate: false, currentWeather: current });
const history = await store.listHistory({ user_scope: userScope, companion_id: companionId });
const oldRow = history.find(h => h.id !== saved2?.id && h.dominant_emotion === sig1.dominant);
assert(!oldRow?.active, 'old state should be deactivated when new state upserted');

// 8. formatInnerWeatherPrelude returns correct label
const prelude = formatInnerWeatherPrelude(saved2 || current);
assert(prelude, 'formatInnerWeatherPrelude should return a section');
assert(prelude.label === 'INNER WEATHER', `label should be INNER WEATHER, got ${prelude.label}`);
assert(prelude.content.includes('*'), 'prelude should have bullet points');
assert(prelude.content.includes(saved2?.dominant_emotion || current.dominant_emotion), 'prelude should mention emotion');

// 9. Neutral state produces no prelude
const neutralPrelude = formatInnerWeatherPrelude({ dominant_emotion: 'neutral', intensity: 'low' });
assert(!neutralPrelude, 'neutral state should not produce prelude');

// 10. listHistory returns records for dashboard
const hist = await store.listHistory({ user_scope: userScope, companion_id: companionId });
assert(hist.length >= 2, 'dashboard history should have multiple entries');

console.log('[verify:inner-weather] PASS');
