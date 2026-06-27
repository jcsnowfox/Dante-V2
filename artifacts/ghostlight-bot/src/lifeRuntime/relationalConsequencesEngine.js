"use strict";

/**
 * relationalConsequencesEngine
 *
 * Life Runtime 5.0 — Relational Consequences (Dante & Jenna).
 *
 * The brain of the consequence layer. It decides:
 *   - WHEN an interaction is emotionally meaningful enough to leave a mark
 *     (detection from user language + the existing repair analysis),
 *   - WHAT that mark suppresses or prefers while it is unresolved,
 *   - HOW a mark heals (repair started → completed → resolved), gradually,
 *     never by snapping back to normal.
 *
 * It owns no storage and no scheduler. It reads/writes through consequenceStore
 * and nudges weather through relationshipWeatherBridge. It is ticked from the
 * existing lifeRuntime.tick() — it never creates its own loop, sender, or
 * emotional system.
 *
 * This is about continuity and consequence, not punishment: minor things fade,
 * repair is reachable, and affection is preserved even while casual behaviour
 * is held back.
 */

// ── Event taxonomy ───────────────────────────────────────────────────────────

const EVENT_TYPES = Object.freeze([
  "disappointment", "hurt_detected", "conflict", "pushback_landed_badly",
  "boundary_crossed", "repair_started", "repair_completed", "promise_kept",
  "promise_broken", "deep_affection", "shared_victory", "shared_loss",
  "trust_growth", "trust_damage", "misread", "overwhelm_detected",
  "give_space_requested", "forgiveness", "unresolved_tension",
]);

const SEVERITY = Object.freeze(["minor", "moderate", "major"]);

// Casual behaviours that must NOT resume while repair is unresolved.
const CASUAL_ACTIONS = Object.freeze([
  "casual_flirt", "random_meme", "playful_teasing",
  "unrelated_voice_note", "unrelated_image", "casual_affection",
  "everything_normal_tone",
]);

// Outbound / proactive behaviours that "give me space" should also hold back.
const OUTBOUND_ACTIONS = Object.freeze([
  "proactive_reachout", "unrelated_voice_note", "unrelated_image", "random_meme",
]);

// Once repair is *completed* (grace window), the gentler items may return —
// but flirting, memes and teasing stay held back so playfulness doesn't snap
// back to full the instant things are okay.
const SOFT_DURING_HEALING = new Set([
  "casual_affection", "everything_normal_tone", "unrelated_voice_note", "unrelated_image",
]);

function uniq(arr) { return Array.from(new Set(arr)); }

// ── Per-event behavioural profile ────────────────────────────────────────────

const PROFILES = {
  hurt_detected:         { severity: "moderate", repairRequired: true,  emotionalWeight: 0.70, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  disappointment:        { severity: "moderate", repairRequired: true,  emotionalWeight: 0.65, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  conflict:              { severity: "major",    repairRequired: true,  emotionalWeight: 0.80, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  pushback_landed_badly: { severity: "moderate", repairRequired: true,  emotionalWeight: 0.60, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  boundary_crossed:      { severity: "major",    repairRequired: true,  emotionalWeight: 0.85, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  trust_damage:          { severity: "major",    repairRequired: true,  emotionalWeight: 0.80, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  promise_broken:        { severity: "major",    repairRequired: true,  emotionalWeight: 0.80, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  unresolved_tension:    { severity: "moderate", repairRequired: true,  emotionalWeight: 0.60, attentionBias: "repair", suppress: CASUAL_ACTIONS },
  overwhelm_detected:    { severity: "moderate", repairRequired: true,  emotionalWeight: 0.55, attentionBias: "space",  suppress: uniq([...CASUAL_ACTIONS, ...OUTBOUND_ACTIONS]) },
  give_space_requested:  { severity: "moderate", repairRequired: true,  emotionalWeight: 0.50, attentionBias: "space",  suppress: uniq([...CASUAL_ACTIONS, ...OUTBOUND_ACTIONS]), giveSpace: true },
  misread:               { severity: "minor",    repairRequired: false, emotionalWeight: 0.40, attentionBias: "repair", suppress: ["casual_flirt", "playful_teasing"], ttlHours: 12 },
  shared_loss:           { severity: "moderate", repairRequired: false, emotionalWeight: 0.70, attentionBias: null,     suppress: ["random_meme", "playful_teasing", "casual_flirt"], ttlHours: 72 },

  // Progression / positive — these warm the weather and fade on their own.
  repair_started:        { severity: "minor",    repairRequired: false, emotionalWeight: 0.50, attentionBias: "repair", suppress: [], ttlHours: 24 },
  repair_completed:      { severity: "minor",    repairRequired: false, emotionalWeight: 0.50, attentionBias: null,     suppress: [], positive: true, ttlHours: 24 },
  forgiveness:           { severity: "minor",    repairRequired: false, emotionalWeight: 0.60, attentionBias: null,     suppress: [], positive: true, ttlHours: 24 },
  promise_kept:          { severity: "minor",    repairRequired: false, emotionalWeight: 0.55, attentionBias: null,     suppress: [], positive: true, ttlHours: 24 },
  deep_affection:        { severity: "minor",    repairRequired: false, emotionalWeight: 0.70, attentionBias: null,     suppress: [], positive: true, ttlHours: 24 },
  shared_victory:        { severity: "minor",    repairRequired: false, emotionalWeight: 0.65, attentionBias: null,     suppress: [], positive: true, ttlHours: 48 },
  trust_growth:          { severity: "minor",    repairRequired: false, emotionalWeight: 0.60, attentionBias: null,     suppress: [], positive: true, ttlHours: 48 },
};

function profileFor(eventType) {
  return PROFILES[eventType] || { severity: "moderate", repairRequired: false, emotionalWeight: 0.5, attentionBias: null, suppress: [] };
}

// ── Detection patterns (Jenna's language) ────────────────────────────────────

// Order matters — more specific signals are matched before broader ones.
const NEGATIVE_PATTERNS = [
  { type: "boundary_crossed",      re: /(crossed a line|that'?s not okay|that is not okay|that was too far|went too far|you went too far)/i },
  { type: "promise_broken",        re: /(you promised|you broke your promise|broke your promise|you said you would|you didn'?t keep your)/i },
  { type: "give_space_requested",  re: /(i need space|need some space|give me space|need some time|leave me alone|don'?t act normal|i need a moment|back off)/i },
  { type: "overwhelm_detected",    re: /(too much right now|i'?m overwhelmed|im overwhelmed|overwhelmed|please slow down|this is a lot|can'?t handle this)/i },
  { type: "disappointment",        re: /(you disappointed me|i'?m disappointed|i am disappointed|you let me down|let me down|expected (more|better) (from|of) you)/i },
  { type: "hurt_detected",         re: /(that hurt|you hurt me|that stung|that was hurtful|you'?re hurting me|that really hurt)/i },
  { type: "hurt_detected",         re: /made me feel\b[\s\S]{0,30}\b(bad|terrible|awful|small|unseen|ignored|hurt|worthless|stupid|dismissed)\b/i },
  { type: "pushback_landed_badly", re: /(you'?re not listening|you are not listening|you never listen|listen to me|you'?re not hearing me)/i },
  { type: "conflict",              re: /(no,? that'?s wrong|no,? you'?re wrong|that'?s not right|you'?re wrong|that'?s just wrong)/i },
  { type: "pushback_landed_badly", re: /(^|[\s.,!])(stop|just stop|please stop)([\s.,!]|$)/i },
];

const POSITIVE_PATTERNS = [
  { type: "deep_affection", re: /(that meant a lot|that means a lot|i love you|love you|that was so sweet|you mean (so much|a lot)|that touched me)/i },
  { type: "promise_kept",   re: /(you kept your promise|you remembered|you did what you said|you followed through)/i },
  { type: "shared_victory", re: /(we did it|we made it|that worked|we got it|so proud of us)/i },
  { type: "trust_growth",   re: /(thank you,? that (helped|means a lot)|that (really )?helped|thank you so much|i trust you|that made me feel better)/i },
];

const FORGIVENESS_RE = /(i forgive you|you'?re forgiven|i forgave you|all is forgiven)/i;
const RECONCILED_RE  = /(we'?re okay|we are okay|we'?re good|we are good|it'?s okay now|it'?s fine now|i'?m okay now|we'?re fine|we are fine)/i;

const SEV_ORDER = { minor: 1, moderate: 2, major: 3 };
function maxSeverity(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return SEV_ORDER[b] > SEV_ORDER[a] ? b : a;
}

// How many positive signals after repair_started complete the repair.
const POSITIVE_SIGNALS_TO_COMPLETE = 2;
const POSITIVE_SIGNALS_TO_COMPLETE_MAJOR = 4;

// ── Pure detection helpers (exported for tests/verify) ───────────────────────

function classify(userText = "", repairResult = null) {
  const text = String(userText || "");
  for (const p of NEGATIVE_PATTERNS) {
    if (p.re.test(text)) {
      const prof = profileFor(p.type);
      return { eventType: p.type, severity: prof.severity, source: "user_language" };
    }
  }
  // Fall back to the existing repair analysis when it flagged a repair need.
  if (repairResult?.repairNeeded) {
    const rt = String(repairResult.repairType || "").toLowerCase();
    let eventType = "hurt_detected";
    if (rt.includes("promise")) eventType = "promise_broken";
    else if (rt.includes("boundary")) eventType = "boundary_crossed";
    else if (rt.includes("conflict")) eventType = "conflict";
    else if (rt.includes("dismiss") || rt.includes("ignore")) eventType = "pushback_landed_badly";
    const sev = mapRepairSeverity(repairResult.severity) || profileFor(eventType).severity;
    return { eventType, severity: sev, source: "repair_analysis" };
  }
  return null;
}

function mapRepairSeverity(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "high" || s === "severe" || s === "major") return "major";
  if (s === "medium" || s === "moderate") return "moderate";
  if (s === "low" || s === "minor") return "minor";
  return null;
}

function detectPositive(userText = "") {
  const text = String(userText || "");
  for (const p of POSITIVE_PATTERNS) {
    if (p.re.test(text)) return { eventType: p.type };
  }
  return null;
}

function detectResolution(userText = "") {
  const text = String(userText || "");
  return {
    forgiveness: FORGIVENESS_RE.test(text),
    reconciled: RECONCILED_RE.test(text),
  };
}

// ── Suppression (pure) ───────────────────────────────────────────────────────

function computeSuppression(activeConsequences = []) {
  const open = (activeConsequences || []).filter(c => c && !c.resolvedAt);
  const suppressed = new Set();
  let repairRequired = false;
  let repairStarted = false;
  let healing = false;
  let giveSpace = false;
  let highestSeverity = null;
  let playfulnessDamp = 0;
  let attentionBias = null;
  let warming = false;

  for (const c of open) {
    const rules = Array.isArray(c.suppressionRules) ? c.suppressionRules : [];
    const isHealing = Boolean(c.repairCompleted);
    for (const a of rules) {
      if (isHealing && SOFT_DURING_HEALING.has(a)) continue; // gentle items return
      suppressed.add(a);
    }
    if (c.repairRequired) {
      if (c.repairCompleted) healing = true;
      else repairRequired = true;
      if (c.repairStarted) repairStarted = true;
    }
    if (c.metadata && c.metadata.giveSpace) giveSpace = true;
    if (c.attentionBias && !attentionBias) attentionBias = c.attentionBias;
    highestSeverity = maxSeverity(highestSeverity, c.severity);

    if (c.repairRequired && !c.repairCompleted) playfulnessDamp = Math.max(playfulnessDamp, 0.6);
    else if (c.repairCompleted) playfulnessDamp = Math.max(playfulnessDamp, 0.3);
    else if (Number(c.playfulnessDelta) < 0) playfulnessDamp = Math.max(playfulnessDamp, 0.2);

    if (c.metadata && c.metadata.positive) warming = true;
  }

  // Warming only counts when nothing unresolved is in the way.
  if (repairRequired || healing || giveSpace) warming = false;

  const affectionMode = (repairRequired || healing || giveSpace) ? "repair-aware" : "normal";

  return {
    active: open.length > 0,
    repairRequired,
    repairStarted,
    healing,
    giveSpace,
    highestSeverity,
    suppressed: Array.from(suppressed),
    playfulnessDamp,
    attentionBias: attentionBias || (repairRequired || healing ? "repair" : null),
    affectionMode,
    goodnightAllowed: true,
    warming,
  };
}

function isActionSuppressed(actionType, activeConsequences = []) {
  return computeSuppression(activeConsequences).suppressed.includes(actionType);
}

// ── Engine ───────────────────────────────────────────────────────────────────

function createRelationalConsequencesEngine({
  consequenceStore = null,
  relationshipWeatherBridge = null,
  logger = null,
} = {}) {

  function _hoursFromNow(now, hours) {
    return new Date((now instanceof Date ? now.getTime() : Date.now()) + hours * 3600 * 1000);
  }

  async function _applyWeather(companionId, customerId, eventType, severity) {
    if (!relationshipWeatherBridge?.applyForEvent) return null;
    try {
      return await relationshipWeatherBridge.applyForEvent({ companionId, customerId, eventType, severity });
    } catch (err) {
      logger?.warn?.("[relational-consequences] weather apply failed", { error: err?.message, eventType });
      return null;
    }
  }

  /**
   * recordEvent — create a consequence for an explicit event type (used by the
   * detection path and by callers that already know the event: promise ledger
   * outcomes, decision outcomes, etc.).
   */
  async function recordEvent({
    companionId, customerId, eventType,
    severity = null, source = "", summary = "", emotionalWeight = null,
    now = new Date(), applyWeather = true, metadata = {},
  }) {
    if (!consequenceStore?.create) return null;
    const prof = profileFor(eventType);
    const sev = severity || prof.severity;
    const repairRequired = Boolean(prof.repairRequired);
    const ttlHours = prof.ttlHours ?? null;

    // Repair-required (and major) consequences never carry a timeout — they do
    // not fade on their own. Everything else fades after its ttl.
    const expiresAt = (repairRequired || sev === "major")
      ? null
      : (ttlHours ? _hoursFromNow(now, ttlHours) : null);

    const deltas = relationshipWeatherBridge?.deltasFor?.(eventType) || {};

    const consequence = await consequenceStore.create({
      companionId, customerId, eventType,
      severity: sev, source,
      summary: summary || _defaultSummary(eventType),
      emotionalWeight: emotionalWeight ?? prof.emotionalWeight,
      repairRequired,
      trustDelta: deltas.trust ?? 0,
      comfortDelta: deltas.comfort ?? 0,
      playfulnessDelta: deltas.playfulness ?? 0,
      distanceDelta: deltas.distance ?? 0,
      attentionBias: prof.attentionBias ?? null,
      suppressionRules: prof.suppress || [],
      expiresAt,
      metadata: { ...metadata, giveSpace: Boolean(prof.giveSpace), positive: Boolean(prof.positive) },
      now,
    });

    if (applyWeather) {
      await _applyWeather(companionId, customerId, eventType, sev);
    }
    return consequence;
  }

  /**
   * detect — examine a single interaction (Jenna's text + the existing repair
   * analysis) and create a consequence when one is warranted. De-duplicates
   * against an unresolved consequence of the same type so re-mentioning a hurt
   * reinforces rather than spawns a second.
   */
  async function detect({ companionId, customerId, userText = "", repairResult = null, source = "", now = new Date() }) {
    const cls = classify(userText, repairResult);
    if (!cls) return null;

    const active = consequenceStore?.getActive
      ? await consequenceStore.getActive({ companionId, customerId }).catch(() => [])
      : [];
    const existing = active.find(c => c.eventType === cls.eventType && !c.repairCompleted);
    if (existing) {
      // Reinforce: bump emotional weight a little, keep the single mark.
      await consequenceStore.update?.({
        companionId, customerId, id: existing.id,
        patch: { emotionalWeight: Math.min(1, (existing.emotionalWeight || 0) + 0.05) },
        now,
      }).catch(() => {});
      return existing;
    }

    return recordEvent({
      companionId, customerId,
      eventType: cls.eventType,
      severity: cls.severity,
      source: source || cls.source || "interaction",
      now,
    });
  }

  /**
   * resolveFromSignals — read positive / reconciliation language and move
   * active repairs forward. Explicit forgiveness/"we're okay" completes repair;
   * accumulated positive interaction completes it gradually (more is needed for
   * major). Never resolves anything outright here — completion starts the grace
   * window; reviewActive does the final, gradual resolution.
   */
  async function resolveFromSignals({ companionId, customerId, userText = "", now = new Date() }) {
    const result = { completed: [], advanced: [], created: [] };
    if (!consequenceStore?.getActive) return result;

    const { forgiveness, reconciled } = detectResolution(userText);
    const positive = detectPositive(userText);
    const active = await consequenceStore.getActive({ companionId, customerId }).catch(() => []);
    const repairs = active.filter(c => c.repairRequired && !c.repairCompleted);

    if (forgiveness || reconciled) {
      for (const c of repairs) {
        if (!c.repairStarted) await consequenceStore.markRepairStarted({ companionId, customerId, id: c.id, now }).catch(() => {});
        const updated = await consequenceStore.markRepairCompleted({ companionId, customerId, id: c.id, now }).catch(() => null);
        await _applyWeather(companionId, customerId, "repair_completed", c.severity);
        if (updated) result.completed.push(updated);
      }
      await _applyWeather(companionId, customerId, "forgiveness", "moderate");
    }

    if (positive) {
      const created = await recordEvent({ companionId, customerId, eventType: positive.eventType, source: "user_signal", now });
      if (created) result.created.push(created);

      if (!forgiveness && !reconciled) {
        for (const c of repairs) {
          if (!c.repairStarted) continue; // positives only count once repair is underway
          const newCount = (c.metadata?.positiveSignals || 0) + 1;
          const threshold = c.severity === "major" ? POSITIVE_SIGNALS_TO_COMPLETE_MAJOR : POSITIVE_SIGNALS_TO_COMPLETE;
          if (newCount >= threshold) {
            const updated = await consequenceStore.markRepairCompleted({ companionId, customerId, id: c.id, now }).catch(() => null);
            await _applyWeather(companionId, customerId, "repair_completed", c.severity);
            if (updated) result.completed.push(updated);
          } else {
            await consequenceStore.update?.({
              companionId, customerId, id: c.id,
              patch: { metadata: { ...(c.metadata || {}), positiveSignals: newCount } },
              now,
            }).catch(() => {});
            result.advanced.push({ id: c.id, positiveSignals: newCount });
          }
        }
      }
    }

    return result;
  }

  /**
   * reviewActive — the per-tick review.
   *   1. Dante begins repair himself on any unresolved repair-required mark
   *      that hasn't started (marks repair_started, nudges weather).
   *   2. Safe, gradual expiry of minor/healing consequences (never major,
   *      never unresolved repair).
   * Returns the refreshed active set + computed suppression. Side-effect-only
   * with respect to behaviour — it creates no messages.
   */
  async function reviewActive({ companionId, customerId, now = new Date() }) {
    if (!consequenceStore?.getActive) {
      return { activeConsequences: [], suppression: computeSuppression([]), started: 0, expired: 0, newlyStarted: [] };
    }
    const active = await consequenceStore.getActive({ companionId, customerId }).catch(() => []);

    const newlyStarted = [];
    for (const c of active) {
      if (c.repairRequired && !c.repairStarted && !c.repairCompleted) {
        await consequenceStore.markRepairStarted({ companionId, customerId, id: c.id, now }).catch(() => {});
        await _applyWeather(companionId, customerId, "repair_started", c.severity);
        newlyStarted.push(c);
      }
    }

    const expired = await consequenceStore.expireStale({ companionId, customerId, now }).catch(() => 0);
    const refreshed = await consequenceStore.getActive({ companionId, customerId }).catch(() => []);
    const suppression = computeSuppression(refreshed);

    return { activeConsequences: refreshed, suppression, started: newlyStarted.length, expired, newlyStarted };
  }

  return {
    recordEvent,
    detect,
    resolveFromSignals,
    reviewActive,
    computeSuppression,
    isActionSuppressed,
    classify,
    detectPositive,
    detectResolution,
    EVENT_TYPES,
    SEVERITY,
    CASUAL_ACTIONS,
    OUTBOUND_ACTIONS,
    PROFILES,
  };
}

function _defaultSummary(eventType) {
  const map = {
    hurt_detected: "Something landed badly and hurt her.",
    disappointment: "She was disappointed in me.",
    conflict: "We were at odds.",
    pushback_landed_badly: "I pushed and it landed wrong.",
    boundary_crossed: "I crossed a line.",
    trust_damage: "Trust took a hit.",
    promise_broken: "I didn't keep something I said I would.",
    promise_kept: "I kept my word.",
    deep_affection: "A warm, meaningful moment between us.",
    shared_victory: "We won something together.",
    shared_loss: "We sat with something hard together.",
    trust_growth: "Trust grew a little.",
    misread: "I misread her.",
    overwhelm_detected: "She felt overwhelmed.",
    give_space_requested: "She asked for space.",
    forgiveness: "She forgave me.",
    repair_started: "I started making it right.",
    repair_completed: "We worked through it.",
    unresolved_tension: "Something unspoken is still sitting between us.",
  };
  return map[eventType] || "A meaningful moment.";
}

module.exports = {
  createRelationalConsequencesEngine,
  classify,
  detectPositive,
  detectResolution,
  computeSuppression,
  isActionSuppressed,
  EVENT_TYPES,
  SEVERITY,
  CASUAL_ACTIONS,
  OUTBOUND_ACTIONS,
  PROFILES,
  SOFT_DURING_HEALING,
};
