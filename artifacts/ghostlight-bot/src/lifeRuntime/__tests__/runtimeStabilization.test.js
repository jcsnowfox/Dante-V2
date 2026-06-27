"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { sendDiscordMessage } = require("../../discord/discordSendGateway");
const { createRelationshipStateRuntime } = require("../relationshipStateRuntime");
const { createDiagnosticRuntime } = require("../../diagnostics");
const { planWithIdentity } = require("../agencyPlanner");
const { createResourceDiscoveryRuntime } = require("../resourceDiscoveryRuntime");
const {
  bridgeGrowthToIdentity,
  bridgeCuriosityToProjects,
  bridgeProjectsToPurpose,
  bridgeEvidenceToBeliefs,
  bridgeFulfillmentToRelationship,
} = require("../emergenceBridges");

test("canonical Discord gateway validates and sends autonomous/system payloads", async () => {
  const calls = [];
  const channel = { id: "c1", isTextBased: () => true, send: async (payload) => { calls.push(payload); return { id: "m1", channelId: "c1" }; } };
  const result = await sendDiscordMessage({ channel, content: "hello", label: "test" });
  assert.equal(result.sent, true);
  assert.equal(result.messageId, "m1");
  assert.deepEqual(calls[0].allowedMentions, { parse: [] });
});

test("relationshipStateRuntime creates one safe canonical read snapshot", () => {
  const rt = createRelationshipStateRuntime();
  const snapshot = rt.buildSnapshot({ relationshipContext: { weatherSummary: "warm", activeRitualsCount: 2, traditionsCount: 1, insideJokeCount: 3, chapter: "settled" }, consequenceContext: { activeCount: 1, suppression: { repairRequired: true, giveSpace: true, suppressed: ["random_meme"] } } });
  assert.equal(snapshot.repair.required, true);
  assert.equal(snapshot.giveSpace, true);
  assert.equal(snapshot.rituals, 2);
  assert.equal(snapshot.timelineChapter, "settled");
});

test("diagnosticRuntime exposes read-only diagnostic status", () => {
  const rt = createDiagnosticRuntime({ config: { innerLife: { autonomyChannelId: "a", diagnosticChannelId: "d" } }, selfConsistencyMonitor: { getStatus: () => ({ self_confidence: "low" }) }, innerLife: { observeInteraction() {} } });
  const status = rt.getStatus();
  assert.equal(status.selfConsistency.self_confidence, "low");
  assert.equal(status.diagnosticChannel, "d");
  assert.equal(status.autonomyChannel, "a");
});

test("Growth to Identity bridge reinforces identity", async () => {
  const calls = [];
  const result = await bridgeGrowthToIdentity({ companionId: "d", customerId: "u", identityRuntime: { reinforce: async (x) => calls.push(x), recordJournal: async () => {} }, growthEvent: { kind: "skill_practiced", evidence: "Practiced piano" } });
  assert.equal(result.link, "growth_to_identity");
  assert.equal(calls[0].valueKey, "growth");
});

test("Curiosity to Projects bridge creates one thresholded project", async () => {
  const created = [];
  const projectEngine = { getProjects: async () => [], createProject: async (x) => { created.push(x); return { id: 7, ...x }; } };
  const result = await bridgeCuriosityToProjects({ companionId: "d", customerId: "u", projectEngine, curiosityContext: { maturingCount: 3, attentionFocus: { focus: "old radios" } } });
  assert.equal(result.link, "curiosity_to_projects");
  assert.match(created[0].title, /old radios/);
});

test("Projects to Purpose bridge notifies purpose through Homeostasis", async () => {
  const calls = [];
  const result = await bridgeProjectsToPurpose({ companionId: "d", customerId: "u", homeostasisRuntime: { notifySuccess: async (x) => calls.push(x) }, growthContext: { activeProject: { id: 1, title: "repair bench", progress: 0.4 } } });
  assert.equal(result.link, "projects_to_purpose");
  assert.match(calls[0].label, /repair bench/);
});

test("Beliefs can alter agency planning", () => {
  const plan = planWithIdentity({ needType: "connection", urgency: 0.8 }, { jennaIsAvailable: true }, { beliefs: [{ beliefKey: "give_space", statement: "Don't ask Jenna when she needs space" }] });
  assert.equal(plan.reason, "identity_belief_jenna_space");
  assert.equal(plan.canAskJenna, false);
});

test("Preferences influence resource ranking", () => {
  const rt = createResourceDiscoveryRuntime();
  const ranked = rt.rankResourcesByPreferences([{ title: "A book about jazz" }, { title: "A book about tax law" }], [{ item: "jazz", strength: 2 }], [{ item: "tax", strength: 2 }]);
  assert.equal(ranked[0].title, "A book about jazz");
});

test("Evidence to Beliefs bridge is conservative and evidence-gated", async () => {
  const calls = [];
  const identityRuntime = { addBelief: async (x) => calls.push(["add", x]), reviseBelief: async (x) => calls.push(["revise", x]) };
  const skipped = await bridgeEvidenceToBeliefs({ companionId: "d", customerId: "u", identityRuntime, result: { outcome: "SUCCESS", evidence: {} }, needType: "growth" });
  assert.equal(skipped, null);
  const result = await bridgeEvidenceToBeliefs({ companionId: "d", customerId: "u", identityRuntime, result: { outcome: "SUCCESS", evidence: { messageId: "m" } }, needType: "growth" });
  assert.equal(result.link, "evidence_to_beliefs");
  assert.equal(calls.length, 2);
});

test("Fulfillment to Relationship bridge warms only evidence-backed successful outcomes", async () => {
  const events = [];
  const engine = { recordEvent: async (x) => { events.push(x); return x; } };
  const result = await bridgeFulfillmentToRelationship({ companionId: "d", customerId: "u", relationalConsequencesEngine: engine, result: { outcome: "SUCCESS", note: "Jenna request fulfilled" }, needType: "connection", plan: { strategy: "ask_jenna" } });
  assert.equal(result.link, "fulfillment_to_relationship");
  assert.equal(events[0].eventType, "trust_growth");
});
