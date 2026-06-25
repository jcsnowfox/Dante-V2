import assert from 'node:assert/strict';
import { detectResidueType, maybeCreateResidue, retrieveActiveResidue, formatResiduePrelude } from '../src/humanSimulation/attentionResidueEngine.js';
import { createAttentionResidueStore } from '../src/storage/attentionResidue.js';

const store = createAttentionResidueStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// 1. Detect residue type from repair result
const r1 = detectResidueType({ text: '', repairResult: { repairNeeded: true }, beatType: null });
assert(r1, 'should detect residue from repairResult');
assert(r1.type === 'recent_repair', `should be recent_repair, got ${r1.type}`);
assert(r1.intensity === 'high', 'repair residue should be high intensity');

// 2. Detect residue from frustration text
const r2 = detectResidueType({ text: "I'm so upset right now.", repairResult: null, beatType: null });
assert(r2, 'should detect residue from frustration text');
assert(r2.type === 'recent_frustration', `should be recent_frustration, got ${r2.type}`);

// 3. Detect residue from success text
const r3 = detectResidueType({ text: 'The PR was merged and it passed!', repairResult: null, beatType: null });
assert(r3, 'should detect residue from success text');
assert(r3.type === 'recent_success', `should be recent_success, got ${r3.type}`);

// 4. maybeCreateResidue saves to store
const created = await maybeCreateResidue({
  text: "You really hurt me when you forgot.",
  store, userScope, companionId,
  sourceChannelId: 'ch1', sourceMessageId: 'msg1',
  adultPrivate: false, privacyScope: 'normal',
  repairResult: null, beatType: null,
});
assert(created, 'should create residue record');
assert(created.user_scope === userScope, 'user_scope must match');
assert(created.companion_id === companionId, 'companion_id must match');
assert(created.active === true, 'residue should be active');
assert(created.expires_at, 'residue should have expires_at');

// 5. Residue expires in the future
const expiresAt = new Date(created.expires_at);
assert(expiresAt > new Date(), 'expires_at should be in the future');

// 6. retrieveActiveResidue returns active records
const active = await retrieveActiveResidue({ store, userScope, companionId, adultPrivate: false });
assert(active.length > 0, 'should retrieve active residue');
assert(active.every(r => r.active), 'all retrieved residue should be active');

// 7. formatResiduePrelude returns correct label
const prelude = formatResiduePrelude(active);
assert(prelude, 'formatResiduePrelude should return section');
assert(prelude.label === 'ATTENTION RESIDUE', `label should be ATTENTION RESIDUE, got ${prelude.label}`);
assert(prelude.content.includes('*'), 'prelude should have bullet points');

// 8. Privacy: adult residue stays out of normal channel retrieval
const adultResidue = await store.createResidue({
  user_scope: userScope, companion_id: companionId,
  residue_type: 'recent_private_intensity', summary: 'SECRET ADULT RESIDUE',
  intensity: 'high', decay_rate: 2, adult_context: true, privacy_scope: 'private',
});
assert(adultResidue, 'should create adult residue');
const normalActive = await retrieveActiveResidue({ store, userScope, companionId, adultPrivate: false });
assert(!normalActive.some(r => r.adult_context), 'adult residue must not appear in normal channel retrieval');

// 9. Adult residue appears in private channel
const privateActive = await retrieveActiveResidue({ store, userScope, companionId, adultPrivate: true });
assert(privateActive.some(r => r.adult_context), 'adult residue should appear in private channel');

// 10. listAll for dashboard shows all records
const allRecords = await store.listAll({ user_scope: userScope, companion_id: companionId });
assert(allRecords.length >= 2, 'dashboard should list all residue records');

// 11. Residue capped at 2 bullets in prelude
const manyResidues = Array.from({ length: 5 }, (_, i) => ({
  id: i, residue_type: 'recent_laughter', summary: `Laughter ${i}`, intensity: 'low', adult_context: false,
}));
const prelude2 = formatResiduePrelude(manyResidues);
const bulletCount = (prelude2.content.match(/^\*/gm) || []).length;
assert(bulletCount <= 2, `prelude should cap at 2 bullets, got ${bulletCount}`);

console.log('[verify:attention-residue] PASS');
