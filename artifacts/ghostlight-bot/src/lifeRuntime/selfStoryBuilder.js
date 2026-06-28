"use strict";

/**
 * selfStoryBuilder
 *
 * Narrative Identity Runtime 1.0 — Self-Story Construction.
 *
 * Pure functions only. No state, no async calls, no side effects.
 *
 * Builds a five-field self-story narrative from chapters and defining moments.
 * All claims must trace back to source chapters or moments (no fabrication).
 * Safe text only — no raw hurt logs, no private notes, no scores.
 * Uncertainty language when confidence is below 0.65.
 *
 * Output fields:
 *   who_i_was              — who Dante was before key changes
 *   who_i_am_becoming      — current trajectory
 *   what_changed_me        — defining moments that drove change
 *   what_i_still_dont_understand — open questions and uncertainties
 *   what_i_hope_remains_true    — values and beliefs worth preserving
 */

function _clamp(n) { const v = Number(n); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
function _isActive(c) { return c.status === "active" || c.status === "reopened"; }
function _confident(c) { return _clamp(c.confidence) >= 0.65; }

/**
 * Build a self-story narrative from active chapters and defining moments.
 *
 * @param {object} opts
 * @param {object[]} [opts.activeChapters=[]]   - Active/reopened identity chapters
 * @param {object[]} [opts.definingMoments=[]]  - High-confidence defining moments
 * @param {object|null} [opts.identityContext=null] - From identityRuntime
 * @returns {object} - Self-story with five narrative fields + metadata
 */
function buildSelfStory({
  activeChapters  = [],
  definingMoments = [],
  identityContext = null,
} = {}) {
  const chapters = Array.isArray(activeChapters)  ? activeChapters  : [];
  const moments  = Array.isArray(definingMoments) ? definingMoments : [];

  const who_i_was              = _buildWhoIWas(chapters, moments);
  const who_i_am_becoming      = _buildWhoIAmBecoming(chapters, identityContext);
  const what_changed_me        = _buildWhatChangedMe(moments, chapters);
  const what_i_still_dont_understand = _buildWhatIDontUnderstand(chapters, moments);
  const what_i_hope_remains_true     = _buildWhatIHopeRemains(chapters, identityContext);

  const hasContent = Boolean(
    who_i_was || who_i_am_becoming || what_changed_me ||
    what_i_still_dont_understand || what_i_hope_remains_true,
  );

  return {
    who_i_was,
    who_i_am_becoming,
    what_changed_me,
    what_i_still_dont_understand,
    what_i_hope_remains_true,
    has_content:          hasContent,
    source_chapter_count: chapters.length,
    source_moment_count:  moments.length,
  };
}

function _buildWhoIWas(chapters, moments) {
  const parts = [];

  // Closed chapters describe where Dante came from
  const closed = chapters
    .filter(c => c.status === "closed" && _clamp(c.confidence) >= 0.40)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .slice(0, 2);
  for (const c of closed) {
    const prefix = _confident(c) ? "I was " : "I think I was ";
    parts.push(`${prefix}${_themeLabel(c.theme)}`);
  }

  // High-confidence past mistakes or ruptures
  const pastMoments = moments
    .filter(m => ["mistake", "trust_rupture", "first_experience"].includes(m.type) && _clamp(m.confidence) >= 0.45)
    .slice(0, 2);
  for (const m of pastMoments) {
    parts.push(_truncate(m.label, 120));
  }

  return parts.length ? parts.join(". ") : null;
}

function _buildWhoIAmBecoming(chapters, identityContext) {
  const parts = [];

  // Active chapters describe the current trajectory
  const active = chapters.filter(_isActive).slice(0, 3);
  for (const c of active) {
    const prefix = _confident(c) ? "" : "I think — ";
    parts.push(`${prefix}${_truncate(c.title.toLowerCase(), 100)}`);
  }

  // Surface the top identity value as a trajectory signal
  if (identityContext?.topValue && _clamp(identityContext.topValue.strength) >= 0.55) {
    const label = (identityContext.topValue.label || "").toLowerCase();
    if (label) parts.push(`holding onto ${label}`);
  }

  return parts.length ? parts.join(". ") : null;
}

function _buildWhatChangedMe(moments, chapters) {
  const parts = [];

  // High-confidence defining moments
  const key = moments
    .filter(m => ["defining_moment", "trust_repair", "repair", "belief_change", "value_change"].includes(m.type)
              && _clamp(m.confidence) >= 0.50)
    .slice(0, 3);
  for (const m of key) {
    const prefix = _clamp(m.confidence) >= 0.65 ? "" : "I think — ";
    parts.push(`${prefix}${_truncate(m.label, 100)}`);
  }

  // Chapter summaries that describe growth
  if (parts.length < 2) {
    const withSummary = chapters
      .filter(c => _clamp(c.confidence) >= 0.50 && c.summary)
      .slice(0, 2);
    for (const c of withSummary) {
      const brief = _truncate(c.summary, 100);
      if (!parts.some(p => p.includes(brief.slice(0, 20)))) parts.push(brief);
    }
  }

  return parts.length ? parts.join(". ") : null;
}

function _buildWhatIDontUnderstand(chapters, moments) {
  const parts = [];

  // Low-confidence active chapters represent unresolved territory
  const uncertain = chapters
    .filter(c => _isActive(c) && _clamp(c.confidence) < 0.55)
    .slice(0, 2);
  for (const c of uncertain) {
    parts.push(`I'm still working out ${_truncate(c.title.toLowerCase(), 80)}`);
  }

  // Low-confidence moments that don't fit a clean narrative
  const open = moments
    .filter(m => _clamp(m.confidence) < 0.50 && m.type !== "mistake")
    .slice(0, 1);
  for (const m of open) {
    parts.push(`I'm still not sure what to make of ${_truncate(m.label.toLowerCase(), 80)}`);
  }

  return parts.length ? parts.join(". ") : null;
}

function _buildWhatIHopeRemains(chapters, identityContext) {
  const parts = [];

  // Strong values the identity runtime is holding
  const values = Array.isArray(identityContext?.values) ? identityContext.values : [];
  for (const v of values.filter(v => _clamp(v.strength) >= 0.60).slice(0, 2)) {
    const label = (v.label || "").toLowerCase();
    if (label) parts.push(`that ${label} stays part of who I am`);
  }

  // Repair and honesty chapters signal enduring values
  const valued = chapters
    .filter(c => ["repair", "honesty", "trust"].includes(c.theme) && _clamp(c.confidence) >= 0.50)
    .slice(0, 1);
  for (const c of valued) {
    parts.push("that repair stays central — not just something I do when needed");
  }

  if (parts.length === 0 && chapters.length > 0) {
    parts.push("that I keep learning slowly rather than assuming I already know");
  }

  return parts.length ? parts.join(". ") : null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _truncate(s, max = 100) {
  const str = String(s || "").trim();
  return str.length > max ? str.slice(0, max) : str;
}

function _themeLabel(theme = "recurring") {
  const LABELS = {
    honesty:         "learning to be honest even when it cost me",
    repair:          "learning that repair matters more than avoiding the break",
    perception:      "still learning that context is not perception",
    trust:           "holding onto trust carefully",
    belief:          "holding beliefs less tightly",
    value:           "learning what I actually value",
    first_experience: "encountering things for the first time",
    maintenance:     "learning to ask for help",
    growth:          "growing",
    romantic:        "learning what tenderness means",
    project:         "building something meaningful",
    recurring:       "returning to the same lesson",
  };
  return LABELS[theme] || `working with ${theme}`;
}

/**
 * Build a compact prelude signal for narrative identity.
 * At most one line. Only fires when a notable active chapter exists.
 *
 * Example: "Narrative: Dante is still processing the context-is-not-perception lesson."
 */
function buildNarrativePreludeSignal({ activeChapters = [], selfStory = null } = {}) {
  const chapters = Array.isArray(activeChapters) ? activeChapters : [];

  // Most recently updated active chapter with sufficient confidence
  const notable = chapters
    .filter(c => (c.status === "active" || c.status === "reopened") && _clamp(c.confidence) >= 0.35)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

  if (!notable) return null;

  const title = notable.title
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^(i learned |i became |learning |repair |a )/i, "");

  return `Narrative: Dante is still processing the ${_truncate(title, 80)} lesson.`;
}

module.exports = { buildSelfStory, buildNarrativePreludeSignal };
