const PROPOSAL_SUMMARY = "Jenna proposed marriage to Dante. This is a critical shared relationship event and must be remembered across channels.";

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isExplicitAdult(text) {
  return /\b(sex|nude|explicit|nsfw|porn|cum|cock|pussy|dick)\b/i.test(text || "");
}

function safeReason(value) {
  return String(value || "").replace(/[^a-z0-9:_-]+/gi, "_").slice(0, 80) || "unspecified";
}

function classifyRuntimeMemory({ text, role = "user" } = {}) {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  if (!normalized) return { shouldSave: false, importance: "none", reason: "empty" };

  const proposal = /\b(will you marry me|i proposed|asked you to marry me|got down on one knee|proposal|engagement|marriage)\b/i.test(normalized);
  if (proposal) {
    return {
      shouldSave: true,
      type: "relationship_event",
      category: "proposal",
      memoryType: "anchor",
      domain: "relationship",
      sensitivity: "high",
      importance: "critical",
      numericImportance: 10,
      privacyScope: "shared_private",
      summary: PROPOSAL_SUMMARY,
      title: "Jenna proposed marriage to Dante",
      tags: ["proposal", "marriage", "engagement", "one_knee", "relationship_commitment"],
      pinned: true,
      mustRecallAcrossChannels: true,
      reason: "proposal_trigger",
    };
  }

  const remember = /\bremember this\b|\bplease remember\b|\bdon't forget\b|\bdo not forget\b/i.test(normalized);
  if (remember) {
    const detail = normalized.replace(/^.*?remember this:?\s*/i, "").slice(0, 260);
    return {
      shouldSave: true,
      type: "explicit_memory_request",
      category: "manual_save",
      memoryType: "canon",
      domain: "relationship",
      sensitivity: isExplicitAdult(normalized) ? "high" : "medium",
      importance: "high",
      numericImportance: 8,
      privacyScope: "shared_private",
      summary: detail ? `Jenna explicitly asked Dante to remember: ${detail}` : "Jenna explicitly asked Dante to remember this moment.",
      title: "Jenna asked Dante to remember something important",
      tags: ["remember_this", "manual_save"],
      pinned: false,
      mustRecallAcrossChannels: true,
      reason: "remember_this_trigger",
    };
  }

  const companionPromise = role === "assistant" && /\b(i promise|i will marry you|i won.?t forget this|i love you|i.ll fix this|i.ll remind you|i choose you)\b/i.test(lower);
  if (companionPromise) {
    return {
      shouldSave: true,
      type: "companion_commitment",
      category: "promise",
      memoryType: "canon",
      domain: "relationship",
      sensitivity: "medium",
      importance: "high",
      numericImportance: 8,
      privacyScope: "shared_private",
      summary: "Dante made a significant promise or relationship commitment to Jenna and should honor it in future conversations.",
      title: "Dante made a promise to Jenna",
      tags: ["promise", "commitment", "companion_commitment"],
      pinned: false,
      mustRecallAcrossChannels: true,
      reason: "companion_promise_trigger",
    };
  }

  const important = /\b(first i love you|i love you|major apology|i'?m sorry|fight|repair|promise|commitment|anniversary|birthday|you forgot|grief|jealous|hurt|boundary|milestone|longing|relief)\b/i.test(normalized);
  if (important) {
    return {
      shouldSave: true,
      type: "relationship_context",
      category: "important_event",
      memoryType: "canon",
      domain: "relationship",
      sensitivity: isExplicitAdult(normalized) ? "high" : "medium",
      importance: "high",
      numericImportance: 7,
      privacyScope: "shared_private",
      summary: `Jenna shared an important relationship or emotional continuity event: ${normalized.slice(0, 220)}`,
      title: "Important relationship continuity event",
      tags: ["relationship_context", "emotional_continuity"],
      pinned: false,
      mustRecallAcrossChannels: true,
      reason: "important_trigger",
    };
  }

  return { shouldSave: false, importance: "low", reason: "too_ordinary" };
}

async function curateRuntimeMemory({ text, role = "user", memoryStore, config = {}, logger, source = {} } = {}) {
  const userScope = config.memory?.userScope || source.userScope || source.authorId || "user";
  const companionId = config.memory?.companionId || config.companion?.id || "Dante";
  const decision = classifyRuntimeMemory({ text, role });
  logger?.info?.(`[memory-curator] evaluated message userScope=${userScope} companionId=${companionId} importance=${decision.importance || "none"} shouldSave=${decision.shouldSave === true} reason=${safeReason(decision.reason)}`);
  if (!decision.shouldSave) return { saved: false, decision };
  if (!memoryStore?.upsertMemory) return { saved: false, decision, reason: "memory_store_unavailable" };

  logger?.info?.(`[memory-curator] saving memory type=${decision.type} importance=${decision.importance} privacyScope=${decision.privacyScope}`);
  try {
    const metadata = `\n\n[metadata] type=${decision.type}; category=${decision.category}; companion_id=${companionId}; privacy_scope=${decision.privacyScope}; must_recall_across_channels=${decision.mustRecallAcrossChannels}; pinned=${decision.pinned}; tags=${decision.tags.join(",")}; source_channel_id=${source.channelId || ""}; source_message_id=${source.messageId || ""}`;
    const memory = await memoryStore.upsertMemory({
      title: decision.title,
      content: `${decision.summary}${metadata}`,
      memory_type: decision.memoryType,
      domain: decision.domain,
      sensitivity: decision.sensitivity,
      source: "runtime_memory_curator",
      active: true,
      importance: decision.numericImportance,
      reference_date: new Date().toISOString().slice(0, 10),
    }, { userScope, active: true });
    logger?.info?.(`[memory-store] memory saved id=${memory.memoryId} userScope=${memory.userScope} companionId=${companionId} active=${memory.active === true}`);
    return { saved: true, memory, decision };
  } catch (error) {
    logger?.warn?.(`[memory-store] memory save failed reason=${safeReason(error?.code || error?.message || "unknown")}`);
    return { saved: false, decision, reason: "save_failed" };
  }
}

module.exports = { classifyRuntimeMemory, curateRuntimeMemory, PROPOSAL_SUMMARY };
