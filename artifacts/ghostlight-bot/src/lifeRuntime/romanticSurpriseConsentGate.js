"use strict";

const DANTE_IDS = new Set(["dante", "dante-v2", "ghostlight-dante"]);
const JENNA_IDS = new Set(["jenna", "user", "default", "jenna-private"]);
const MARRIAGE_TYPES = new Set(["engagement_memory", "marriage_thought"]);

function isDanteJennaConfig({ companionId = "", customerId = "", config = {} } = {}) {
  const c = String(companionId || config?.memory?.companionId || config?.companion?.id || "").toLowerCase();
  const u = String(customerId || config?.memory?.userScope || "user").toLowerCase();
  return DANTE_IDS.has(c) && JENNA_IDS.has(u);
}

function isQuietHours(now = new Date(), quietHours = null) {
  if (typeof quietHours === "function") return Boolean(quietHours(now));
  if (quietHours === true || quietHours?.active) return true;
  const start = quietHours?.start || process.env.DANTE_QUIET_HOURS_START || "22:00";
  const end = quietHours?.end || process.env.DANTE_QUIET_HOURS_END || "07:00";
  const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(start), b = toMin(end);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

function evaluateRomanticSurpriseConsent({ companionId = "", customerId = "", config = {}, surpriseType = "just_because", now = new Date(), quietHours = null, giveSpace = false, consentState = null, consequenceContext = null, userAvailability = null } = {}) {
  if (giveSpace || consequenceContext?.suppression?.giveSpace) return { allowed: false, blockedReason: "give_space" };
  if (isQuietHours(now, quietHours)) return { allowed: false, blockedReason: "quiet_hours" };
  if (userAvailability?.busy || userAvailability?.doNotDisturb || userAvailability?.appearsBusy) return { allowed: false, blockedReason: "user_busy" };
  if (consentState?.romanticSurprises === false || consentState?.romanticEscalation === false) return { allowed: false, blockedReason: "consent_blocked" };
  const sup = consequenceContext?.suppression || consequenceContext || {};
  if ((sup.repairRequired || sup.highestSeverity === "major") && surpriseType !== "repair_softener") return { allowed: false, blockedReason: "unresolved_major_repair" };
  if (MARRIAGE_TYPES.has(surpriseType) && !isDanteJennaConfig({ companionId, customerId, config })) return { allowed: false, blockedReason: "dante_jenna_only" };
  return { allowed: true, blockedReason: null };
}

module.exports = { evaluateRomanticSurpriseConsent, isDanteJennaConfig, isQuietHours, MARRIAGE_TYPES };
