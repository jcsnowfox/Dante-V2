const {
  createConversationStore,
  SUPPORTED_EVENT_TYPES,
  SUPPORTED_ROLES,
  SUPPORTED_SOURCES,
  buildEventContentText,
  buildConversationSummary,
  buildConversationExportHeader,
  filterExportEvents,
  formatConversationExport,
  mapEventToHistoryItem,
  formatEventAsPlainText,
  getConversationLabel,
  validateEventInput,
} = require("./conversations");
const {
  createMemoryStore,
  SUPPORTED_MEMORY_TYPES,
  SUPPORTED_SENSITIVITY_LEVELS,
  DEFAULT_IMPORTANCE_BY_TYPE,
  normalizeDomain,
  normalizeMemoryRecord,
} = require("./memories");
const {
  createGeneratedMemoryStore,
  SUPPORTED_GENERATED_SOURCE_KINDS,
  SUPPORTED_GENERATED_STATUSES,
  normalizeGeneratedMemoryRecord,
} = require("./generatedMemories");
const { createSettingsStore } = require("./settings");
const {
  createGeneratedImageStore,
  normalizeGeneratedImageRecord,
  SUPPORTED_GENERATED_IMAGE_STATUSES,
} = require("./generatedImages");
const {
  createGeneratedAudioStore,
  normalizeGeneratedAudioRecord,
  SUPPORTED_GENERATED_AUDIO_STATUSES,
} = require("./generatedAudio");
const {
  createMusicStore,
  normalizeSpotifyTrackRecord,
  normalizeAffinityRecord,
  buildMusicActorKey,
  resolveMusicActor,
  SUPPORTED_MUSIC_REACTIONS,
} = require("./music");
const { createImageStylePresetStore } = require("./imageStylePresets");
const { createImageAppearancePresetStore } = require("./imageAppearancePresets");
const { createCacheStore, normalizeCacheRecord } = require("./cache");
const {
  createSummaryQueueStore,
  normalizeSummaryQueueRecord,
  SUPPORTED_SUMMARY_QUEUE_TYPES,
  SUPPORTED_SUMMARY_QUEUE_STATUSES,
} = require("./summaryQueue");
const { createJournalStore, normalizeJournalEntryRecord } = require("./journals");
const { createChannelModeStore, normalizeModeKey } = require("./channelModes");
const {
  createAutomationStore,
  SUPPORTED_AUTOMATION_TYPES,
  normalizeAutomationRecord,
} = require("./automations");
const {
  createHeartbeatActionStore,
  SUPPORTED_HEARTBEAT_EXECUTOR_TYPES,
  SUPPORTED_HEARTBEAT_FREQUENCIES,
  normalizeHeartbeatActionRecord,
} = require("./heartbeatActions");
const {
  createProactiveActionStore,
  normalizeProactiveActionRecord,
  SUPPORTED_TRIGGER_TYPES,
  SUPPORTED_ACTION_TYPES,
  SUPPORTED_PROACTIVE_TOOLS,
  SUPPORTED_SCHEDULE_MODES,
  SUPPORTED_SCHEDULE_DAYS,
  MAX_ENABLED_TOOLS,
} = require("./proactiveActions");
const { createEmotionalBeatStore } = require("./emotionalBeats");
const { createPromiseLedger } = require("../continuity/promiseLedger");
const { createMicroPreferenceStore } = require("./microPreferences");
const { createPersonalTimelineStore } = require("./personalTimeline");
const { createFollowUpStore } = require("./followUpItems");
const { createChannelAwarenessStore } = require("./channelAwareness");
const { createInnerWeatherStore } = require("./innerWeather");
const { createAttentionResidueStore } = require("./attentionResidue");
const { createInteractionPresenceStore } = require("./interactionPresence");

module.exports = {
  createConversationStore,
  createMemoryStore,
  createGeneratedMemoryStore,
  createSettingsStore,
  createGeneratedImageStore,
  createGeneratedAudioStore,
  createMusicStore,
  createImageStylePresetStore,
  createImageAppearancePresetStore,
  createCacheStore,
  createSummaryQueueStore,
  createJournalStore,
  createChannelModeStore,
  createAutomationStore,
  createHeartbeatActionStore,
  createProactiveActionStore,
  createEmotionalBeatStore,
  createPromiseLedger,
  createMicroPreferenceStore,
  createPersonalTimelineStore,
  createFollowUpStore,
  createChannelAwarenessStore,
  createInnerWeatherStore,
  createAttentionResidueStore,
  createInteractionPresenceStore,
  SUPPORTED_EVENT_TYPES,
  SUPPORTED_ROLES,
  SUPPORTED_SOURCES,
  SUPPORTED_MEMORY_TYPES,
  SUPPORTED_SENSITIVITY_LEVELS,
  SUPPORTED_GENERATED_SOURCE_KINDS,
  SUPPORTED_GENERATED_STATUSES,
  SUPPORTED_AUTOMATION_TYPES,
  SUPPORTED_HEARTBEAT_EXECUTOR_TYPES,
  SUPPORTED_HEARTBEAT_FREQUENCIES,
  SUPPORTED_TRIGGER_TYPES,
  SUPPORTED_ACTION_TYPES,
  SUPPORTED_PROACTIVE_TOOLS,
  SUPPORTED_SCHEDULE_MODES,
  SUPPORTED_SCHEDULE_DAYS,
  MAX_ENABLED_TOOLS,
  SUPPORTED_GENERATED_IMAGE_STATUSES,
  SUPPORTED_GENERATED_AUDIO_STATUSES,
  SUPPORTED_MUSIC_REACTIONS,
  SUPPORTED_SUMMARY_QUEUE_TYPES,
  SUPPORTED_SUMMARY_QUEUE_STATUSES,
  DEFAULT_IMPORTANCE_BY_TYPE,
  buildEventContentText,
  buildConversationSummary,
  buildConversationExportHeader,
  filterExportEvents,
  formatConversationExport,
  mapEventToHistoryItem,
  formatEventAsPlainText,
  getConversationLabel,
  normalizeDomain,
  normalizeMemoryRecord,
  normalizeModeKey,
  normalizeJournalEntryRecord,
  normalizeGeneratedImageRecord,
  normalizeGeneratedAudioRecord,
  normalizeSpotifyTrackRecord,
  normalizeAffinityRecord,
  buildMusicActorKey,
  resolveMusicActor,
  normalizeCacheRecord,
  normalizeSummaryQueueRecord,
  normalizeAutomationRecord,
  normalizeHeartbeatActionRecord,
  normalizeProactiveActionRecord,
  normalizeGeneratedMemoryRecord,
  createStagedMemoryStore: createGeneratedMemoryStore,
  SUPPORTED_STAGED_SOURCE_KINDS: SUPPORTED_GENERATED_SOURCE_KINDS,
  SUPPORTED_STAGED_STATUSES: SUPPORTED_GENERATED_STATUSES,
  normalizeStagedMemoryRecord: normalizeGeneratedMemoryRecord,
  validateEventInput,
};
