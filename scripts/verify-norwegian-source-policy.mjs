import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-source-policy] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-source-policy] FAIL ${message}`);
  process.exitCode = 1;
}

async function main() {
  const statusPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianSourceStatus.js');
  const policyPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianSourcePolicy.js');
  const sourcesPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianTrustedSources.js');

  // Load source status module
  let statusMod;
  try {
    statusMod = require(statusPath);
    pass('norwegianSourceStatus.js loaded');
  } catch (error) {
    fail(`norwegianSourceStatus.js failed to load: ${error.message}`);
    return;
  }

  const { SOURCE_STATUS, ALLOWED_SOURCE_STATUSES, validateSourceStatus } = statusMod;

  // Check SOURCE_STATUS values
  const expectedStatuses = [
    'verified',
    'partial',
    'stt_based_practice',
    'low_confidence',
    'unverified_practice',
    'not_checked',
  ];
  for (const status of expectedStatuses) {
    if (SOURCE_STATUS[status] === status) {
      pass(`SOURCE_STATUS.${status} = '${status}'`);
    } else {
      fail(`SOURCE_STATUS.${status} is missing or wrong value`);
    }
  }

  // ALLOWED_SOURCE_STATUSES is a Set with all values
  if (ALLOWED_SOURCE_STATUSES instanceof Set) {
    pass('ALLOWED_SOURCE_STATUSES is a Set');
  } else {
    fail('ALLOWED_SOURCE_STATUSES must be a Set');
  }

  for (const status of expectedStatuses) {
    if (ALLOWED_SOURCE_STATUSES.has(status)) {
      pass(`ALLOWED_SOURCE_STATUSES contains: ${status}`);
    } else {
      fail(`ALLOWED_SOURCE_STATUSES missing: ${status}`);
    }
  }

  // validateSourceStatus accepts valid values
  for (const status of expectedStatuses) {
    try {
      const result = validateSourceStatus(status);
      if (result === status) {
        pass(`validateSourceStatus accepts: ${status}`);
      } else {
        fail(`validateSourceStatus returned wrong value for: ${status}`);
      }
    } catch (error) {
      fail(`validateSourceStatus threw for valid status '${status}': ${error.message}`);
    }
  }

  // validateSourceStatus rejects invalid values
  const invalidStatuses = ['', 'made_up', 'VERIFIED', 'true', 'null', 'unknown'];
  for (const bad of invalidStatuses) {
    try {
      validateSourceStatus(bad);
      fail(`validateSourceStatus should reject: '${bad}'`);
    } catch {
      pass(`validateSourceStatus rejects invalid: '${bad}'`);
    }
  }

  // Load source policy module
  let policyMod;
  try {
    policyMod = require(policyPath);
    pass('norwegianSourcePolicy.js loaded');
  } catch (error) {
    fail(`norwegianSourcePolicy.js failed to load: ${error.message}`);
    return;
  }

  const { POLICY, getPolicy, checkVocabularyAllowed, checkGrammarAllowed, checkMediaLinkAllowed, resolveConflict } = policyMod;

  // Check policy sections exist
  const requiredPolicySections = [
    'vocabulary', 'grammar', 'pronunciation', 'mediaLinks',
    'dialectClaims', 'sourceConflict', 'uncertainty', 'subtitleAvailability',
  ];
  for (const section of requiredPolicySections) {
    if (POLICY[section]) {
      pass(`POLICY.${section} exists`);
    } else {
      fail(`POLICY.${section} is missing`);
    }
  }

  // Source conflict rule: source wins
  if (POLICY.sourceConflict.resolution === 'source_wins') {
    pass('Source conflict resolution is source_wins');
  } else {
    fail('Source conflict resolution must be source_wins');
  }

  // Media links only allow verified
  if (POLICY.mediaLinks.allowedStatuses.includes('verified') && POLICY.mediaLinks.allowedStatuses.length === 1) {
    pass('mediaLinks only allows verified status');
  } else {
    fail('mediaLinks must only allow verified status');
  }

  // getPolicy returns the policy
  if (typeof getPolicy === 'function') {
    const p = getPolicy();
    if (p === POLICY) {
      pass('getPolicy() returns POLICY');
    } else {
      fail('getPolicy() should return POLICY');
    }
  } else {
    fail('getPolicy must be a function');
  }

  // checkVocabularyAllowed works
  if (typeof checkVocabularyAllowed === 'function') {
    if (checkVocabularyAllowed('verified') === true) {
      pass('checkVocabularyAllowed accepts verified');
    } else {
      fail('checkVocabularyAllowed should accept verified');
    }
    if (checkVocabularyAllowed('stt_based_practice') === false) {
      pass('checkVocabularyAllowed rejects stt_based_practice');
    } else {
      fail('checkVocabularyAllowed should reject stt_based_practice for vocabulary');
    }
  } else {
    fail('checkVocabularyAllowed must be a function');
  }

  // checkMediaLinkAllowed only allows verified
  if (typeof checkMediaLinkAllowed === 'function') {
    if (checkMediaLinkAllowed('verified') === true) {
      pass('checkMediaLinkAllowed accepts verified');
    } else {
      fail('checkMediaLinkAllowed should accept verified');
    }
    if (checkMediaLinkAllowed('unverified_practice') === false) {
      pass('checkMediaLinkAllowed rejects unverified_practice');
    } else {
      fail('checkMediaLinkAllowed should reject unverified_practice for media links');
    }
  } else {
    fail('checkMediaLinkAllowed must be a function');
  }

  // resolveConflict
  if (typeof resolveConflict === 'function') {
    const resolution = resolveConflict();
    if (resolution === 'source_wins') {
      pass('resolveConflict() returns source_wins');
    } else {
      fail('resolveConflict() must return source_wins');
    }
  } else {
    fail('resolveConflict must be a function');
  }

  // dialectClaims note mentions that it's a practical choice
  if (POLICY.dialectClaims.note && POLICY.dialectClaims.note.includes('practical')) {
    pass('dialectClaims note clarifies this is a practical choice');
  } else {
    fail('dialectClaims must clarify this is a practical choice');
  }

  // Load trusted sources
  let sourcesMod;
  try {
    sourcesMod = require(sourcesPath);
    pass('norwegianTrustedSources.js loaded');
  } catch (error) {
    fail(`norwegianTrustedSources.js failed to load: ${error.message}`);
    return;
  }

  const { TRUSTED_SOURCE_CATEGORIES, TRUSTED_SOURCES, getSourceById } = sourcesMod;

  const expectedCategories = [
    'official_dictionary', 'official_language_guidance', 'public_broadcaster', 'education', 'media',
  ];
  for (const cat of expectedCategories) {
    if (TRUSTED_SOURCE_CATEGORIES[cat]) {
      pass(`TRUSTED_SOURCE_CATEGORIES.${cat} exists`);
    } else {
      fail(`TRUSTED_SOURCE_CATEGORIES.${cat} is missing`);
    }
  }

  const expectedSourceIds = [
    'ordboekene', 'bokmaalsordboka', 'nynorskordboka',
    'spraakraadet', 'nrk', 'nrk_tv', 'nrk_nyheter', 'nrk_skole', 'youtube_verified',
  ];
  for (const id of expectedSourceIds) {
    const src = getSourceById(id);
    if (src && src.id === id) {
      pass(`Trusted source exists: ${id} ("${src.name}")`);
    } else {
      fail(`Trusted source missing: ${id}`);
    }
  }

  if (TRUSTED_SOURCES.length >= 9) {
    pass(`TRUSTED_SOURCES has ${TRUSTED_SOURCES.length} entries`);
  } else {
    fail(`TRUSTED_SOURCES should have at least 9 entries, found: ${TRUSTED_SOURCES.length}`);
  }

  if (!process.exitCode) {
    console.log('[verify:norwegian-source-policy] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:norwegian-source-policy] Unexpected error:', error.message);
  process.exit(1);
});
