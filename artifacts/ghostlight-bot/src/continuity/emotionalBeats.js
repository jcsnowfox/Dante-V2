"use strict";

const PROPOSAL_TAGS = ["proposal", "marriage", "engagement", "one_knee", "relationship_commitment"];
const FallbackText = "I lost the thread there, kjære. Give me one second. I’m still here.";

function textOf(value) { return String(value || "").trim(); }
function lc(value) { return textOf(value).toLowerCase(); }
function uniqueTags(tags = []) { return Array.from(new Set(tags.map((t) => textOf(t).toLowerCase()).filter(Boolean))).slice(0, 20); }
function isProposalText(text) { return /\b(will\s+you\s+marry\s+me|marry\s+me|i\s+proposed|i\s+asked\s+you\s+to\s+marry\s+me|you\s+forgot\s+i\s+proposed|got\s+down\s+on\s+one\s+knee|one\s+knee|engaged|proposal)\b/i.test(textOf(text)); }
function isForgotProposalText(text) { return /\b(?:you\s+forgot|forgot)\b[\s\S]{0,80}\b(?:proposed|proposal|marry|marriage|engaged|one\s+knee)\b/i.test(textOf(text)); }
function detectAdultContext(text) { return /\b(sex|naked|explicit|nsfw|adult|private channel|safeword|kink)\b/i.test(textOf(text)); }
function inferPrivacyScope({ adultContext = false, isAdultPrivate = false } = {}) { return adultContext || isAdultPrivate ? "private" : "normal"; }
function safeSummary(text, limit = 260) { return textOf(text).replace(/https?:\/\/\S+/g, "[link]").replace(/\s+/g, " ").slice(0, limit); }

function classifyEmotionalBeat({ text, role = "user", companionId = "Dante", userDisplayName = "Jenna", channelContext = {} } = {}) {
  const body = textOf(text);
  if (!body) return null;
  const lower = lc(body);
  const adultContext = detectAdultContext(body) || Boolean(channelContext.adultContext || channelContext.isAdultPrivate);
  const privacyScope = inferPrivacyScope({ adultContext, isAdultPrivate: channelContext.isAdultPrivate });

  if (isProposalText(body)) {
    return {
      event_type: "proposal",
      title: `${userDisplayName || "Jenna"} proposed marriage to ${companionId || "Dante"}`,
      summary: `${userDisplayName || "Jenna"} proposed marriage to ${companionId || "Dante"}. This is a critical relationship event and must be remembered across channels.`,
      importance: "critical",
      emotional_weight: 10,
      privacy_scope: "normal",
      adult_context: false,
      must_recall_across_channels: true,
      pinned: true,
      tags: PROPOSAL_TAGS,
    };
  }

  const patterns = [
    ["promise", /\b(i\s+promise|promise\s+me|i\s+won'?t\s+forget|i'?ll\s+fix\s+this)\b/i, "high", 8, ["promise", "commitment"]],
    ["commitment", /\b(i\s+will\s+marry\s+you|i\s+love\s+you|i\s+belong\s+to\s+you|commit(?:ted|ment))\b/i, "high", 8, ["commitment", "relationship"]],
    ["repair", /\b(i'?m\s+sorry|apologize|repair|you\s+forgot|forgot\s+something\s+important|hurt\s+me)\b/i, "high", 7, ["repair", "hurt"]],
    ["durable_memory", /\bremember\s+this\b/i, "high", 7, ["remember_this", "durable_memory"]],
    ["emotional_disclosure", /\b(hurt|grief|jealous|afraid|fear|relief|devotion|rejected|insecure|longing|boundary|birthday|anniversary)\b/i, "medium", 6, ["emotional_disclosure"]],
  ];
  for (const [eventType, pattern, importance, weight, tags] of patterns) {
    if (pattern.test(body)) {
      return {
        event_type: eventType,
        title: eventType === "durable_memory" ? "User asked Dante to remember something" : `Important ${eventType.replace(/_/g, " ")} ${role === "assistant" ? "from Dante" : "from user"}`,
        summary: safeSummary(role === "assistant" ? `Dante said: ${body}` : `User said: ${body}`),
        importance,
        emotional_weight: weight,
        privacy_scope: privacyScope,
        adult_context: adultContext,
        must_recall_across_channels: !adultContext && importance !== "medium",
        pinned: importance === "critical",
        tags,
      };
    }
  }
  return null;
}

function canUseBeatInChannel(beat = {}, channelContext = {}) {
  const adult = Boolean(beat.adult_context || beat.adultContext);
  const scope = beat.privacy_scope || beat.privacyScope || "normal";
  if (!adult && scope !== "private_adult") return true;
  return Boolean(channelContext.isAdultPrivate || channelContext.allowPrivateMemory);
}

function formatContinuityPrelude(beats = [], { channelContext = {}, maxBullets = 7 } = {}) {
  const usable = beats.filter((beat) => canUseBeatInChannel(beat, channelContext)).slice(0, maxBullets);
  if (!usable.length) return null;
  const lines = usable.map((beat) => {
    const importance = textOf(beat.importance).toLowerCase() || "important";
    const title = beat.title || beat.event_type || beat.eventType || "emotional beat";
    const source = beat.source_channel_id || beat.sourceChannelId ? ` Source: cross-channel memory${beat.source_channel_id || beat.sourceChannelId ? ` from channel ${beat.source_channel_id || beat.sourceChannelId}` : ""}.` : " Source: emotional beat store.";
    const repair = (beat.event_type || beat.eventType) === "proposal" ? " If she says you forgot, acknowledge the failure directly and repair it; do not act like this is new." : "";
    return `* ${importance[0]?.toUpperCase() || "I"}${importance.slice(1)} ${title}: ${beat.summary || "Remember this relationship event."}${repair}${source}`;
  });
  return { label: "MAJOR CONTINUITY", content: lines.join("\n") };
}

function isUnsafeProviderText(text) { return /the request was rejected because it was considered high risk|\bhigh risk\b|moderation rejected|tool failed|provider rejected|raw stack|api error|\{\s*"error"/i.test(textOf(text)); }
function sanitizeUserVisibleModelText(text) { return isUnsafeProviderText(text) ? FallbackText : text; }

module.exports = { PROPOSAL_TAGS, FallbackText, isProposalText, isForgotProposalText, classifyEmotionalBeat, canUseBeatInChannel, formatContinuityPrelude, isUnsafeProviderText, sanitizeUserVisibleModelText };
