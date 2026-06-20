const ATTENTION_SCAN_KIND = "recent_attention";
const ATTENTION_PROJECT_DOMAINS = new Set(["projects", "work", "systems"]);

const CURATOR_CANDIDATE_LANES = Object.freeze([
  "preferences",
  "people_places",
  "rituals_dynamic",
  "routines_care",
  "project_work_system",
  "new_durable_context",
  "changed_context",
  "resolved_context",
  "reinforced_context",
  "personal_context",
  "relationship_context",
  "other",
]);

const ATTENTION_LANE_CAPS = Object.freeze({
  preferences: 2,
  people_places: 2,
  rituals_dynamic: 2,
  routines_care: 2,
  project_work_system: 1,
  personal_context: 2,
  relationship_context: 2,
  other: 2,
});

const CURATOR_LANE_CAPS = Object.freeze({
  project_work_system: 2,
  changed_context: 2,
  resolved_context: 2,
  new_durable_context: 3,
  reinforced_context: 1,
  personal_context: 2,
  relationship_context: 2,
  preferences: 2,
  people_places: 2,
  rituals_dynamic: 2,
  routines_care: 2,
  other: 3,
});

const ATTENTION_DISCOVERY_LANES = Object.freeze([
  {
    key: "short_preferences_tastes",
    label: "Short Scan Lane: preferences / tastes",
    outputLanes: "preferences",
    domainPalette: ["preferences", "leisure", "rituals"],
    guidance: [
      "Your only job in this pass is to look for notable preferences and tastes.",
      "Look for likes, dislikes, music/media taste, food/drink preferences, comfort media, hobbies, leisure tastes, communication preferences, and things {userName} clearly wants or avoids.",
      "Ignore projects, work, health, chores, daily events, and relationship dynamics unless they directly reveal a durable preference or taste.",
    ],
  },
  {
    key: "short_people_places",
    label: "Short Scan Lane: people / places",
    outputLanes: "people_places",
    domainPalette: ["people", "places"],
    guidance: [
      "Your only job in this pass is to look for notable people and places.",
      "Look for important real people, recurring social context, meaningful places, regular venues, homes, workplaces, local places, or travel/location context that may matter later.",
      "Ignore projects, ordinary everyday-type errands and vague social mentions unless they reveal a person or place you think you should recognise later.",
      "Return nothing unless the person or place is named or clearly identifiable and has durable continuity value.",
    ],
  },
  {
    key: "short_anchor_candidates",
    label: "Short Scan Lane: anchor candidates / shared dynamics",
    outputLanes: "relationship_context|rituals_dynamic",
    domainPalette: ["identity", "dynamic", "rituals", "patterns"],
    guidance: [
      "Your only job in this pass is to look for anchor candidates and small shared dynamic or ritual references.",
      "For anchor candidates, look for clear {userName}-defined context about your persona, relational role, identity, stable behavioural boundaries, or how you should remain recognisable over time.",
      "For shared dynamics, look for {userName}-accepted in-jokes, shared phrases, recurring symbolic references, interaction habits, or small relational cues that would help you recognise the relationship later.",
      "Anchor candidates must use continuityType anchor_context. Shared dynamics should use relationship_context or other, with lane relationship_context or rituals_dynamic.",
      "Do not use your own jokes, generated identity claims, imagined scenes, or playful narration as evidence unless {userName} accepts, repeats, clearly enjoys, or treats the reference as meaningful.",
      "Return nothing unless the candidate is high-confidence and has clear future continuity value.",
    ],
  },
]);

const CURATOR_DISCOVERY_LANES = Object.freeze([
  {
    key: "long_projects_systems_routines_work",
    label: "Long Scan Lane: projects / systems / routines / work",
    outputLanes: "project_work_system|routines_care|changed_context|new_durable_context",
    domainPalette: ["projects", "systems", "work", "routines"],
    guidance: [
      "Your only job in this pass is to look for substantial project, system, routine, and work context.",
      "Look for active projects, technical systems, workflows, recurring routines, employment, clients, business operations, obligations, practical rhythms, and materially changed status.",
      "Do not treat every mention of work or a project as durable memory. Look for ongoing direction, decisions, commitments, blockers, repeated workflows, or changes that would matter later.",
      "Ignore preferences, people, places, health, relationship texture, and resolved context unless directly needed to understand a project/system/routine/work candidate.",
    ],
  },
  {
    key: "long_health_care_relationship_dynamic_rituals",
    label: "Long Scan Lane: health / care / relationship / dynamic / rituals",
    outputLanes: "personal_context|relationship_context|rituals_dynamic|routines_care|changed_context|new_durable_context",
    domainPalette: ["health", "stressors", "patterns", "dynamic", "rituals", "routines", "preferences"],
    guidance: [
      "Your only job in this pass is to look for health, care, relationship, dynamic, and ritual context.",
      "Look for durable health or care needs, recurring support patterns, relationship dynamics, expectations for how you and {userName} interact, boundaries, rituals, shared phrases, and meaningful behavioural patterns.",
      "Do not turn one rough day, one mood, or one comforting exchange into a general pattern unless repetition or explicit future relevance is clear.",
      "Ignore projects, systems, work, and ordinary day logs unless they directly reveal a durable care or relationship pattern.",
    ],
  },
  {
    key: "long_resolved_content",
    label: "Long Scan Lane: resolved content",
    outputLanes: "resolved_context",
    domainPalette: [
      "people",
      "projects",
      "work",
      "health",
      "stressors",
      "patterns",
      "routines",
      "systems",
      "dynamic",
      "general",
    ],
    guidance: [
      "Your only job in this pass is to look for active memories or situations that may now be resolved.",
      "Look for clear evidence that a concern, blocker, strain, open loop, plan, project phase, stressor, or active situation has been closed, solved, superseded, completed, or is no longer current.",
      "Do not suggest resolving something just because it is old, less recently mentioned, or emotionally quieter.",
      "Return nothing unless the source clearly says what changed and why the resolved background may still matter later.",
    ],
  },
]);

function getPromptName(value, fallback) {
  return String(value || fallback || "").trim() || fallback;
}

function personalizeLaneText(line, { userName = "the user", personaName = "Ghostlight" } = {}) {
  const safeUserName = getPromptName(userName, "the user");
  const safePersonaName = getPromptName(personaName, "Ghostlight");
  return String(line || "")
    .replaceAll("{userName}", safeUserName)
    .replaceAll("{personaName}", safePersonaName);
}

function buildLaneGuidance({ scanKind = "curator", userName = "the user", personaName = "Ghostlight" } = {}) {
  const personalize = (line) => personalizeLaneText(line, { userName, personaName });

  if (scanKind === ATTENTION_SCAN_KIND) {
    return [
      "Recent Attention Lanes:",
      "- preferences: likes, dislikes, music, media, food, comfort things, tastes, and communication preferences.",
      "- people_places: important people, places, venues, locations, and social context.",
      "- rituals_dynamic: shared phrases, in-jokes, interaction habits, your relationship texture, and communication dynamics.",
      "- routines_care: recurring practical rhythms, care needs, health-adjacent routines, and day-to-day patterns that may help future support.",
      "- project_work_system: project, work, and system details. This lane is allowed but capped so it cannot dominate the attention scan.",
      "- personal_context: identity, stressors, emotional context, and other small durable context about {userName}.",
      "- relationship_context: relational expectations between you and {userName}, trust patterns, boundaries, and interaction style.",
      "- other: useful durable context that does not fit a more specific lane.",
    ].map(personalize).join("\n");
  }

  return [
    "Long-Window Curator Lanes:",
    "- new_durable_context: genuinely new durable context about {userName}, you, people, places, projects, systems, preferences, or life context.",
    "- changed_context: existing active memory is materially stale, incomplete, or inaccurate and may need a real update.",
    "- resolved_context: an active canon concern, blocker, project, stressor, plan, or open loop is now closed or no longer current.",
    "- reinforced_context: repeated evidence strengthens known context; usually choose no action unless memory is missing or materially incomplete.",
    "- project_work_system: substantial project, work, or technical system context. This lane is useful but should not dominate every run.",
    "- personal_context: identity, preferences, people, places, routines, stressors, health, or other durable context about {userName}.",
    "- relationship_context: dynamics between you and {userName}, rituals, boundaries, trust patterns, and interaction expectations.",
    "- other: useful durable context that does not fit a more specific lane.",
  ].map(personalize).join("\n");
}

function buildDiscoveryLaneFocus(laneDefinition = null, { userName = "the user", personaName = "Ghostlight" } = {}) {
  if (!laneDefinition) {
    return "";
  }

  const personalize = (line) => personalizeLaneText(line, { userName, personaName });
  return [
    laneDefinition.label,
    "",
    ...laneDefinition.guidance.map((line) => `- ${personalize(line)}`),
    Array.isArray(laneDefinition.domainPalette) && laneDefinition.domainPalette.length
      ? `- Domain palette for this pass: ${laneDefinition.domainPalette.join(", ")}.`
      : "",
    `- Expected output lanes for this pass: ${laneDefinition.outputLanes}.`,
    "- A quiet lane with zero candidates is a successful result when the source window has no clear matching signal.",
    "- Do not collect candidates outside this lane just because they are visible in the source text.",
  ].filter(Boolean).join("\n");
}

module.exports = {
  ATTENTION_DISCOVERY_LANES,
  ATTENTION_LANE_CAPS,
  ATTENTION_PROJECT_DOMAINS,
  ATTENTION_SCAN_KIND,
  CURATOR_CANDIDATE_LANES,
  CURATOR_DISCOVERY_LANES,
  CURATOR_LANE_CAPS,
  buildDiscoveryLaneFocus,
  buildLaneGuidance,
};
