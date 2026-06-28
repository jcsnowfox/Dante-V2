"use strict";

function renderTravelStorageErrorPanel({ helpers, message = "Travel Saga storage is unavailable.", detail = "" }) {
  const { escapeHtml = (value) => String(value == null ? "" : value) } = helpers;
  return [
    "<section class=\"nordic-dashboard nordic-home-shell nordic-home-wide nordic-bg travel-page\" data-dashboard=\"travel\">",
    "<div class=\"nordic-panel nordic-panel--hero\">",
    "<p class=\"nordic-eyebrow\">Travel Saga</p>",
    "<h1 class=\"travel-title\">Travel storage unavailable</h1>",
    `<p class="nordic-home-muted">${escapeHtml(message)}</p>`,
    detail ? `<p class="notice error">${escapeHtml(detail)}</p>` : "",
    "</div>",
    "<div class=\"nordic-panel\">",
    "<h2 class=\"nordic-panel__title\">Safe checks</h2>",
    "<ul class=\"nordic-home-muted\">",
    "<li>Check app context initialization for travelAdventureStore.</li>",
    "<li>Check TRAVEL_ADVENTURES_FILE or TRAVEL_DATA_PATH.</li>",
    "<li>Check the Railway volume mount if this is deployed.</li>",
    "</ul>",
    "<p class=\"nordic-home-muted\">Persistence mode: json-file. Live web concierge: false.</p>",
    "</div>",
    "</section>",
  ].join("");
}

async function buildTravelStatusPayload({ innerContext }) {
  const store = innerContext?.travelAdventureStore;
  if (!store) {
    return {
      storeAvailable: false,
      configuredPathType: "unknown",
      configuredPathBasename: "",
      tripCount: 0,
      checklistCount: 0,
      lastLoadError: "travelAdventureStore missing from app context",
      persistenceMode: "json-file",
      liveWebConcierge: false,
    };
  }

  if (typeof store.getDiagnostics === "function") {
    const diagnostics = await store.getDiagnostics();
    return {
      storeAvailable: true,
      configuredPathType: diagnostics.configuredPathType || "unknown",
      configuredPathBasename: diagnostics.configuredPathBasename || "",
      tripCount: Number(diagnostics.tripCount) || 0,
      checklistCount: Number(diagnostics.checklistCount) || 0,
      lastLoadError: diagnostics.lastLoadError || "",
      persistenceMode: diagnostics.persistenceMode || "json-file",
      liveWebConcierge: false,
    };
  }

  const [trips, checklistItems] = await Promise.all([
    store.listTrips ? store.listTrips({ includeArchived: true }) : [],
    store.listChecklistItems ? store.listChecklistItems("") : [],
  ]);

  return {
    storeAvailable: true,
    configuredPathType: "unknown",
    configuredPathBasename: "",
    tripCount: Array.isArray(trips) ? trips.length : 0,
    checklistCount: Array.isArray(checklistItems) ? checklistItems.length : 0,
    lastLoadError: "",
    persistenceMode: "json-file",
    liveWebConcierge: false,
  };
}

function renderTravelStatusBlock(status = {}, helpers = {}) {
  const { escapeHtml = (value) => String(value == null ? "" : value) } = helpers;
  return [
    "<div class=\"nordic-panel travel-status-panel\">",
    "<div class=\"nordic-panel__header\"><div><p class=\"nordic-eyebrow\">Diagnostics</p><h2 class=\"nordic-panel__title\">Travel Saga storage</h2></div></div>",
    "<dl class=\"travel-status-list\">",
    `<dt>Store available</dt><dd>${status.storeAvailable ? "true" : "false"}</dd>`,
    `<dt>Persistence mode</dt><dd>${escapeHtml(status.persistenceMode || "json-file")}</dd>`,
    `<dt>Path source</dt><dd>${escapeHtml(status.configuredPathType || "unknown")}</dd>`,
    `<dt>Path file</dt><dd>${escapeHtml(status.configuredPathBasename || "unavailable")}</dd>`,
    `<dt>Trips</dt><dd>${Number(status.tripCount) || 0}</dd>`,
    `<dt>Checklist items</dt><dd>${Number(status.checklistCount) || 0}</dd>`,
    `<dt>Live web concierge</dt><dd>${status.liveWebConcierge ? "true" : "false"}</dd>`,
    status.lastLoadError ? `<dt>Last load error</dt><dd>${escapeHtml(status.lastLoadError)}</dd>` : "",
    "</dl>",
    "<p class=\"nordic-home-muted\">Default data/travel-adventures.json may not survive redeploys unless backed by a persistent volume.</p>",
    "</div>",
  ].join("");
}

async function handleTravelPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell } = helpers;
  const store = innerContext.travelAdventureStore;
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const tripId = route.tripId ? decodeURIComponent(route.tripId) : "";
  let pageBody = "";

  try {
    if (!store) {
      pageBody = renderTravelStorageErrorPanel({ helpers });
    } else if (tripId) {
      const trip = await store.getTrip(tripId);
      const checklistItems = trip ? await store.listChecklistItems(trip.id) : [];
      pageBody = helpers.renderTripDetailPage({ trip, checklistItems, theme, helpers });
    } else {
      const trips = await store.listTrips({ status, includeArchived: status === "archived" });
      const checklistPairs = await Promise.all(trips.map(async (trip) => [trip.id, await store.listChecklistItems(trip.id)]));
      const statusPayload = await buildTravelStatusPayload({ innerContext });
      pageBody = [
        helpers.renderAdventureBookPage({ trips, checklistByTrip: Object.fromEntries(checklistPairs), statusFilter: status, theme, helpers }),
        renderTravelStatusBlock(statusPayload, helpers),
      ].join("");
    }
  } catch (error) {
    innerContext.logger?.warn?.("[travel] dashboard render failed", { error: error.message });
    pageBody = renderTravelStorageErrorPanel({
      helpers,
      message: "Travel Saga storage could not be read safely.",
      detail: error.message || "Unknown travel storage error.",
    });
  }
  innerRes.end(renderAdminShell({ currentSection: "travel", theme, themeLinks, message: getMessage(url), error: getError(url), pageBody }));
}

module.exports = { handleTravelPageRequest, buildTravelStatusPayload, renderTravelStorageErrorPanel, renderTravelStatusBlock };
