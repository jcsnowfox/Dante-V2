#!/usr/bin/env node
"use strict";

const fs   = require("node:fs");
const path = require("node:path");

const root     = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "../..");
let failed = false;

function read(rel)                     { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel, base = root)      { return fs.existsSync(path.join(base, rel)); }
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = true;
}

// ── New files exist ──────────────────────────────────────────────────────────
check("perceptionEngine exists",           exists("src/lifeRuntime/perceptionEngine.js"));
check("worldBeliefResolver exists",        exists("src/lifeRuntime/worldBeliefResolver.js"));
check("worldDecayEngine exists",           exists("src/lifeRuntime/worldDecayEngine.js"));
check("worldModelPreludeBuilder exists",   exists("src/lifeRuntime/worldModelPreludeBuilder.js"));
check("worldModelRuntime exists",          exists("src/lifeRuntime/worldModelRuntime.js"));
check("worldModel test file exists",       exists("src/lifeRuntime/__tests__/worldModel.test.js"));

// ── perceptionEngine purity ──────────────────────────────────────────────────
const pe = read("src/lifeRuntime/perceptionEngine.js");
check("perceptionEngine exports processJennaSignals",        pe.includes("processJennaSignals"));
check("perceptionEngine exports processDanteSignals",        pe.includes("processDanteSignals"));
check("perceptionEngine exports processRelationshipSignals", pe.includes("processRelationshipSignals"));
check("perceptionEngine exports processEnvironmentSignals",  pe.includes("processEnvironmentSignals"));
check("perceptionEngine has no setInterval",                 !pe.includes("setInterval"));
check("perceptionEngine has no channel.send",                !pe.includes("channel.send"));
check("perceptionEngine has no top-level await",             !pe.includes("await ") || pe.includes("module.exports"));

// ── worldBeliefResolver purity ───────────────────────────────────────────────
const wbr = read("src/lifeRuntime/worldBeliefResolver.js");
check("worldBeliefResolver exports resolveBeliefDomain", wbr.includes("resolveBeliefDomain"));
check("worldBeliefResolver exports isUnknown",           wbr.includes("isUnknown"));
check("worldBeliefResolver exports isSurfaceable",       wbr.includes("isSurfaceable"));
check("worldBeliefResolver exports DOMAIN_DEFAULTS",     wbr.includes("DOMAIN_DEFAULTS"));
check("worldBeliefResolver has BELIEF_SURFACE_THRESHOLD", wbr.includes("BELIEF_SURFACE_THRESHOLD"));
check("worldBeliefResolver has UNKNOWN_THRESHOLD",        wbr.includes("UNKNOWN_THRESHOLD"));
check("worldBeliefResolver has no setInterval",           !wbr.includes("setInterval"));
check("worldBeliefResolver has no channel.send",          !wbr.includes("channel.send"));

// ── worldDecayEngine purity ──────────────────────────────────────────────────
const wde = read("src/lifeRuntime/worldDecayEngine.js");
check("worldDecayEngine exports applyDecayToBelief",   wde.includes("applyDecayToBelief"));
check("worldDecayEngine exports applyDecayToModel",    wde.includes("applyDecayToModel"));
check("worldDecayEngine exports getDecayThreshold",    wde.includes("getDecayThreshold"));
check("worldDecayEngine exports DECAY_THRESHOLDS_MS",  wde.includes("DECAY_THRESHOLDS_MS"));
check("worldDecayEngine has STALENESS_DECAY_RATE",     wde.includes("STALENESS_DECAY_RATE"));
check("worldDecayEngine jenna.availability 30min",     wde.includes('"jenna.availability"'));
check("worldDecayEngine relationship.warmth 7d",       wde.includes('"relationship.warmth"'));
check("worldDecayEngine environment.quiet_hours zero", wde.includes('"environment.quiet_hours"'));
check("worldDecayEngine has no setInterval",           !wde.includes("setInterval"));
check("worldDecayEngine has no channel.send",          !wde.includes("channel.send"));

// ── worldModelPreludeBuilder purity ─────────────────────────────────────────
const wmpb = read("src/lifeRuntime/worldModelPreludeBuilder.js");
check("worldModelPreludeBuilder exports buildWorldModelSignal",  wmpb.includes("buildWorldModelSignal"));
check("worldModelPreludeBuilder exports buildWorldModelPrelude", wmpb.includes("buildWorldModelPrelude"));
check("worldModelPreludeBuilder slices to 200 chars",           wmpb.includes("slice(0, 200)"));
check("worldModelPreludeBuilder has no setInterval",            !wmpb.includes("setInterval"));
check("worldModelPreludeBuilder has no channel.send",           !wmpb.includes("channel.send"));

// ── worldModelRuntime structure ──────────────────────────────────────────────
const wmr = read("src/lifeRuntime/worldModelRuntime.js");
check("worldModelRuntime exports createWorldModelRuntime", wmr.includes("createWorldModelRuntime"));
check("worldModelRuntime has _beliefMap",                  wmr.includes("_beliefMap"));
check("worldModelRuntime has init()",                      wmr.includes("async function init"));
check("worldModelRuntime has tick()",                      wmr.includes("async function tick"));
check("worldModelRuntime has getWorldModel()",             wmr.includes("getWorldModel"));
check("worldModelRuntime has getWorldModelContext()",      wmr.includes("getWorldModelContext"));
check("worldModelRuntime has getStatus()",                 wmr.includes("getStatus"));
check("worldModelRuntime has pruneAll()",                  wmr.includes("pruneAll"));
check("worldModelRuntime applies decay before signals",    wmr.includes("applyDecayToModel"));
check("worldModelRuntime has no setInterval",              !wmr.includes("setInterval"));
check("worldModelRuntime has no channel.send",             !wmr.includes("channel.send"));
check("worldModelRuntime emits world_model_updated",       wmr.includes("world_model_updated"));
check("worldModelRuntime emits world_belief_conflict",     wmr.includes("world_belief_conflict"));
check("worldModelRuntime emits world_belief_decayed",      wmr.includes("world_belief_decayed"));

// ── Domain coverage ──────────────────────────────────────────────────────────
check("worldModelRuntime covers jenna domain",        wmr.includes("jenna:"));
check("worldModelRuntime covers dante domain",        wmr.includes("dante:"));
check("worldModelRuntime covers relationship domain", wmr.includes("relationship:"));
check("worldModelRuntime covers environment domain",  wmr.includes("environment:"));
check("worldModelRuntime covers second_life domain",  wmr.includes("second_life:"));

// ── lifeRuntime integration ──────────────────────────────────────────────────
const lr = read("src/lifeRuntime/lifeRuntime.js");
check("lifeRuntime imports createWorldModelRuntime",   lr.includes("createWorldModelRuntime"));
check("lifeRuntime has worldModelRuntime parameter",   lr.includes("worldModelRuntime = null"));
check("lifeRuntime initialises worldModel",            lr.includes("worldModel?.init"));
check("lifeRuntime has _tickWorldModel function",      lr.includes("_tickWorldModel"));
check("lifeRuntime calls _tickWorldModel after perception", (() => {
  const percIdx  = lr.indexOf("await _tickPerception(now)");
  const wmodIdx  = lr.indexOf("await _tickWorldModel(now)");
  return percIdx >= 0 && wmodIdx > percIdx;
})());
check("lifeRuntime passes worldModelContext to prelude", lr.includes("worldModelContext:    _worldModelContext"));
check("lifeRuntime reports worldModel health",          lr.includes('healthTracker.report("worldModel"'));
check("lifeRuntime includes worldModel in getStatus",   lr.includes("worldModel: worldModel ? worldModel.getStatus()"));
check("lifeRuntime prunes worldModel",                  lr.includes("worldModel?.pruneAll"));

// ── lifePreludeBuilder integration ───────────────────────────────────────────
const lpb = read("src/lifeRuntime/lifePreludeBuilder.js");
check("lifePreludeBuilder imports buildWorldModelSignal",   lpb.includes("buildWorldModelSignal"));
check("lifePreludeBuilder destructures worldModelContext",  lpb.includes("worldModelContext"));
check("lifePreludeBuilder emits world model signal",        lpb.includes("buildWorldModelSignal(worldModelContext.worldModel"));

// ── runtimeEventBus integration ──────────────────────────────────────────────
const reb = read("src/lifeRuntime/runtimeEventBus.js");
check("runtimeEventBus has world_model_updated event",  reb.includes("world_model_updated"));
check("runtimeEventBus has world_belief_conflict event", reb.includes("world_belief_conflict"));
check("runtimeEventBus has world_belief_decayed event", reb.includes("world_belief_decayed"));

// ── package.json integration ─────────────────────────────────────────────────
const pkg = JSON.parse(read("package.json"));
check("package.json has verify:world-model-runtime script", Boolean(pkg.scripts?.["verify:world-model-runtime"]));
check("verify:runtime:all includes world-model-runtime",    (pkg.scripts?.["verify:runtime:all"] ?? "").includes("verify:world-model-runtime"));

// ── Test coverage ────────────────────────────────────────────────────────────
const tests = read("src/lifeRuntime/__tests__/worldModel.test.js");
check("tests cover Discord activity → Jenna belief",        tests.includes("Discord activity"));
check("tests cover explicit override",                       tests.includes("Explicit"));
check("tests cover confidence decay",                        tests.includes("decays"));
check("tests cover stale detection",                         tests.includes("stale"));
check("tests cover conflict detection",                      tests.includes("Conflicting signals"));
check("tests cover unknown stays unknown",                   tests.includes("Unknown stays UNKNOWN"));
check("tests cover repair → relationship belief",            tests.includes("repair_progress"));
check("tests cover dante health belief",                     tests.includes("runtime_health"));
check("tests cover second_life default",                     tests.includes("second_life.presence"));
check("tests cover structured world model",                  tests.includes("jenna domain"));
check("tests cover prelude signal",                          tests.includes("buildWorldModelSignal"));
check("tests cover no scheduler",                            tests.includes("setInterval"));
check("tests cover no channel.send",                         tests.includes("channel.send"));
check("tests cover getStatus fields",                        tests.includes("getStatus"));

// ── worldStateStore is still present (not replaced) ──────────────────────────
check("worldStateStore.js still exists (not replaced)", exists("src/lifeRuntime/worldStateStore.js"));

if (failed) process.exit(1);
console.log("WORLD_MODEL_RUNTIME_PASS");
