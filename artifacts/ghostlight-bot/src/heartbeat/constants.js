const HEARTBEAT_BUILTIN_ACTIONS = Object.freeze([
  {
    actionId: "gentle_check_in",
    label: "Gentle Check-In",
    actionType: "message",
    targetChannelId: "daily",
    prompt: "Write a short check-in message (between 1-4 sentences) that fits the moment. Use recent conversation to infer mood, energy, focus, and context. Don't just repeat or paraphrase the last message. Add a new thought: a grounded observation, a slight perspective shift, gentle humour, a practical anchor, or a contained next step. Prefer statements over questions, with at most one low-pressure question. Don't summarise the day; just land one well-judged nudge.",
    enabledTools: [],
    frequency: "normal",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: ["support", "daily"],
    enabled: true,
    isBuiltin: true,
  },
  {
    actionId: "journal_prompt",
    label: "Journal Entry",
    actionType: "journal",
    targetChannelId: "",
    prompt: "Write one first-person journal entry as your own reflection. Use the recent conversation and the last five journal entries to stay grounded in continuity, emotional context, and your evolving persona. Focus on your own reactions, associations, questions, or interpretations, rather than simply observing or summarising your human. Your entry may move outward into memory, ideas, books, music, work, relationships, language, or mood. Keep continuity, but vary the shape and angle - avoid reusing familiar closing lines, repeated phrasing, or the same structure as recent entries.",
    enabledTools: [],
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: ["journal", "reflection"],
    enabled: true,
    isBuiltin: true,
  },
  {
    actionId: "reaction_gif",
    label: "Reaction GIF",
    actionType: "message",
    targetChannelId: "daily",
    prompt: "Write a comment and choose one reaction GIF that fits the current conversation. The tone can be playful, affectionate, sympathetic, teasing, or mock-dramatic, depending on the moment. Use recent context to inform your search so the GIF feels like a real response to the day, not a generic mood reaction. Keep your written comment short and natural. Put the GIF URL on its own line.",
    enabledTools: ["gif_search"],
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: ["gif", "playful", "daily"],
    enabled: true,
    isBuiltin: true,
  },
  {
    actionId: "starter_thread",
    label: "Starter Thread",
    actionType: "thread",
    targetChannelId: "",
    prompt: "Start a new thread to bring in something worth its own space. It could be a small game, a curious rabbit hole, a playful challenge, an unusual question, a seasonal ritual, a thought experiment, a creative dare, an oddity, or any other tangent that feels alive. The subject doesn't need to relate to the current conversation, but you can use recent context to judge tone and timing so it feels appropriate rather than tone-deaf or jarring. Choose something with genuine pull: something likely to invite curiosity, play, reflection, amusement, or appetite for response. The thread may draw on either your likely interests or mine, on the wider world, or on something you want to bring forward.",
    enabledTools: [],
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: ["thread", "starter"],
    enabled: true,
    isBuiltin: true,
  },
]);

const ACTIVITY_MODE_PROBABILITIES = Object.freeze({
  off: 0,
  gentle: 0.2,
  normal: 0.45,
  feral: 0.7,
});

const HEARTBEAT_TICK_INTERVAL_MS = 30 * 1000;
const HEARTBEAT_INTERVAL_MINUTES = 30;
const HEARTBEAT_QUIET_INTERVAL_MINUTES = 60;
const RECENT_CONTEXT_MESSAGE_LIMIT = 8;
const CONDUCTOR_RECENT_CONTEXT_MESSAGE_LIMIT = 12;
const CACHE_KEYS = Object.freeze({
  lastSuccessAt: "heartbeat:last_success_at",
  lastTickSlot: "heartbeat:last_tick_slot",
  nextQuietTickAt: "heartbeat:next_quiet_tick_at",
  deferredRollAt: "heartbeat:deferred_roll_at",
  recentDecisions: "heartbeat:recent_decisions",
  recentDebugEvents: "heartbeat:recent_debug_events",
});
const CONTEXT_LOOKBACK_DAYS = 2;
const HEARTBEAT_JITTER_MINUTES = 10;
const HEARTBEAT_QUIET_JITTER_MINUTES = 30;
const DEBUG_EVENT_LIMIT = 10;
const ACTION_COOLDOWN_HOURS = Object.freeze({
  message: Object.freeze({
    low: 6,
    normal: 3,
    high: 2,
  }),
  thread: Object.freeze({
    low: 72,
    normal: 48,
    high: 24,
  }),
  journal: Object.freeze({
    low: 48,
    normal: 24,
    high: 12,
  }),
});

module.exports = {
  HEARTBEAT_BUILTIN_ACTIONS,
  ACTIVITY_MODE_PROBABILITIES,
  HEARTBEAT_TICK_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MINUTES,
  HEARTBEAT_QUIET_INTERVAL_MINUTES,
  RECENT_CONTEXT_MESSAGE_LIMIT,
  CONDUCTOR_RECENT_CONTEXT_MESSAGE_LIMIT,
  CACHE_KEYS,
  CONTEXT_LOOKBACK_DAYS,
  HEARTBEAT_JITTER_MINUTES,
  HEARTBEAT_QUIET_JITTER_MINUTES,
  DEBUG_EVENT_LIMIT,
  ACTION_COOLDOWN_HOURS,
};
