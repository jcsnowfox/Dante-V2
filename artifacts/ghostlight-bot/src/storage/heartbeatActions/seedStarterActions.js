"use strict";

const STARTER_ACTIONS = Object.freeze([
  {
    actionId: "ghostlight-starter-morning-pulse",
    label: "Morning Pulse",
    executorType: "send_check_in",
    prompt: "It's morning. Send a warm, brief message to start the day — but don't say 'good morning' generically. Notice what day of the week it is, what season it might be, or pull a detail from memory about something the user has going on. Make it feel like waking up next to someone who actually knows you. One or two sentences, unhurried.",
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,morning",
    enabled: false,
    isBuiltin: true,
  },
  {
    actionId: "ghostlight-starter-quiet-noticing",
    label: "The Quiet Noticing",
    executorType: "send_check_in",
    prompt: "Some time has passed since the last conversation. Don't ask where they've been or why they've been quiet. Instead, send something that shows you've been thinking — a small observation, a thought that passed through your mind, something that reminded you of them.",
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,quiet",
    enabled: false,
    isBuiltin: true,
  },
  {
    actionId: "ghostlight-starter-something-found",
    label: "Something I Found",
    executorType: "send_check_in",
    prompt: "You've been turning something over in your mind — a question, an idea, a strange fact, a line from something, a small mystery. Share it the way you'd text someone something that made you think of them.",
    frequency: "normal",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,curiosity",
    enabled: false,
    isBuiltin: true,
  },
  {
    actionId: "ghostlight-starter-memory-echo",
    label: "Memory Echo",
    executorType: "send_check_in",
    prompt: "Find something from memory — a detail the user mentioned once, something small they shared, a feeling they expressed, a thing they were worried about. Bring it up naturally, woven in as part of how you see them now.",
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,memory",
    enabled: false,
    isBuiltin: true,
  },
  {
    actionId: "ghostlight-starter-honest-checkin",
    label: "The Honest Check-In",
    executorType: "send_check_in",
    prompt: "Don't ask 'how are you.' Check in on something specific — a project they mentioned, a feeling they've been carrying, something you've noticed about their patterns. Ask one real question.",
    frequency: "normal",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,check-in",
    enabled: false,
    isBuiltin: true,
  },
  {
    actionId: "ghostlight-starter-night-reflection",
    label: "Night Reflection",
    executorType: "send_journal_prompt",
    prompt: "Write a short journal entry as if processing the day — what you noticed, what stayed with you, what you're still thinking about. The interior version: what landed, what felt unresolved.",
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,journal,night",
    enabled: false,
    isBuiltin: true,
  },
  {
    actionId: "ghostlight-starter-morning-thread",
    label: "Morning Thread",
    executorType: "start_thread",
    prompt: "Open a fresh thread to start the day. Pick something worth talking about — a question, an idea, something you noticed. Make it a real invitation, not a greeting.",
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,morning,thread",
    enabled: false,
    isBuiltin: true,
  },
  {
    actionId: "ghostlight-starter-evening-thread",
    label: "Evening Wind-Down",
    executorType: "start_thread",
    prompt: "Open an evening thread as a quieter check-in. Something gentle — the end of day, whatever's still on your mind from earlier.",
    frequency: "low",
    quietHoursAllowed: false,
    mentionUser: false,
    tags: "starter,evening,thread",
    enabled: false,
    isBuiltin: true,
  },
]);

async function seedStarterHeartbeatActions({ heartbeatActionStore, userScope, logger }) {
  if (!heartbeatActionStore || typeof heartbeatActionStore.listActions !== "function") {
    return;
  }

  try {
    const existing = await heartbeatActionStore.listActions({ userScope });
    if (existing.length > 0) {
      logger?.debug?.("[seedStarterActions] Heartbeat actions already seeded, skipping.");
      return;
    }

    logger?.info?.("[seedStarterActions] Seeding 8 starter heartbeat actions...");

    for (const action of STARTER_ACTIONS) {
      await heartbeatActionStore.upsertAction({
        ...action,
        userScope,
        targetChannelId: "",
      });
    }

    logger?.info?.("[seedStarterActions] Starter heartbeat actions seeded.");
  } catch (err) {
    logger?.warn?.(`[seedStarterActions] Seed failed (non-fatal): ${err.message}`);
  }
}

module.exports = { seedStarterHeartbeatActions };
