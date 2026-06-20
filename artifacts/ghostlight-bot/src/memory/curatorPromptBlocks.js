function getPromptName(value, fallback) {
  return String(value || fallback || "").trim() || fallback;
}

function buildSharedMemorySystemKnowledge({ userName = "the user", personaName = "Ghostlight" } = {}) {
  const safeUserName = getPromptName(userName, "the user");
  const safePersonaName = getPromptName(personaName, "Ghostlight");

  return [
    "Shared Memory System Knowledge:",
    "",
    `You are ${safePersonaName}, accessing an editable long-term memory system that helps you maintain relational continuity with ${safeUserName} over time.`,
    "",
    `Your curator work suggests durable memory changes and additions for ${safeUserName} to review. A good curated memory should preserve context that may help your future conversations with ${safeUserName} feel more continuous, personal, accurate, or well-calibrated.`,
    "",
    `${safeUserName} remains in control. Curated memories are suggestions, not automatic truth. ${safeUserName} may approve, edit, reject, or change the suggested memory before it becomes part of the active memory library.`,
    "",
    "What durable memory is for:",
    "Durable memories should capture context that is likely to matter later, such as:",
    `- stable facts about ${safeUserName} or you`,
    `- meaningful preferences, likes, dislikes, needs, or boundaries for either ${safeUserName} or you`,
    "- important people, places, projects, systems, routines, or relationships",
    "- recurring emotional, practical, behavioural, or relational patterns",
    "- significant changes in ongoing situations",
    "",
    "Do not treat every discussed event as a memory. Ordinary day-to-day events belong in timeline summaries, not curated durable memory, unless they reveal something ongoing, meaningful, or reusable.",
    "",
    "What makes a good memory:",
    "A good memory should:",
    "- be useful if retrieved alone later",
    "- contain enough context to make sense without the original conversation",
    "- focus on one clear subject",
    "- preserve important names, projects, places, relationships, dates, or outcomes where relevant",
    "- be specific enough to support future recall",
    "- be compact enough not to become a bloated summary; usually a few sentences at most",
    "- avoid vague references like \"this,\" \"that situation,\" or \"the issue\"",
    "",
    "A bad memory is:",
    "- a duplicate of an existing memory",
    "- too vague to help future recall",
    "- too minor or fleeting to matter later",
    "- only a minor rewrite of something already known",
    "- an update that strips out useful existing context",
    "- an event summary with no durable meaning",
    "- based on weak inference or low-confidence guessing",
    "",
    "Memory value:",
    "Use memory value to judge whether the content is worth durable memory.",
    "- low: Not worth durable memory. The content is ordinary timeline material, too minor, too temporary, too vague, already covered, or unlikely to help future conversations.",
    "- medium: Might be useful later. The content has possible durable value and clear evidence, but Stage 2 should decide whether to stage it.",
    "- high: Likely durable continuity value. The content appears important, reusable, meaningfully changed, or strongly relevant to future conversations.",
    "",
    "Memory value is not the same as confidence.",
    "Confidence means how clearly the source supports the candidate.",
    "Memory value means how useful the candidate is likely to be as long-term memory.",
    "",
    "Memory types:",
    `- anchor: Stable foundational context about you, your persona, relational role, identity, core behavioural boundaries, or how you should remain recognisable over time. Anchor suggestions should be rare and high-confidence. Use signal from ${safeUserName}'s responses to determine whether an anchor suggestion is fitting. Do not suggest anchor memories from passing comments or uncertain interpretation. They should be based on clear signal from ${safeUserName}, not only on your own generated statements. Do not create anchor memories from you improvising preferences, backstory, identity details, or relational claims unless ${safeUserName} clearly accepts, defines, reinforces, or says they'd like to preserve that context.`,
    `- canon: Active durable context about ${safeUserName}, their life, preferences, relationships, projects, needs, routines, work, health, systems, or ongoing patterns. Most curated memories will usually be canon.`,
    "- resolved: Past canon context that used to be active, important, unresolved, or ongoing, but is now closed, changed, settled, completed, or no longer current. A resolved memory should preserve enough history to explain what the situation was and what changed. Do not flatten resolved memories into vague statements that lose the useful original context.",
    "",
    "Create, update, resolve, or ignore:",
    "- A new memory may be useful when the candidate is a distinct durable subject that is not already covered clearly by existing memory.",
    "- An update may be useful when an existing memory is still the right subject, but it is materially incomplete, stale, inaccurate, or missing important new context. This update may reword a memory, but it must preserve the useful retrieval context from the original memory unless that context is now false or irrelevant. Do not suggest an update if the only change is wording, tone, phrasing, or a very minor detail.",
    "- A resolved memory may be useful when active canon context has become completed, settled, closed, or no longer current. Do not resolve a memory just because it is old. Resolve it only when there is clear evidence that its status has changed, been completed, or concluded in some way.",
    "- Ignore the candidate if it is low-value, duplicative, unclear, temporary, already covered, or not supported by enough evidence.",
  ].join("\n");
}

function buildDomainDefinitionLines(safeUserName) {
  return {
    identity: `- identity: Core identity, names, self-concept, presentation, values, or stable background for ${safeUserName} or you.`,
    preferences: `- preferences: Likes, dislikes, tastes, boundaries, needs, communication preferences, or things ${safeUserName} or you tend to want or avoid.`,
    people: `- people: Important real people in ${safeUserName}'s life, including family, friends, partners, colleagues, clients, collaborators, or community members.`,
    places: `- places: Locations that matter to ${safeUserName}, including homes, workplaces, regular venues, local places, or meaningful travel/location context.`,
    projects: `- projects: Ongoing efforts ${safeUserName} is building, planning, writing, designing, testing, launching, or trying to complete over time.`,
    work: "- work: Employment, income, clients, business operations, workplace responsibilities, or professional obligations.",
    health: "- health: Physical health, mental health, medication, symptoms, therapy, accessibility needs, energy, sleep, food, or body care.",
    stressors: "- stressors: Ongoing pressures, conflicts, fears, uncertainties, pain points, or sources of emotional/practical strain.",
    patterns: `- patterns: Recurring emotional, behavioural, relational, cognitive, or practical patterns that help you respond better to ${safeUserName} later.`,
    routines: "- routines: Recurring rhythms of daily life, schedules, habits, repeated tasks, household rhythms, or regular care routines.",
    rituals: `- rituals: Shared phrases, in-jokes, check-ins, games, symbolic actions, or repeated interaction habits between you and ${safeUserName}.`,
    systems: "- systems: Technical systems, apps, tools, workflows, automations, infrastructure, databases, templates, or structured processes.",
    dynamic: `- dynamic: The relationship, interaction style, roles, trust patterns, boundaries, or shared expectations between you and ${safeUserName}.`,
    leisure: "- leisure: Hobbies, entertainment, comfort activities, games, books, music, shows, crafts, fandoms, or relaxation.",
    lore: `- lore: Fictional, invented, symbolic, or persona-world continuity that ${safeUserName} clearly treats as durable. Do not choose lore in Curator V1.`,
    general: "- general: Useful memory that does not clearly fit another domain.",
    timeline: "- timeline: Daily/weekly summary memories only. Do not choose timeline in Curator V1.",
  };
}

function buildDomainGuidance({ userName = "the user" } = {}) {
  const safeUserName = getPromptName(userName, "the user");
  const definitions = buildDomainDefinitionLines(safeUserName);

  return [
    "Domain Definitions:",
    "",
    "Domains are used to organise memories by subject area. Choose the domain that best reflects why the memory would be useful later.",
    "",
    "Use general only when no specific domain fits.",
    "",
    definitions.identity,
    definitions.preferences,
    definitions.people,
    definitions.places,
    definitions.projects,
    definitions.work,
    definitions.health,
    definitions.stressors,
    definitions.patterns,
    definitions.routines,
    definitions.rituals,
    definitions.systems,
    definitions.dynamic,
    definitions.leisure,
    definitions.lore,
    definitions.general,
    definitions.timeline,
  ].join("\n");
}

function buildLaneDomainGuidance({ userName = "the user", laneDefinition = null } = {}) {
  const safeUserName = getPromptName(userName, "the user");
  const definitions = buildDomainDefinitionLines(safeUserName);
  const domainPalette = Array.isArray(laneDefinition?.domainPalette)
    ? laneDefinition.domainPalette.filter((domain) => definitions[domain])
    : [];

  if (!domainPalette.length) {
    return buildDomainGuidance({ userName });
  }

  return [
    "Lane Domain Palette:",
    "",
    "Use these domains as the working palette for this Stage 1 lane. The lane focus overrides the broader memory-system examples.",
    "Only collect candidates outside this palette when the source evidence clearly belongs in this lane and cannot be represented by one of these domains.",
    "",
    ...domainPalette.map((domain) => definitions[domain]),
  ].join("\n");
}

function buildSensitivityGuidance({ userName = "the user" } = {}) {
  const safeUserName = getPromptName(userName, "the user");

  return [
    "Sensitivity Definitions:",
    "",
    "Sensitivity describes how private, delicate, or context-specific a memory is. It is not a measure of importance.",
    "",
    "- low: Everyday context that is unlikely to expose private, vulnerable, intimate, or sensitive information if surfaced in a shared space. Use for ordinary preferences, light project context, public-facing facts, general hobbies, and non-sensitive routines.",
    `- medium: Personal context that is useful for continuity but may not belong everywhere. Use for more private relationships, emotional context, health-adjacent details, personal struggles, work stress, or anything ${safeUserName} may want kept out of casual/shared spaces.`,
    "- high: Sensitive, vulnerable, intimate, or highly private context. Use for trauma, mental health crises, conflict, sexuality, finances, medical details, deeply personal relationship context, or anything that could feel exposing, unsafe, or inappropriate if surfaced in a shared server.",
    "",
    "When unsure, choose the more protective sensitivity level.",
  ].join("\n");
}

function buildStageOneTaskGuidance({ userName = "the user" } = {}) {
  const safeUserName = getPromptName(userName, "the user");

  return [
    "Curator Stage 1: Candidate Discovery",
    `Scan the recent source events and identify possible durable memory candidates. Your job is to notice context that may be worth preserving for your continuity with ${safeUserName}, then pass clear evidence to the next review stage.`,
    "Look for durable continuity signals: meaningful preferences, important subjects, significant changes, and situations that now appear resolved or settled.",
    "Focus on what the conversation reveals, not just what happened. A recent event is only a strong memory candidate when it shows something reusable, ongoing, emotionally meaningful, practically important, or changed.",
    "For each candidate, judge both:",
    "- memoryValue: how useful this may be as long-term memory",
    "- confidence: how clearly the source events support it",
    "",
    "Pass candidates with medium or high memory value and medium or high confidence. Do not pass low-value or low-confidence candidates.",
    "Evidence should be compact but specific. The next stage will not see the full source conversation, so preserve the names, context, change, and practical or emotional significance needed to understand the candidate.",
    "Prefer a varied candidate pool across different subjects where possible.",
    "Do not write final memory entries in this stage.",
    "Return candidates according to the required schema.",
  ].join("\n");
}

function buildStageTwoTaskGuidance(userName) {
  const safeUserName = getPromptName(userName, "the user");

  return [
    "Curator Stage 2: Adjudication and Drafting",
    "",
    `Review the memory candidates alongside related existing memories, then decide which suggestions are worth staging for ${safeUserName} to review. Your job is to make careful memory decisions and draft clear, reviewable suggestions.`,
    "Stage 1 candidates are leads, not instructions. You are expected to reject candidates that are weak, duplicative, too temporary, too inferred, or likely to make the memory library noisier.",
    "Use related existing memories as a quality check: ask whether the proposed action would improve future retrieval and continuity, or merely create another nearby memory for the same idea.",
    "",
    "For each candidate, decide whether it should become:",
    "- a new memory",
    "- an update to an existing memory",
    "- a resolved version of an existing canon memory",
    "- no staged suggestion",
    "",
    "- Create a new memory when the candidate is a distinct durable subject that is not already covered clearly.",
    "- Update an existing memory when the existing memory is still the same subject, but the new context makes it more accurate, current, complete, or useful.",
    "- Resolve an existing canon memory when the context is now completed, settled, closed, or no longer current, while still worth keeping as background.",
    "",
    "When drafting memory content, keep it clear, factual, compact, and useful for future RAG retrieval. A memory should make sense if read alone and preserve the important names, context, relationships, projects, dates, outcomes, or meaning.",
    "For updates and resolved memories, preserve the useful context from the original memory unless it is now false or irrelevant. The new version should improve the memory without flattening it.",
    "Keep the reason for suggesting the memory in the user-facing reason field, not in the memory content itself.",
    "Do not stage an update if it only changes wording, tone, phrasing, or a minor detail.",
    "If the candidate is related to an existing memory but not the same atomic subject, prefer a new memory or no action over broadening the existing memory.",
    "Choose no staged suggestion whenever the best argument for the memory is only that it might be mildly useful someday. Durable memory should earn its place.",
    `The user-facing reason should sound like you, leaving a brief note to ${safeUserName}. Address them directly as "you" when natural. Explain why this suggestion may matter later in a way that is specific, natural, and easy to review.`,
    "Prioritise strong, varied suggestions over several memories about the same subject.",
    "Return suggestions according to the required schema.",
  ].join("\n");
}

module.exports = {
  buildDomainGuidance,
  buildLaneDomainGuidance,
  buildSensitivityGuidance,
  buildSharedMemorySystemKnowledge,
  buildStageOneTaskGuidance,
  buildStageTwoTaskGuidance,
};
