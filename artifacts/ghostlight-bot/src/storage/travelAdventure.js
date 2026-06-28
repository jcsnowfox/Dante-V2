"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const TRIP_STATUSES = Object.freeze(["wishlist", "planned", "booked", "visited", "archived"]);
const CHECKLIST_CATEGORIES = Object.freeze(["planning", "packing", "booking", "food", "accessibility", "memories", "custom"]);

function nowIso() { return new Date().toISOString(); }
function clean(value) { return String(value == null ? "" : value).trim(); }
function list(value) { return Array.from(new Set(clean(value).split(/[\n,]/).map((item) => item.trim()).filter(Boolean))).slice(0, 24); }
function status(value) { const v = clean(value).toLowerCase(); return TRIP_STATUSES.includes(v) ? v : "wishlist"; }
function category(value) { const v = clean(value).toLowerCase(); return CHECKLIST_CATEGORIES.includes(v) ? v : "custom"; }
function dateOnly(value) { const v = clean(value); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }
function id() { return crypto.randomUUID(); }

function normalizePreferences(input = {}) {
  return {
    preferredPace: clean(input.preferredPace),
    foodNotes: clean(input.foodNotes),
    accessibilityNotes: clean(input.accessibilityNotes),
    budgetNotes: clean(input.budgetNotes),
    hotelNotes: clean(input.hotelNotes),
    transportNotes: clean(input.transportNotes),
    mustSee: clean(input.mustSee),
    avoid: clean(input.avoid),
    generalNotes: clean(input.generalNotes),
  };
}

function normalizeTrip(input = {}, existing = null) {
  const t = nowIso();
  const title = clean(input.title || existing?.title);
  if (!title) throw new Error("Destination title is required.");
  return {
    id: clean(existing?.id || input.id) || id(),
    title,
    location: clean(input.location ?? existing?.location),
    country: clean(input.country ?? existing?.country),
    region: clean(input.region ?? existing?.region),
    status: status(input.status ?? existing?.status),
    startDate: dateOnly(input.startDate ?? existing?.startDate),
    endDate: dateOnly(input.endDate ?? existing?.endDate),
    notes: clean(input.notes ?? existing?.notes),
    vibeTags: Array.isArray(input.vibeTags) ? input.vibeTags.map(clean).filter(Boolean) : list(input.vibeTags ?? existing?.vibeTags?.join(", ")),
    companionRoleNotes: clean(input.companionRoleNotes ?? existing?.companionRoleNotes),
    preferences: normalizePreferences({ ...(existing?.preferences || {}), ...(input.preferences || {}) }),
    createdAt: existing?.createdAt || t,
    updatedAt: t,
  };
}

function normalizeChecklistItem(input = {}, existing = null) {
  const t = nowIso();
  const label = clean(input.label ?? existing?.label);
  if (!label) throw new Error("Checklist label is required.");
  return {
    id: clean(existing?.id || input.id) || id(),
    tripId: clean(input.tripId ?? existing?.tripId),
    label,
    category: category(input.category ?? existing?.category),
    checked: input.checked === true || input.checked === "true" || input.checked === "on",
    notes: clean(input.notes ?? existing?.notes),
    createdAt: existing?.createdAt || t,
    updatedAt: t,
  };
}

function defaultState() { return { trips: [], checklistItems: [] }; }

function resolveTravelAdventureFilePath({ filePath = "", env = process.env, cwd = process.cwd() } = {}) {
  const configuredPath = clean(filePath) || clean(env.TRAVEL_ADVENTURES_FILE) || clean(env.TRAVEL_DATA_PATH);
  return configuredPath || path.join(cwd, "data", "travel-adventures.json");
}

function createTravelAdventureStore({ filePath = "", logger = null, env = process.env } = {}) {
  const resolvedPath = resolveTravelAdventureFilePath({ filePath, env });
  let state = defaultState();
  let loaded = false;

  async function load() {
    if (loaded) return;
    try {
      const raw = await fs.readFile(resolvedPath, "utf8");
      const parsed = JSON.parse(raw);
      state = { trips: Array.isArray(parsed.trips) ? parsed.trips : [], checklistItems: Array.isArray(parsed.checklistItems) ? parsed.checklistItems : [] };
    } catch (error) {
      if (error.code !== "ENOENT") logger?.warn?.("[travel] Failed to load travel store", { error: error.message });
      state = defaultState();
    }
    loaded = true;
  }
  async function save() { await fs.mkdir(path.dirname(resolvedPath), { recursive: true }); await fs.writeFile(resolvedPath, JSON.stringify(state, null, 2)); }

  return {
    async init() { await load(); await save(); },
    async listTrips({ status: filterStatus = "", includeArchived = false } = {}) { await load(); return state.trips.filter((trip) => (includeArchived || trip.status !== "archived") && (!filterStatus || trip.status === filterStatus)).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)); },
    async getTrip(tripId) { await load(); return state.trips.find((trip) => trip.id === clean(tripId)) || null; },
    async saveTrip(input = {}) { await load(); const existing = input.id ? state.trips.find((trip) => trip.id === clean(input.id)) : null; const trip = normalizeTrip(input, existing); if (existing) state.trips = state.trips.map((item) => item.id === trip.id ? trip : item); else state.trips.push(trip); await save(); return trip; },
    async updateTripStatus(tripId, nextStatus) { await load(); const trip = state.trips.find((item) => item.id === clean(tripId)); if (!trip) return null; trip.status = status(nextStatus); trip.updatedAt = nowIso(); await save(); return trip; },
    async archiveTrip(tripId) { return this.updateTripStatus(tripId, "archived"); },
    async deleteTrip(tripId) { await load(); const target = clean(tripId); const before = state.trips.length; state.trips = state.trips.filter((trip) => trip.id !== target); state.checklistItems = state.checklistItems.filter((item) => item.tripId !== target); await save(); return before !== state.trips.length; },
    async listChecklistItems(tripId = "") { await load(); const target = clean(tripId); return state.checklistItems.filter((item) => !target || item.tripId === target).sort((a, b) => Number(a.checked) - Number(b.checked) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0)); },
    async saveChecklistItem(input = {}) { await load(); const existing = input.id ? state.checklistItems.find((item) => item.id === clean(input.id)) : null; const item = normalizeChecklistItem(input, existing); if (!state.trips.some((trip) => trip.id === item.tripId)) throw new Error("Trip not found."); if (existing) state.checklistItems = state.checklistItems.map((row) => row.id === item.id ? item : row); else state.checklistItems.push(item); await save(); return item; },
    async setChecklistChecked(itemId, checked) { await load(); const item = state.checklistItems.find((row) => row.id === clean(itemId)); if (!item) return null; item.checked = Boolean(checked); item.updatedAt = nowIso(); await save(); return item; },
    async deleteChecklistItem(itemId) { await load(); const target = clean(itemId); const before = state.checklistItems.length; state.checklistItems = state.checklistItems.filter((item) => item.id !== target); await save(); return before !== state.checklistItems.length; },
    async getNextTripWithChecklist() { const trips = await this.listTrips({ includeArchived: false }); const preferred = trips.find((trip) => ["booked", "planned", "wishlist"].includes(trip.status)) || trips[0] || null; if (!preferred) return null; return { trip: preferred, checklistItems: await this.listChecklistItems(preferred.id) }; },
  };
}

module.exports = { createTravelAdventureStore, TRIP_STATUSES, CHECKLIST_CATEGORIES, normalizeTrip, normalizeChecklistItem, normalizePreferences, resolveTravelAdventureFilePath };
