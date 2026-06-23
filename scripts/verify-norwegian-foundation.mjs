import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-foundation] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-foundation] FAIL ${message}`);
  process.exitCode = 1;
}

const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');

const REQUIRED_FILES = [
  'norwegianSourceStatus.js',
  'norwegianSourcePolicy.js',
  'norwegianTrustedSources.js',
  'norwegianSettings.js',
  'norwegianLearningStore.js',
  'index.js',
];

function checkFiles() {
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(BASE, file);
    if (!existsSync(filePath)) {
      fail(`Missing file: src/norwegian/${file}`);
    } else {
      pass(`File exists: src/norwegian/${file}`);
    }
  }
}

function checkModuleLoads() {
  // Load modules that do not depend on pg (root doesn't have pg in node_modules)
  const modulesWithoutPg = [
    { file: 'norwegianSourceStatus.js', exports: ['SOURCE_STATUS', 'ALLOWED_SOURCE_STATUSES', 'validateSourceStatus'] },
    { file: 'norwegianSourcePolicy.js', exports: ['POLICY', 'getPolicy', 'checkVocabularyAllowed', 'checkMediaLinkAllowed', 'resolveConflict'] },
    { file: 'norwegianTrustedSources.js', exports: ['TRUSTED_SOURCE_CATEGORIES', 'TRUSTED_SOURCES', 'getSourceById'] },
    { file: 'norwegianSettings.js', exports: ['NORWEGIAN_LEVELS', 'DEFAULT_NORWEGIAN_SETTINGS', 'validateNorwegianSettings', 'normalizeNorwegianSettings'] },
  ];

  for (const { file, exports: expectedExports } of modulesWithoutPg) {
    try {
      const mod = require(path.join(BASE, file));
      pass(`${file} loaded`);
      for (const key of expectedExports) {
        if (mod[key] === undefined) {
          fail(`${file} missing export: ${key}`);
        } else {
          pass(`${file} exports: ${key}`);
        }
      }
    } catch (error) {
      fail(`${file} failed to load: ${error.message}`);
    }
  }

  // Check store file exports createNorwegianLearningStore by reading source
  const storeSrc = readFileSync(path.join(BASE, 'norwegianLearningStore.js'), 'utf8');
  if (storeSrc.includes('createNorwegianLearningStore')) {
    pass('norwegianLearningStore.js defines createNorwegianLearningStore');
  } else {
    fail('norwegianLearningStore.js must define createNorwegianLearningStore');
  }

  const indexSrc = readFileSync(path.join(BASE, 'index.js'), 'utf8');
  if (indexSrc.includes('createNorwegianLearningStore')) {
    pass('index.js exports createNorwegianLearningStore');
  } else {
    fail('index.js must export createNorwegianLearningStore');
  }
}

function checkDashboardWiring() {
  const renderPagesPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/http/renderAdminPages.js');
  if (existsSync(renderPagesPath)) {
    const content = readFileSync(renderPagesPath, 'utf8');
    if (content.includes('renderNorwegianLearningPage')) {
      pass('renderNorwegianLearningPage is exported from renderAdminPages.js');
    } else {
      fail('renderNorwegianLearningPage is not in renderAdminPages.js');
    }
  } else {
    fail('renderAdminPages.js not found');
  }

  const handlersPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/http/adminPageHandlers.js');
  if (existsSync(handlersPath)) {
    const content = readFileSync(handlersPath, 'utf8');
    if (content.includes('handleNorwegianLearningPageRequest')) {
      pass('handleNorwegianLearningPageRequest is in adminPageHandlers.js');
    } else {
      fail('handleNorwegianLearningPageRequest is not in adminPageHandlers.js');
    }
    if (content.includes("section === \"norwegian\"")) {
      pass('Norwegian section route is in adminPageHandlers.js');
    } else {
      fail('Norwegian section route is not in adminPageHandlers.js');
    }
  } else {
    fail('adminPageHandlers.js not found');
  }

  const sharedPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/http/renderAdminPages/shared.js');
  if (existsSync(sharedPath)) {
    const content = readFileSync(sharedPath, 'utf8');
    if (content.includes('norwegian') && content.includes('Norwegian')) {
      pass('Norwegian nav entry is in shared.js sidebar');
    } else {
      fail('Norwegian nav entry is not in shared.js sidebar');
    }
  } else {
    fail('shared.js not found');
  }
}

function checkNoBloat() {
  const norwegianDir = BASE;
  const files = REQUIRED_FILES.map((f) => path.join(norwegianDir, f));

  for (const filePath of files) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf8');
    const sizeKb = Buffer.byteLength(content, 'utf8') / 1024;
    if (sizeKb > 200) {
      fail(`File is unexpectedly large (${sizeKb.toFixed(1)} KB): ${path.basename(filePath)}`);
    } else {
      pass(`File size OK (${sizeKb.toFixed(1)} KB): ${path.basename(filePath)}`);
    }
  }
}

function checkIndexWired() {
  const indexPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/index.js');
  if (!existsSync(indexPath)) {
    fail('src/index.js not found');
    return;
  }
  const content = readFileSync(indexPath, 'utf8');
  if (content.includes('createNorwegianLearningStore')) {
    pass('createNorwegianLearningStore is referenced in src/index.js');
  } else {
    fail('createNorwegianLearningStore is not referenced in src/index.js');
  }
  if (content.includes('norwegianLearning.init()')) {
    pass('norwegianLearning.init() is called in src/index.js');
  } else {
    fail('norwegianLearning.init() is not called in src/index.js');
  }
}

async function main() {
  checkFiles();
  checkModuleLoads();
  checkDashboardWiring();
  checkNoBloat();
  checkIndexWired();

  if (!process.exitCode) {
    console.log('[verify:norwegian-foundation] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:norwegian-foundation] Unexpected error:', error.message);
  process.exit(1);
});
