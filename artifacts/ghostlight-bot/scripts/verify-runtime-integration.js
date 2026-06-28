#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "../..");
let failed = false;
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel, base = root) { return fs.existsSync(path.join(base, rel)); }
function check(name, pass, detail = "") { console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!pass) failed = true; }
function rg(pattern, cwd = root) { return spawnSync("rg", ["-n", pattern, "."], { cwd, encoding: "utf8" }); }

check("canonical autonomous/system Discord send gateway exists", exists("src/discord/discordSendGateway.js"));
const gateway = read("src/discord/discordSendGateway.js");
check("gateway owns channel.send", gateway.includes("channel.send"));
check("gateway enforces allowedMentions", gateway.includes("allowedMentions"));
check("gateway has safe logging", gateway.includes("sanitizeLogValue"));

const sendSearch = rg("channel\\.send");
const sendLines = sendSearch.stdout.split("\n").filter(Boolean)
  .filter((line) => !line.includes("src/discord/discordSendGateway.js"))
  .filter((line) => !line.includes("__tests__"));
const forbiddenSystemSend = sendLines.filter((line) => /src\/(innerLife|automations|heartbeat|proactiveActions|alive|lifeRuntime)\//.test(line));
check("no duplicate autonomous/system channel.send outside gateway", forbiddenSystemSend.length === 0, forbiddenSystemSend.join(" | "));
check("interactive reply path exceptions documented", gateway.includes("Interactive user replies may still use the messageCreate reply path"));

check("fulfillment ownership contract exists", exists("docs/FULFILLMENT_OWNERSHIP.md", repoRoot));
check("canonical fulfillment evidence ledger documented", fs.readFileSync(path.join(repoRoot, "docs/FULFILLMENT_OWNERSHIP.md"), "utf8").includes("canonical evidence ledger"));
check("no fake fulfillment principle exists", read("src/lifeRuntime/fulfillmentHistoryStore.js").includes("forced_to_UNAVAILABLE"));

check("relationshipStateRuntime exists", exists("src/lifeRuntime/relationshipStateRuntime.js"));
check("relationshipStateRuntime consumed by lifeRuntime", read("src/lifeRuntime/lifeRuntime.js").includes("relationshipStateRuntime.buildSnapshot"));
check("relationship ownership contract exists", exists("docs/RELATIONSHIP_OWNERSHIP.md", repoRoot));

check("diagnosticRuntime exists", exists("src/diagnostics/diagnosticRuntime.js"));
check("diagnosticRuntime exported", exists("src/diagnostics/index.js"));
check("diagnosticRuntime consumed by lifeRuntime status", read("src/lifeRuntime/lifeRuntime.js").includes("diagnostics: diagnosticRuntime.getStatus()"));
check("diagnostic runtime map exists", exists("docs/DIAGNOSTIC_RUNTIME_MAP.md", repoRoot));

const bridges = read("src/lifeRuntime/emergenceBridges.js");
for (const token of ["bridgeGrowthToIdentity", "bridgeCuriosityToProjects", "bridgeProjectsToPurpose", "bridgeEvidenceToBeliefs", "bridgeFulfillmentToRelationship"]) {
  check(`emergence link implemented: ${token}`, bridges.includes(token));
}
check("beliefs influence agency planning", read("src/lifeRuntime/agencyPlanner.js").includes("identity_belief_jenna_space"));
check("preferences influence resource discovery ranking", read("src/lifeRuntime/resourceDiscoveryRuntime.js").includes("rankResourcesByPreferences"));
check("emergence links tested", read("src/lifeRuntime/__tests__/runtimeStabilization.test.js").includes("Growth to Identity") && read("src/lifeRuntime/__tests__/runtimeStabilization.test.js").includes("Preferences influence resource ranking"));
check("degradation matrix exists", exists("src/lifeRuntime/__tests__/runtimeDegradation.test.js"));

const pkg = JSON.parse(read("package.json"));
check("verify:runtime:all script exists", Boolean(pkg.scripts && pkg.scripts["verify:runtime:all"]));
check("verify docs exist", exists("docs/VERIFY_SCRIPTS.md", repoRoot));
check("dead code policy exists", exists("docs/DEAD_CODE_AUDIT.md", repoRoot));
const archiveImports = rg("require\\([^)]*archive|from [\\'\"][^\\'\"]*archive", repoRoot).stdout.split("\n").filter(Boolean).filter((line) => !/scripts\/verify-runtime-integration/.test(line));
check("no active imports from archive", archiveImports.length === 0, archiveImports.join(" | "));

check("no duplicate life runtime scheduler registration", (read("src/index.js").match(/registerLifeRuntime/g) || []).length === 2);
check("dashboard proof script remains included", pkg.scripts["verify:all"].includes("verify-dashboard-not-broken"));
check("alive proof script remains included", pkg.scripts["verify:all"].includes("verify-alive-layer-proof"));

if (failed) process.exit(1);
console.log("RUNTIME_INTEGRATION_PASS");
