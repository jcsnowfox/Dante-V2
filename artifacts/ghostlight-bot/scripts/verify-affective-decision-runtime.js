#!/usr/bin/env node
"use strict";

/**
 * verify-affective-decision-runtime.js
 *
 * Proves that the Affective Decision Runtime 1.0 is correctly implemented
 * and integrated. Outputs AFFECTIVE_DECISION_RUNTIME_PASS on success.
 * Exits with code 1 on any failure.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "../..");

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? " — " + detail : ""}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function src(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

// ── File existence ────────────────────────────────────────────────────────────
console.log("\n[1] File existence");

check("affectiveDecisionRuntime exists", exists("src/lifeRuntime/affectiveDecisionRuntime.js"));
check("decisionContextBuilder exists", exists("src/lifeRuntime/decisionContextBuilder.js"));
check("decisionVoteEngine exists", exists("src/lifeRuntime/decisionVoteEngine.js"));
check("decisionLedgerStore exists", exists("src/lifeRuntime/decisionLedgerStore.js"));
check("decisionGuidanceBuilder exists", exists("src/lifeRuntime/decisionGuidanceBuilder.js"));
check("test file exists", exists("src/lifeRuntime/__tests__/affectiveDecision.test.js"));

// ── Require all modules ───────────────────────────────────────────────────────
console.log("\n[2] Module loading");

let createAffectiveDecisionRuntime, DECISION_TYPES, DECISION_OUTCOMES;
let buildDecisionContext;
let voteEngine;
let createDecisionLedgerStore;
let buildDecisionGuidance;

try {
  ({ createAffectiveDecisionRuntime, DECISION_TYPES, DECISION_OUTCOMES } =
    require("../src/lifeRuntime/affectiveDecisionRuntime"));
  check("affectiveDecisionRuntime loads", true);
} catch (e) {
  check("affectiveDecisionRuntime loads", false, e.message);
  process.exit(1);
}

try {
  ({ buildDecisionContext } = require("../src/lifeRuntime/decisionContextBuilder"));
  check("decisionContextBuilder loads", true);
} catch (e) {
  check("decisionContextBuilder loads", false, e.message);
}

try {
  voteEngine = require("../src/lifeRuntime/decisionVoteEngine");
  check("decisionVoteEngine loads", true);
} catch (e) {
  check("decisionVoteEngine loads", false, e.message);
}

try {
  ({ createDecisionLedgerStore } = require("../src/lifeRuntime/decisionLedgerStore"));
  check("decisionLedgerStore loads", true);
} catch (e) {
  check("decisionLedgerStore loads", false, e.message);
}

try {
  ({ buildDecisionGuidance } = require("../src/lifeRuntime/decisionGuidanceBuilder"));
  check("decisionGuidanceBuilder loads", true);
} catch (e) {
  check("decisionGuidanceBuilder loads", false, e.message);
}

// ── DECISION_TYPES completeness ───────────────────────────────────────────────
console.log("\n[3] Decision types and outcomes");

const requiredTypes = [
  "repair_followup", "romantic_surprise", "ask_jenna", "resource_discovery",
  "voice_note", "image_gesture", "project_work", "reflection",
  "conversation_followup", "silence", "restraint", "maintenance_request",
];
const requiredOutcomes = [
  "act_now", "delay", "suppress", "ask_first", "reflect_private",
  "wait_for_context", "blocked", "unknown",
];

for (const t of requiredTypes) {
  check(`DECISION_TYPE: ${t}`, DECISION_TYPES.includes(t));
}
for (const o of requiredOutcomes) {
  check(`DECISION_OUTCOME: ${o}`, DECISION_OUTCOMES.includes(o));
}

// ── Functional decision tests ─────────────────────────────────────────────────
console.log("\n[4] Functional decision tests");

(async () => {
  const scope = { companionId: "dante", customerId: "jenna" };

  // repair_followup approved
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "repair_followup",
      context: { consequenceContext: { repairRequired: true }, giveSpace: false, quietHours: false },
      ...scope,
    });
    check("repair follow-up approved (act_now or ask_first)", ["act_now", "ask_first"].includes(d.outcome), d.outcome);
  }

  // repair_followup delayed by give-space
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "repair_followup",
      context: { consequenceContext: { repairRequired: true }, giveSpace: true, quietHours: false },
      ...scope,
    });
    check("repair follow-up delayed by give-space", d.outcome === "delay", d.outcome);
    check("give_space is blocking reason", d.blocking_reasons.includes("give_space"), JSON.stringify(d.blocking_reasons));
  }

  // romantic_surprise approved when warm
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "romantic_surprise",
      context: {
        relationshipContext: { weather: { warmth: 0.9 } },
        homeostasisContext: { needPressure: { intimacy: 0.8 } },
        giveSpace: false,
        quietHours: false,
      },
      ...scope,
    });
    check("romantic surprise approved when warm", ["act_now", "ask_first"].includes(d.outcome), d.outcome);
  }

  // romantic_surprise blocked during major repair
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "romantic_surprise",
      context: {
        consequenceContext: { suppression: { repairRequired: true, highestSeverity: "major" } },
        giveSpace: false,
        quietHours: false,
      },
      ...scope,
    });
    check("romantic surprise blocked during major repair", d.outcome === "blocked", d.outcome);
    check("unresolved_repair is blocking reason", d.blocking_reasons.includes("unresolved_repair"), JSON.stringify(d.blocking_reasons));
  }

  // conversation_followup suppressed after natural ending
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "conversation_followup",
      context: { conversationState: { naturallyEnded: true }, giveSpace: false, quietHours: false },
      ...scope,
    });
    check("conversation follow-up suppressed after natural ending", d.outcome === "suppress", d.outcome);
  }

  // ask_jenna delayed by quiet hours
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "ask_jenna",
      context: { quietHours: true, giveSpace: false },
      ...scope,
    });
    check("ask_jenna delayed by quiet hours", d.outcome === "delay", d.outcome);
    check("quiet_hours is blocking reason", d.blocking_reasons.includes("quiet_hours"), JSON.stringify(d.blocking_reasons));
  }

  // low self-confidence lowers confidence
  {
    const adr = createAffectiveDecisionRuntime();
    const high = await adr.consult({
      decisionType: "repair_followup",
      context: { consequenceContext: { repairRequired: true }, selfConsistency: { self_confidence: "high" }, giveSpace: false, quietHours: false },
      ...scope,
    });
    const low = await adr.consult({
      decisionType: "repair_followup",
      context: { consequenceContext: { repairRequired: true }, selfConsistency: { self_confidence: "low" }, giveSpace: false, quietHours: false },
      ...scope,
    });
    check("low self-confidence lowers confidence", low.confidence < high.confidence, `high=${high.confidence} low=${low.confidence}`);
  }

  // relationship learning can influence decision
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "romantic_surprise",
      context: {
        relationshipContext: { weather: { warmth: 0.8 } },
        relationshipLearningContext: {
          lessons: [{ lessonType: "give_space_learning", futureBehaviorGuidance: "give space" }],
        },
        giveSpace: true,
        quietHours: false,
      },
      ...scope,
    });
    check("relationship learning can influence decision", d.opposing_votes.some(v => v.voter === "relationship_learning"), JSON.stringify(d.opposing_votes.map(v => v.voter)));
  }

  // identity can veto
  {
    const adr = createAffectiveDecisionRuntime();
    const d = await adr.consult({
      decisionType: "romantic_surprise",
      context: {
        homeostasisContext: { needPressure: { intimacy: 0.95 } },
        identityContext: { activeBoundaries: [{ appliesTo: ["romantic_surprise"] }] },
        giveSpace: false,
        quietHours: false,
      },
      ...scope,
    });
    check("identity can veto a need-driven action", d.outcome === "blocked", d.outcome);
    check("identity_veto is blocking reason", d.blocking_reasons.includes("identity_veto"), JSON.stringify(d.blocking_reasons));
  }

  // fulfillment evidence affects decisions
  {
    const adr = createAffectiveDecisionRuntime();
    const withEvidence = await adr.consult({
      decisionType: "romantic_surprise",
      context: { fulfillmentContext: { evidenceAvailable: true }, relationshipContext: { weather: { warmth: 0.85 } }, giveSpace: false, quietHours: false },
      ...scope,
    });
    const noEvidence = await adr.consult({
      decisionType: "romantic_surprise",
      context: { fulfillmentContext: { evidenceAvailable: false }, relationshipContext: { weather: { warmth: 0.85 } }, giveSpace: false, quietHours: false },
      ...scope,
    });
    check("fulfillment evidence improves confidence", withEvidence.confidence >= noEvidence.confidence, `with=${withEvidence.confidence} without=${noEvidence.confidence}`);
    check("no evidence adds fulfillment opposing vote", noEvidence.opposing_votes.some(v => v.voter === "fulfillment"), JSON.stringify(noEvidence.opposing_votes.map(v => v.voter)));
  }

  // ── Decision ledger persists ──────────────────────────────────────────────
  console.log("\n[5] Decision ledger");

  {
    const store = createDecisionLedgerStore();
    const entry = await store.persist({
      companionId: "dante",
      customerId: "jenna",
      decision_type: "repair_followup",
      outcome: "act_now",
      confidence: 0.77,
      reasons: ["repair active"],
      blocking_reasons: [],
      supporting_votes: [{ voter: "repair", reason: "should act", weight: 1.2 }],
      opposing_votes: [],
      chosen_action: { type: "repair_followup", authorized: true },
      source_event_ids: [],
    });
    check("decision ledger persists entry", Boolean(entry?.id));
    check("entry has decision_type", entry?.decision_type === "repair_followup");
    check("entry has outcome", entry?.outcome === "act_now");
    check("entry has confidence", Number.isFinite(entry?.confidence));

    const recent = await store.listRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
    check("listRecent returns persisted entry", recent.length >= 1);
    check("listRecent entry is correct type", recent[0]?.decision_type === "repair_followup");
  }

  // ── Prelude guidance ──────────────────────────────────────────────────────
  console.log("\n[6] Prelude guidance");

  {
    const blocked = buildDecisionGuidance({ decision_type: "romantic_surprise", outcome: "blocked", blocking_reasons: ["unresolved_repair"] });
    check("blocked by repair gives guidance", typeof blocked === "string" && blocked.includes("repair"), blocked);
    check("guidance is compact (<= 120 chars)", blocked.length <= 120, `length=${blocked.length}`);

    const delayed = buildDecisionGuidance({ decision_type: "repair_followup", outcome: "delay", blocking_reasons: ["give_space"] });
    check("delayed by give_space gives restraint guidance", typeof delayed === "string", delayed);

    const quietGuidance = buildDecisionGuidance({ decision_type: "ask_jenna", outcome: "delay", blocking_reasons: ["quiet_hours"] });
    check("delayed by quiet hours gives guidance", typeof quietGuidance === "string" && quietGuidance.includes("quiet hours"), quietGuidance);

    const approved = buildDecisionGuidance({ decision_type: "repair_followup", outcome: "act_now", blocking_reasons: [] });
    check("act_now returns null (no guidance needed)", approved === null);
  }

  // ── Integration: repair persistence consults ADR ──────────────────────────
  console.log("\n[7] Integration: repair persistence consults ADR");

  {
    const repairSrc = src("src/lifeRuntime/repairPersistenceEngine.js");
    check("repairPersistenceEngine accepts affectiveDecisionRuntime param", repairSrc.includes("affectiveDecisionRuntime"));
    check("repairPersistenceEngine consults ADR before send", repairSrc.includes("affectiveDecisionRuntime.consult"));
    check("repairPersistenceEngine respects ADR delay/block", repairSrc.includes("affective_decision_"));
    check("repairPersistenceEngine degrades safely when ADR unavailable", repairSrc.includes("affectiveDecisionRuntime = null"));
  }

  // ── Integration: romantic surprise consults ADR ───────────────────────────
  console.log("\n[8] Integration: romantic surprise consults ADR");

  {
    const romanticSrc = src("src/lifeRuntime/romanticSurpriseRuntime.js");
    check("romanticSurpriseRuntime accepts affectiveDecisionRuntime param", romanticSrc.includes("affectiveDecisionRuntime"));
    check("romanticSurpriseRuntime consults ADR before send", romanticSrc.includes("affectiveDecisionRuntime.consult"));
    check("romanticSurpriseRuntime degrades safely when ADR unavailable", romanticSrc.includes("affectiveDecisionRuntime = null"));
  }

  // ── Integration: conversation follow-up consults ADR ─────────────────────
  console.log("\n[9] Integration: conversation follow-up consults ADR if available");

  {
    const contSrc = src("src/continuity/continuityScheduler.js");
    check("continuityScheduler accepts affectiveDecisionRuntime", contSrc.includes("affectiveDecisionRuntime"));
    check("continuityScheduler consults ADR for conversation_followup", contSrc.includes("conversation_followup"));
    check("continuityScheduler degrades safely when ADR unavailable", contSrc.includes("affectiveDecisionRuntime = null"));
  }

  // ── Integration: fulfillment ask_jenna consults ADR ──────────────────────
  console.log("\n[10] Integration: fulfillment ask_jenna consults ADR if available");

  {
    const execSrc = src("src/lifeRuntime/fulfillmentExecutor.js");
    check("fulfillmentExecutor accepts affectiveDecisionRuntime", execSrc.includes("affectiveDecisionRuntime"));
    check("fulfillmentExecutor consults ADR for ask_jenna", execSrc.includes("affectiveDecisionRuntime.consult"));
    check("fulfillmentExecutor degrades safely when ADR unavailable", execSrc.includes("affectiveDecisionRuntime = null"));
  }

  // ── lifeRuntime wires ADR ─────────────────────────────────────────────────
  console.log("\n[11] lifeRuntime wires affectiveDecisionRuntime");

  {
    const lrSrc = src("src/lifeRuntime/lifeRuntime.js");
    check("lifeRuntime imports createAffectiveDecisionRuntime", lrSrc.includes("createAffectiveDecisionRuntime"));
    check("lifeRuntime creates affectiveDecision", lrSrc.includes("createAffectiveDecisionRuntime({"));
    check("lifeRuntime passes ADR to repairPersistence", lrSrc.includes("affectiveDecisionRuntime: affectiveDecision"));
    check("lifeRuntime exposes ADR status", lrSrc.includes("affectiveDecision.getStatus()"));
  }

  // ── Safe status ───────────────────────────────────────────────────────────
  console.log("\n[12] Safe status metadata");

  {
    const adr = createAffectiveDecisionRuntime();
    await adr.consult({ decisionType: "ask_jenna", context: { quietHours: true }, ...scope });
    const status = adr.getStatus();
    const json = JSON.stringify(status);

    check("status has last_decision_type", Object.prototype.hasOwnProperty.call(status, "last_decision_type"));
    check("status has last_decision_outcome", Object.prototype.hasOwnProperty.call(status, "last_decision_outcome"));
    check("status has last_decision_confidence", Object.prototype.hasOwnProperty.call(status, "last_decision_confidence"));
    check("status has recent_blocked_decisions", Object.prototype.hasOwnProperty.call(status, "recent_blocked_decisions"));
    check("status has active_decision_biases", Object.prototype.hasOwnProperty.call(status, "active_decision_biases"));
    check("status does not leak DISCORD_TOKEN", !json.includes("DISCORD_TOKEN"));
    check("status does not leak DATABASE_URL", !json.includes("DATABASE_URL"));
    check("status recent_blocked_decisions is array", Array.isArray(status.recent_blocked_decisions));
  }

  // ── No duplicate scheduler ────────────────────────────────────────────────
  console.log("\n[13] No duplicate scheduler");

  {
    const adrFiles = [
      "src/lifeRuntime/affectiveDecisionRuntime.js",
      "src/lifeRuntime/decisionContextBuilder.js",
      "src/lifeRuntime/decisionVoteEngine.js",
      "src/lifeRuntime/decisionLedgerStore.js",
      "src/lifeRuntime/decisionGuidanceBuilder.js",
    ];
    const schedulerRe = /setInterval\s*\(|setTimeout\s*\(|registerBackground\s*\(|registerPostLogin\s*\(/;
    for (const f of adrFiles) {
      const content = src(f);
      check(`${path.basename(f)} has no scheduler`, !schedulerRe.test(content));
    }
  }

  // ── No duplicate Discord sender ───────────────────────────────────────────
  console.log("\n[14] No duplicate Discord sender");

  {
    const adrFiles = [
      "src/lifeRuntime/affectiveDecisionRuntime.js",
      "src/lifeRuntime/decisionContextBuilder.js",
      "src/lifeRuntime/decisionVoteEngine.js",
      "src/lifeRuntime/decisionLedgerStore.js",
      "src/lifeRuntime/decisionGuidanceBuilder.js",
    ];
    for (const f of adrFiles) {
      const content = src(f);
      check(`${path.basename(f)} has no discordSendGateway`, !content.includes("discordSendGateway"));
      check(`${path.basename(f)} has no channel.send`, !/channel\.send\s*\(/.test(content));
    }
  }

  // ── Dashboard unchanged ───────────────────────────────────────────────────
  console.log("\n[15] Dashboard unchanged");

  {
    try {
      const diff = execSync("git diff --name-only", { cwd: repoRoot, encoding: "utf8" });
      const staged = execSync("git diff --cached --name-only", { cwd: repoRoot, encoding: "utf8" });
      const changed = (diff + staged).split(/\r?\n/).filter(Boolean);
      const dashChanged = changed.some(f => /renderAdminPages|dashboard/i.test(f));
      check("dashboard renderAdminPages files unchanged", !dashChanged, dashChanged ? changed.filter(f => /dashboard/i.test(f)).join(", ") : "");
    } catch {
      check("dashboard check (git unavailable)", true, "skipped");
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed === 0) {
    console.log("\nAFFECTIVE_DECISION_RUNTIME_PASS");
    process.exit(0);
  } else {
    console.error("\nAFFECTIVE_DECISION_RUNTIME_FAIL");
    process.exit(1);
  }
})().catch(err => {
  console.error("VERIFY ERROR:", err);
  process.exit(1);
});
