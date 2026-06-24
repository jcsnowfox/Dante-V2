"use strict";

const { detectPreferences, saveDetectedPreferences, retrieveRelevantPreferences, formatPreferencePrelude } = require("./microPreferenceLearner");
const { maybeCreateTimelineEvent, retrieveTimelineAnchors, formatTimelinePrelude } = require("./personalTimeline");
const { maybeCreateFollowUp, retrieveDueFollowUps, formatFollowUpPrelude } = require("./followUpScheduler");
const { loadOrCreateChannelAwareness, formatChannelPrelude } = require("./channelAwarenessMap");

function createHumanSimulationEngine({ config, logger, microPreferenceStore, personalTimelineStore, followUpStore, channelAwarenessStore }) {
  const scope = {
    userScope: config?.memory?.userScope || "user",
    companionId: config?.memory?.companionId || config?.companion?.id || "Dante",
  };

  return {
    available: true,

    async init() {
      await Promise.all([
        microPreferenceStore?.init?.(),
        personalTimelineStore?.init?.(),
        followUpStore?.init?.(),
        channelAwarenessStore?.init?.(),
      ].filter(Boolean));
      logger?.info?.("[human-simulation] all stores initialised");
    },

    async processMessage({ message, input, repairResult, adultScope, beatType }) {
      const preludeSections = [];
      const channelId = message?.channelId || message?.channel?.id || "";
      const guildId = message?.guildId || "";
      const channelName = message?.channel?.name || "";
      const text = String(input?.content || "");
      const adultPrivate = !!adultScope?.active;
      const privacyScope = adultPrivate ? "private" : "normal";
      const sourceChannelId = channelId;
      const sourceMessageId = message?.id || "";

      // 1. Channel Awareness — always first (affects other preludes)
      let awareness = null;
      try {
        awareness = await loadOrCreateChannelAwareness({
          store: channelAwarenessStore,
          guildId,
          channelId,
          channelName,
          userScope: scope.userScope,
          companionId: scope.companionId,
          config,
          adultScope,
        });
        const channelSection = formatChannelPrelude(awareness);
        if (channelSection) preludeSections.push(channelSection);
      } catch (err) {
        logger?.warn?.("[human-simulation] channel awareness failed", { error: err?.message });
      }

      // 2. Micro-Preference Learner — detect + save + retrieve
      try {
        const detected = detectPreferences(text);
        if (detected.length) {
          // Mark adult_context if channel is private
          const scopedDetected = adultPrivate ? detected.map((d) => ({ ...d, adult_context: true, privacy_scope: "private" })) : detected;
          await saveDetectedPreferences({ detected: scopedDetected, store: microPreferenceStore, userScope: scope.userScope, companionId: scope.companionId });
          logger?.debug?.(`[human-simulation] saved ${scopedDetected.length} preferences`);
        }
        const prefs = await retrieveRelevantPreferences({ store: microPreferenceStore, userScope: scope.userScope, companionId: scope.companionId, adultPrivate });
        const prefSection = formatPreferencePrelude(prefs);
        if (prefSection) preludeSections.push(prefSection);
      } catch (err) {
        logger?.warn?.("[human-simulation] micro-preference failed", { error: err?.message });
      }

      // 3. Personal Timeline — auto-create + retrieve anchors
      try {
        await maybeCreateTimelineEvent({
          text,
          store: personalTimelineStore,
          userScope: scope.userScope,
          companionId: scope.companionId,
          sourceChannelId,
          sourceMessageId,
          adultContext: adultPrivate,
          privacyScope,
          repairResult,
          beatType,
        });
        const anchors = await retrieveTimelineAnchors({
          store: personalTimelineStore,
          userScope: scope.userScope,
          companionId: scope.companionId,
          messageText: text,
          adultPrivate,
        });
        const timelineSection = formatTimelinePrelude(anchors);
        if (timelineSection) preludeSections.push(timelineSection);
      } catch (err) {
        logger?.warn?.("[human-simulation] personal timeline failed", { error: err?.message });
      }

      // 4. Follow-Up Scheduler — auto-create + retrieve due
      try {
        await maybeCreateFollowUp({
          text,
          store: followUpStore,
          userScope: scope.userScope,
          companionId: scope.companionId,
          sourceChannelId,
          sourceMessageId,
          adultContext: adultPrivate,
          privacyScope,
          repairResult,
        });
        const due = await retrieveDueFollowUps({ store: followUpStore, userScope: scope.userScope, companionId: scope.companionId, adultPrivate });
        const followUpSection = formatFollowUpPrelude(due);
        if (followUpSection) preludeSections.push(followUpSection);
      } catch (err) {
        logger?.warn?.("[human-simulation] follow-up scheduler failed", { error: err?.message });
      }

      return { preludeSections };
    },

    // Expose store references for dashboard
    stores: {
      get microPreferences() { return microPreferenceStore; },
      get personalTimeline() { return personalTimelineStore; },
      get followUpItems() { return followUpStore; },
      get channelAwareness() { return channelAwarenessStore; },
    },
  };
}

module.exports = { createHumanSimulationEngine };
