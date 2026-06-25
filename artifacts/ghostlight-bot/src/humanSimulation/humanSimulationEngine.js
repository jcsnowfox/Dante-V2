"use strict";

const { detectPreferences, saveDetectedPreferences, retrieveRelevantPreferences, formatPreferencePrelude } = require("./microPreferenceLearner");
const { maybeCreateTimelineEvent, retrieveTimelineAnchors, formatTimelinePrelude } = require("./personalTimeline");
const { maybeCreateFollowUp, retrieveDueFollowUps, formatFollowUpPrelude } = require("./followUpScheduler");
const { loadOrCreateChannelAwareness, formatChannelPrelude } = require("./channelAwarenessMap");
const { detectEmotionalSignal, updateInnerWeather, formatInnerWeatherPrelude } = require("./innerWeatherEngine");
const { maybeCreateResidue, retrieveActiveResidue, formatResiduePrelude } = require("./attentionResidueEngine");
const { calculateSilenceBucket, determineReentryMode, updatePresenceUserMessage, updatePresenceCompanionReply, formatPresencePrelude } = require("./silenceBehaviorEngine");

function createHumanSimulationEngine({ config, logger, microPreferenceStore, personalTimelineStore, followUpStore, channelAwarenessStore, innerWeatherStore, attentionResidueStore, interactionPresenceStore }) {
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
        innerWeatherStore?.init?.(),
        attentionResidueStore?.init?.(),
        interactionPresenceStore?.init?.(),
      ].filter(Boolean));
      logger?.info?.("[human-simulation] all stores initialised");
    },

    async processMessage({ message, input, repairResult, adultScope, beatType }) {
      const preludeSections = [];
      const channelId = message?.channelId || message?.channel?.id || "";
      const guildId = message?.guildId || "";
      const channelName = message?.channel?.name || "";
      const threadId = message?.channel?.isThread?.() ? channelId : null;
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

      // 5. Inner Weather — detect emotional signal, update state, inject prelude
      let currentWeather = null;
      try {
        currentWeather = await innerWeatherStore?.getCurrentWeather?.({ user_scope: scope.userScope, companion_id: scope.companionId }) || null;
        const signal = detectEmotionalSignal({ text, repairResult, beatType });
        if (signal) {
          currentWeather = await updateInnerWeather({
            store: innerWeatherStore,
            userScope: scope.userScope,
            companionId: scope.companionId,
            signal,
            sourceChannelId,
            sourceMessageId,
            adultPrivate,
            currentWeather,
          }) || currentWeather;
        }
        // Only inject if not adult/private or if in private channel
        if (!currentWeather?.adult_context || adultPrivate) {
          const weatherSection = formatInnerWeatherPrelude(currentWeather);
          if (weatherSection) preludeSections.push(weatherSection);
        }
      } catch (err) {
        logger?.warn?.("[human-simulation] inner weather failed", { error: err?.message });
      }

      // 6. Attention Residue — create from this message, retrieve active, inject
      try {
        await maybeCreateResidue({
          text,
          store: attentionResidueStore,
          userScope: scope.userScope,
          companionId: scope.companionId,
          sourceChannelId,
          sourceMessageId,
          adultPrivate,
          privacyScope,
          repairResult,
          beatType,
        });
        const residues = await retrieveActiveResidue({
          store: attentionResidueStore,
          userScope: scope.userScope,
          companionId: scope.companionId,
          adultPrivate,
        });
        const residueSection = formatResiduePrelude(residues);
        if (residueSection) preludeSections.push(residueSection);
      } catch (err) {
        logger?.warn?.("[human-simulation] attention residue failed", { error: err?.message });
      }

      // 7. Silence Behavior — calculate bucket/reentry, update presence, inject
      try {
        const presence = await interactionPresenceStore?.getPresence?.({
          user_scope: scope.userScope,
          companion_id: scope.companionId,
          channel_id: channelId,
        }) || null;
        const residues = await retrieveActiveResidue({ store: attentionResidueStore, userScope: scope.userScope, companionId: scope.companionId, adultPrivate });
        const hasUnresolvedTension = residues.some((r) => r.residue_type === 'unresolved_tension' || r.residue_type === 'recent_hurt');
        const bucket = calculateSilenceBucket(presence?.last_user_message_at);
        const reentryMode = determineReentryMode({
          bucket,
          channelKind: awareness?.channel_kind || 'unknown',
          hasUnresolvedTension,
          residues,
          innerWeather: currentWeather,
        });
        await updatePresenceUserMessage({
          store: interactionPresenceStore,
          userScope: scope.userScope,
          companionId: scope.companionId,
          channelId,
          threadId,
          bucket,
          reentryMode,
        });
        const presenceSection = formatPresencePrelude({
          silenceBucket: bucket,
          reentryMode,
          lastInteractionSummary: presence?.last_interaction_summary || '',
        });
        if (presenceSection) preludeSections.push(presenceSection);
      } catch (err) {
        logger?.warn?.("[human-simulation] silence behavior failed", { error: err?.message });
      }

      return { preludeSections };
    },

    // Called after reply is sent — updates presence last_companion_reply_at
    async postProcessMessage({ message, reply, adultScope }) {
      const channelId = message?.channelId || message?.channel?.id || "";
      const summary = String(reply || "").slice(0, 120);
      try {
        await updatePresenceCompanionReply({
          store: interactionPresenceStore,
          userScope: scope.userScope,
          companionId: scope.companionId,
          channelId,
          summary,
        });
      } catch {}
    },

    // Expose store references for dashboard
    stores: {
      get microPreferences() { return microPreferenceStore; },
      get personalTimeline() { return personalTimelineStore; },
      get followUpItems() { return followUpStore; },
      get channelAwareness() { return channelAwarenessStore; },
      get innerWeather() { return innerWeatherStore; },
      get attentionResidue() { return attentionResidueStore; },
      get interactionPresence() { return interactionPresenceStore; },
    },
  };
}

module.exports = { createHumanSimulationEngine };
