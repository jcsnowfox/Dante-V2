import assert from 'node:assert/strict';
import { createBoundaryConsentStore } from '../src/storage/boundaryConsentProfiles.js';
import { detectBoundaryLanguage, saveBoundaryConsent, retrieveRelevantBoundaries, formatBoundaryPrelude } from '../src/humanSimulation/boundaryConsentEngine.js';

const store = createBoundaryConsentStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// --- Detection tests ---

// Scenario A: medical_anxiety_boundary
const textA = "Don't give me emergency stroke warning lists unless I directly ask.";
const detectedA = detectBoundaryLanguage(textA);
assert(detectedA, 'Should detect boundary in Scenario A text');
assert(['medical_anxiety_boundary', 'do_not_send_emergency_list'].includes(detectedA.boundary_type) || detectedA.boundary_type === 'medical_anxiety_boundary', `Expected medical_anxiety_boundary, got ${detectedA.boundary_type}`);
assert(detectedA.allowed === false, 'medical boundary should be allowed=false');
assert(detectedA.confidence >= 0.85, `Confidence should be >= 0.85, got ${detectedA.confidence}`);

// Scenario B: adult/private scope
const textB = "That's okay in here, but don't say it in the normal channels.";
const detectedB = detectBoundaryLanguage(textB);
assert(detectedB, 'Should detect boundary in Scenario B text');
assert(
  detectedB.boundary_type === 'adult_private_preference' || detectedB.boundary_type === 'adult_private_boundary',
  `Expected adult/private type, got ${detectedB.boundary_type}`
);

// Scenario C: tone boundary
const textC = "Don't give me therapy-bot phrasing.";
const detectedC = detectBoundaryLanguage(textC);
assert(detectedC, 'Should detect tone boundary');
assert(detectedC.boundary_type === 'tone_boundary' || detectedC.boundary_type === 'medical_anxiety_boundary', `Got ${detectedC.boundary_type}`);

// Neutral text should not trigger
const noMatch = detectBoundaryLanguage("What's the weather like today?");
assert(noMatch === null, 'Neutral text should not trigger boundary detection');

// --- Storage tests ---

const saved = await saveBoundaryConsent({
  detected: detectedA,
  store,
  userScope,
  companionId,
  sourceChannelId: 'ch-general',
  sourceMessageId: 'msg-001',
  adultPrivate: false,
});
assert(saved, 'Should save boundary');
assert(saved.user_scope === userScope, 'user_scope must match');
assert(saved.companion_id === companionId, 'companion_id must match');
assert(saved.boundary_type === detectedA.boundary_type, 'boundary_type must match');
assert(saved.confidence >= 0.85, 'saved confidence should be high');

// Adult/private boundary
const savedB = await saveBoundaryConsent({
  detected: { ...detectedB, boundary_key: 'private_scope_test' },
  store,
  userScope,
  companionId,
  sourceChannelId: 'ch-private',
  sourceMessageId: 'msg-002',
  adultPrivate: true,
});
assert(savedB, 'Should save adult/private boundary');
assert(savedB.adult_context === true, 'adult_context must be true for private boundary');
assert(savedB.privacy_scope === 'private', 'privacy_scope must be private');

// --- Retrieval tests ---

// Normal channel — must not receive adult/private boundaries
const normalBoundaries = await retrieveRelevantBoundaries({ store, userScope, companionId, adultPrivate: false });
assert(Array.isArray(normalBoundaries), 'Should return array');
const hasAdultInNormal = normalBoundaries.some(b => b.adult_context);
assert(!hasAdultInNormal, 'Normal channel retrieval must not include adult/private boundaries');

// Private channel — should include adult/private
const privateBoundaries = await retrieveRelevantBoundaries({ store, userScope, companionId, adultPrivate: true });
assert(privateBoundaries.some(b => b.adult_context), 'Private channel should include adult/private boundaries');

// --- Prelude format tests ---

const prelude = formatBoundaryPrelude(normalBoundaries, false);
if (normalBoundaries.length > 0) {
  assert(prelude, 'Should produce prelude when boundaries exist');
  assert(prelude.label === 'BOUNDARIES', 'prelude label should be BOUNDARIES');
  assert(typeof prelude.content === 'string', 'prelude content should be string');
}

// Privacy: adult/private details must not leak into normal prelude
const preludeNormal = formatBoundaryPrelude(privateBoundaries, false);
if (preludeNormal) {
  // The adult boundary content should be filtered
  assert(!preludeNormal.content.toLowerCase().includes('private_scope_test'), 'Adult boundary key must not leak into normal prelude');
}

// Deactivate boundary
const deactivated = await store.deactivate({ id: saved.id });
assert(deactivated, 'Should return deactivated record');
assert(deactivated.active === false, 'Deactivated boundary should have active=false');

// After deactivation, active_only retrieval should not include it
const afterDeactivate = await store.listBoundaries({ user_scope: userScope, companion_id: companionId, active_only: true, include_adult: false });
assert(!afterDeactivate.some(b => b.id === saved.id), 'Deactivated boundary should not appear in active_only list');

console.log('[verify:boundary-consent-memory] PASS');
