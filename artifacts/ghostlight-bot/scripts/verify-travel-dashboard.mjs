#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const has = (file, text) => read(file).includes(text);

function check(label, fn) {
  try {
    fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}: ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('TRAVEL_DASHBOARD_VERIFY_START');

check('/admin/travel route allowlisted', () => {
  assert.ok(has('src/http/createHealthServer.js', 'url.pathname === "/admin/travel"'));
  assert.ok(has('src/http/createHealthServer.js', 'url.pathname.startsWith("/admin/travel/")'));
});

check('/admin/travel/status.json route exists', () => {
  assert.ok(has('src/http/createHealthServer.js', 'url.pathname === "/admin/travel/status.json"'));
  assert.ok(has('src/http/createHealthServer.js', 'buildTravelStatusPayload'));
});

check('route-state mapping exists', () => {
  assert.ok(has('src/http/adminPageHandlers/shared.js', 'pathname === "/admin/travel"'));
  assert.ok(has('src/http/adminPageHandlers/shared.js', 'section: "travel"'));
});

check('travel handler import/export exists', () => {
  assert.ok(has('src/http/adminPageHandlers.js', 'handleTravelPageRequest'));
  assert.ok(has('src/http/adminPageHandlers/travelPageHandler.js', 'module.exports = { handleTravelPageRequest'));
  assert.ok(has('src/http/adminPageHandlers/travelPageHandler.js', 'buildTravelStatusPayload'));
});

check('travel render helper exports exist', () => {
  assert.ok(has('src/http/renderAdminPages.js', 'renderAdventureBookPage'));
  assert.ok(has('src/http/renderAdminPages.js', 'renderTripDetailPage'));
  assert.ok(has('src/http/adminRenderHelpers.js', 'function renderAdventureBookPage'));
  assert.ok(has('src/http/adminRenderHelpers.js', 'function renderTripDetailPage'));
});

check('POST action wiring exists', () => {
  assert.ok(has('src/http/createHealthServer.js', 'handleTravelActions'));
  assert.ok(has('src/http/actions/travelActions.js', '/admin/actions/travel-trip-save'));
  assert.ok(has('src/http/actions/travelActions.js', '/admin/actions/travel-checklist-save'));
});

check('travel store initialization wiring exists', () => {
  assert.ok(has('src/index.js', 'createTravelAdventureStore'));
  assert.ok(has('src/index.js', 'travelAdventureStore.init'));
  assert.ok(has('src/index.js', 'travelAdventureStore,'));
});

check('sidebar nav entry exists', () => {
  assert.ok(has('src/http/renderAdminPages/shared.js', 'path: "/admin/travel"'));
  assert.ok(has('src/http/renderAdminPages/shared.js', 'section: "travel"'));
});

check('no cognitive runtime or personality ownership in travel surface', () => {
  const files = [
    'src/http/adminPageHandlers/travelPageHandler.js',
    'src/http/renderAdminPages/travelPages.js',
    'src/http/actions/travelActions.js',
    'src/storage/travelAdventure.js',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /cognitive|personality|neural|memoryRuntime|emotionalRuntime|lifeRuntime/i, file);
    assert.doesNotMatch(source, /setInterval|setTimeout|channel\.send|discordSendGateway/, file);
  }
});

check('no fake gallery photos introduced', () => {
  const source = read('src/http/renderAdminPages/travelPages.js') + read('src/http/renderAdminPages/topLevelPages.js');
  assert.doesNotMatch(source, /fake gallery|static gallery|user-dante-gallery-example|approved-dashboard-layout-reference/i);
  assert.doesNotMatch(source, /class="nordic-gallery-img" src="\/assets\/nordic-dashboard/);
});

check('Travel persistence docs exist', () => {
  assert.ok(existsSync(resolve(root, '../../docs/TRAVEL_SAGA_PERSISTENCE.md')));
});

if (process.exitCode) process.exit(process.exitCode);
console.log('TRAVEL_DASHBOARD_VERIFY_PASS');
