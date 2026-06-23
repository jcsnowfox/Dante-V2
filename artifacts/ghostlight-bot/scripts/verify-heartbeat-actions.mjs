import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pass(message) {
  console.log(`[verify:heartbeat-actions] PASS ${message}`);
}

function warn(message) {
  console.warn(`[verify:heartbeat-actions] WARN ${message}`);
}

function fail(message) {
  console.error(`[verify:heartbeat-actions] FAIL ${message}`);
  process.exitCode = 1;
}

async function main() {
  // Check env vars
  const enabled = process.env.HEARTBEAT_ENABLED ?? process.env.METRONOME_ENABLED;
  if (enabled === undefined || enabled === null) {
    pass('HEARTBEAT_ENABLED not set — defaults to true (heartbeat is active)');
  } else if (['1', 'true', 'yes', 'on'].includes(String(enabled).toLowerCase())) {
    pass(`HEARTBEAT_ENABLED=${enabled}`);
  } else {
    warn(`HEARTBEAT_ENABLED=${enabled} — heartbeat is disabled`);
  }

  const quietHoursEnabled = process.env.HEARTBEAT_QUIET_HOURS_ENABLED ?? process.env.METRONOME_QUIET_HOURS_ENABLED;
  if (quietHoursEnabled !== undefined) {
    pass(`HEARTBEAT_QUIET_HOURS_ENABLED=${quietHoursEnabled}`);
  } else {
    pass('HEARTBEAT_QUIET_HOURS_ENABLED not set — defaults to true (quiet hours enabled)');
  }

  const quietStart = process.env.HEARTBEAT_QUIET_HOURS_START ?? process.env.METRONOME_QUIET_HOURS_START ?? '22:00';
  const quietEnd = process.env.HEARTBEAT_QUIET_HOURS_END ?? process.env.METRONOME_QUIET_HOURS_END ?? '08:00';
  pass(`Quiet hours: ${quietStart} – ${quietEnd}`);

  // Check heartbeat service file exists
  const heartbeatPath = path.resolve(__dirname, '../src/heartbeat/index.js');
  if (!existsSync(heartbeatPath)) {
    fail(`heartbeat/index.js not found at ${heartbeatPath}`);
  } else {
    pass('heartbeat/index.js exists');
    const content = readFileSync(heartbeatPath, 'utf8');
    if (!content.includes('quietHours') && !content.includes('quiet_hours') && !content.includes('quietHoursEnabled')) {
      warn('heartbeat/index.js may not check quiet hours — verify manually');
    } else {
      pass('heartbeat/index.js references quiet hours');
    }
  }

  // Check heartbeat action store
  const storePath = path.resolve(__dirname, '../src/storage/heartbeatActions/index.js');
  if (!existsSync(storePath)) {
    fail(`storage/heartbeatActions/index.js not found at ${storePath}`);
  } else {
    pass('storage/heartbeatActions/index.js exists');
    const content = readFileSync(storePath, 'utf8');
    if (!content.includes('ALTER TABLE heartbeat_actions ADD COLUMN IF NOT EXISTS')) {
      warn('heartbeat_actions store may be missing ADD COLUMN IF NOT EXISTS migration guards');
    } else {
      pass('heartbeat_actions store has ADD COLUMN IF NOT EXISTS migration guards');
    }
  }

  // Check index.js wires heartbeatActionStore
  const indexPath = path.resolve(__dirname, '../src/index.js');
  if (!existsSync(indexPath)) {
    fail(`src/index.js not found`);
  } else {
    const content = readFileSync(indexPath, 'utf8');
    if (!content.includes('heartbeatActionStore')) {
      fail('heartbeatActionStore is not referenced in src/index.js');
    } else {
      pass('heartbeatActionStore is wired in src/index.js');
    }
    if (!content.includes('seedStarterHeartbeatActions')) {
      warn('seedStarterHeartbeatActions is not called in src/index.js');
    } else {
      pass('seedStarterHeartbeatActions is called in src/index.js');
    }
  }

  if (!process.exitCode) {
    console.log('[verify:heartbeat-actions] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:heartbeat-actions] Unexpected error:', error.message);
  process.exit(1);
});
