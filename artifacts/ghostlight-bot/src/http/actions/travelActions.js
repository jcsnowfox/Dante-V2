"use strict";

const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");

const RETURN_PATH = "/admin/travel";
function value(fields, key) { const raw = fields[key]; return String(Array.isArray(raw) ? raw[0] : raw || "").trim(); }
function redirect(res, { returnTo = RETURN_PATH, theme = "", message = "", error = "" } = {}) { res.writeHead(303, { Location: buildReturnLocation({ returnTo, fallbackPath: RETURN_PATH, theme, message, error }) }).end(); }
function tripFromFields(fields) {
  return {
    id: value(fields, "id"), title: value(fields, "title"), location: value(fields, "location"), country: value(fields, "country"), region: value(fields, "region"), status: value(fields, "status"), startDate: value(fields, "startDate"), endDate: value(fields, "endDate"), notes: value(fields, "notes"), vibeTags: value(fields, "vibeTags"), companionRoleNotes: value(fields, "companionRoleNotes"),
    preferences: { preferredPace: value(fields, "preferredPace"), foodNotes: value(fields, "foodNotes"), accessibilityNotes: value(fields, "accessibilityNotes"), budgetNotes: value(fields, "budgetNotes"), hotelNotes: value(fields, "hotelNotes"), transportNotes: value(fields, "transportNotes"), mustSee: value(fields, "mustSee"), avoid: value(fields, "avoid"), generalNotes: value(fields, "generalNotes") },
  };
}

async function withTravelForm(req, res, context, withAdmin, fn) {
  return withAdmin(async (innerReq, innerRes, innerContext) => {
    const { fields } = await parseRequestForm(innerReq);
    const theme = normalizeTheme(fields.theme);
    const returnTo = value(fields, "returnTo") || RETURN_PATH;
    if (!innerContext.travelAdventureStore) return redirect(innerRes, { returnTo, theme, error: "Travel store unavailable." });
    try { return await fn({ fields, theme, returnTo, innerRes, innerContext }); }
    catch (error) { innerContext.logger?.warn?.("[travel] action failed", { error: error.message }); return redirect(innerRes, { returnTo, theme, error: error.message || "Travel action failed." }); }
  })(req, res, context);
}

async function handleTravelActions({ req, res, url, context, withAdmin }) {
  if (!url.pathname.startsWith("/admin/actions/travel-")) return false;
  if (req.method !== "POST") return false;
  return withTravelForm(req, res, context, withAdmin, async ({ fields, theme, returnTo, innerRes, innerContext }) => {
    const store = innerContext.travelAdventureStore;
    if (url.pathname === "/admin/actions/travel-trip-save") { const trip = await store.saveTrip(tripFromFields(fields)); return redirect(innerRes, { returnTo: trip.id ? `/admin/travel/${encodeURIComponent(trip.id)}` : returnTo, theme, message: "Destination saved." }); }
    if (url.pathname === "/admin/actions/travel-trip-status") { const updated = await store.updateTripStatus(value(fields, "id"), value(fields, "status")); if (!updated) throw new Error("Trip not found."); return redirect(innerRes, { returnTo, theme, message: "Trip status updated." }); }
    if (url.pathname === "/admin/actions/travel-trip-archive") { const updated = await store.archiveTrip(value(fields, "id")); if (!updated) throw new Error("Trip not found."); return redirect(innerRes, { returnTo, theme, message: "Trip archived." }); }
    if (url.pathname === "/admin/actions/travel-trip-delete") { const ok = await store.deleteTrip(value(fields, "id")); if (!ok) throw new Error("Trip not found."); return redirect(innerRes, { returnTo, theme, message: "Trip deleted." }); }
    if (url.pathname === "/admin/actions/travel-checklist-save") { const item = await store.saveChecklistItem({ id: value(fields, "itemId"), tripId: value(fields, "tripId"), label: value(fields, "label"), category: value(fields, "category"), notes: value(fields, "notes"), checked: value(fields, "checked") === "true" }); return redirect(innerRes, { returnTo: returnTo || `/admin/travel/${encodeURIComponent(item.tripId)}`, theme, message: "Checklist item saved." }); }
    if (url.pathname === "/admin/actions/travel-checklist-toggle") { const item = await store.setChecklistChecked(value(fields, "itemId"), value(fields, "checked") === "true"); if (!item) throw new Error("Checklist item not found."); return redirect(innerRes, { returnTo, theme, message: item.checked ? "Checklist item checked." : "Checklist item unchecked." }); }
    if (url.pathname === "/admin/actions/travel-checklist-delete") { const ok = await store.deleteChecklistItem(value(fields, "itemId")); if (!ok) throw new Error("Checklist item not found."); return redirect(innerRes, { returnTo, theme, message: "Checklist item deleted." }); }
    return redirect(innerRes, { returnTo, theme, error: "Unknown travel action." });
  });
}

module.exports = { handleTravelActions };
