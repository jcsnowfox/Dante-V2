#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { isPromptContaminated } = require("../src/chat/promptContextSanitizer");

const ROOT = path.resolve(__dirname, "..");
const QUARANTINE = process.argv.includes("--quarantine");
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TARGET_RE = /conversation|histor|memor|journal|summar|inner|alive|autonom|decision|note|dream/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "docs", "src", "scripts", "assets"]);

const EXTRA_PATTERNS = [
  ["unrelated_noun_cluster", /(?:\b[A-Z][a-zA-Z]{2,}\b[\s,;:-]+){5,}/],
  ["broken_phrase_chain", /\b(?:Dating\s+toolbox|NewReader|feed\s+tickets|resize\s+patterns|cartoon\s+elbows|arc\s+question|regime\s+clouds)\b/i],
  ["malformed_assistant_reply", /\b(?:printStats|contentassist|tool_call|function_call|Passport\s+js|Maritime\s+Boundaries)\b/i],
  ["random_foreign_single_word", /(?:^|[\n\r])\s*(?:ประเภท|ありがとう|bonjour|hola|gracias|danke|merci|привет|こんにちは|你好)\s*(?:[\n\r]|$)/i],
  ["raw_internal_label", /\b(?:source:\s*(?:inbound_message|channel_context|conversation_update)|conversation_update|channel_context|inbound_message|Dynamic Internal Context|Private Heartbeat context)\b/i],
  ["audit_debug_text", /\b(?:DEBUG_REPLY_PROMPT|PROMPT_CONTEXT_BLOAT_AUDIT|PERFORMANCE_AUDIT_REPORT|verification script|root cause|files changed|outputCorruptionDetector)\b/i],
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TARGET_RE.test(full) && /\.(json|jsonl|md|txt|log|sqlite|db)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function lineOf(text, index) { return text.slice(0, index).split(/\r?\n/).length; }
function reasonsFor(text) {
  const reasons = [];
  if (isPromptContaminated(text, { role: /assistant/i.test(text) ? "assistant" : "" })) reasons.push("prompt_contamination");
  for (const [name, re] of EXTRA_PATTERNS) if (re.test(text)) reasons.push(name);
  return [...new Set(reasons)];
}

const findings = [];
for (const file of walk(ROOT)) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_FILE_BYTES) continue;
  const text = fs.readFileSync(file, "utf8");
  const reasons = reasonsFor(text);
  if (!reasons.length) continue;
  let firstIndex = Infinity;
  for (const [, re] of EXTRA_PATTERNS) {
    const m = text.match(re);
    if (m && m.index < firstIndex) firstIndex = m.index;
  }
  if (firstIndex === Infinity) firstIndex = 0;
  findings.push({ file: path.relative(ROOT, file), line: lineOf(text, firstIndex), reasons });
}

if (QUARANTINE && findings.length) {
  const qdir = path.join(ROOT, "quarantine", `stored-sludge-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(qdir, { recursive: true });
  for (const finding of findings) {
    const src = path.join(ROOT, finding.file);
    const dest = path.join(qdir, finding.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  fs.writeFileSync(path.join(qdir, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), findings }, null, 2));
  console.log(`Quarantine copy written: ${path.relative(ROOT, qdir)}`);
}

console.log(JSON.stringify({ checkedRoot: ROOT, quarantine: QUARANTINE, affectedRecords: findings }, null, 2));
process.exit(0);
