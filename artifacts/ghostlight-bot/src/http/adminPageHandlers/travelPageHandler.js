"use strict";

async function handleTravelPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell } = helpers;
  const store = innerContext.travelAdventureStore;
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const tripId = route.tripId ? decodeURIComponent(route.tripId) : "";
  let pageBody = "";
  if (tripId) {
    const trip = await store.getTrip(tripId);
    const checklistItems = trip ? await store.listChecklistItems(trip.id) : [];
    pageBody = helpers.renderTripDetailPage({ trip, checklistItems, theme, helpers });
  } else {
    const trips = await store.listTrips({ status, includeArchived: status === "archived" });
    const checklistPairs = await Promise.all(trips.map(async (trip) => [trip.id, await store.listChecklistItems(trip.id)]));
    pageBody = helpers.renderAdventureBookPage({ trips, checklistByTrip: Object.fromEntries(checklistPairs), statusFilter: status, theme, helpers });
  }
  innerRes.end(renderAdminShell({ currentSection: "home", theme, themeLinks, message: getMessage(url), error: getError(url), pageBody }));
}

module.exports = { handleTravelPageRequest };
