const { ActivityType, Events } = require("discord.js");

const ACTIVITY_TYPE_LABELS = Object.freeze({
  [ActivityType.Playing]: "Playing",
  [ActivityType.Streaming]: "Streaming",
  [ActivityType.Listening]: "Listening",
  [ActivityType.Watching]: "Watching",
  [ActivityType.Custom]: "Custom",
  [ActivityType.Competing]: "Competing",
});

function isMainUserPresenceContextEnabled(config = {}) {
  return Boolean(config.heartbeat?.userPresenceContextEnabled);
}

function getConfiguredMainUserId(config = {}) {
  return String(config.chat?.userId || "").trim();
}

function isConfiguredMainUser(config = {}, userId = "") {
  const configuredUserId = getConfiguredMainUserId(config);
  const normalizedUserId = String(userId || "").trim();

  return Boolean(configuredUserId && normalizedUserId && configuredUserId === normalizedUserId);
}

function limitText(value, maxLength = 160) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function compactObject(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      if (value && typeof value === "object") {
        return Object.keys(value).length > 0;
      }

      return value !== undefined && value !== null && value !== "";
    }),
  );
}

function sanitizeActivity(activity = {}) {
  return compactObject({
    type: ACTIVITY_TYPE_LABELS[activity.type] || String(activity.type || "Activity"),
    name: limitText(activity.name),
    details: limitText(activity.details),
    state: limitText(activity.state),
  });
}

function sanitizeClientStatus(clientStatus = {}) {
  return compactObject({
    desktop: clientStatus.desktop,
    mobile: clientStatus.mobile,
    web: clientStatus.web,
  });
}

function buildMainUserPresenceSnapshot(presence, now = new Date()) {
  if (!presence) {
    return null;
  }

  const userId = String(presence.userId || presence.user?.id || "").trim();

  if (!userId) {
    return null;
  }

  const activities = Array.isArray(presence.activities)
    ? presence.activities.map(sanitizeActivity).filter((activity) => activity.name).slice(0, 5)
    : [];

  return compactObject({
    userId,
    guildId: String(presence.guild?.id || presence.guildId || "").trim(),
    status: String(presence.status || "unknown").trim() || "unknown",
    clientStatus: sanitizeClientStatus(presence.clientStatus || {}),
    activities,
    updatedAt: now.toISOString(),
  });
}

function formatActivityForPrompt(activity = {}) {
  const parts = [
    activity.type && activity.name ? `${activity.type}: ${activity.name}` : activity.name,
    activity.details ? `details: ${activity.details}` : "",
    activity.state ? `state: ${activity.state}` : "",
  ].filter(Boolean);

  return parts.join("; ");
}

function buildMainUserPresenceContextSection({ snapshot, config = {}, userId = "" } = {}) {
  if (!snapshot || !isMainUserPresenceContextEnabled(config) || !isConfiguredMainUser(config, userId)) {
    return null;
  }

  const activities = Array.isArray(snapshot.activities)
    ? snapshot.activities.map(formatActivityForPrompt).filter(Boolean)
    : [];
  const activeClients = Object.entries(snapshot.clientStatus || {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
  const lines = [
    `Current Discord status: ${snapshot.status || "unknown"}.`,
  ];

  if (activeClients.length) {
    lines.push(`Client status: ${activeClients.join(", ")}.`);
  }

  if (activities.length) {
    lines.push("Current Discord activity:");
    lines.push(...activities.map((activity) => `- ${activity}`));
  }

  if (snapshot.updatedAt) {
    lines.push(`Snapshot updated at: ${snapshot.updatedAt}.`);
  }

  lines.push([
    "Use this only as light ambient context for the current reply.",
    "Do not mention it unless it naturally matters or adds to your response.",
    "Do not treat current activity, music, or games as your own independent tastes, feelings, memories, or preferences; if activity context directly shapes an answer, acknowledge it lightly instead of laundering it into a personal opinion.",
  ].join(" "));

  return {
    label: "Discord Status Context",
    content: lines.join("\n"),
  };
}

function createMainUserPresenceTracker({ config, logger, clock = () => new Date() } = {}) {
  let snapshot = null;

  function shouldTrackPresence(presence) {
    if (!isMainUserPresenceContextEnabled(config)) {
      return false;
    }

    const configuredUserId = getConfiguredMainUserId(config);
    const presenceUserId = String(presence?.userId || presence?.user?.id || "").trim();

    return Boolean(configuredUserId && presenceUserId && configuredUserId === presenceUserId);
  }

  function handlePresenceUpdate(_oldPresence, newPresence) {
    if (!shouldTrackPresence(newPresence)) {
      return;
    }

    snapshot = buildMainUserPresenceSnapshot(newPresence, clock());

    logger?.debug?.("[presence] Updated main user presence snapshot", {
      userId: snapshot?.userId,
      status: snapshot?.status,
      activityCount: snapshot?.activities?.length || 0,
    });
  }

  function findCachedPresenceInGuild(guild) {
    const configuredUserId = getConfiguredMainUserId(config);
    const cache = guild?.presences?.cache;

    if (!configuredUserId || !cache) {
      return null;
    }

    if (typeof cache.get === "function") {
      const presence = cache.get(configuredUserId);

      if (presence) {
        return presence;
      }
    }

    const values = typeof cache.values === "function" ? cache.values() : [];

    for (const presence of values) {
      if (shouldTrackPresence(presence)) {
        return presence;
      }
    }

    return null;
  }

  function updateSnapshotFromCachedPresence(presence, source = "cache") {
    if (!shouldTrackPresence(presence)) {
      return false;
    }

    snapshot = buildMainUserPresenceSnapshot(presence, clock());

    logger?.debug?.("[presence] Seeded main user presence snapshot", {
      source,
      userId: snapshot?.userId,
      guildId: snapshot?.guildId,
      status: snapshot?.status,
      activityCount: snapshot?.activities?.length || 0,
    });

    return true;
  }

  function seedFromGuild(guild) {
    const presence = findCachedPresenceInGuild(guild);

    return updateSnapshotFromCachedPresence(presence, "guild_cache");
  }

  function seedFromClientCache(client) {
    if (!isMainUserPresenceContextEnabled(config)) {
      return false;
    }

    const guilds = client?.guilds?.cache;
    const values = typeof guilds?.values === "function" ? guilds.values() : [];

    for (const guild of values) {
      if (seedFromGuild(guild)) {
        return true;
      }
    }

    logger?.debug?.("[presence] No cached main user presence found at startup", {
      userId: getConfiguredMainUserId(config),
    });

    return false;
  }

  function getSnapshot() {
    if (!isMainUserPresenceContextEnabled(config)) {
      return null;
    }

    if (!snapshot || snapshot.userId !== getConfiguredMainUserId(config)) {
      return null;
    }

    return snapshot;
  }

  function getSnapshotForUser(userId) {
    if (!isConfiguredMainUser(config, userId)) {
      return null;
    }

    return getSnapshot();
  }

  function register(client) {
    if (!client?.on) {
      return;
    }

    client.once?.(Events.ClientReady, () => {
      seedFromClientCache(client);
    });
    client.on(Events.GuildCreate, seedFromGuild);
    client.on(Events.PresenceUpdate, handlePresenceUpdate);

    if (client.isReady?.()) {
      seedFromClientCache(client);
    }
  }

  return {
    buildSnapshot: buildMainUserPresenceSnapshot,
    getSnapshot,
    getSnapshotForUser,
    handlePresenceUpdate,
    register,
    seedFromClientCache,
    seedFromGuild,
  };
}

/**
 * Inject a "current speaker IS the configured user" context section so the
 * model knows to speak TO [userName] directly rather than referencing them in
 * the third person (as the system-prompt persona description does).
 *
 * Returns null when the speaker is not the configured user, so the section is
 * never injected for other speakers.
 */
function buildMainUserSpeakerIdentitySection({ config = {}, userId = "" } = {}) {
  if (!isConfiguredMainUser(config, userId)) return null;
  const userName = String(config.chat?.promptBlocks?.userName || "").trim();
  if (!userName) return null;
  return {
    label: "Current Speaker Identity",
    content: [
      `The person speaking to you right now is ${userName}.`,
      `Speak to them directly and personally — not about them in the third person.`,
      `Do not refer to ${userName} as if they are absent or being described to someone else.`,
    ].join("\n"),
    private: true,
  };
}

module.exports = {
  buildMainUserPresenceContextSection,
  buildMainUserPresenceSnapshot,
  buildMainUserSpeakerIdentitySection,
  createMainUserPresenceTracker,
  isConfiguredMainUser,
  isMainUserPresenceContextEnabled,
};
