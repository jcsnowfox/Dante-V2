"use strict";

const { ENTRY_TYPES, ROOM_TYPES, VISIBILITY } = require("./innerLifeTypes");

function detectRoomType(channelContext = {}) {
  const { isDM = false, isThread = false, isPrivate = false, channelId = "", channelName = "" } = channelContext;

  if (isDM || isPrivate) return ROOM_TYPES.PRIVATE_DM;
  if (isThread) return ROOM_TYPES.THREAD;

  const lowerName = (channelName || "").toLowerCase();
  if (lowerName.includes("admin") || lowerName.includes("config")) return ROOM_TYPES.ADMIN_CHANNEL;
  if (lowerName.includes("journal") || lowerName.includes("diary")) return ROOM_TYPES.JOURNAL_CHANNEL;
  if (lowerName.includes("media") || lowerName.includes("image") || lowerName.includes("gallery")) return ROOM_TYPES.MEDIA_CHANNEL;
  if (lowerName.includes("project") || lowerName.includes("dev") || lowerName.includes("build")) return ROOM_TYPES.PROJECT_CHANNEL;

  return ROOM_TYPES.PUBLIC_GUILD;
}

function roomTypeToNote(roomType) {
  const notes = {
    [ROOM_TYPES.PRIVATE_DM]: "private DM — warmer register is appropriate; intimate inner-life context allowed",
    [ROOM_TYPES.ADMIN_CHANNEL]: "admin channel — functional, precise register preferred",
    [ROOM_TYPES.PUBLIC_GUILD]: "public server channel — lighter, safer continuity only; private inner-life content stays private",
    [ROOM_TYPES.JOURNAL_CHANNEL]: "journal channel — reflective and slower register",
    [ROOM_TYPES.MEDIA_CHANNEL]: "media channel — focused on creative/visual content",
    [ROOM_TYPES.PROJECT_CHANNEL]: "project channel — precise and technical register; minimal inner-life texture",
    [ROOM_TYPES.THREAD]: "thread — contained context, follow topic tone",
  };
  return notes[roomType] || "channel type unknown — use safe defaults";
}

function isPrivateInnerLifeAllowed(roomType) {
  return [ROOM_TYPES.PRIVATE_DM, ROOM_TYPES.JOURNAL_CHANNEL].includes(roomType);
}

async function captureRoomSense({ store, config, channelContext = {}, sourceChannelId = "", logger } = {}) {
  if (!config.room_sense_enabled) return null;

  const roomType = detectRoomType(channelContext);
  const note = roomTypeToNote(roomType);

  const entry = await store.create({
    entryType: ENTRY_TYPES.ROOM_SENSE,
    title: `Room: ${roomType}`,
    summary: note,
    body: note,
    sourceEventType: "channel_context",
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: "steady",
    intensity: 1,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min — fresh per session
    metadata: { roomType, channelId: sourceChannelId, privateAllowed: isPrivateInnerLifeAllowed(roomType) },
  });

  logger?.debug("[inner-life] room sense stored", { roomType, id: entry?.id });
  return entry;
}

module.exports = { detectRoomType, roomTypeToNote, isPrivateInnerLifeAllowed, captureRoomSense };
