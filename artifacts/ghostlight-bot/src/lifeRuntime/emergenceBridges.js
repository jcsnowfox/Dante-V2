"use strict";

function normalizeTopic(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ").slice(0, 80); }

async function bridgeGrowthToIdentity({ companionId, customerId, identityRuntime, growthEvent = {}, now = new Date() } = {}) {
  if (!companionId || !identityRuntime) return null;
  const kind = growthEvent.kind || "growth";
  if (!["skill_practiced", "project_progress", "project_completed", "hobby_activity", "collection_growth"].includes(kind)) return null;
  const valueKey = kind.includes("skill") || kind.includes("project") ? "growth" : "curiosity";
  await identityRuntime.reinforce({ companionId, customerId, valueKey, label: valueKey === "growth" ? "Growth" : "Curiosity", evidence: growthEvent.evidence || `Life runtime observed ${kind}`, delta: 0.005, at: now }).catch(() => {});
  if (identityRuntime.recordJournal && (kind === "project_completed" || kind === "skill_practiced")) {
    await identityRuntime.recordJournal({ companionId, customerId, entryType: "growth_signal", content: growthEvent.evidence || `Growth signal: ${kind}`, relatedKey: valueKey, at: now }).catch(() => {});
  }
  return { linked: true, link: "growth_to_identity", valueKey };
}

async function bridgeCuriosityToProjects({ companionId, customerId, curiosityContext, projectEngine, now = new Date() } = {}) {
  if (!companionId || !projectEngine || !curiosityContext) return null;
  const topic = normalizeTopic(curiosityContext.attentionFocus?.focus || curiosityContext.recentInsight?.topic);
  if (!topic || Number(curiosityContext.maturingCount || 0) < 3) return null;
  const active = await projectEngine.getProjects({ companionId, customerId, status: "active" }).catch(() => []);
  if (active.some((p) => normalizeTopic(p.title).includes(topic) || normalizeTopic(p.purpose).includes(topic))) return { skipped: true, reason: "already_project" };
  const project = await projectEngine.createProject({ companionId, customerId, title: `Explore ${topic}`, purpose: `Curiosity matured around ${topic}` }).catch(() => null);
  return project ? { linked: true, link: "curiosity_to_projects", projectId: project.id, at: now } : null;
}

async function bridgeProjectsToPurpose({ companionId, customerId, growthContext, homeostasisRuntime, now = new Date() } = {}) {
  if (!companionId || !homeostasisRuntime || !growthContext?.activeProject) return null;
  const project = growthContext.activeProject;
  if (Number(project.progress || 0) >= 0.25) {
    await homeostasisRuntime.notifySuccess?.({ companionId, customerId, label: `project:${project.title}`, magnitude: Math.min(1, Number(project.progress || 0)), now }).catch(() => {});
    return { linked: true, link: "projects_to_purpose", projectId: project.id };
  }
  if (project.status === "abandoned") {
    await homeostasisRuntime.notifyFailure?.({ companionId, customerId, label: `project:${project.title}`, magnitude: 0.2, now }).catch(() => {});
    return { linked: true, link: "projects_to_purpose", projectId: project.id, outcome: "failure" };
  }
  return null;
}

async function bridgeEvidenceToBeliefs({ companionId, customerId, identityRuntime, result, needType = "", now = new Date() } = {}) {
  if (!companionId || !identityRuntime || !result) return null;
  if (!["SUCCESS", "PARTIAL"].includes(result.outcome)) return null;
  const evidence = result.evidence || result.recorded?.evidence || {};
  if (!evidence || Object.keys(evidence).length === 0) return null;
  const beliefKey = `evidence_${String(needType || "agency").replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
  await identityRuntime.addBelief?.({ companionId, customerId, beliefKey, statement: `Evidence can support ${needType || "agency"} without pretending.`, source: "fulfillment_evidence", confidence: 0.52, at: now }).catch(() => {});
  await identityRuntime.reviseBelief?.({ companionId, customerId, beliefKey, evidence: `Repeated evidence-backed fulfillment: ${result.outcome}`, delta: 0.01, direction: "reinforce", at: now }).catch(() => {});
  return { linked: true, link: "evidence_to_beliefs", beliefKey };
}

async function bridgeFulfillmentToRelationship({ companionId, customerId, relationalConsequencesEngine, result, needType = "", plan = {}, now = new Date() } = {}) {
  if (!companionId || !relationalConsequencesEngine?.recordEvent || !result) return null;
  if (!["SUCCESS", "PARTIAL"].includes(result.outcome)) return null;
  const strategy = String(plan.strategy || "");
  let eventType = null;
  if (strategy === "ask_jenna" || result.note?.toLowerCase?.().includes("jenna")) eventType = "trust_growth";
  else if (String(needType).includes("connection") || String(needType).includes("romantic")) eventType = "deep_affection";
  else if (plan.reason === "identity_repair_constraint" || strategy === "deliberate_restraint") eventType = "repair_started";
  if (!eventType) return null;
  const recorded = await relationalConsequencesEngine.recordEvent({ companionId, customerId, eventType, severity: "minor", source: "fulfillment_runtime", summary: `Fulfillment outcome warmed relationship safely: ${strategy}`, now }).catch(() => null);
  return recorded ? { linked: true, link: "fulfillment_to_relationship", eventType } : null;
}

module.exports = { bridgeGrowthToIdentity, bridgeCuriosityToProjects, bridgeProjectsToPurpose, bridgeEvidenceToBeliefs, bridgeFulfillmentToRelationship, normalizeTopic };
