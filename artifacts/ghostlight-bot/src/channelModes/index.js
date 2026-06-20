const { defaultMode } = require("../chat/modes/defaultMode");
const { normalizeModeKey } = require("../storage/channelModes");

const BUILTIN_CHANNEL_MODES = Object.freeze([
  {
    modeKey: "default",
    label: "Default",
    instructions: "",
    chatModel: "",
    memoryTypes: ["anchor", "canon", "resolved", "timeline"],
    memorySensitivity: "high",
    includeTimeContext: "inherit",
    retrievalSource: "personal",
    retrievalAccess: "global",
    heartbeatRole: "",
    isBuiltin: true,
  },
  {
    modeKey: "daily",
    label: "Daily",
    instructions: "",
    chatModel: "",
    memoryTypes: ["anchor", "canon", "resolved", "timeline"],
    memorySensitivity: "high",
    includeTimeContext: "inherit",
    retrievalSource: "off",
    retrievalAccess: "off",
    heartbeatRole: "daily",
    isBuiltin: true,
  },
  {
    modeKey: "roleplay",
    label: "Roleplay",
    instructions: "",
    chatModel: "",
    memoryTypes: ["anchor", "canon", "resolved", "roleplay"],
    memorySensitivity: "high",
    includeTimeContext: "inherit",
    retrievalSource: "off",
    retrievalAccess: "off",
    heartbeatRole: "roleplay",
    isBuiltin: true,
  },
  {
    modeKey: "journal",
    label: "Journal",
    instructions: "",
    chatModel: "",
    memoryTypes: ["anchor", "canon", "resolved", "timeline"],
    memorySensitivity: "high",
    includeTimeContext: "inherit",
    retrievalSource: "off",
    retrievalAccess: "off",
    heartbeatRole: "journal",
    isBuiltin: true,
  },
  {
    modeKey: "testing",
    label: "Testing",
    instructions: "",
    chatModel: "",
    memoryTypes: ["anchor", "canon", "resolved", "timeline"],
    memorySensitivity: "high",
    includeTimeContext: "inherit",
    retrievalSource: "off",
    retrievalAccess: "off",
    heartbeatRole: "testing",
    isBuiltin: true,
  },
  {
    modeKey: "shared_server",
    label: "Shared Server",
    instructions: "",
    chatModel: "",
    memoryTypes: ["anchor", "canon", "resolved"],
    memorySensitivity: "low",
    includeTimeContext: "inherit",
    retrievalSource: "off",
    retrievalAccess: "off",
    heartbeatRole: "",
    isBuiltin: true,
  },
]);

const DEPRECATED_BUILTIN_CHANNEL_MODE_KEYS = Object.freeze(new Set([
  "curiosities",
]));

function buildModeFallback(config = {}) {
  return {
    ...defaultMode,
    historyLimit: config.chat?.historyLimit ?? defaultMode.historyLimit,
  };
}

function mapDefinitionToMode(definition, fallback = defaultMode) {
  if (!definition) {
    return {
      ...fallback,
      label: fallback.label || fallback.name,
      instructions: "",
      chatModel: "",
      memoryTypes: ["anchor", "canon", "resolved", "timeline"],
      memorySensitivity: "high",
      includeTimeContext: "inherit",
      retrievalSource: "off",
      retrievalAccess: "off",
      heartbeatRole: "",
      source: "fallback",
    };
  }

  return {
    ...fallback,
    name: definition.modeKey,
    label: definition.label,
    description: definition.label || fallback.description || "",
    instructions: definition.instructions || "",
    chatModel: definition.chatModel || "",
    memoryTypes: Array.isArray(definition.memoryTypes) ? definition.memoryTypes : ["anchor", "canon", "resolved", "timeline"],
    memorySensitivity: definition.memorySensitivity || "high",
    includeTimeContext: definition.includeTimeContext || "inherit",
    retrievalSource: definition.retrievalSource || "off",
    retrievalAccess: definition.retrievalAccess || "off",
    heartbeatRole: definition.heartbeatRole || "",
    isBuiltin: Boolean(definition.isBuiltin),
    source: definition.isBuiltin ? "builtin" : "custom",
  };
}

function buildBuiltinModeMap() {
  return new Map(BUILTIN_CHANNEL_MODES.map((mode) => [mode.modeKey, mode]));
}

function createChannelModeService({ config, logger, store }) {
  const builtinModes = buildBuiltinModeMap();
  const modeFallback = buildModeFallback(config);

  async function seedBuiltinModes() {
    if (!store?.persistenceEnabled || !store?.upsertModeDefinition || !store?.getModeDefinition) {
      return;
    }

    for (const definition of BUILTIN_CHANNEL_MODES) {
      try {
        const existing = await store.getModeDefinition(definition.modeKey);

        if (existing) {
          continue;
        }

        await store.upsertModeDefinition(definition);
      } catch (error) {
        logger.warn("[channel-modes] Failed to seed built-in channel mode", {
          modeKey: definition.modeKey,
          error: error.message,
        });
      }
    }
  }

  function getBuiltinMode(modeKey) {
    return builtinModes.get(normalizeModeKey(modeKey));
  }

  async function getModeDefinition(modeKey) {
    if (!modeKey) {
      return null;
    }

    const normalizedKey = normalizeModeKey(modeKey);
    const builtinDefinition = getBuiltinMode(normalizedKey);
    const customDefinition = await store.getModeDefinition(normalizedKey);

    if (!customDefinition) {
      return builtinDefinition || null;
    }

    return {
      ...(builtinDefinition || {}),
      ...customDefinition,
      isBuiltin: builtinDefinition ? true : customDefinition.isBuiltin,
    };
  }

  function resolveTargetChannel(interactionOrMessage) {
    const channel = interactionOrMessage.channel;
    const isThread = Boolean(channel?.isThread?.());
    return {
      guildId: interactionOrMessage.guildId,
      targetChannelId: isThread ? channel.parentId : interactionOrMessage.channelId,
      parentChannelId: isThread ? channel.parentId : null,
      currentChannelId: interactionOrMessage.channelId,
      inheritedFromParent: isThread,
    };
  }

  return {
    async init() {
      await store.init();
      await seedBuiltinModes();
      logger.debug?.("[channel-modes] Channel mode service ready", {
        builtinModeCount: BUILTIN_CHANNEL_MODES.length,
      });
    },

    async listModes() {
      const definitions = await store.listModeDefinitions();
      const merged = new Map();

      for (const builtin of BUILTIN_CHANNEL_MODES) {
        merged.set(builtin.modeKey, builtin);
      }

      for (const definition of definitions) {
        const builtinDefinition = builtinModes.get(definition.modeKey);
        merged.set(definition.modeKey, {
          ...(builtinDefinition || {}),
          ...definition,
          isBuiltin: builtinDefinition
            ? true
            : DEPRECATED_BUILTIN_CHANNEL_MODE_KEYS.has(definition.modeKey) ? false : definition.isBuiltin,
          description: definition.label,
        });
      }

      return [...merged.values()].sort((left, right) => left.label.localeCompare(right.label));
    },

    async listModeChoices(limit = 25) {
      const modes = await this.listModes();
      return modes
        .slice(0, limit)
        .map((mode) => ({ name: mode.label, value: mode.modeKey }));
    },

    async resolveModeByKey(modeKey) {
      const definition = await getModeDefinition(modeKey);

      if (!definition) {
        return null;
      }

      return mapDefinitionToMode(definition, modeFallback);
    },

    async saveModeDefinition(record) {
      const saved = await store.upsertModeDefinition(record);
      logger.info("[channel-modes] Saved channel mode definition", {
        modeKey: saved.modeKey,
        label: saved.label,
        isBuiltin: saved.isBuiltin,
      });
      return saved;
    },

    async deleteModeDefinition(modeKey) {
      const normalizedKey = normalizeModeKey(modeKey);

      if (builtinModes.has(normalizedKey)) {
        throw new Error("Built-in channel modes cannot be deleted.");
      }

      const deleted = await store.deleteModeDefinition(normalizedKey, {
        allowBuiltin: DEPRECATED_BUILTIN_CHANNEL_MODE_KEYS.has(normalizedKey),
      });

      if (deleted) {
        logger.info("[channel-modes] Deleted channel mode definition", {
          modeKey: deleted.modeKey,
          label: deleted.label,
          clearedAssignmentCount: deleted.clearedAssignmentCount || 0,
        });
      }

      return deleted;
    },

    async assignModeToChannel({ guildId, channelId, modeKey }) {
      const definition = await getModeDefinition(modeKey);

      if (!definition) {
        throw new Error(`Unknown mode "${modeKey}".`);
      }

      const assignment = await store.assignChannelMode({
        guildId,
        channelId,
        modeKey: definition.modeKey,
      });

      logger.info("[channel-modes] Assigned mode to channel", {
        guildId,
        channelId,
        modeKey: definition.modeKey,
      });

      return assignment;
    },

    async clearChannelMode({ guildId, channelId }) {
      return store.clearChannelAssignment({ guildId, channelId });
    },

    async getChannelAssignment({ guildId, channelId }) {
      return store.getChannelAssignment({ guildId, channelId });
    },

    async listAssignments({ guildId }) {
      return store.listChannelAssignments({ guildId });
    },

    resolveTargetChannel,

    async resolveModeForChannel({ guildId, channelId, parentChannelId = null, fallbackModeKey = null }) {
      const lookupChannelIds = [channelId];

      if (parentChannelId && parentChannelId !== channelId) {
        lookupChannelIds.push(parentChannelId);
      }

      for (const targetChannelId of lookupChannelIds) {
        const assignment = await store.getChannelAssignment({ guildId, channelId: targetChannelId });

        if (!assignment) {
          continue;
        }

        const definition = await getModeDefinition(assignment.modeKey);

        if (definition) {
          return {
            ...mapDefinitionToMode(definition, modeFallback),
            assignment,
            inheritedFromParent: Boolean(parentChannelId && targetChannelId === parentChannelId),
          };
        }
      }

      const fallbackDefinition = await getModeDefinition(fallbackModeKey || config.chat.defaultMode || "default");
      return {
        ...mapDefinitionToMode(
          fallbackDefinition || getBuiltinMode("default") || { modeKey: "default", label: "Default" },
          modeFallback,
        ),
        assignment: null,
        inheritedFromParent: false,
      };
    },

    async resolveModeForContext(interactionOrMessage) {
      const target = resolveTargetChannel(interactionOrMessage);
      const homeGuildId = String(config.discord?.guildId || "").trim();
      const externalGuildEnabled = Boolean(config.discord?.externalSharedModeEnabled);
      const externalModeKey = String(config.discord?.externalSharedModeKey || "shared_server").trim() || "shared_server";

      if (target.guildId && homeGuildId && target.guildId !== homeGuildId) {
        if (!externalGuildEnabled) {
          return null;
        }

        return this.resolveModeForChannel({
          guildId: target.guildId,
          channelId: target.currentChannelId,
          parentChannelId: target.parentChannelId,
          fallbackModeKey: externalModeKey,
        });
      }

      return this.resolveModeForChannel({
        guildId: target.guildId,
        channelId: target.currentChannelId,
        parentChannelId: target.parentChannelId,
      });
    },

    async resolveChannelForHeartbeat({ guildId, heartbeatRole = "", modeKey = "" }) {
      const assignments = await store.listChannelAssignments({ guildId });
      const normalizedRole = String(heartbeatRole || "").trim().toLowerCase();
      const normalizedModeKey = modeKey ? normalizeModeKey(modeKey) : "";

      if (normalizedRole) {
        for (const assignment of assignments) {
          const definition = await getModeDefinition(assignment.modeKey);

          if (definition?.heartbeatRole && String(definition.heartbeatRole).trim().toLowerCase() === normalizedRole) {
            return {
              channelId: assignment.channelId,
              assignment,
              mode: mapDefinitionToMode(definition, modeFallback),
              matchedBy: "heartbeatRole",
            };
          }
        }
      }

      if (normalizedModeKey) {
        for (const assignment of assignments) {
          if (assignment.modeKey !== normalizedModeKey) {
            continue;
          }

          const definition = await getModeDefinition(assignment.modeKey);

          if (definition) {
            return {
              channelId: assignment.channelId,
              assignment,
              mode: mapDefinitionToMode(definition, modeFallback),
              matchedBy: "modeKey",
            };
          }
        }
      }

      return null;
    },
  };
}

module.exports = {
  BUILTIN_CHANNEL_MODES,
  createChannelModeService,
};
