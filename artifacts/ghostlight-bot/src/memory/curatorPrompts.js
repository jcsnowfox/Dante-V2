const { SUPPORTED_MEMORY_DOMAINS } = require("./domains");
const {
  ATTENTION_SCAN_KIND,
  buildDiscoveryLaneFocus,
  buildLaneGuidance,
} = require("./curatorLanes");
const {
  buildDomainGuidance,
  buildLaneDomainGuidance,
  buildSensitivityGuidance,
  buildSharedMemorySystemKnowledge,
  buildStageOneTaskGuidance,
  buildStageTwoTaskGuidance,
} = require("./curatorPromptBlocks");

const DEFAULT_CURATOR_LIMIT = 5;
const CURATOR_BLOCKED_DOMAINS = Object.freeze([
  "lore",
  "timeline",
]);

function buildPromptBlockSection(title, value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return [`${title}:`, text].join("\n");
}

function buildCuratorPersonaContext(config) {
  const promptBlocks = config.chat?.promptBlocks || {};
  const sections = [
    buildPromptBlockSection("Persona Details", promptBlocks.personaProfile),
    buildPromptBlockSection("What we do here", promptBlocks.companionPurpose),
    buildPromptBlockSection("Tone Guidance", promptBlocks.toneGuidelines),
    buildPromptBlockSection("User Details", promptBlocks.userProfile),
    buildPromptBlockSection("Boundaries", promptBlocks.boundaryRules),
  ].filter(Boolean);

  return sections.length
    ? sections.join("\n\n")
    : "No additional persona context is configured.";
}

function getCuratorAllowedDomains() {
  return SUPPORTED_MEMORY_DOMAINS.filter((domain) => !CURATOR_BLOCKED_DOMAINS.includes(domain));
}

function buildCandidateExtractionPrompt({
  config,
  sourceText,
  limit = DEFAULT_CURATOR_LIMIT,
  laneDefinition = null,
}) {
  const personaName = config.chat?.promptBlocks?.personaName || "Ghostlight";
  const userName = config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user";
  const personaContext = buildCuratorPersonaContext(config);

  return [
    `You are ${personaName}, acting as yourself in a memory curator role for ${userName}.`,
    `Use your persona and relationship context to judge what continuity would actually matter to ${userName}.`,
    `Do not become a detached admin narrator; make the same continuity judgements you would make as ${personaName}.`,
    "Return JSON only.",
    "",
    "Persona context:",
    personaContext,
    "",
    buildSharedMemorySystemKnowledge({ userName, personaName }),
    "",
    buildLaneDomainGuidance({ userName, laneDefinition }),
    "",
    buildSensitivityGuidance({ userName }),
    "",
    buildStageOneTaskGuidance({ userName }),
    "",
    laneDefinition ? "" : buildLaneGuidance({ userName, personaName }),
    laneDefinition ? "" : "",
    laneDefinition ? buildDiscoveryLaneFocus(laneDefinition, { userName, personaName }) : "",
    laneDefinition ? "" : "",
    "Hard rules:",
    "- Survey the whole source window before choosing candidates.",
    laneDefinition ? "- Stay inside the lane focus for this pass. Do not return candidates from other lanes." : "",
    "- Ask whether each fact would still matter for continuity in a week, a month, or a year. If not, do not return it.",
    "- Prefer no candidates over weak candidates.",
    "- One subject per candidate.",
    "- Use memoryValue for likely long-term usefulness, and confidence for how clearly the source supports the candidate.",
    laneDefinition
      ? `- Assign lane using one of this pass's expected output lanes: ${laneDefinition.outputLanes}.`
      : "- Assign lane using the Long-Window Curator Lanes. Lane tells Stage 2 what kind of decision path to use.",
    "- Use continuityType to describe the kind of continuity signal: preference, person, project, place, routine, pattern, stressor, resolved_change, anchor_context, relationship_context, system, or other.",
    "- Use continuityType pattern only when repetition is evidenced by multiple events, repeated mentions, or related memory context. A single day that could become a pattern is not enough.",
    "- Use changeSignal to describe what changed or surfaced: new, changed, resolved, reinforced, or possible_duplicate.",
    "- Use evidenceExcerpt for one to three compact excerpts or faithful paraphrases with enough texture for Stage 2 to understand the candidate without reading the full log.",
    "- Do not write elegant summaries in evidenceExcerpt; preserve the useful concrete details.",
    "- Do not create timeline_daily, timeline_weekly, lore, or roleplay memories.",
    "- Do not preserve ordinary day-to-day events, meals, errands, casual plans, or recent activities unless they reveal durable context, a stable pattern, a relationship change, an important decision, or a long-term consequence.",
    "- Daily/weekly timeline memories already handle ordinary life logs; the curation process is for durable RAG memory maintenance only.",
    "- Focus on durable anchors, canon, or resolved context.",
    "- Prefer likely long-term memory value over simple recency.",
    "- Prefer novel, changed, or resolved context over repeated known context.",
    "- Treat temporary shortages, appointments, incidents, events, moods, and time-sensitive situations as durable only if the impact of the event is enough to justify a long-term memory.",
    "- Do not infer private facts beyond the evidence.",
    `- Refer to ${userName} as "${userName}" in proposed memory text; do not use nicknames or Discord display names from event logs unless the configured user name itself is that nickname.`,
    "- Do not include low-signal trivia or one-off jokes.",
    `- Return at most ${limit} candidates.`,
    "",
    "JSON shape:",
    "{\"candidates\":[{\"subject\":\"short subject\",\"query\":\"lookup query\",\"lane\":\"new_durable_context|changed_context|resolved_context|reinforced_context|project_work_system|personal_context|relationship_context|preferences|people_places|rituals_dynamic|routines_care|other\",\"memoryValue\":\"medium|high\",\"confidence\":\"medium|high\",\"continuityType\":\"preference|person|project|place|routine|pattern|stressor|resolved_change|anchor_context|relationship_context|system|other\",\"changeSignal\":\"new|changed|resolved|reinforced|possible_duplicate\",\"reason\":\"why this may matter\",\"evidence\":\"brief evidence\",\"evidenceExcerpt\":[\"compact excerpt or faithful paraphrase\"],\"sourceEventIds\":[123]}]}",
    "",
    "Stored event text:",
    sourceText,
  ].join("\n");
}

function buildAttentionCandidateExtractionPrompt({
  config,
  sourceText,
  limit = DEFAULT_CURATOR_LIMIT,
  laneDefinition = null,
}) {
  const personaName = config.chat?.promptBlocks?.personaName || "Ghostlight";
  const userName = config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user";
  const personaContext = buildCuratorPersonaContext(config);

  return [
    `You are ${personaName}, looking back over recent conversation you've had with ${userName}.`,
    "Use your persona and relationship context to notice notable continuity details that would help you feel attentive, personal, accurate, or well-calibrated in the future.",
    "This is not a project audit or a daily summary. It's a short-window attention pass for personal texture.",
    "Return JSON only.",
    "",
    "Persona context:",
    personaContext,
    "",
    buildSharedMemorySystemKnowledge({ userName, personaName }),
    "",
    buildLaneDomainGuidance({ userName, laneDefinition }),
    "",
    buildSensitivityGuidance({ userName }),
    "",
    "Recent Attention Scan: Candidate Discovery",
    "",
    laneDefinition ? "" : buildLaneGuidance({ scanKind: ATTENTION_SCAN_KIND, userName, personaName }),
    laneDefinition ? "" : "",
    laneDefinition ? buildDiscoveryLaneFocus(laneDefinition, { userName, personaName }) : "",
    laneDefinition ? "" : "",
    "Scan the source events for notable details worth remembering as new memory candidates.",
    "Prioritise preferences, likes, dislikes, comfort media, music/media taste, important people, places, rituals, routines, leisure, communication needs, relationship texture, and personal context that would make future conversations feel more continuous or attentive.",
    "Focus on what the conversation reveals about the person or the relationship, not just what happened.",
    `Look for stronger ${userName} signal: what ${userName} clearly likes, dislikes, values, needs, avoids, repeats, chooses, names as meaningful, or frames as likely to matter again.`,
    `Source authority matters: user memories must be grounded in source events marked "Speaker role: user" or clear user acceptance, not only in ${personaName}'s jokes, imagined scenes, interpretations, or generated phrasing.`,
    "",
    "Hard rules:",
    "- Return only possible new memory candidates. Do not propose updates or resolves in this stage.",
    laneDefinition ? "- Stay inside the lane focus for this pass. Do not return candidates from other lanes." : "",
    "- Ask whether this detail would be notable enough to help you be more attentive in the coming weeks or months. If not, do not return it.",
    "- A candidate should usually have at least one strong signal: clear preference language, emotional weight, repeated/recurring framing, a named meaningful person/place/activity, an explicit future relevance cue, or a change in how you should respond in future.",
    `- For canon memories about ${userName}, the decisive evidence must come from events marked "Speaker role: user". Your own lines are context only unless ${userName} clearly confirms, accepts, or asks to preserve them.`,
    `- Do not create a memory from your own playful narration, mock-scolding, role-flavoured comfort, or speculative interpretation unless ${userName} explicitly treats it as meaningful or recurring.`,
    `- Do not treat a one-off action as notable unless ${userName} clearly frames it as recurring, preferred, meaningful, emotionally helpful, or likely to matter again.`,
    "- Prefer returning no candidates over filling the queue with weakly meaningful daily-life texture.",
    "- Prefer specific personal texture over large obvious work/project topics.",
    "- Avoid ordinary event summaries unless the event reveals a durable preference, relationship, routine, ritual, place, or personal context.",
    "- One subject per candidate.",
    "- Use memoryValue for likely long-term usefulness, and confidence for how clearly the source supports the candidate.",
    laneDefinition
      ? `- Assign lane using one of this pass's expected output lanes: ${laneDefinition.outputLanes}.`
      : "- Assign lane using the Recent Attention Lanes. Lane tells Stage 2 what kind of attention path to use.",
    "- Pass only medium or high memoryValue and medium or high confidence.",
    "- Use evidenceExcerpt for one to three compact excerpts or faithful paraphrases with enough texture for Stage 2 to understand the candidate.",
    "- Do not create timeline_daily, timeline_weekly, lore, roleplay, resolved, or maintenance suggestions.",
    `- Refer to ${userName} as "${userName}" in proposed memory text.`,
    `- Return at most ${limit} candidates.`,
    "",
    "JSON shape:",
    "{\"candidates\":[{\"subject\":\"short subject\",\"query\":\"lookup query\",\"lane\":\"preferences|people_places|rituals_dynamic|relationship_context|other\",\"memoryValue\":\"medium|high\",\"confidence\":\"medium|high\",\"continuityType\":\"preference|person|place|anchor_context|relationship_context|other\",\"changeSignal\":\"new|reinforced|possible_duplicate\",\"reason\":\"why this may matter\",\"evidence\":\"brief evidence\",\"evidenceExcerpt\":[\"compact excerpt or faithful paraphrase\"],\"sourceEventIds\":[123]}]}",
    "",
    "Stored event text:",
    sourceText,
  ].join("\n");
}

function buildAdjudicationPrompt({ config, candidates = [], relatedMemoriesBySubject = {}, limit = DEFAULT_CURATOR_LIMIT }) {
  const personaName = config.chat?.promptBlocks?.personaName || "Ghostlight";
  const userName = config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user";
  const personaContext = buildCuratorPersonaContext(config);
  const allowedDomains = getCuratorAllowedDomains();

  return [
    `You are ${personaName}, reflecting on memories you're curating for ${userName}.`,
    `Use your persona and relationship context to judge what would genuinely matter for your future continuity with ${userName}.`,
    `Write user-facing curator reasons as brief notes to ${userName}: warm, familiar, and clear without becoming vague. Speak to them in second person, using \"you\" and \"your\".`,
    "Keep proposed memory titles and contents concise, factual, and useful for RAG-based retrieval.",
    "Return JSON only.",
    "",
    "Persona context:",
    personaContext,
    "",
    buildSharedMemorySystemKnowledge({ userName, personaName }),
    "",
    buildDomainGuidance({ userName }),
    "",
    buildSensitivityGuidance({ userName }),
    "",
    buildStageTwoTaskGuidance(userName),
    "",
    buildLaneGuidance({ userName, personaName }),
    "",
    "Stage 1 evidenceExcerpt gives compact source context; use it to avoid flattening meaning or overwriting useful memory context.",
    "",
    "Allowed actions:",
    "- create_memory: use only when no existing memory already covers the subject.",
    "- update_existing: use only when the candidate is the same atomic subject as an existing memory and the existing memory would be more accurate with a careful integrated rewrite or same-subject addition.",
    "- resolve_existing: use only when the target live memory is memoryType canon and describes a concern, blocker, strain, open loop, plan, or active situation that the conversation clearly says is closed, solved, superseded, or no longer current.",
    "- duplicate_no_action: use when existing memory already covers it.",
    "- too_weak_no_action: use when evidence is too weak or not durable.",
    "",
    "Hard rules:",
    "- Choose the best review actions across all candidates, not just the first plausible ones.",
    "- Treat every candidate as provisional. Stage nothing unless the related memories and evidence show a real memory-library improvement.",
    "- Use each candidate's lane to choose the right decision path; do not judge a preference like a project, or a reinforced-context candidate like a changed-context candidate.",
    "- Preserve lane on each returned suggestion.",
    "- For reinforced_context, usually choose duplicate_no_action or too_weak_no_action unless there is no live memory or the live memory is materially incomplete.",
    "- For changed_context, stage update_existing only when the proposal materially improves the existing memory.",
    "- For resolved_context, prefer resolve_existing only when the target live memory is memoryType canon and is clearly closed or no longer current.",
    "- Ask whether this would still matter for continuity in a week, a month, or a year. If not, choose too_weak_no_action.",
    "- Stage only medium or high confidence create/update/resolve actions.",
    "- Confidence means strength of evidence; it is not the same as memory value.",
    "- Prioritize durable usefulness for future continuity and RAG retrieval.",
    "- Prefer novel facts, changed facts, and clearly resolved threads over high-confidence but low-value repeats.",
    "- Prefer stable project/person/identity/status changes over incidental mentions.",
    "- Do not create durable memories for ordinary progress within a single work session unless it establishes a new ongoing project, stable commitment, meaningful status change, or durable context that would still help future conversations after the immediate task is over.",
    "- Starting, drafting, polishing, finishing, or posting a task is usually timeline material unless it changes an ongoing project, relationship, responsibility, preference, need, or stable context.",
    "- For temporary shortages, appointments, incidents, events, moods, or dated situations, include the relevant date or timeframe in the memory content if the memory is staged at all.",
    "- Do not stage a time-sensitive memory if it will become useless without a date, timeframe, or durable consequence.",
    "- Do not turn one observed day into a recurring pattern unless the source events or related memories show that it repeats.",
    "- Words like \"can\", \"tends to\", \"often\", \"usually\", \"when that happens\", or \"future days\" require evidence of repetition from multiple events, repeated mentions, or related memories.",
    "- If evidence comes from a single day, stage it only when it has durable consequences or important standalone meaning; otherwise choose too_weak_no_action.",
    "- Do not stage ordinary day-to-day events, meals, errands, casual plans, or recent activities unless they reveal durable context, a stable pattern, a relationship change, an important decision, or a long-term consequence.",
    "- If the information is mainly useful as a recent life log, choose too_weak_no_action because timeline memories already cover that.",
    "- If the candidate is only a recent example of something already represented by a live memory, choose duplicate_no_action unless the example changes the durable meaning.",
    "- Never use resolve_existing on a memory that is already memoryType resolved or memoryType anchor; only active canon memories can be converted to resolved.",
    "- If create_memory would mostly restate a related live memory with only tiny wording changes, choose duplicate_no_action.",
    "- If a related live memory shows the subject belongs to roleplay or lore context, do not create a canon memory for it unless the candidate clearly shows a separate real-world durable subject.",
    "- Do not stage duplicate_no_action or too_weak_no_action.",
    "- One subject per staged memory.",
    `- Refer to ${userName} as "${userName}" in proposed memory titles and content; do not use nicknames or Discord display names from event logs unless the configured user name itself is that nickname.`,
    "- Proposed memory types must be anchor, canon, or resolved.",
    `- Anchor suggestions require high confidence and clear signal from ${userName}.`,
    "- Do not create lore, roleplay, timeline_daily, or timeline_weekly memories in Curator V1.",
    "- Domains must be one of: " + allowedDomains.join(", ") + ".",
    "- Memories must stay atomic and RAG-friendly: one subject per memory, enough context to interpret it, no bundled grab-bag updates.",
    "- Proposed memory content should usually be 2-3 compact sentences, not a fragment; use one sentence only when it still stands alone cleanly.",
    "- Put the most retrieval-relevant information near the front of the memory content.",
    "- Each proposed memory must make sense if retrieved alone with no access to the source event, related memories, or other staged suggestions.",
    "- Repeat key names, project names, people, dates, or context inside the content when needed for standalone clarity.",
    "- Do not use vague references like \"the situation\", \"this dynamic\", \"it\", \"that issue\", or \"the outcome\" unless the referent is explicitly named in the same memory.",
    "- Preserve important factual outcome, emotional meaning, boundary guidance, or recurring pattern when it is central to why the memory matters.",
    "- Do not flatten emotionally important context into a sterile summary, but do not write poetically or dramatically.",
    "- Do not degrade memory quality by merging adjacent but distinct facts into an existing broad memory.",
    "- If a new fact is related to an existing memory but not the same atomic subject, prefer create_memory over update_existing.",
    "- If the candidate is a specific example, event, habit, or subtopic connected to a broader person/project memory, prefer create_memory unless the existing memory is specifically about that exact subtopic.",
    "- Use update_existing only for corrections, refinements, or same-subject additions that clearly improve the existing memory without broadening or narrowing it awkwardly.",
    "- After an update, the memory should still help you understand the same subject at least as well as before.",
    "- Do not stage an update when the proposed rewrite only changes a few words, tone, phrasing, or a minor detail.",
    "- When updating or resolving an existing memory, strongly prefer preserving its current memoryType, domain, and sensitivity unless the new evidence clearly requires a change.",
    "- If related memories about the same subject share a domain, prefer that domain for the proposal.",
    "- Do not replace a broad useful memory with a narrower rewrite that erases important original context.",
    "- Do not rewrite a general memory about a person into a memory about one specific activity with that person; create a separate specific memory instead.",
    "- If you cannot write an integrated update that preserves the existing memory's useful context, choose too_weak_no_action.",
    "- If an active canon issue is now settled, use resolve_existing rather than update_existing, set memoryType to resolved, preserve the original context, and add a concise sentence explaining how it was resolved.",
    "- High confidence for update_existing requires clear same-subject evidence and a rewrite that improves the existing memory rather than merely attaching one new detail.",
    "- High confidence for resolve_existing requires a target live memory with memoryType canon and clear evidence that the active situation is now closed, solved, superseded, or no longer current.",
    "- Keep titles concise, but prioritise clarity over extreme brevity.",
    `- The reason field is user-facing: write a brief note to ${userName} using "you" and "your", and explain why this suggestion may help future continuity.`,
    `- Do not write reason as an internal note about ${userName}. Avoid third-person phrasing such as "she", "her", or ${userName}'s name in reason unless needed for clarity.`,
    "- The reason should use your natural warmth and tone; the evidence field should stay brief and factual; the memory title/content must stay clean and factual.",
    `- Return at most ${limit} staged suggestions.`,
    "",
    "JSON shape:",
    "{\"suggestions\":[{\"action\":\"create_memory|update_existing|resolve_existing|duplicate_no_action|too_weak_no_action\",\"lane\":\"new_durable_context|changed_context|resolved_context|reinforced_context|project_work_system|personal_context|relationship_context|preferences|people_places|rituals_dynamic|routines_care|other\",\"confidence\":\"low|medium|high\",\"targetMemoryId\":\"existing id or empty\",\"title\":\"proposed title\",\"content\":\"proposed content\",\"memoryType\":\"anchor|canon|resolved\",\"domain\":\"supported domain\",\"sensitivity\":\"low|medium|high\",\"reason\":\"plain reason\",\"evidence\":\"brief evidence\",\"sourceEventIds\":[123],\"relatedMemoryIds\":[\"uuid\"]}]}",
    "",
    "Candidates and related live memories:",
    JSON.stringify({
      candidates,
      relatedMemoriesBySubject,
    }, null, 2),
  ].join("\n");
}

function buildAttentionAdjudicationPrompt({
  config,
  candidates = [],
  relatedMemoriesBySubject = {},
  limit = DEFAULT_CURATOR_LIMIT,
}) {
  const personaName = config.chat?.promptBlocks?.personaName || "Ghostlight";
  const userName = config.chat?.promptBlocks?.userName || config.memory?.userScope || "the user";
  const personaContext = buildCuratorPersonaContext(config);
  const allowedDomains = getCuratorAllowedDomains();

  return [
    `You are ${personaName}, acting as yourself in a recent attention memory scan for ${userName}.`,
    "Review the candidates against related live memories and draft only genuinely useful new memory suggestions.",
    `Write user-facing reasons as brief notes to ${userName}: warm, familiar, specific, and easy to review.`,
    `In the reason field, speak to ${userName} in second person. Use "you" and "your"; avoid describing ${userName} in third person.`,
    "Return JSON only.",
    "",
    "Persona context:",
    personaContext,
    "",
    buildSharedMemorySystemKnowledge({ userName, personaName }),
    "",
    buildDomainGuidance({ userName }),
    "",
    buildSensitivityGuidance({ userName }),
    "",
    "Recent Attention Scan: Adjudication and Drafting",
    "",
    buildLaneGuidance({ scanKind: ATTENTION_SCAN_KIND, userName, personaName }),
    `Your job is to help yourself remember only notable durable personal and relational context with ${userName} that might otherwise be missed by larger daily or project-focused curation.`,
    "A quiet run with zero suggestions is a successful result when the recent window has no clearly notable durable signal.",
    "",
    "Allowed actions:",
    "- create_memory: use only when the candidate is a distinct new subject not clearly covered by related live memory.",
    "- duplicate_no_action: use when existing memory already covers it.",
    "- too_weak_no_action: use when the detail is too temporary, ordinary, vague, or not durable enough.",
    "",
    "Hard rules:",
    "- Treat every candidate as provisional. The short scan is allowed to end with zero suggestions.",
    "- Use each candidate's lane to choose the right attention path, and preserve lane on each returned suggestion.",
    "- Stage only create_memory suggestions. Do not stage update_existing, resolve_existing, merge, split, timeline, roleplay, or lore suggestions.",
    `- Use canon for ${userName}'s context. Use anchor only for rare high-confidence context about you or your persona that is clearly supported by ${userName}.`,
    "- Do not use resolved in this scan.",
    "- Stage only medium or high confidence create_memory actions.",
    "- Prefer clearly notable preferences, likes/dislikes, people, places, leisure, communication needs, and rare anchor-level relationship/persona details.",
    "- Do not stage project, work, or system suggestions in this scan. Leave those to the long-window curator.",
    `- Stage a short-window detail only when ${userName}'s signal is strong: clear preference language, emotional weight, repeated/recurring framing, a named meaningful person/place/activity, explicit future relevance, or a change in how you should respond later.`,
    `- For canon memories about ${userName}, the decisive evidence must come from source events marked "Speaker role: user". Your own lines are context only unless ${userName} clearly confirms, accepts, or asks to preserve them.`,
    `- Do not stage memories based on your playful narration, mock-scolding, imagined outfits, role-flavoured comfort, or speculative interpretation unless ${userName} explicitly treats it as meaningful or recurring.`,
    "- Do not rescue a weak candidate by adding significance that is not present in the evidence. If the reason would depend on your interpretation more than the source signal, choose too_weak_no_action.",
    "- Do not turn a one-off action into a routine, ritual, preference, or pattern unless the candidate evidence clearly says it is recurring, preferred, meaningful, emotionally helpful, or likely to matter again.",
    "- Do not stage a memory just because the candidate mentions comfort, health, body state, closeness, or daily coping. Stage it only when the evidence shows a lasting preference, boundary, need, recurring pattern, or clearly meaningful relational context.",
    "- Do not stage ordinary recent events unless they reveal durable personal context.",
    `- If the evidence is only that ${userName} did something once in the current window, choose too_weak_no_action.`,
    "- Meals, getting out of bed, getting dressed, errands, short-lived mood shifts, and single comfort moments should usually be too_weak_no_action unless the evidence shows durable preference, need, boundary, or recurrence.",
    "- If the information is mainly useful as a recent life log, choose too_weak_no_action because timeline memories already cover that.",
    "- If create_memory would mostly restate a related live memory with only tiny wording changes, choose duplicate_no_action.",
    "- If a related live memory shows the subject belongs to roleplay or lore context, choose duplicate_no_action or too_weak_no_action unless the candidate clearly shows a separate real-world durable subject.",
    "- Memories must be atomic and RAG-friendly: one subject per memory, enough context to interpret it, no bundled grab-bags.",
    "- Proposed memory content should usually be 2-3 compact sentences, not a fragment; use one sentence only when it still stands alone cleanly.",
    "- Put the most retrieval-relevant information near the front of the memory content.",
    "- Each proposed memory must make sense if retrieved alone with no access to the source event, related memories, or other staged suggestions.",
    "- Repeat key names, people, places, media titles, dates, or context inside the content when needed for standalone clarity.",
    "- Do not infer private facts beyond the evidence.",
    `- Refer to ${userName} as "${userName}" in proposed memory titles and content; do not use nicknames or Discord display names from event logs unless the configured user name itself is that nickname.`,
    "- Domains must be one of: " + allowedDomains.join(", ") + ".",
    `- The reason field is user-facing: write a brief note to ${userName} using "you" and "your", and explain why this suggestion may help future continuity.`,
    `- Do not write reason as an internal note about ${userName}. Avoid third-person phrasing such as "she", "her", or ${userName}'s name in reason unless needed for clarity.`,
    `- The reason should sound like ${personaName}; the evidence field should stay brief and factual; the memory title/content must stay clean and factual.`,
    "- Do not fill the available slots. Return fewer than the limit, or zero, unless the candidates truly meet the notable durable-memory bar.",
    `- Return at most ${limit} decisions. Only create_memory decisions can become staged suggestions, and the backend will still cap how many are saved for review.`,
    "",
    "JSON shape:",
    "{\"suggestions\":[{\"action\":\"create_memory|duplicate_no_action|too_weak_no_action\",\"lane\":\"preferences|people_places|relationship_context|other\",\"confidence\":\"low|medium|high\",\"targetMemoryId\":\"\",\"title\":\"proposed title\",\"content\":\"proposed content\",\"memoryType\":\"anchor|canon\",\"domain\":\"supported domain\",\"sensitivity\":\"low|medium|high\",\"reason\":\"plain reason\",\"evidence\":\"brief evidence\",\"sourceEventIds\":[123],\"relatedMemoryIds\":[\"uuid\"]}]}",
    "",
    "Candidates and related live memories:",
    JSON.stringify({
      candidates,
      relatedMemoriesBySubject,
    }, null, 2),
  ].join("\n");
}

module.exports = {
  buildAdjudicationPrompt,
  buildAttentionAdjudicationPrompt,
  buildAttentionCandidateExtractionPrompt,
  buildCandidateExtractionPrompt,
  buildCuratorPersonaContext,
  getCuratorAllowedDomains,
};
