import 'dotenv/config';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:games] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:games] FAIL ${message}`);
  process.exitCode = 1;
}

async function main() {
  // Check games system entry file
  const gamesIndexPath = path.resolve(__dirname, '../src/games/index.js');
  if (!existsSync(gamesIndexPath)) {
    fail(`games/index.js not found at ${gamesIndexPath}`);
  } else {
    pass(`games/index.js exists at ${gamesIndexPath}`);
  }

  // Try requiring the games module to catch require() errors
  try {
    const gamesModule = require(gamesIndexPath);
    if (typeof gamesModule.createGameSystem !== 'function') {
      fail('createGameSystem is not exported from games/index.js');
    } else {
      pass('createGameSystem is exported from games/index.js');
    }
  } catch (error) {
    fail(`games/index.js failed to load: ${error.message}`);
  }

  // Check index.js references createGameSystem
  const indexPath = path.resolve(__dirname, '../src/index.js');
  if (!existsSync(indexPath)) {
    fail(`src/index.js not found at ${indexPath}`);
  } else {
    const { readFileSync } = await import('node:fs');
    const indexContent = readFileSync(indexPath, 'utf8');
    if (!indexContent.includes('createGameSystem')) {
      fail('createGameSystem is not wired into src/index.js');
    } else {
      pass('createGameSystem is referenced in src/index.js');
    }
    if (!indexContent.includes('gameSystem.init()')) {
      fail('gameSystem.init() is not called in src/index.js startup sequence');
    } else {
      pass('gameSystem.init() is called in src/index.js');
    }
    if (!indexContent.includes('createButtonHandler')) {
      fail('createButtonHandler is not called in src/index.js');
    } else {
      pass('createButtonHandler is called in src/index.js');
    }
  }

  if (!process.exitCode) {
    console.log('[verify:games] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:games] Unexpected error:', error.message);
  process.exit(1);
});
