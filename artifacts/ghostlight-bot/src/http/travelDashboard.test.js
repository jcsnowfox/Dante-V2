"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createTravelAdventureStore, resolveTravelAdventureFilePath } = require("../storage/travelAdventure");
const { renderHomePage } = require("./renderAdminPages/topLevelPages");
const { renderAdventureBookPage, renderTripDetailPage, buildPlanningBrief } = require("./renderAdminPages/travelPages");
const { getAdminRouteState } = require("./adminPageHandlers/shared");
const { renderShell } = require("./renderAdminPages/shared");

const helpers = {
  escapeHtml(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); },
  buildAdminLocation({ path, extra }) { const params = new URLSearchParams(extra || {}); return params.toString() ? `${path}?${params}` : path; },
  withThemeField() { return ""; },
  renderIconImage() { return ""; },
  renderLayout({ body }) { return body; },
};

async function makeStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dante-travel-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createTravelAdventureStore({ filePath: path.join(dir, "travel.json") });
  await store.init();
  return store;
}

function renderHomeTravel(trip, checklistItems = []) {
  return renderHomePage({ theme: "dark", helpers, stats: { timezone: "UTC", companion: { name: "Dante" }, statuses: [], featureStates: [], recentDecisions: [], recentImages: [], recentJournals: [], travel: { trips: trip ? [trip] : [], checklistByTrip: trip ? { [trip.id]: checklistItems } : {}, nextTrip: trip || null, nextChecklistItems: checklistItems } } });
}


test("travel store default local path resolves under data directory", () => {
  const cwd = path.join(os.tmpdir(), "dante-default-path");
  const resolved = resolveTravelAdventureFilePath({ env: {}, cwd });
  assert.equal(resolved, path.join(cwd, "data", "travel-adventures.json"));
});

test("travel store env override path is used", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dante-travel-env-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "railway", "travel.json");
  const store = createTravelAdventureStore({ env: { TRAVEL_ADVENTURES_FILE: filePath } });
  await store.init();
  await store.saveTrip({ title: "Railway Fjord", status: "wishlist" });
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(raw.trips[0].title, "Railway Fjord");
  assert.equal(resolveTravelAdventureFilePath({ env: { TRAVEL_DATA_PATH: "relative-travel.json" }, cwd: dir }), "relative-travel.json");
});

test("travel store creates missing parent directory", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dante-travel-parent-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "missing", "deep", "travel.json");
  const store = createTravelAdventureStore({ filePath });
  await store.init();
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { trips: [], checklistItems: [] });
});

test("travel store handles missing and invalid files safely", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dante-travel-invalid-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const missingStore = createTravelAdventureStore({ filePath: path.join(dir, "missing.json") });
  await missingStore.init();
  assert.deepEqual(await missingStore.listTrips({ includeArchived: true }), []);
  const invalidPath = path.join(dir, "invalid.json");
  await fs.writeFile(invalidPath, "{not-json");
  const warnings = [];
  const invalidStore = createTravelAdventureStore({ filePath: invalidPath, logger: { warn: (...args) => warnings.push(args) } });
  await invalidStore.init();
  assert.deepEqual(await invalidStore.listTrips({ includeArchived: true }), []);
  assert.equal(warnings.length, 1);
});

test("travel store creates, lists, updates, archives, and deletes trips", async (t) => {
  const store = await makeStore(t);
  const trip = await store.saveTrip({ title: "Bergen Fjord", location: "Bergen", country: "Norway", status: "wishlist", vibeTags: "fjord,aurora" });
  assert.equal((await store.listTrips()).length, 1);
  const updated = await store.saveTrip({ ...trip, status: "planned", notes: "Take the slow route." });
  assert.equal(updated.status, "planned");
  assert.equal(updated.notes, "Take the slow route.");
  await store.archiveTrip(trip.id);
  assert.equal((await store.listTrips()).length, 0);
  assert.equal((await store.listTrips({ includeArchived: true })).length, 1);
  assert.equal(await store.deleteTrip(trip.id), true);
  assert.equal((await store.listTrips({ includeArchived: true })).length, 0);
});

test("checklist items create, update, check, uncheck, and delete", async (t) => {
  const store = await makeStore(t);
  const trip = await store.saveTrip({ title: "Oslo", status: "planned" });
  const item = await store.saveChecklistItem({ tripId: trip.id, label: "Book hotel", category: "booking" });
  assert.equal(item.checked, false);
  assert.equal((await store.listChecklistItems(trip.id)).length, 1);
  assert.equal((await store.setChecklistChecked(item.id, true)).checked, true);
  assert.equal((await store.setChecklistChecked(item.id, false)).checked, false);
  assert.equal(await store.deleteChecklistItem(item.id), true);
  assert.equal((await store.listChecklistItems(trip.id)).length, 0);
});

test("home dashboard renders real travel entries and interactive checklist", async (t) => {
  const store = await makeStore(t);
  const trip = await store.saveTrip({ title: "Lofoten", location: "Reine", country: "Norway", status: "planned", notes: "Northern light watch." });
  const item = await store.saveChecklistItem({ tripId: trip.id, label: "Pack wool layers", category: "packing" });
  const html = renderHomeTravel(trip, [item]);
  assert.match(html, /Lofoten/);
  assert.match(html, /Open Planning Brief/);
  assert.match(html, /action="\/admin\/actions\/travel-checklist-toggle"/);
  assert.match(html, /Pack wool layers/);
  assert.doesNotMatch(html, /href="#"/);
});

test("home dashboard renders travel empty state without fake gallery photos", () => {
  const html = renderHomeTravel(null, []);
  assert.match(html, /No saved travel destinations yet\./);
  assert.match(html, /Open Adventure Book/);
  assert.doesNotMatch(html, /class="nordic-gallery-img" src="\/assets\/nordic-dashboard/);
});

test("adventure book route and trip detail route render", async (t) => {
  const store = await makeStore(t);
  const trip = await store.saveTrip({ title: "Tromsø", country: "Norway", status: "booked", preferences: { foodNotes: "Low carb seafood" } });
  const item = await store.saveChecklistItem({ tripId: trip.id, label: "Reserve fish soup", category: "food" });
  const book = renderAdventureBookPage({ trips: [trip], checklistByTrip: { [trip.id]: [item] }, theme: "dark", helpers });
  const detail = renderTripDetailPage({ trip, checklistItems: [item], theme: "dark", helpers });
  assert.deepEqual(getAdminRouteState("/admin/travel"), { section: "travel" });
  assert.deepEqual(getAdminRouteState(`/admin/travel/${trip.id}`), { section: "travel", tripId: trip.id });
  assert.match(book, /Adventure Book/);
  assert.match(detail, /Dante Concierge Planning Brief/);
  assert.match(detail, /Live web lookup is not connected here yet/);
});

test("invalid or missing ids are rejected safely by store operations", async (t) => {
  const store = await makeStore(t);
  assert.equal(await store.updateTripStatus("missing", "visited"), null);
  assert.equal(await store.setChecklistChecked("missing", true), null);
  await assert.rejects(() => store.saveChecklistItem({ tripId: "missing", label: "Nope" }), /Trip not found/);
});

test("planning brief compiles trip context without claiming web search", async (t) => {
  const store = await makeStore(t);
  const trip = await store.saveTrip({ title: "Stavanger", country: "Norway", notes: "Quiet pace", preferences: { mustSee: "fjords", avoid: "crowds" } });
  const item = await store.saveChecklistItem({ tripId: trip.id, label: "Check ferry", category: "booking" });
  const brief = buildPlanningBrief(trip, [item]);
  assert.match(brief, /Stavanger/);
  assert.match(brief, /fjords/);
  assert.doesNotMatch(brief, /web search completed/i);
});

test("sidebar remains unchanged", () => {
  const shell = renderShell({ currentSection: "home", pageBody: "<main>Travel</main>", theme: "dark", themeLinks: {}, config: {}, helpers });
  assert.match(shell, /gl-nav-link/);
  assert.match(shell, /Gallery/);
});
