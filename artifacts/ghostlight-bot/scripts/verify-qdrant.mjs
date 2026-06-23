import 'dotenv/config';

function pass(message) {
  console.log(`[verify:qdrant] PASS ${message}`);
}

function warn(message) {
  console.warn(`[verify:qdrant] WARN ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:qdrant] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

async function main() {
  const qdrantUrl = process.env.QDRANT_URL || '';
  const qdrantApiKey = process.env.QDRANT_API_KEY || '';
  const collection = process.env.QDRANT_COLLECTION || 'ghostlight-memory';
  const musicCollection = process.env.QDRANT_MUSIC_COLLECTION || 'ghostlight-music';

  if (!qdrantUrl) {
    warn('QDRANT_URL is not set — Qdrant vector memory is disabled (this is OK if you use only PostgreSQL memories)');
    console.log('[verify:qdrant] Qdrant is not configured — skipping connectivity checks.');
    return;
  }

  pass(`QDRANT_URL is set: ${qdrantUrl}`);

  if (!qdrantApiKey) {
    warn('QDRANT_API_KEY is not set — this is OK for local/unauthenticated Qdrant, but required for Qdrant Cloud');
  } else {
    pass('QDRANT_API_KEY is set');
  }

  pass(`Collection name: ${collection}`);
  pass(`Music collection name: ${musicCollection}`);

  // Attempt a health check
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (qdrantApiKey) {
      headers['api-key'] = qdrantApiKey;
    }

    const healthUrl = new URL('/healthz', qdrantUrl).toString();
    const response = await fetch(healthUrl, { headers, signal: AbortSignal.timeout(5000) });

    if (response.ok) {
      pass(`Qdrant health check passed: HTTP ${response.status}`);
    } else {
      fail(`Qdrant health check returned HTTP ${response.status}`, { url: healthUrl });
    }
  } catch (error) {
    fail(`Qdrant health check failed: ${error.message}`, { url: qdrantUrl });
  }

  if (!process.exitCode) {
    console.log('[verify:qdrant] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:qdrant] Unexpected error:', error.message);
  process.exit(1);
});
