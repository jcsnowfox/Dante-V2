import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pass(message) {
  console.log(`[verify:norwegian-dashboard] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-dashboard] FAIL ${message}`);
  process.exitCode = 1;
}

const DASHBOARD_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');

function checkDashboardExists() {
  if (!existsSync(DASHBOARD_PATH)) {
    fail('norwegianDashboard.js does not exist');
    return null;
  }
  pass('norwegianDashboard.js exists');
  return readFileSync(DASHBOARD_PATH, 'utf8');
}

function checkMediaTabUsesUrl(src) {
  // Must use media.url, NOT media.source_id
  if (src.includes('media.source_id')) {
    fail('renderMediaTab uses media.source_id — must use media.url');
  } else {
    pass('renderMediaTab does not use media.source_id');
  }

  if (src.includes('media.url')) {
    pass('renderMediaTab uses media.url correctly');
  } else {
    fail('renderMediaTab does not reference media.url — media links will be broken');
  }
}

function checkMediaTabUsesSourceName(src) {
  if (src.includes('media.source_name')) {
    pass('renderMediaTab uses media.source_name');
  } else {
    fail('renderMediaTab does not use media.source_name — source attribution missing');
  }
}

function checkMediaTabUsesLevel(src) {
  if (src.includes('media.level')) {
    pass('renderMediaTab uses media.level');
  } else {
    fail('renderMediaTab does not use media.level — level display missing');
  }
}

function checkMediaTabDoesNotParseNotesForSource(src) {
  // The old buggy code did JSON.parse(media.notes) to get source info
  // Now we have real columns; notes should not be parsed for source data
  const parseNotesForSource = /JSON\.parse\(media\.notes\)\s*\.\s*(source|level|url)/;
  if (parseNotesForSource.test(src)) {
    fail('renderMediaTab still parses media.notes for source/level/url — use direct columns');
  } else {
    pass('renderMediaTab does not parse media.notes for source data');
  }
}

function checkReviewTabHasPhase6Fields(src) {
  const phase6Fields = ['grade', 'priority', 'review_count', 'last_result', 'next_due_at'];
  for (const field of phase6Fields) {
    if (src.includes(field)) {
      pass(`renderReviewTab references Phase 6 field: ${field}`);
    } else {
      fail(`renderReviewTab missing Phase 6 field: ${field}`);
    }
  }
}

function checkEscapingUsed(src) {
  // XSS guard — HTML output must escape user data
  if (src.includes('esc(') || src.includes('escapeHtml(') || src.includes('he.escape(')) {
    pass('Dashboard uses HTML escaping function');
  } else {
    fail('Dashboard does not appear to escape HTML — potential XSS');
  }
}

function checkNoRawSourceId(src) {
  // source_id was the old broken field; it should not appear in the rendered output
  if (/href=.*source_id/.test(src)) {
    fail('Dashboard renders href from source_id — broken link bug still present');
  } else {
    pass('No href rendered from source_id');
  }
}

function checkWatchStatusRendered(src) {
  if (src.includes('watch_status') || src.includes('watchLabel') || src.includes('Watched')) {
    pass('Dashboard renders watch_status or watched indicator');
  } else {
    fail('Dashboard does not show watch_status — user cannot see watched state');
  }
}

function main() {
  const src = checkDashboardExists();
  if (!src) return;

  checkMediaTabUsesUrl(src);
  checkMediaTabUsesSourceName(src);
  checkMediaTabUsesLevel(src);
  checkMediaTabDoesNotParseNotesForSource(src);
  checkReviewTabHasPhase6Fields(src);
  checkEscapingUsed(src);
  checkNoRawSourceId(src);
  checkWatchStatusRendered(src);

  if (!process.exitCode) {
    console.log('[verify:norwegian-dashboard] All checks passed.');
  }
}

main();
