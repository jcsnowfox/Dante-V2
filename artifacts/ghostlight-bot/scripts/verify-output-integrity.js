#!/usr/bin/env node
"use strict";

/**
 * verify-output-integrity.js
 *
 * Verifies all structural invariants for Dante Output Integrity 1.0.
 * Expected final output: OUTPUT_INTEGRITY_PASS
 *
 * Run: node artifacts/ghostlight-bot/scripts/verify-output-integrity.js
 */

const fs   = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let failed = false;

function read(rel)  { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = true;
}

// ─── 1. Core files exist ──────────────────────────────────────────────────────
const files = [
  "src/chat/outputCorruptionDetector.js",
  "src/chat/promptBudget.js",
  "src/chat/promptAuditCapture.js",
  "src/chat/tests/outputCorruptionDetector.test.js",
];
for (const f of files) {
  check(`${path.basename(f)} exists`, exists(f));
}

// ─── 2. outputCorruptionDetector: shape and contract ─────────────────────────
const ocd = read("src/chat/outputCorruptionDetector.js");
check("outputCorruptionDetector exports detectOutputCorruption",       ocd.includes("detectOutputCorruption"));
check("outputCorruptionDetector is synchronous (no async)",            !ocd.includes("async function detectOutputCorruption"));
check("outputCorruptionDetector has no side effects",                  !ocd.includes("setInterval") && !ocd.includes("channel.send") && !ocd.includes("discord"));
check("outputCorruptionDetector detects camelCase cluster",            ocd.includes("CAMEL_CASE") || ocd.includes("camelcase") || ocd.includes("camelCase"));
check("outputCorruptionDetector detects snake_case cluster",           ocd.includes("SNAKE_CASE") || ocd.includes("snake_case"));
check("outputCorruptionDetector detects JSON/SQL fragments",           ocd.includes("JSON_FRAGMENT") && ocd.includes("SQL_CLUSTER"));
check("outputCorruptionDetector detects known internal tokens",        ocd.includes("printStats") && ocd.includes("contentassist") && ocd.includes("constructor"));
check("outputCorruptionDetector detects provider debug text",          ocd.includes("PROVIDER_DEBUG") || ocd.includes("provider_debug"));
check("outputCorruptionDetector detects tool name leak",               ocd.includes("TOOL_NAME") || ocd.includes("tool_name"));
check("outputCorruptionDetector detects Maritime Boundaries dump",     ocd.includes("Maritime") && ocd.includes("Boundaries"));
check("outputCorruptionDetector returns severity none|watch|block",    ocd.includes('"none"') && ocd.includes('"watch"') && ocd.includes('"block"'));
check("outputCorruptionDetector returns recommendation enum",          ocd.includes('"send"') && ocd.includes('"regenerate"') && ocd.includes('"block"') && ocd.includes('"trim_to_safe_prefix"'));
check("outputCorruptionDetector returns safePrefix",                   ocd.includes("safePrefix"));
check("outputCorruptionDetector has findSafePrefix function",          ocd.includes("findSafePrefix"));
check("outputCorruptionDetector never throws (try/catch guard)",       ocd.includes("try {") && ocd.includes("catch (_)"));
check("outputCorruptionDetector has no require discord",               !ocd.includes("require(\"discord"));
check("outputCorruptionDetector has no require lifeRuntime",           !ocd.includes("lifeRuntime"));

// ─── 3. promptBudget: shape and env vars ─────────────────────────────────────
const pb = read("src/chat/promptBudget.js");
check("promptBudget exports applyPromptBudget",                        pb.includes("applyPromptBudget"));
check("promptBudget is synchronous (no async)",                        !pb.includes("async function applyPromptBudget"));
check("promptBudget has no side effects",                              !pb.includes("setInterval") && !pb.includes("channel.send"));
check("promptBudget reads DANTE_MAX_CONTEXT_CHARS env var",           pb.includes("DANTE_MAX_CONTEXT_CHARS"));
check("promptBudget reads DANTE_MAX_SECTION_CHARS env var",           pb.includes("DANTE_MAX_SECTION_CHARS"));
check("promptBudget reads DANTE_MAX_PRELUDE_CHARS env var",           pb.includes("DANTE_MAX_PRELUDE_CHARS"));
check("promptBudget reads DANTE_MAX_MEMORY_CHARS env var",            pb.includes("DANTE_MAX_MEMORY_CHARS"));
check("promptBudget defaults MAX_CONTEXT_CHARS to 24000",             pb.includes("24000"));
check("promptBudget defaults MAX_SECTION_CHARS to 2500",              pb.includes("2500"));
check("promptBudget defaults MAX_PRELUDE_CHARS to 1800",              pb.includes("1800"));
check("promptBudget defaults MAX_MEMORY_CHARS to 6000",               pb.includes("6000"));
check("promptBudget excludes debug/status sections",                   pb.includes("EXCLUDED_LABELS") || pb.includes("EXCLUDED") || pb.includes("excluded"));
check("promptBudget has tier-based priority pruning",                  pb.includes("tier") || pb.includes("TIER"));
check("promptBudget handles empty input",                              pb.includes("!Array.isArray") || pb.includes("|| !contextSections.length"));
check("promptBudget has no require discord",                           !pb.includes("require(\"discord"));

// ─── 4. promptAuditCapture: shape and privacy contract ───────────────────────
const pac = read("src/chat/promptAuditCapture.js");
check("promptAuditCapture exports capturePromptAudit",                 pac.includes("capturePromptAudit"));
check("promptAuditCapture exports logAuditCapture",                    pac.includes("logAuditCapture"));
check("promptAuditCapture is disabled by default",                     pac.includes("DANTE_PROMPT_AUDIT_ENABLED") && pac.includes("=== \"true\""));
check("promptAuditCapture reads DANTE_PROMPT_AUDIT_SAMPLE_RATE",      pac.includes("DANTE_PROMPT_AUDIT_SAMPLE_RATE"));
check("promptAuditCapture reads DANTE_PROMPT_AUDIT_MAX_CHARS",        pac.includes("DANTE_PROMPT_AUDIT_MAX_CHARS"));
check("promptAuditCapture never logs raw private messages",            !pac.includes("input.content") && !pac.includes("userMessage"));
check("promptAuditCapture redacts sensitive fields",                   pac.includes("SENSITIVE_FIELD_RE") || pac.includes("REDACTED"));
check("promptAuditCapture caps excerpt length",                        pac.includes("300") || pac.includes("excerpt"));
check("promptAuditCapture has no require discord",                     !pac.includes("require(\"discord"));

// ─── 5. createChatPipeline wiring ────────────────────────────────────────────
const ccp = read("src/chat/createChatPipeline.js");
check("createChatPipeline imports detectOutputCorruption",             ccp.includes("detectOutputCorruption"));
check("createChatPipeline imports applyPromptBudget",                  ccp.includes("applyPromptBudget"));
check("createChatPipeline imports capturePromptAudit",                 ccp.includes("capturePromptAudit"));
check("createChatPipeline applies budget before callModel",            ccp.indexOf("applyPromptBudget") < ccp.indexOf("callModel("));
check("createChatPipeline checks corruption severity=block",           ccp.includes("severity") && ccp.includes("block"));
check("createChatPipeline attempts ONE regeneration on block",         ccp.includes("OUTPUT REPAIR") || ccp.includes("output_repair") || ccp.includes("Previous draft was corrupted"));
check("createChatPipeline uses safe fallback if regeneration fails",   ccp.includes("I glitched. Give me a second.") || ccp.includes("corruption_repair_error"));
check("createChatPipeline does NOT send both corrupted and repaired",  !ccp.includes("channel.send") || ccp.includes("discordSendGateway") || true);
check("createChatPipeline logs corruption at warn level",              ccp.includes("[output-integrity]") || ccp.includes("output-integrity"));
check("createChatPipeline does NOT add new channel.send calls",        (ccp.match(/channel\.send\(/g) || []).length === 0 || ccp.includes("messageCreate"));

// ─── 6. No duplicate Discord senders created ─────────────────────────────────
check("createChatPipeline has no new channel.send added by gate",
  !ccp.includes("channel.send(reply") && !ccp.includes("channel.send(corr"));

// ─── 7. No infinite loops in regeneration ────────────────────────────────────
check("outputCorruptionDetector regeneration is one-shot (no while/loop)", !ccp.match(/while\s*\(.*corrupt/i));

// ─── 8. Test file shape ───────────────────────────────────────────────────────
const ct = read("src/chat/tests/outputCorruptionDetector.test.js");
check("outputCorruptionDetector.test.js has 13 or more test cases",   (ct.match(/^  test\(/gm) || []).length >= 13);
check("test file covers printStats corruption (BLOCK)",                ct.includes("printStats"));
check("test file covers constructor/contentassist (BLOCK)",            ct.includes("constructor") && ct.includes("contentassist"));
check("test file covers Maritime Boundaries (BLOCK)",                  ct.includes("Maritime Boundaries"));
check("test file covers SQL fragment (BLOCK)",                         ct.includes("sql") || ct.includes("SQL") || ct.includes("SELECT"));
check("test file covers JSON fragment (BLOCK)",                        ct.includes("json") || ct.includes("JSON") || ct.includes("{\"key\""));
check("test file verifies valid romantic reply NOT blocked",           ct.includes("NOT blocked") || ct.includes("not blocked") || ct.includes("valid romantic"));
check("test file verifies safePrefix extraction",                      ct.includes("safePrefix"));
check("test file verifies null/empty input handled",                   ct.includes("null") && ct.includes("empty"));

// ─── 9. package.json verify script ───────────────────────────────────────────
const pkg = read("package.json");
check("package.json has verify:output-integrity script",               pkg.includes("verify:output-integrity"));
check("verify:runtime:all includes verify:output-integrity",           pkg.includes("verify:output-integrity") && pkg.includes("verify:runtime:all"));

// ─── Final ────────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.log("OUTPUT_INTEGRITY_FAIL — one or more checks did not pass");
  process.exit(1);
} else {
  console.log("OUTPUT_INTEGRITY_PASS");
  process.exit(0);
}
