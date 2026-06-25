"use strict";

const { buildWorldContext } = require("../context/worldContext");

const DEFAULT_MAX_BULLETS = 8;

function createSituationalAwarenessEngine({
  config,
  logger,
  timedNotesStore = null,
  conversationFollowupStore = null,
  proactiveVarietyMemoryStore = null,
  emotionalBeatStore = null,
  promiseLedger = null,
  recentDecisionStore = null,
  innerWeatherStore = null,
  situationalAwarenessStore = null,
}) {
  const awarenessConfig = config?.situationalAwareness || {};
  const engineEnabled = awarenessConfig.enabled !== false;

  function isEnabled() {
    return engineEnabled;
  }

  function maxBulletsCount() {
    return Math.max(1, Math.min(20, Number(awarenessConfig.maxBullets) || DEFAULT_MAX_BULLETS));
  }

  function shouldInclude(key) {
    const envKey = `include${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    const val = awarenessConfig[envKey];
    return val !== false;
  }

  async function buildTimeSection({ now, worldContext }) {
    if (!shouldInclude("time")) return null;
    try {
      const wc = worldContext || buildWorldContext({ now, config });
      const bullets = [
        `Time: ${wc.timestamp?.humanReadable || now.toISOString()}`,
        `Day: ${wc.date?.weekday || ""} | Season: ${wc.seasonal?.season || ""}`,
        `Cycle: ${wc.time?.cycleOfDay || ""}`,
      ].filter(Boolean);
      return { key: "time", bullets };
    } catch {
      return null;
    }
  }

  async function buildPresenceSection({ presenceSnapshot }) {
    if (!shouldInclude("presence")) return null;
    try {
      if (!presenceSnapshot?.activities?.length) return null;
      const activities = presenceSnapshot.activities.slice(0, 3).map((a) =>
        `${a.name || a.type || "activity"}${a.state ? `: ${a.state}` : ""}`.trim()
      ).filter(Boolean);
      if (!activities.length) return null;
      return { key: "presence", bullets: activities.map((a) => `Activity: ${a}`) };
    } catch {
      return null;
    }
  }

  async function buildConversationSection({ recentHistory, channelId, threadId }) {
    if (!shouldInclude("conversation")) return null;
    try {
      const items = Array.isArray(recentHistory) ? recentHistory.slice(-5) : [];
      if (!items.length) return null;
      const lastUserMsg = [...items].reverse().find((m) =>
        !m.isBot && (m.role === "user" || m.source === "discord")
      );
      const bullets = [
        `Recent messages in context: ${items.length}`,
        lastUserMsg
          ? `Last user message: ${String(lastUserMsg.content || lastUserMsg.contentText || "").slice(0, 80).trim()}`
          : null,
        channelId ? `Channel: ${channelId}` : null,
        threadId ? `Thread: ${threadId}` : null,
      ].filter(Boolean);
      return bullets.length ? { key: "conversation", bullets } : null;
    } catch {
      return null;
    }
  }

  async function buildRelationshipSection({ scope, privacyScope }) {
    if (!shouldInclude("relationship")) return null;
    if (privacyScope === "adult_private") return null;
    try {
      if (!innerWeatherStore?.listHistory) return null;
      const weatherHistory = await innerWeatherStore.listHistory({
        user_scope: scope.user_scope,
        companion_id: scope.companion_id,
        limit: 1,
      }).catch(() => []);
      const current = weatherHistory[0];
      if (!current) return null;
      const bullets = [
        current.mood ? `Current mood: ${current.mood}` : null,
        current.energy_level ? `Energy: ${current.energy_level}` : null,
      ].filter(Boolean);
      return bullets.length ? { key: "relationship", bullets } : null;
    } catch {
      return null;
    }
  }

  async function buildMemorySection({ memories }) {
    if (!shouldInclude("memory")) return null;
    try {
      const items = Array.isArray(memories) ? memories.slice(0, 3) : [];
      if (!items.length) return null;
      const bullets = items.map((m) => {
        const text = String(m.content || m.contentText || m.text || "").slice(0, 80).trim();
        return text ? `Memory: ${text}` : null;
      }).filter(Boolean);
      return bullets.length ? { key: "memory", bullets } : null;
    } catch {
      return null;
    }
  }

  async function buildProjectsSection({ scope, privacyScope }) {
    if (!shouldInclude("projects")) return null;
    if (privacyScope === "adult_private") return null;
    try {
      const promises = promiseLedger?.listPromises
        ? await promiseLedger.listPromises({
          ...scope,
          limit: 3,
          allowAdultPrivate: false,
        }).catch(() => [])
        : [];
      const timedNotes = timedNotesStore?.listNotes
        ? await timedNotesStore.listNotes({ ...scope, status: "active", limit: 3 }).catch(() => [])
        : [];
      const bullets = [
        ...promises.slice(0, 2).map((p) => {
          const text = String(p.content || p.summary || "").slice(0, 60).trim();
          return text ? `Promise: ${text}` : null;
        }),
        ...timedNotes.slice(0, 2).map((n) => {
          const text = String(n.title || n.content || "").slice(0, 60).trim();
          return text ? `Note: ${text}` : null;
        }),
      ].filter(Boolean);
      return bullets.length ? { key: "projects", bullets } : null;
    } catch {
      return null;
    }
  }

  async function buildWorldSection({ worldContext, now }) {
    if (!shouldInclude("world")) return null;
    if (awarenessConfig.includeWorld === false) return null;
    try {
      const wc = worldContext || buildWorldContext({ now, config });
      const bullets = [
        `Timezone: ${wc.timezone?.iana || "UTC"}${wc.timezone?.utcOffset ? ` (${wc.timezone.utcOffset})` : ""}`,
        `Quarter: ${wc.seasonal?.quarter || ""}`,
      ].filter(Boolean);
      return bullets.length ? { key: "world", bullets } : null;
    } catch {
      return null;
    }
  }

  async function buildActivitySection({ scope, privacyScope }) {
    if (!shouldInclude("activity")) return null;
    if (privacyScope === "adult_private") return null;
    try {
      const [varietyMemory, emotionalBeats] = await Promise.all([
        proactiveVarietyMemoryStore?.listRecent
          ? proactiveVarietyMemoryStore.listRecent({ ...scope, limit: 2 }).catch(() => [])
          : [],
        emotionalBeatStore?.listBeats
          ? emotionalBeatStore.listBeats({ ...scope, limit: 2 }).catch(() => [])
          : [],
      ]);
      const bullets = [
        ...varietyMemory.slice(0, 1).map((v) => {
          const text = String(v.action_label || v.label || v.theme_summary || "").slice(0, 50).trim();
          return text ? `Recent proactive: ${text}` : null;
        }),
        ...emotionalBeats.slice(0, 1).map((b) => {
          const text = String(b.beat_type || b.label || "").slice(0, 50).trim();
          return text ? `Emotional beat: ${text}` : null;
        }),
      ].filter(Boolean);
      return bullets.length ? { key: "activity", bullets } : null;
    } catch {
      return null;
    }
  }

  function buildPrivacySection({ privacyScope, mode }) {
    if (!shouldInclude("privacy")) return null;
    const scope = privacyScope || "normal";
    const modeName = mode?.name || "";
    const isAdult = scope === "adult_private" || modeName === "adult_private";
    return {
      key: "privacy",
      bullets: [`Privacy scope: ${isAdult ? "adult_private" : "normal"}`],
    };
  }

  function buildToolsSection({ tools, toolContext }) {
    if (!shouldInclude("tools")) return null;
    if (!awarenessConfig.includeTools) return null;
    try {
      if (!tools?.list) return null;
      const available = tools.list(toolContext || {}).map((t) => t?.name).filter(Boolean).slice(0, 5);
      if (!available.length) return null;
      return {
        key: "tools",
        bullets: [`Available tools: ${available.join(", ")}`],
      };
    } catch {
      return null;
    }
  }

  function buildCompactPrelude(sections, { maxBullets = DEFAULT_MAX_BULLETS, warnings = [] } = {}) {
    const allBullets = [];
    for (const section of sections) {
      if (!section?.bullets?.length) continue;
      for (const bullet of section.bullets) {
        if (allBullets.length >= maxBullets) break;
        if (bullet) allBullets.push(`• ${bullet}`);
      }
      if (allBullets.length >= maxBullets) break;
    }

    if (!allBullets.length) return "";

    const parts = ["## SITUATIONAL AWARENESS", "", ...allBullets];
    if (warnings.length) {
      parts.push("", `⚠ Warnings: ${warnings.join(", ")}`);
    }
    return parts.join("\n");
  }

  async function buildAwarenessContext({
    message = null,
    input = null,
    now = new Date(),
    recentHistory = [],
    memories = [],
    mode = null,
    tools = null,
    triggerType = "chat",
    presenceSnapshot = null,
    worldContext = null,
  }) {
    const userScope = config?.memory?.userScope || "user";
    const companionId = config?.memory?.companionId || config?.companion?.id || "";
    const channelId = message?.channelId || message?.channel?.id || "";
    const threadId = message?.channel?.isThread?.() ? channelId : "";
    const privacyScope = mode?.name === "adult_private" ? "adult_private" : "normal";
    const scope = { user_scope: userScope, companion_id: companionId };

    if (!isEnabled()) {
      return {
        user_scope: userScope,
        companion_id: companionId,
        platform: "discord",
        channel_id: channelId,
        thread_id: threadId,
        generated_at: now.toISOString(),
        sections: {},
        compact_prelude: "",
        warnings: ["awareness_disabled"],
        sources_used: [],
      };
    }

    let resolvedWorldContext = worldContext;
    if (!resolvedWorldContext) {
      try {
        resolvedWorldContext = buildWorldContext({ now, config });
      } catch {
        resolvedWorldContext = null;
      }
    }

    const warnings = [];
    const sectionNames = ["time", "presence", "conversation", "relationship", "memory", "projects", "world", "activity", "privacy", "tools"];
    const sectionResults = await Promise.allSettled([
      buildTimeSection({ now, worldContext: resolvedWorldContext }),
      buildPresenceSection({ presenceSnapshot }),
      buildConversationSection({ recentHistory, channelId, threadId }),
      buildRelationshipSection({ scope, privacyScope }),
      buildMemorySection({ memories }),
      buildProjectsSection({ scope, privacyScope }),
      buildWorldSection({ worldContext: resolvedWorldContext, now }),
      buildActivitySection({ scope, privacyScope }),
      buildPrivacySection({ privacyScope, mode }),
      buildToolsSection({ tools, toolContext: { surface: triggerType, userScope } }),
    ]);

    const sections = {};
    const orderedSections = [];
    const sources_used = [];

    for (let i = 0; i < sectionResults.length; i++) {
      const result = sectionResults[i];
      const name = sectionNames[i];
      if (result.status === "fulfilled" && result.value) {
        sections[name] = result.value;
        orderedSections.push(result.value);
        sources_used.push(name);
      } else if (result.status === "rejected") {
        warnings.push(`section_${name}_failed`);
      }
    }

    const compact_prelude = buildCompactPrelude(orderedSections, {
      maxBullets: maxBulletsCount(),
      warnings,
    });

    const awarenessContext = {
      user_scope: userScope,
      companion_id: companionId,
      platform: "discord",
      channel_id: channelId,
      thread_id: threadId,
      generated_at: now.toISOString(),
      sections,
      compact_prelude,
      warnings,
      sources_used,
    };

    if (situationalAwarenessStore?.storeSnapshot && awarenessConfig.storeSnapshots) {
      situationalAwarenessStore.storeSnapshot({
        user_scope: userScope,
        companion_id: companionId,
        trigger_type: triggerType,
        channel_id: channelId,
        sections_used: sources_used,
        prelude_length: compact_prelude.length,
        warnings_count: warnings.length,
      }).catch(() => {});
    }

    return awarenessContext;
  }

  async function processMessage({
    message,
    input,
    recentHistory,
    memories,
    mode,
    tools,
    presenceSnapshot,
    worldContext,
  }) {
    if (!isEnabled()) return null;
    try {
      const awarenessContext = await buildAwarenessContext({
        message,
        input,
        now: new Date(),
        recentHistory,
        memories,
        mode,
        tools,
        triggerType: "chat",
        presenceSnapshot,
        worldContext,
      });
      const preludeSection = awarenessContext.compact_prelude
        ? { label: "SITUATIONAL AWARENESS", content: awarenessContext.compact_prelude }
        : null;
      return { preludeSection, awarenessContext };
    } catch (error) {
      logger?.warn?.("[situational-awareness] processMessage failed", { error: error?.message });
      return null;
    }
  }

  async function buildProactiveAwarenessContext({ now = new Date(), tools, recentMessages }) {
    if (!isEnabled()) return null;
    try {
      return buildAwarenessContext({
        now,
        recentHistory: recentMessages || [],
        tools,
        triggerType: "heartbeat",
      });
    } catch (error) {
      logger?.warn?.("[situational-awareness] buildProactiveAwarenessContext failed", { error: error?.message });
      return null;
    }
  }

  return {
    available: true,
    isEnabled,

    async init() {
      logger?.info?.("[situational-awareness] engine initialised", { enabled: isEnabled() });
    },

    processMessage,
    buildAwarenessContext,
    buildProactiveAwarenessContext,
    buildCompactPrelude,
  };
}

module.exports = { createSituationalAwarenessEngine };
