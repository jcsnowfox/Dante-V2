/**
 * companion/companionEvent
 *
 * Phase 1 — Shared Companion Brain Contract.
 *
 * Defines the single normalized inbound/outbound shapes that EVERY channel
 * (Discord, Second Life, Telegram, web, ...) flows through. There is exactly
 * one personality, one memory source, one relationship state, one prompt
 * builder, and one model routing system behind this contract. Channels may add
 * channel-specific context, but the personality must never fork.
 *
 * Nothing here is customer-specific: no names, UUIDs, regions, or prompts are
 * hardcoded. The normalizers only coerce shapes and apply safe generic
 * defaults.
 */

const INBOUND_CHANNEL_TYPES = new Set(["discord", "second_life", "telegram", "web"]);
const DEFAULT_CHANNEL_TYPE = "discord";
const DEFAULT_PRIVACY_LEVEL = "public";
const DEFAULT_EVENT_TYPE = "message";

function normalizeChannelType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return INBOUND_CHANNEL_TYPES.has(normalized) ? normalized : DEFAULT_CHANNEL_TYPE;
}

function asText(value) {
  return value == null ? "" : String(value);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Normalize an arbitrary inbound payload into the shared companion event shape.
 * Unknown channel types fall back to the default channel; missing fields use
 * safe, name-free defaults.
 */
function normalizeInboundEvent(raw = {}) {
  const event = raw && typeof raw === "object" ? raw : {};
  return {
    companionId: asText(event.companionId).trim(),
    channelType: normalizeChannelType(event.channelType),
    externalUserId: asText(event.externalUserId).trim(),
    userDisplayName: asText(event.userDisplayName),
    messageText: asText(event.messageText),
    eventType: asText(event.eventType).trim() || DEFAULT_EVENT_TYPE,
    privacyLevel: asText(event.privacyLevel).trim() || DEFAULT_PRIVACY_LEVEL,
    locationContext: event.locationContext == null ? null : event.locationContext,
    relationshipContext: event.relationshipContext == null ? null : event.relationshipContext,
    worldContext: event.worldContext == null ? null : event.worldContext,
    timestamp: asText(event.timestamp).trim() || new Date().toISOString(),
    metadata: asObject(event.metadata),
  };
}

/**
 * Normalize an arbitrary outbound payload into the shared companion result
 * shape. Falls back to the inbound event for companionId/channelType/privacy so
 * a channel adapter never has to repeat them.
 */
function normalizeOutboundResult(raw = {}, inbound = {}) {
  const result = raw && typeof raw === "object" ? raw : {};
  const source = inbound && typeof inbound === "object" ? inbound : {};
  return {
    companionId: asText(result.companionId).trim() || asText(source.companionId).trim(),
    channelType: normalizeChannelType(result.channelType || source.channelType),
    responseText: asText(result.responseText),
    actionCommands: asArray(result.actionCommands),
    memoryWrites: asArray(result.memoryWrites),
    stateUpdates: asObject(result.stateUpdates),
    privacyLevel: asText(result.privacyLevel).trim()
      || asText(source.privacyLevel).trim()
      || DEFAULT_PRIVACY_LEVEL,
    metadata: asObject(result.metadata),
  };
}

module.exports = {
  INBOUND_CHANNEL_TYPES,
  DEFAULT_CHANNEL_TYPE,
  DEFAULT_PRIVACY_LEVEL,
  normalizeChannelType,
  normalizeInboundEvent,
  normalizeOutboundResult,
};
