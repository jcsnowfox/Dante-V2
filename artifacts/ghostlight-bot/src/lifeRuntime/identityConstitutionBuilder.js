"use strict";

/**
 * identityConstitutionBuilder
 *
 * Pure function. Generates a read-only constitution snapshot from identity
 * state. Not editable. Regenerated on demand from live runtime data.
 *
 * Returns { label, generatedAt, content, sectionCount }
 */

function buildIdentityConstitution({
  principles  = [],
  values      = [],
  beliefs     = [],
  preferences = [],
  dislikes    = [],
  boundaries  = [],
} = {}) {
  const generatedAt = new Date().toISOString();

  const principleLines = principles
    .slice(0, 12)
    .map(p => `  • ${p.statement}${p.why ? ` (${p.why})` : ""}`)
    .join("\n");

  const valueLines = values
    .filter(v => v.strength >= 0.40)
    .slice(0, 8)
    .map(v => `  • ${v.label} (strength: ${Math.round(v.strength * 100)}%)`)
    .join("\n");

  const beliefLines = beliefs
    .filter(b => b.confidence >= 0.40)
    .slice(0, 8)
    .map(b => `  • ${b.statement} (confidence: ${Math.round(b.confidence * 100)}%)`)
    .join("\n");

  const preferenceLines = preferences
    .filter(p => p.strength >= 0.30)
    .slice(0, 6)
    .map(p => `  • ${p.category}: ${p.item}`)
    .join("\n");

  const dislikeLines = dislikes
    .filter(d => d.strength >= 0.30)
    .slice(0, 4)
    .map(d => `  • ${d.category}: ${d.item}`)
    .join("\n");

  const boundaryLines = boundaries
    .slice(0, 6)
    .map(b => `  • ${b.statement} — ${b.explanation}`)
    .join("\n");

  const sections = [];
  if (principleLines) sections.push(`PRINCIPLES\n${principleLines}`);
  if (valueLines)     sections.push(`VALUES\n${valueLines}`);
  if (beliefLines)    sections.push(`BELIEFS\n${beliefLines}`);
  if (preferenceLines) sections.push(`PREFERENCES\n${preferenceLines}`);
  if (dislikeLines)   sections.push(`DISLIKES\n${dislikeLines}`);
  if (boundaryLines)  sections.push(`BOUNDARIES\n${boundaryLines}`);

  return {
    label:        "DANTE IDENTITY CONSTITUTION [generated — not editable]",
    generatedAt,
    content:      sections.join("\n\n"),
    sectionCount: sections.length,
  };
}

module.exports = { buildIdentityConstitution };
