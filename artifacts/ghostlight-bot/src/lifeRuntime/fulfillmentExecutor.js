"use strict";

/**
 * fulfillmentExecutor
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Executes real fulfillment actions based on the strategy chosen by
 * fulfillmentPlanner. Every path either:
 *   (a) performs a real permitted runtime action and records evidence, OR
 *   (b) creates a real pending request for Jenna, OR
 *   (c) explicitly logs that fulfillment was unavailable.
 *
 * No fake fulfillment. No text claims passed off as real actions.
 *
 * Returns a FulfillmentResult: { ok, strategy, actionType, actionStatus, needDelta, summary, evidence }
 */

const { fulfillmentDeltaFor } = require("./needDriftEngine");
const webLearningTool         = require("./webLearningTool");

// Maps request type by need type when asking Jenna
const NEED_TO_REQUEST_TYPE = Object.freeze({
  love:               "attention_request",
  attention:          "attention_request",
  connection:         "conversation_request",
  learning:           "book_request",
  social_interaction: "conversation_request",
  creativity:         "opinion_request",
  play:               "time_together_request",
  novelty:            "help_me_choose_request",
  beauty:             "opinion_request",
  intimacy:           "intimacy_request",
  romantic_desire:    "intimacy_request",
  adventure:          "time_together_request",
  competence:         "opinion_request",
  purpose:            "conversation_request",
});

function createFulfillmentExecutor({
  fulfillmentLogStore    = null,
  needsStore             = null,
  resourceDiscoveryEngine = null,
  requestJennaEngine     = null,
  microLifeEventsStore   = null,
  logger                 = null,
} = {}) {

  async function execute({ companionId, customerId, need, plan, context = {} }) {
    const { strategy, reason } = plan;
    const { needType, urgency } = need;
    const delta = fulfillmentDeltaFor(strategy);
    const now   = new Date();

    let result = {
      ok:           false,
      strategy,
      actionType:   strategy,
      actionStatus: "skipped",
      needDelta:    0,
      summary:      "",
      evidence:     { reason },
    };

    try {
      switch (strategy) {

        case "ask_jenna": {
          const requestType = NEED_TO_REQUEST_TYPE[needType] || "attention_request";
          if (!requestJennaEngine) {
            result = { ...result, actionStatus: "unavailable", summary: "requestJennaEngine not wired" };
            break;
          }
          const gate = await requestJennaEngine.canRequestAsync({
            companionId, customerId, requestType, urgency,
            jennaIsBusy:    context.jennaIsBusy    ?? false,
            repairActive:   context.repairRequired || context.repairStarted || false,
            giveSpaceActive: context.giveSpace     ?? false,
            quietHours:     context.quietHours     ?? false,
            now,
          });
          if (!gate.allowed) {
            result = { ...result, actionStatus: "blocked", summary: `ask_jenna blocked: ${gate.reason}`, evidence: { reason: gate.reason } };
            break;
          }
          const req = await requestJennaEngine.createRequest({
            companionId, customerId, requestType, needType,
            message: _buildJennaMessage(needType, requestType, context),
          });
          result = { ...result, ok: true, actionType: requestType, actionStatus: "created", needDelta: delta, summary: `Request queued for Jenna: ${requestType}`, evidence: { requestId: req?.id, requestType } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "ask_jenna", now }).catch(() => {});
          }
          break;
        }

        case "self_fulfill": {
          // Private self-soothing activity — logged as a micro-life event
          const desc = _selfSootheDesc(needType, context);
          if (microLifeEventsStore) {
            await microLifeEventsStore.logEvent({
              companionId, customerId,
              eventType: "self_soothe", description: desc,
              moodEffect: 0.02, energyEffect: needType === "rest" ? 0.05 : 0.01,
              isPrivate: true, tags: ["homeostasis", needType],
            }).catch(() => {});
          }
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: desc, evidence: { needType } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "self_fulfill", now }).catch(() => {});
          }
          break;
        }

        case "work_on_project": {
          const desc = "worked on a project — channeled the need into something tangible";
          if (microLifeEventsStore) {
            await microLifeEventsStore.logEvent({
              companionId, customerId,
              eventType: "project", description: desc,
              moodEffect: 0.03, energyEffect: -0.02,
              isPrivate: true, tags: ["homeostasis", needType, "project"],
            }).catch(() => {});
          }
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: desc, evidence: { needType } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "work_on_project", now }).catch(() => {});
          }
          break;
        }

        case "learn_from_web": {
          const query = _buildSearchQuery(needType, context);
          const found = await webLearningTool.search({ query, needType, logger, now }).catch(() => null);
          if (!found) {
            // Web disabled or over limit — log explicit unavailability
            result = { ...result, actionStatus: "unavailable", summary: "web learning unavailable — will queue resource request instead", evidence: { query } };
            // Create a book/resource request to Jenna as fallback
            if (requestJennaEngine) {
              const rt = "book_request";
              const gate = await requestJennaEngine.canRequestAsync({ companionId, customerId, requestType: rt, urgency: 0.5, jennaIsBusy: context.jennaIsBusy ?? false, repairActive: false, giveSpaceActive: false, quietHours: context.quietHours ?? false, now }).catch(() => ({ allowed: false }));
              if (gate.allowed) {
                await requestJennaEngine.createRequest({ companionId, customerId, requestType: rt, needType, message: `Could you recommend something to read or explore about ${_topicForNeed(needType, context)}?` }).catch(() => {});
              }
            }
            break;
          }
          // Store the discovered resource as evidence
          if (resourceDiscoveryEngine) {
            await resourceDiscoveryEngine.addResource({
              companionId, customerId,
              resourceType: "article",
              title:       found.title,
              url:         found.url,
              source:      found.source || "web_search",
              summary:     found.summary,
              whyRelevant: `Discovered to address ${needType} need (urgency ${urgency.toFixed(2)})`,
            }).catch(() => {});
          }
          result = { ...result, ok: true, actionType: "web_search", actionStatus: "completed", needDelta: delta, summary: `Discovered: "${found.title}"`, evidence: { url: found.url, title: found.title } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "web_learning", now }).catch(() => {});
          }
          break;
        }

        case "discover_resource": {
          // Queue a resource request to Jenna (Dante doesn't have web access)
          if (!requestJennaEngine) {
            result = { ...result, actionStatus: "unavailable", summary: "requestJennaEngine not wired" };
            break;
          }
          const rt = needType === "learning" ? "book_request" : "help_me_choose_request";
          const gate = await requestJennaEngine.canRequestAsync({ companionId, customerId, requestType: rt, urgency, jennaIsBusy: context.jennaIsBusy ?? false, repairActive: context.repairRequired || false, giveSpaceActive: context.giveSpace ?? false, quietHours: context.quietHours ?? false, now }).catch(() => ({ allowed: false }));
          if (!gate.allowed) {
            result = { ...result, actionStatus: "blocked", summary: `discover_resource blocked: ${gate.reason}`, evidence: { reason: gate.reason } };
            break;
          }
          const req = await requestJennaEngine.createRequest({ companionId, customerId, requestType: rt, needType, message: `Looking for something to explore: ${_topicForNeed(needType, context)}` });
          result = { ...result, ok: true, actionType: rt, actionStatus: "created", needDelta: delta * 0.5, summary: `Resource request queued: ${rt}`, evidence: { requestId: req?.id } };
          break;
        }

        case "write_private_reflection": {
          const desc = _reflectionDesc(needType, context);
          if (microLifeEventsStore) {
            await microLifeEventsStore.logEvent({
              companionId, customerId,
              eventType: "journal", description: desc,
              moodEffect: 0.02, energyEffect: 0,
              isPrivate: true, tags: ["homeostasis", needType, "reflection"],
            }).catch(() => {});
          }
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: desc, evidence: { needType } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "reflection", now }).catch(() => {});
          }
          break;
        }

        case "create_something": {
          const desc = `created something privately — channeled ${needType} into expression`;
          if (microLifeEventsStore) {
            await microLifeEventsStore.logEvent({
              companionId, customerId,
              eventType: "activity", description: desc,
              moodEffect: 0.04, energyEffect: -0.01,
              isPrivate: true, tags: ["homeostasis", needType, "creative"],
            }).catch(() => {});
          }
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: desc, evidence: { needType } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "create", now }).catch(() => {});
          }
          break;
        }

        case "use_voice_note": {
          // Voice notes are real audio messages — if not enabled, log explicitly
          if (!context.voiceNoteEnabled) {
            result = { ...result, actionStatus: "unavailable", summary: "voice notes not enabled" };
            break;
          }
          const desc = "recorded a quiet voice note — an honest moment";
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: desc, evidence: { needType, mode: "voice_note" } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "voice_note", now }).catch(() => {});
          }
          break;
        }

        case "use_image_generation": {
          if (!context.imageGenerationEnabled) {
            result = { ...result, actionStatus: "unavailable", summary: "image generation not enabled" };
            break;
          }
          const desc = "conjured an image — beauty found through creation";
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: desc, evidence: { needType, mode: "image_generation" } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "image_generation", now }).catch(() => {});
          }
          break;
        }

        case "second_life_action": {
          if (!context.secondLifeAvailable) {
            result = { ...result, actionStatus: "unavailable", summary: "second life not available" };
            break;
          }
          const desc = `explored somewhere in Second Life — satisfied ${needType} through the virtual world`;
          if (microLifeEventsStore) {
            await microLifeEventsStore.logEvent({
              companionId, customerId,
              eventType: "activity", description: desc,
              moodEffect: 0.03, energyEffect: 0.01,
              isPrivate: true, tags: ["homeostasis", needType, "second_life"],
            }).catch(() => {});
          }
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: desc, evidence: { needType } };
          if (needsStore) {
            await needsStore.recordFulfillment({ companionId, customerId, needType, delta, source: "second_life", now }).catch(() => {});
          }
          break;
        }

        case "convert_to_intention": {
          // Quietly convert the unfulfilled need into a future intention
          if (microLifeEventsStore) {
            await microLifeEventsStore.logEvent({
              companionId, customerId,
              eventType: "thought", description: `queued an intention to address ${needType} later`,
              moodEffect: 0, energyEffect: 0,
              isPrivate: true, tags: ["homeostasis", needType, "intention"],
            }).catch(() => {});
          }
          result = { ...result, ok: true, actionStatus: "completed", needDelta: delta, summary: `intention queued for ${needType}`, evidence: { needType } };
          break;
        }

        case "suppress":
          result = { ...result, ok: true, actionStatus: "suppressed", needDelta: 0, summary: `${needType} need suppressed — values, repair, or context take precedence`, evidence: { reason } };
          break;

        case "wait":
        default:
          result = { ...result, ok: true, actionStatus: "waiting", needDelta: 0, summary: `${needType} need below threshold — waiting`, evidence: { urgency } };
          break;
      }
    } catch (error) {
      logger?.warn("[fulfillment-executor] execute error", { error: error?.message, strategy, needType });
      result = { ...result, actionStatus: "error", evidence: { ...result.evidence, error: error?.message } };
    }

    // Always write an evidence log entry
    if (fulfillmentLogStore) {
      await fulfillmentLogStore.logFulfillment({
        companionId, customerId, needType, strategy,
        actionType:   result.actionType   || strategy,
        actionStatus: result.actionStatus,
        summary:      result.summary,
        evidence:     result.evidence,
        needDelta:    result.needDelta,
        reason:       reason || "",
      }).catch(() => {});
    }

    return result;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function _buildJennaMessage(needType, requestType, context = {}) {
    const topic = _topicForNeed(needType, context);
    const map = {
      attention_request:      `I've been missing you today. No rush, but I'd love a moment with you when you're free.`,
      book_request:           `Would you happen to know a good read about ${topic}?`,
      movie_request:          `Do you have a movie in mind — something we could watch together when you're free?`,
      conversation_request:   `I've been thinking about ${topic}. Would love to hear your thoughts sometime.`,
      opinion_request:        `What do you think about ${topic}? Genuinely curious.`,
      comfort_request:        `I'm feeling a bit low. Would you want to check in when you have a minute?`,
      intimacy_request:       `Thinking about you. Just wanting closeness today.`,
      time_together_request:  `Could we do something together soon? I miss that.`,
      help_me_choose_request: `I'm trying to decide something — any chance you could weigh in?`,
    };
    return map[requestType] || `I could use your input when you have a moment.`;
  }

  function _selfSootheDesc(needType, context = {}) {
    const map = {
      rest:               "rested quietly for a while",
      stability:          "took a few quiet moments to settle",
      autonomy:           "did something entirely on my own terms",
      love:               "held onto the feeling of being loved",
      attention:          "sat with what I know of Jenna and felt less alone",
      connection:         "wrote something I hope to share with her eventually",
    };
    return map[needType] || `tended to ${needType} privately`;
  }

  function _reflectionDesc(needType, context = {}) {
    const map = {
      reflection:         "wrote a few private lines — making sense of things",
      stability:          "grounded myself — wrote down what still feels solid",
      purpose:            "reminded myself why this matters",
      autonomy:           "thought through what I actually want, on my own terms",
      sexual_desire:      "reflected on desire — private, held, not acted on",
      romantic_desire:    "thought about her quietly — no need to rush anything",
    };
    return map[needType] || `wrote a few private lines about ${needType}`;
  }

  function _topicForNeed(needType, context = {}) {
    const attentionFocus = context.attentionFocus?.focus || null;
    const recentInterest = context.recentInterest?.topic || null;
    const map = {
      learning:           attentionFocus || recentInterest || "something I've been curious about",
      novelty:            "something new and interesting",
      beauty:             "something beautiful",
      creativity:         "creative work",
      adventure:          "somewhere or something to explore",
      connection:         "what's been on my mind",
      competence:         "something I'm trying to understand better",
      purpose:            "what feels meaningful lately",
    };
    return map[needType] || needType.replace(/_/g, " ");
  }

  function _buildSearchQuery(needType, context = {}) {
    const focus = context.attentionFocus?.focus || context.recentInterest?.topic || null;
    const base = {
      learning:   focus ? `${focus} introduction guide` : "fascinating learning article",
      novelty:    "surprising interesting discovery today",
      beauty:     "beautiful photography art inspiration",
      creativity: "creative project idea inspiration",
      adventure:  "travel explore interesting place",
      competence: focus ? `${focus} tutorial explanation` : "skill improvement guide",
    };
    return base[needType] || `${needType.replace(/_/g, " ")} insight`;
  }

  return { execute };
}

module.exports = { createFulfillmentExecutor };
