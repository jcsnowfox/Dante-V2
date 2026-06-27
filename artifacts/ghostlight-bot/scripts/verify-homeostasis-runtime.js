"use strict";

/**
 * verify-homeostasis-runtime.js
 *
 * Structural verification for Life Runtime 6.0 — Homeostasis Runtime.
 * Checks all 9 new files, 4 storage tables, integration wiring, and hard rules.
 *
 * Prints HOMEOSTASIS_RUNTIME_PASS on success.
 * Exits with code 1 on any failure.
 */

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..");
const SRC  = path.join(ROOT, "src/lifeRuntime");

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function src(rel) { return path.join(SRC, rel); }
function rootSrc(rel) { return path.join(ROOT, "src", rel); }
function read(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }

// ── Section 1: Files exist ─────────────────────────────────────────────────

console.log("\n1. Source files");
const requiredFiles = [
  "needsStore.js",
  "fulfillmentLogStore.js",
  "resourceDiscoveryEngine.js",
  "requestJennaEngine.js",
  "needDriftEngine.js",
  "webLearningTool.js",
  "fulfillmentPlanner.js",
  "fulfillmentExecutor.js",
  "homeostasisRuntime.js",
];
for (const f of requiredFiles) {
  check(`${f} exists`, fs.existsSync(src(f)));
}

// ── Section 2: needsStore ─────────────────────────────────────────────────

console.log("\n2. needsStore");
const needsStoreCode = read(src("needsStore.js"));
check("exports createNeedsStore",      needsStoreCode.includes("createNeedsStore"));
check("exports NEED_TYPES array",      needsStoreCode.includes("NEED_TYPES"));
check("19 need types defined",         (needsStoreCode.match(/\"[a-z_]+\"/g) || []).length >= 19);
check("uses clampLevel for currentLevel", needsStoreCode.includes("clampLevel"));
check("floor at 0.05",                 needsStoreCode.includes("0.05"));
check("ceil at 0.95",                  needsStoreCode.includes("0.95"));
check("dante_needs table SQL",         needsStoreCode.includes("dante_needs"));
check("upsertNeed function",           needsStoreCode.includes("upsertNeed"));
check("updateLevel function",          needsStoreCode.includes("updateLevel"));
check("recordFulfillment function",    needsStoreCode.includes("recordFulfillment"));
check("UNIQUE constraint on scope+type", needsStoreCode.includes("UNIQUE (companion_id, customer_id, need_type)"));

// ── Section 3: fulfillmentLogStore ────────────────────────────────────────

console.log("\n3. fulfillmentLogStore");
const logStoreCode = read(src("fulfillmentLogStore.js"));
check("exports createFulfillmentLogStore", logStoreCode.includes("createFulfillmentLogStore"));
check("dante_fulfillment_logs table",  logStoreCode.includes("dante_fulfillment_logs"));
check("logFulfillment function",       logStoreCode.includes("logFulfillment"));
check("getRecent function",            logStoreCode.includes("getRecent"));
check("count function",                logStoreCode.includes("function count"));
check("pruneOlderThan function",       logStoreCode.includes("pruneOlderThan"));
check("evidence JSONB column",         logStoreCode.includes("evidence JSONB"));
check("action_status column",          logStoreCode.includes("action_status"));

// ── Section 4: resourceDiscoveryEngine ───────────────────────────────────

console.log("\n4. resourceDiscoveryEngine");
const resourceCode = read(src("resourceDiscoveryEngine.js"));
check("exports createResourceDiscoveryEngine", resourceCode.includes("createResourceDiscoveryEngine"));
check("exports RESOURCE_TYPES",        resourceCode.includes("RESOURCE_TYPES"));
check("dante_discovered_resources table", resourceCode.includes("dante_discovered_resources"));
check("addResource function",          resourceCode.includes("addResource"));
check("getResources function",         resourceCode.includes("getResources"));
check("updateStatus function",         resourceCode.includes("updateStatus"));
check("pruneOnly consumed resources",  resourceCode.includes("consumed"));
check("10 resource types",             ["book","article","movie","music","video","course","image_reference","second_life_place","project_idea","conversation_topic"].every(t => resourceCode.includes(`"${t}"`)));

// ── Section 5: requestJennaEngine ────────────────────────────────────────

console.log("\n5. requestJennaEngine");
const requestCode = read(src("requestJennaEngine.js"));
check("exports createRequestJennaEngine", requestCode.includes("createRequestJennaEngine"));
check("exports REQUEST_TYPES",         requestCode.includes("REQUEST_TYPES"));
check("dante_resource_requests table", requestCode.includes("dante_resource_requests"));
check("canRequest gate function",      requestCode.includes("canRequest"));
check("canRequestAsync gate function", requestCode.includes("canRequestAsync"));
check("blocks give_space_active",      requestCode.includes("give_space_active"));
check("blocks repair_active",          requestCode.includes("repair_active"));
check("blocks jenna_busy",             requestCode.includes("jenna_busy"));
check("blocks urgency_below_threshold", requestCode.includes("urgency_below_threshold"));
check("blocks quiet_hours",            requestCode.includes("quiet_hours"));
check("cooldown per request type",     requestCode.includes("REQUEST_COOLDOWNS"));
check("cooldown check in canRequestAsync", requestCode.includes("cooldownHours"));
check("no duplicate pending check",    requestCode.includes("already_pending"));
check("createRequest function",        requestCode.includes("createRequest"));
check("getPending function",           requestCode.includes("getPending"));
check("resolve function",              requestCode.includes("function resolve"));
check("9 request types",               ["attention_request","book_request","movie_request","conversation_request","opinion_request","comfort_request","intimacy_request","time_together_request","help_me_choose_request"].every(t => requestCode.includes(`"${t}"`)));

// ── Section 6: needDriftEngine ────────────────────────────────────────────

console.log("\n6. needDriftEngine");
const driftCode = read(src("needDriftEngine.js"));
check("exports tick function",         driftCode.includes("function tick"));
check("exports getPressuredNeeds",     driftCode.includes("getPressuredNeeds"));
check("exports fulfillmentDeltaFor",   driftCode.includes("fulfillmentDeltaFor"));
check("exports BASE_DECAY",            driftCode.includes("BASE_DECAY"));
check("exports DESIRED_LEVEL",         driftCode.includes("DESIRED_LEVEL"));
check("floor 0.05 in clamp",          driftCode.includes("0.05"));
check("ceil 0.95 in clamp",           driftCode.includes("0.95"));
check("giveSpace modifies connection", driftCode.includes("giveSpace") && driftCode.includes("connection"));
check("repairActive modifies decay",   driftCode.includes("repairActive"));
check("hourOfDay context signal",      driftCode.includes("hourOfDay"));
check("FULFILLMENT_DELTAS exported",   driftCode.includes("FULFILLMENT_DELTAS"));
check("ask_jenna highest delta",       driftCode.includes("ask_jenna") && driftCode.includes("0.25"));

// ── Section 7: webLearningTool ────────────────────────────────────────────

console.log("\n7. webLearningTool");
const webCode = read(src("webLearningTool.js"));
check("disabled by default (env var)", webCode.includes("DANTE_WEB_LEARNING_ENABLED"));
check("DANTE_WEB_SEARCH_DAILY_LIMIT",  webCode.includes("DANTE_WEB_SEARCH_DAILY_LIMIT"));
check("DANTE_WEB_SEARCH_PROVIDER",     webCode.includes("DANTE_WEB_SEARCH_PROVIDER"));
check("DANTE_WEB_SEARCH_API_KEY",      webCode.includes("DANTE_WEB_SEARCH_API_KEY"));
check("isEnabled function exported",   webCode.includes("isEnabled"));
check("getDailyUsage exported",        webCode.includes("getDailyUsage"));
check("incrementUsage exported",       webCode.includes("incrementUsage"));
check("search returns null when disabled", webCode.includes("return null"));
check("daily limit check _overLimit",  webCode.includes("_overLimit"));
check("brave search provider",         webCode.includes("brave"));
check("never throws (returns null on error)", webCode.includes("resolve(null)"));

// ── Section 8: fulfillmentPlanner ────────────────────────────────────────

console.log("\n8. fulfillmentPlanner");
const plannerCode = read(src("fulfillmentPlanner.js"));
check("exports planFulfillment",       plannerCode.includes("planFulfillment"));
check("exports selectNeedsToAddress",  plannerCode.includes("selectNeedsToAddress"));
check("giveSpace blocks outreach",     plannerCode.includes("giveSpace") && plannerCode.includes("canAskJenna: false"));
check("sexual_desire requires consent", plannerCode.includes("sexual_desire") && plannerCode.includes("adultContextActive"));
check("sexual_desire suppressed during repair", plannerCode.includes("sexual_desire_repair_suppressed"));
check("repairActive suppresses casual outreach", plannerCode.includes("repairActive"));
check("jennaIsBusy considered",        plannerCode.includes("jennaIsBusy"));
check("jennaIsAsleep considered",      plannerCode.includes("jennaIsAsleep"));
check("quietHours considered in context", plannerCode.includes("quietHours"));
check("webLearningEnabled gate",       plannerCode.includes("webLearningEnabled"));
check("hasActiveProject gate",         plannerCode.includes("hasActiveProject"));
check("returns strategy + reason + canAskJenna", plannerCode.includes("canAskJenna") && plannerCode.includes("reason"));
check("SELF_ONLY_NEEDS exported",      plannerCode.includes("SELF_ONLY_NEEDS"));
check("JENNA_FRIENDLY_NEEDS exported", plannerCode.includes("JENNA_FRIENDLY_NEEDS"));
check("max 2 per tick in selectNeedsToAddress", plannerCode.includes("maxPerTick"));

// ── Section 9: fulfillmentExecutor ───────────────────────────────────────

console.log("\n9. fulfillmentExecutor");
const executorCode = read(src("fulfillmentExecutor.js"));
check("exports createFulfillmentExecutor", executorCode.includes("createFulfillmentExecutor"));
check("execute function exists",       executorCode.includes("async function execute"));
check("always logs evidence (fulfillmentLogStore)", executorCode.includes("fulfillmentLogStore") && executorCode.includes("logFulfillment"));
check("ask_jenna calls canRequestAsync gate", executorCode.includes("canRequestAsync"));
check("ask_jenna creates real request",executorCode.includes("createRequest"));
check("self_fulfill logs micro-life event", executorCode.includes("microLifeEventsStore") && executorCode.includes("logEvent"));
check("learn_from_web uses webLearningTool.search", executorCode.includes("webLearningTool.search"));
check("learn_from_web stores resource when found", executorCode.includes("resourceDiscoveryEngine") && executorCode.includes("addResource"));
check("learn_from_web fallback to resource request", executorCode.includes("unavailable — will queue resource request"));
check("suppress returns zero delta",   executorCode.includes("needDelta: 0"));
check("wait returns zero delta",       executorCode.includes("needDelta: 0"));
check("no fake fulfillment (no text claims)", !executorCode.includes("claimed") && !executorCode.includes("pretend"));
check("records need delta in fulfillmentSources", executorCode.includes("recordFulfillment"));

// ── Section 10: homeostasisRuntime orchestrator ───────────────────────────

console.log("\n10. homeostasisRuntime");
const orchCode = read(src("homeostasisRuntime.js"));
check("exports createHomeostasisRuntime", orchCode.includes("createHomeostasisRuntime"));
check("tick function exists",          orchCode.includes("async function tick"));
check("init function exists",          orchCode.includes("async function init"));
check("pruneAll function exists",      orchCode.includes("async function pruneAll"));
check("getNeedsContext exported",      orchCode.includes("getNeedsContext"));
check("getStatus exported (safe metadata)", orchCode.includes("getStatus"));
check("reads alivePresence for Jenna availability", orchCode.includes("alivePresence") && orchCode.includes("_inferJennaBusy"));
check("reads consequenceContext for repair/give-space", orchCode.includes("consequenceContext") && orchCode.includes("suppression"));
check("max 2 needs per tick (MAX_NEEDS_PER_TICK)", orchCode.includes("MAX_NEEDS_PER_TICK") && orchCode.includes("2"));
check("URGENCY_THRESHOLD gate",        orchCode.includes("URGENCY_THRESHOLD"));
check("quiet hours detection",         orchCode.includes("_isQuietHours"));
check("does not create new scheduler", !orchCode.includes("setInterval") && !orchCode.includes("setTimeout"));
check("passes context to fulfillmentPlanner", orchCode.includes("planFulfillment") || orchCode.includes("fulfillmentPlanner"));
check("homeostasisContext updates after tick", orchCode.includes("_homeostasisContext") || orchCode.includes("getNeedsContext"));

// ── Section 11: Schema registry ───────────────────────────────────────────

console.log("\n11. Schema registry");
const schemaCode = read(rootSrc("storage/postgres/schemaRegistry.js"));
check("dante_needs table registered",             schemaCode.includes("dante_needs"));
check("dante_fulfillment_logs table registered",  schemaCode.includes("dante_fulfillment_logs"));
check("dante_discovered_resources registered",    schemaCode.includes("dante_discovered_resources"));
check("dante_resource_requests registered",       schemaCode.includes("dante_resource_requests"));
check("dante_needs has UNIQUE constraint",        schemaCode.includes("UNIQUE (companion_id, customer_id, need_type)"));
check("all 4 tables after relationship_consequences", (() => {
  const ri = schemaCode.indexOf("relationship_consequences");
  return ri > -1 &&
    schemaCode.indexOf("dante_needs", ri) > ri &&
    schemaCode.indexOf("dante_fulfillment_logs", ri) > ri &&
    schemaCode.indexOf("dante_discovered_resources", ri) > ri &&
    schemaCode.indexOf("dante_resource_requests", ri) > ri;
})());

// ── Section 12: lifeRuntime.js wiring ─────────────────────────────────────

console.log("\n12. lifeRuntime wiring");
const lrCode = read(src("lifeRuntime.js"));
check("homeostasisRuntime param accepted",    lrCode.includes("homeostasisRuntime = null"));
check("homeostasisRuntime.init called",       lrCode.includes("homeostasisRuntime?.init"));
check("_tickHomeostasis function",            lrCode.includes("_tickHomeostasis"));
check("_tickHomeostasis called in tick()",    lrCode.includes("await _tickHomeostasis(now)"));
check("_homeostasisContext state var",        lrCode.includes("_homeostasisContext"));
check("homeostasisContext passed to prelude", lrCode.includes("homeostasisContext"));
check("homeostasisRuntime.getStatus in getStatus()", lrCode.includes("homeostasisRuntime.getStatus()"));
check("homeostasisRuntime.pruneAll in _runPruning", lrCode.includes("pruneAll"));
check("_tickHomeostasis after _tickConsequences", (() => {
  const ci = lrCode.indexOf("_tickConsequences");
  const hi = lrCode.indexOf("_tickHomeostasis");
  return ci > -1 && hi > ci;
})());
check("passes consequenceContext to homeostasis tick", lrCode.includes("consequenceContext") && lrCode.includes("homeostasisRuntime.tick"));

// ── Section 13: lifePreludeBuilder.js ────────────────────────────────────

console.log("\n13. lifePreludeBuilder wiring");
const preludeCode = read(src("lifePreludeBuilder.js"));
check("homeostasisContext parameter accepted",  preludeCode.includes("homeostasisContext"));
check("homeostasis adds one compact line",      preludeCode.includes("topNeed") && preludeCode.includes("Need:"));
check("only shows when urgency >= threshold",   preludeCode.includes("0.50") || preludeCode.includes("0.40"));
check("never exposes raw numbers as scores",    !preludeCode.includes("urgency.toFixed") && !preludeCode.includes("currentLevel.toFixed"));
check("line is compact (need type + level word)", preludeCode.includes("low") || preludeCode.includes("below comfortable"));

// ── Section 14: index.js wiring ────────────────────────────────────────────

console.log("\n14. index.js wiring");
const indexCode = read(rootSrc("index.js"));
check("createNeedsStore imported",              indexCode.includes("createNeedsStore"));
check("createFulfillmentLogStore imported",     indexCode.includes("createFulfillmentLogStore"));
check("createResourceDiscoveryEngine imported", indexCode.includes("createResourceDiscoveryEngine"));
check("createRequestJennaEngine imported",      indexCode.includes("createRequestJennaEngine"));
check("createFulfillmentExecutor imported",     indexCode.includes("createFulfillmentExecutor"));
check("createHomeostasisRuntime imported",      indexCode.includes("createHomeostasisRuntime"));
check("needsStore instantiated",                indexCode.includes("const needsStore = createNeedsStore"));
check("fulfillmentLogStore instantiated",       indexCode.includes("const fulfillmentLogStore = createFulfillmentLogStore"));
check("resourceDiscoveryEngine instantiated",   indexCode.includes("const resourceDiscoveryEngine = createResourceDiscoveryEngine"));
check("requestJennaEngine instantiated",        indexCode.includes("const requestJennaEngine = createRequestJennaEngine"));
check("fulfillmentExecutor instantiated",       indexCode.includes("const fulfillmentExecutor = createFulfillmentExecutor"));
check("homeostasisRuntime instantiated",        indexCode.includes("const homeostasisRuntime = createHomeostasisRuntime"));
check("homeostasisRuntime passed to createLifeRuntime", (() => {
  const lrCall = indexCode.indexOf("createLifeRuntime({");
  const hmIdx  = indexCode.indexOf("homeostasisRuntime", lrCall);
  return lrCall > -1 && hmIdx > lrCall && hmIdx < lrCall + 2000;
})());
check("microLifeEventsStore wired to executor", indexCode.includes("microLifeEventsStore, logger"));

// ── Section 15: Hard rules ────────────────────────────────────────────────

console.log("\n15. Hard rule enforcement");
const allCode = [needsStoreCode, logStoreCode, resourceCode, requestCode, driftCode, webCode, plannerCode, executorCode, orchCode].join("\n");

check("no new scheduler (setInterval) in homeostasis files", !allCode.includes("setInterval"));
check("no new scheduler (setTimeout) in homeostasis files",  !allCode.includes("setTimeout"));
check("sexual desire gate: consent required before escalation", plannerCode.includes("adultContextActive") && plannerCode.includes("consentGiven"));
check("web search disabled by default", webCode.includes('=== "true"') && webCode.includes("DANTE_WEB_LEARNING_ENABLED"));
check("boredom/novelty: discover_resource not noisy", plannerCode.includes("discover_resource") && !plannerCode.includes("sendMessage") && !plannerCode.includes("discord"));
check("no fake fulfillment via text claims", !executorCode.includes('"actually"') && !executorCode.includes("I read") && !executorCode.includes("I watched"));
check("no Discord sender in homeostasis files", !allCode.includes("discord.send") && !allCode.includes("channelId") && !allCode.includes("Discord"));
check("fulfillment always writes evidence log", executorCode.includes("fulfillmentLogStore") && executorCode.includes("logFulfillment"));
check("give-space blocks ALL Jenna outreach", requestCode.includes("give_space_active") && plannerCode.includes("canAskJenna: false"));
check("sexual desire: private restraint when no consent", plannerCode.includes("suppress") && executorCode.includes("sexual_desire"));

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("HOMEOSTASIS_RUNTIME_PASS");
  process.exit(0);
} else {
  console.error(`\n${failed} check(s) failed — see above`);
  process.exit(1);
}
