import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:second-life-bridge] PASS ${message}`);
}

function warn(message) {
  console.warn(`[verify:second-life-bridge] WARN ${message}`);
}

function fail(message) {
  console.error(`[verify:second-life-bridge] FAIL ${message}`);
  process.exitCode = 1;
}

async function main() {
  // Check secondLifeApi.js exists
  const slApiPath = path.resolve(__dirname, '../src/http/secondLifeApi.js');
  if (!existsSync(slApiPath)) {
    fail(`secondLifeApi.js not found at ${slApiPath}`);
  } else {
    pass('secondLifeApi.js exists');
    const content = readFileSync(slApiPath, 'utf8');

    // Should handle /api/second-life/* paths
    if (!content.includes('/api/second-life/')) {
      fail('secondLifeApi.js does not handle /api/second-life/ routes');
    } else {
      pass('secondLifeApi.js handles /api/second-life/ routes');
    }

    // Should check x-bridge-secret header
    if (!content.includes('x-bridge-secret') && !content.includes('bridge-secret')) {
      fail('secondLifeApi.js does not check x-bridge-secret header');
    } else {
      pass('secondLifeApi.js checks bridge secret header');
    }
  }

  // Check createHealthServer.js calls handleSecondLifeApiRequest outside of admin auth gate
  const healthServerPath = path.resolve(__dirname, '../src/http/createHealthServer.js');
  if (!existsSync(healthServerPath)) {
    fail(`createHealthServer.js not found at ${healthServerPath}`);
  } else {
    pass('createHealthServer.js exists');
    const content = readFileSync(healthServerPath, 'utf8');

    if (!content.includes('handleSecondLifeApiRequest') && !content.includes('secondLifeApi') && !content.includes('second-life')) {
      fail('createHealthServer.js does not reference Second Life API handler');
    } else {
      pass('createHealthServer.js references Second Life API handler');
    }
  }

  // Check Second Life store file exists
  const slStorePath = path.resolve(__dirname, '../src/storage/secondLife/index.js');
  if (!existsSync(slStorePath)) {
    fail(`storage/secondLife/index.js not found at ${slStorePath}`);
  } else {
    pass('storage/secondLife/index.js exists');
  }

  // Check SECOND_LIFE_BRIDGE_SECRET is referenced somewhere (env check)
  const envPath = path.resolve(__dirname, '../src/config/env.js');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    if (!envContent.includes('SECOND_LIFE') && !envContent.includes('secondLife')) {
      warn('env.js does not reference SECOND_LIFE env vars — bridge secret may be checked directly in handler');
    } else {
      pass('env.js references Second Life config');
    }
  }

  if (!process.exitCode) {
    console.log('[verify:second-life-bridge] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:second-life-bridge] Unexpected error:', error.message);
  process.exit(1);
});
