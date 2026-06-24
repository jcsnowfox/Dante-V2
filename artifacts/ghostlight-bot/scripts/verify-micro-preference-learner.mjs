import assert from 'node:assert/strict';
import { detectPreferences, saveDetectedPreferences, retrieveRelevantPreferences, formatPreferencePrelude } from '../src/humanSimulation/microPreferenceLearner.js';
import { createMicroPreferenceStore } from '../src/storage/microPreferences.js';

const store = createMicroPreferenceStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// 1. Explicit disliked phrase detection
const detected1 = detectPreferences("I hate when you say 'your feelings are valid'. Don't say that to me.");
assert(detected1.length > 0, 'should detect preference from explicit hate statement');
const disliked = detected1.find(p => p.preference_type === 'disliked_phrase' || p.negative);
assert(disliked, 'should classify as disliked_phrase');
assert(disliked.confidence >= 0.85, `confidence should be high for explicit statement, got ${disliked.confidence}`);
assert(disliked.source === 'explicit', 'source should be explicit');

// 2. Nickname preference detection
const detected2 = detectPreferences("I like when you call me kjære, but only when it sounds natural.");
assert(detected2.length > 0, 'should detect kjare preference');
const kjaere = detected2.find(p => p.preference_type === 'nickname' || p.preference_key?.includes('kjare'));
assert(kjaere, 'should detect kjare nickname preference');

// 3. Save detected preferences
const saved = await saveDetectedPreferences({ detected: detected1, store, userScope, companionId });
assert(saved.length > 0, 'should save detected preferences');
assert(saved[0].user_scope === userScope, 'user_scope must match');
assert(saved[0].companion_id === companionId, 'companion_id must match');

// 4. Repeated signal raises confidence / evidence count
const saved2 = await saveDetectedPreferences({ detected: detected1, store, userScope, companionId });
const updated = await store.listPreferences({ user_scope: userScope, companion_id: companionId });
const pref = updated.find(p => p.preference_key === saved[0].preference_key);
assert(pref, 'preference should persist');
assert(pref.evidence_count >= 2, `evidence count should increase on repeat, got ${pref.evidence_count}`);

// 5. Retrieve preferences before reply
const retrieved = await retrieveRelevantPreferences({ store, userScope, companionId });
assert(retrieved.length > 0, 'retrieveRelevantPreferences should return saved prefs');

// 6. Format prelude
const prelude = formatPreferencePrelude(retrieved);
assert(prelude, 'formatPreferencePrelude should return a section');
assert(prelude.label === 'MICRO-PREFERENCES', 'label should be MICRO-PREFERENCES');
assert(prelude.content.includes('*'), 'content should have bullet points');

// 7. Adult/private preferences do not leak into normal channel
const adultPref = { preference_type: 'adult_private_preference', preference_key: 'adult_pref', preference_value_summary: 'secret adult preference', source: 'explicit', confidence: 0.9, adult_context: true, privacy_scope: 'private' };
await store.upsertPreference({ user_scope: userScope, companion_id: companionId, ...adultPref });
const normalChannelPrefs = await retrieveRelevantPreferences({ store, userScope, companionId, adultPrivate: false });
const hasAdultLeak = normalChannelPrefs.some(p => p.adult_context === true);
assert(!hasAdultLeak, 'adult/private preferences must not appear in normal channel retrieval');

// 8. Dashboard: listPreferences returns all (for admin view)
const allPrefs = await store.listPreferences({ user_scope: userScope, companion_id: companionId, include_adult: true });
assert(allPrefs.some(p => p.adult_context), 'dashboard should see adult prefs when include_adult=true');

console.log('[verify:micro-preference-learner] PASS');
