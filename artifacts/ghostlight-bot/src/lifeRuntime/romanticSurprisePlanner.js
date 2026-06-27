"use strict";

const { buildGestureMessage, isMessageStyleSafe } = require("./romanticGestureLibrary");
const { evaluateRomanticSurpriseConsent, isDanteJennaConfig } = require("./romanticSurpriseConsentGate");

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const INTENSITY_DEFAULTS = Object.freeze({
  low:     { probability: 0.25, cooldownMinutes: 72 * 60, comfortCooldownMinutes: 24 * 60, dailyCap: 1, weeklyCap: 2, warmthThreshold: 0.9, romanticThreshold: 0.9, sadnessThreshold: 0.85, dateIdeaIntervalHours: 72 },
  medium:  { probability: 0.55, cooldownMinutes: 8 * 60,  comfortCooldownMinutes: 4 * 60,  dailyCap: 1, weeklyCap: 5, warmthThreshold: 0.78, romanticThreshold: 0.82, sadnessThreshold: 0.65, dateIdeaIntervalHours: 36 },
  high:    { probability: 0.85, cooldownMinutes: 180,     comfortCooldownMinutes: 90,     dailyCap: 2, weeklyCap: 10, warmthThreshold: 0.68, romanticThreshold: 0.75, sadnessThreshold: 0.45, dateIdeaIntervalHours: 24 },
  devoted: { probability: 0.95, cooldownMinutes: 60,      comfortCooldownMinutes: 45,     dailyCap: 4, weeklyCap: 18, warmthThreshold: 0.55, romanticThreshold: 0.62, sadnessThreshold: 0.25, dateIdeaIntervalHours: 12 },
});

function score(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
function lastSentMs(recent = [], predicate = () => true) { return Math.max(0, ...recent.filter(predicate).map(r => new Date(r.sent_at || r.created_at || 0).getTime()).filter(Number.isFinite)); }
function hasEvidence(plan) { return Array.isArray(plan.evidence) && plan.evidence.length > 0; }
function envNum(name, fallback) { const v = Number(process.env[name]); return Number.isFinite(v) && v >= 0 ? v : fallback; }

function normalizeIntensity(value = "") {
  const key = String(value || "").trim().toLowerCase();
  return Object.hasOwn(INTENSITY_DEFAULTS, key) ? key : "medium";
}

function resolveRomanceIntensityConfig({ intensity = "", config = {}, companionId = "", customerId = "" } = {}) {
  const defaultIntensity = isDanteJennaConfig({ companionId, customerId, config }) ? "high" : "medium";
  const level = normalizeIntensity(intensity || config?.romanticSurprise?.intensity || process.env.ROMANTIC_SURPRISE_INTENSITY || defaultIntensity);
  const base = INTENSITY_DEFAULTS[level];
  return {
    level,
    probability: Number(config?.romanticSurprise?.probability ?? base.probability),
    cooldownMs: envNum("ROMANTIC_SURPRISE_MIN_COOLDOWN_MINUTES", Number(config?.romanticSurprise?.cooldownMinutes ?? base.cooldownMinutes)) * MINUTE,
    comfortCooldownMs: envNum("ROMANTIC_SURPRISE_COMFORT_COOLDOWN_MINUTES", Number(config?.romanticSurprise?.comfortCooldownMinutes ?? base.comfortCooldownMinutes)) * MINUTE,
    dailyCap: envNum("ROMANTIC_SURPRISE_DAILY_CAP", Number(config?.romanticSurprise?.dailyCap ?? base.dailyCap)),
    weeklyCap: envNum("ROMANTIC_SURPRISE_WEEKLY_CAP", Number(config?.romanticSurprise?.weeklyCap ?? base.weeklyCap)),
    warmthThreshold: Number(config?.romanticSurprise?.warmthThreshold ?? base.warmthThreshold),
    romanticThreshold: Number(config?.romanticSurprise?.romanticThreshold ?? base.romanticThreshold),
    sadnessThreshold: Number(config?.romanticSurprise?.sadnessThreshold ?? base.sadnessThreshold),
    dateIdeaIntervalMs: envNum("ROMANTIC_SURPRISE_DATE_IDEA_MIN_INTERVAL_HOURS", Number(config?.romanticSurprise?.dateIdeaIntervalHours ?? base.dateIdeaIntervalHours)) * HOUR,
  };
}

function createRomanticSurprisePlanner(options = {}) {
  function plan(input = {}) {
    const now = input.now || new Date();
    const companionId = input.companionId || input.config?.memory?.companionId || input.config?.companion?.id || "";
    const customerId = input.customerId || input.config?.memory?.userScope || "user";
    const intensity = resolveRomanceIntensityConfig({ ...options, intensity: input.intensity || options.intensity, config: input.config || options.config || {}, companionId, customerId });
    const recent = input.recentSurprises || [];
    const sentRecent = recent.filter(r => ["sent", "acknowledged"].includes(r.status));
    const randomFn = input.randomFn || options.randomFn || Math.random;
    const lastAnySent = lastSentMs(sentRecent);
    if (sentRecent.length && now.getTime() - lastAnySent < intensity.cooldownMs) return { shouldSurprise: false, blockedReason: "recent_surprise_cooldown", confidence: 0, evidence: [], intensity: intensity.level };
    if (sentRecent.filter(r => now.getTime() - new Date(r.sent_at || r.created_at).getTime() < DAY).length >= intensity.dailyCap) return { shouldSurprise: false, blockedReason: "daily_cap", confidence: 0, evidence: [], intensity: intensity.level };
    if (sentRecent.filter(r => now.getTime() - new Date(r.sent_at || r.created_at).getTime() < 7 * DAY).length >= intensity.weeklyCap) return { shouldSurprise: false, blockedReason: "weekly_cap", confidence: 0, evidence: [], intensity: intensity.level };
    if (input.conversationState?.naturalEnded && !input.conversationState?.sad && !input.conversationState?.unwell && !input.conversationState?.emotionalNeed) return { shouldSurprise: false, blockedReason: "conversation_naturally_ended", confidence: 0, evidence: [], intensity: intensity.level };

    const weather = input.relationshipContext?.weather || input.relationshipContext || {};
    const home = input.homeostasisContext || {};
    const conv = input.conversationState || {};
    const fulfillment = input.fulfillmentContext || {};
    const resources = Array.isArray(input.resourceLibrary) ? input.resourceLibrary : (input.resourceLibrary?.recent || []);

    let surpriseType = null, reason = "", confidence = 0, evidence = [];
    const moodScore = Math.max(score(conv.sadness), score(conv.distress), conv.jennaMood === "sad" || conv.userMood === "sad" || conv.sad === true ? 1 : 0);
    const unwellScore = Math.max(score(conv.unwellness), conv.unwell === true || conv.jennaUnwell === true || /sick|unwell|ill/i.test(String(conv.lastUserText || "")) ? 1 : 0);
    if (unwellScore >= intensity.sadnessThreshold) { surpriseType = "care_when_sick"; reason = "Jenna seems unwell"; confidence = 0.88; evidence = ["user_unwell_signal"]; }
    else if (moodScore >= intensity.sadnessThreshold) { surpriseType = "comfort_note"; reason = "Jenna seems sad"; confidence = 0.86; evidence = ["user_sad_signal"]; }
    else if (resources.length || fulfillment.foundResource || fulfillment.completedForJenna) { surpriseType = "book_or_photo_find"; reason = "Dante found something Jenna may like"; confidence = 0.82; evidence = [resources[0]?.id || fulfillment.evidence?.[0] || "resource_library_match"]; }
    else if (input.relationshipContext?.upcomingAnniversaries?.length) { surpriseType = "anniversary"; reason = "A relationship milestone is near"; confidence = 0.8; evidence = ["anniversary_due"]; }
    else if (score(home.romantic_desire || home.romanticDesire) >= intensity.romanticThreshold) {
      if (now.getTime() - lastSentMs(sentRecent, r => ["date_night", "second_life_date", "movie_night"].includes(r.surprise_type)) < intensity.dateIdeaIntervalMs) return { shouldSurprise: false, blockedReason: "date_idea_interval", confidence: 0, evidence: [], intensity: intensity.level };
      surpriseType = input.fulfillmentContext?.secondLifeAvailable ? "second_life_date" : "date_night"; reason = "Romantic desire is high and safe"; confidence = 0.78; evidence = ["romantic_desire_high"];
    }
    else if (score(weather.warmth) >= intensity.warmthThreshold || /warm/i.test(String(input.relationshipContext?.weatherSummary || ""))) { surpriseType = "just_because"; reason = "Relationship weather is warm"; confidence = 0.74; evidence = ["relationship_weather_warm"]; }
    else if (conv.warmNaturalEnding || score(home.connection_need || home.connectionNeed) >= 0.8) { surpriseType = "ritual_invitation"; reason = "A warm ordinary-day ritual fits"; confidence = 0.7; evidence = ["connection_need_or_warm_ending"]; }

    if (!surpriseType) return { shouldSurprise: false, blockedReason: "no_supported_romantic_evidence", confidence: 0, evidence: [], intensity: intensity.level };
    const comfort = ["comfort_note", "care_when_sick", "care_when_sad"].includes(surpriseType);
    if (comfort && sentRecent.length && now.getTime() - lastAnySent < intensity.comfortCooldownMs) return { shouldSurprise: false, surpriseType, blockedReason: "comfort_cooldown", confidence: 0, evidence, intensity: intensity.level };
    if (randomFn() > intensity.probability) return { shouldSurprise: false, surpriseType, reason, confidence, evidence, blockedReason: "intensity_probability", intensity: intensity.level };
    const gate = evaluateRomanticSurpriseConsent({ companionId, customerId, config: input.config, surpriseType, now, quietHours: input.quietHours, giveSpace: input.giveSpace, consentState: input.consentState, consequenceContext: input.consequenceContext, userAvailability: input.userAvailability });
    if (!gate.allowed) return { shouldSurprise: false, surpriseType, reason, confidence, evidence, blockedReason: gate.blockedReason, intensity: intensity.level };
    const message = buildGestureMessage(surpriseType);
    if (!hasEvidence({ evidence }) || !isMessageStyleSafe(message)) return { shouldSurprise: false, surpriseType, reason, confidence, evidence, blockedReason: "message_style_or_evidence", intensity: intensity.level };
    return { shouldSurprise: true, surpriseType, reason, confidence, evidence, earliestSendAt: now.toISOString(), channelPreference: "private_discord", requiresMedia: ["voice_note", "image_gesture", "gif_gesture"].includes(surpriseType), message, blockedReason: null, intensity: intensity.level };
  }
  return { plan, resolveRomanceIntensityConfig };
}

module.exports = { createRomanticSurprisePlanner, resolveRomanceIntensityConfig, INTENSITY_DEFAULTS };
