"use strict";

/**
 * presenceInterpreter
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Interprets Discord presence events, alive presence store data,
 * and explicit user statements into world state signals.
 *
 * CORE LAW: Every signal produced here must carry a source and
 * evidence_ids so the world state is never fabricated.
 */

const AVAILABILITY = Object.freeze({
  AVAILABLE:    "available",
  LIKELY_BUSY:  "likely_busy",
  BUSY:         "busy",
  ASLEEP:       "asleep",
  UNAVAILABLE:  "unavailable",
  GIVE_SPACE:   "give_space",
  UNKNOWN:      "unknown",
});

const DISCORD_STATUS_MAP = Object.freeze({
  online:    { availability: AVAILABILITY.AVAILABLE,    confidence: 0.70 },
  idle:      { availability: AVAILABILITY.LIKELY_BUSY,  confidence: 0.55 },
  dnd:       { availability: AVAILABILITY.BUSY,         confidence: 0.85 },
  offline:   { availability: AVAILABILITY.UNAVAILABLE,  confidence: 0.60 },
  invisible: { availability: AVAILABILITY.UNKNOWN,      confidence: 0.20 },
});

// Explicit statement patterns → override signals
const EXPLICIT_PATTERNS = [
  { pattern: /\b(i'?m?|i am)\s+(busy|working|in\s+a\s+meeting|not\s+available)\b/i,  availability: AVAILABILITY.BUSY,         confidence: 0.95 },
  { pattern: /\b(going\s+to\s+sleep|heading\s+to\s+bed|going\s+to\s+bed|goodnight)\b/i, availability: AVAILABILITY.ASLEEP,    confidence: 0.90 },
  { pattern: /\b(i'?m?\s+)?(awake|up\s+now|just\s+woke)\b/i,                           availability: AVAILABILITY.AVAILABLE,  confidence: 0.90 },
  { pattern: /\b(need\s+space|give\s+me\s+space|leave\s+me\s+alone|i\s+need\s+a\s+break)\b/i, availability: AVAILABILITY.GIVE_SPACE, confidence: 0.95 },
  { pattern: /\b(i'?m?\s+)?(free|available|not\s+busy|here\s+now|back\s+now)\b/i,      availability: AVAILABILITY.AVAILABLE,  confidence: 0.85 },
  { pattern: /\b(brb|be\s+right\s+back|back\s+in\s+a\s+(bit|minute|sec))\b/i,         availability: AVAILABILITY.LIKELY_BUSY, confidence: 0.75 },
  { pattern: /\b(stepping\s+out|stepping\s+away|afk|away\s+from\s+keyboard)\b/i,       availability: AVAILABILITY.LIKELY_BUSY, confidence: 0.80 },
];

// Interpret an alivePresence object into world state signals
function interpretAlivePresence(alivePresence, now = new Date()) {
  if (!alivePresence) return [];
  const signals = [];

  if (alivePresence.userAsleep === true) {
    signals.push({ key: "jenna.availability", value: AVAILABILITY.ASLEEP, confidence: 0.80, source: "alive_presence", evidence_ids: ["alive_presence:sleeping"] });
    signals.push({ key: "jenna.sleeping_confidence", value: 0.80, confidence: 0.80, source: "alive_presence", evidence_ids: ["alive_presence:sleeping"] });
  } else if (alivePresence.userDoNotDisturb === true) {
    signals.push({ key: "jenna.availability", value: AVAILABILITY.BUSY, confidence: 0.85, source: "alive_presence", evidence_ids: ["alive_presence:dnd"] });
    signals.push({ key: "jenna.busy_confidence", value: 0.85, confidence: 0.85, source: "alive_presence", evidence_ids: ["alive_presence:dnd"] });
  } else if (alivePresence.userBusy === true) {
    signals.push({ key: "jenna.availability", value: AVAILABILITY.BUSY, confidence: 0.80, source: "alive_presence", evidence_ids: ["alive_presence:busy"] });
    signals.push({ key: "jenna.busy_confidence", value: 0.80, confidence: 0.80, source: "alive_presence", evidence_ids: ["alive_presence:busy"] });
  } else if (alivePresence.userRecentlyActive === true) {
    signals.push({ key: "jenna.availability", value: AVAILABILITY.AVAILABLE, confidence: 0.65, source: "alive_presence", evidence_ids: ["alive_presence:active"] });
  } else if (alivePresence.userRecentlyActive === false) {
    signals.push({ key: "jenna.availability", value: AVAILABILITY.LIKELY_BUSY, confidence: 0.45, source: "alive_presence", evidence_ids: ["alive_presence:inactive"] });
  }

  if (alivePresence.discordStatus && DISCORD_STATUS_MAP[alivePresence.discordStatus]) {
    const m = DISCORD_STATUS_MAP[alivePresence.discordStatus];
    signals.push({ key: "jenna.discord_status", value: alivePresence.discordStatus, confidence: m.confidence, source: "discord_presence", evidence_ids: ["discord:status:" + alivePresence.discordStatus] });
  }

  if (alivePresence.currentChannel) {
    signals.push({ key: "jenna.current_channel", value: String(alivePresence.currentChannel).slice(0, 80), confidence: 0.85, source: "discord_presence", evidence_ids: ["discord:channel"] });
  }

  if (alivePresence.lastSeen) {
    signals.push({ key: "jenna.last_meaningful_contact", value: String(alivePresence.lastSeen), confidence: 0.90, source: "alive_presence", evidence_ids: ["alive_presence:last_seen"] });
  }

  return signals;
}

// Interpret a Discord event into world state signals
function interpretDiscordEvent(event = {}) {
  if (!event) return [];
  const signals = [];
  const eventType = event.event_type || event.eventType || "";
  const evId      = event.id ? String(event.id) : ("discord_ev_" + Date.now());
  const ts        = event.created_at || event.timestamp || new Date().toISOString();

  if (eventType === "user_message_received" || eventType === "message_created" || eventType === "message_received") {
    signals.push({ key: "jenna.availability", value: AVAILABILITY.AVAILABLE, confidence: 0.85, source: "discord_event", evidence_ids: [evId] });
    signals.push({ key: "jenna.last_meaningful_contact", value: ts, confidence: 0.95, source: "discord_event", evidence_ids: [evId] });
    const channel = event.channel_id || event.channelId || event.channel || null;
    if (channel) {
      signals.push({ key: "jenna.current_channel", value: String(channel).slice(0, 80), confidence: 0.92, source: "discord_event", evidence_ids: [evId] });
    }
  }

  if (eventType === "reaction_added" || eventType === "reaction_created") {
    const emoji = event.emoji || event.payload?.emoji || "";
    if (emoji) {
      signals.push({ key: "jenna.recent_reaction", value: String(emoji).slice(0, 20), confidence: 0.90, source: "discord_event", evidence_ids: [evId] });
    }
    signals.push({ key: "jenna.availability", value: AVAILABILITY.AVAILABLE, confidence: 0.70, source: "discord_event", evidence_ids: [evId] });
    signals.push({ key: "jenna.last_meaningful_contact", value: ts, confidence: 0.85, source: "discord_event", evidence_ids: [evId] });
  }

  if (eventType === "user_presence_update" || eventType === "presence_update") {
    const status = event.status || event.payload?.status || "";
    const m = DISCORD_STATUS_MAP[status];
    if (m) {
      signals.push({ key: "jenna.availability", value: m.availability, confidence: m.confidence, source: "discord_presence", evidence_ids: [evId] });
    }
  }

  if (eventType === "user_typing") {
    signals.push({ key: "jenna.availability", value: AVAILABILITY.AVAILABLE, confidence: 0.75, source: "discord_event", evidence_ids: [evId] });
  }

  return signals;
}

// Interpret explicit user text statements into override signals
function interpretExplicitStatement(text = "") {
  if (!text || typeof text !== "string") return [];
  const signals = [];

  for (const { pattern, availability, confidence } of EXPLICIT_PATTERNS) {
    if (pattern.test(text)) {
      const staleness_threshold_ms = availability === AVAILABILITY.GIVE_SPACE
        ? 4 * 60 * 60 * 1000   // give_space holds for 4 h
        : 2 * 60 * 60 * 1000;  // other explicit holds for 2 h

      signals.push({
        key:                   "jenna.availability",
        value:                 availability,
        confidence,
        source:                "explicit_statement",
        evidence_ids:          ["explicit:" + availability],
        staleness_threshold_ms,
      });

      if (availability === AVAILABILITY.GIVE_SPACE) {
        signals.push({
          key:                   "jenna.give_space",
          value:                 true,
          confidence,
          source:                "explicit_statement",
          evidence_ids:          ["explicit:give_space"],
          staleness_threshold_ms: 4 * 60 * 60 * 1000,
        });
      }
      break; // first matching pattern wins
    }
  }

  return signals;
}

module.exports = {
  interpretAlivePresence,
  interpretDiscordEvent,
  interpretExplicitStatement,
  AVAILABILITY,
  DISCORD_STATUS_MAP,
  EXPLICIT_PATTERNS,
};
