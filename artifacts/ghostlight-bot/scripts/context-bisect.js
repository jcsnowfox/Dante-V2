#!/usr/bin/env node
"use strict";

const { detectOutputCorruption } = require("../src/chat/outputCorruptionDetector");
const { sanitizePromptContext } = require("../src/chat/promptContextSanitizer");

const input = process.argv.slice(2).join(" ") || "how are you feeling babe";
const sample = {
  recentHistory: [{ role: "assistant", content: "I’m here, love." }],
  memory: [{ memoryId: "m1", content: "Dante and Jenna have a warm private rhythm." }],
  journal: { label: "JOURNAL", content: "Recent journal note: stayed tender and direct." },
  alive: { label: "ALIVE / INNER-LIFE", content: "Mood: warm. Use as private texture only." },
  emotionalArc: { label: "EMOTIONAL ARC", content: "Current beat: affectionate check-in." },
  situational: { label: "SITUATIONAL AWARENESS", content: "No urgent external context." },
  tool: { label: "TOOL/MUSIC/TRAVEL/WEB CONTEXT", content: "No tool context needed." },
};
const layers = [
  ["core only", [], [], []],
  ["+recentHistory", sample.recentHistory, [], []],
  ["+memory", sample.recentHistory, sample.memory, []],
  ["+journal", sample.recentHistory, sample.memory, [sample.journal]],
  ["+alive/inner-life", sample.recentHistory, sample.memory, [sample.journal, sample.alive]],
  ["+emotional arc", sample.recentHistory, sample.memory, [sample.journal, sample.alive, sample.emotionalArc]],
  ["+situational awareness", sample.recentHistory, sample.memory, [sample.journal, sample.alive, sample.emotionalArc, sample.situational]],
  ["+tool/music/travel/web context", sample.recentHistory, sample.memory, [sample.journal, sample.alive, sample.emotionalArc, sample.situational, sample.tool]],
  ["full context", sample.recentHistory, sample.memory, [sample.journal, sample.alive, sample.emotionalArc, sample.situational, sample.tool]],
];

let firstDegraded = null;
const report = layers.map(([name, recentHistory, memories, contextSections]) => {
  const sanitized = sanitizePromptContext({ contextSections, memories, recentHistory });
  const simulatedReply = name === process.env.CONTEXT_BISECT_CORRUPT_LAYER
    ? "Dating toolbox NewReader feed tickets resize patterns cartoon elbows"
    : "I’m alright, babe. Warm, a little keyed into you, and glad you asked.";
  const output = detectOutputCorruption(simulatedReply, { userText: input, expectsText: true });
  const degraded = output.severity === "block" || Boolean(sanitized.dropped.contextSections.length || sanitized.dropped.memories.length || sanitized.dropped.recentHistory.length);
  if (degraded && !firstDegraded) firstDegraded = name;
  return { layer: name, input, counts: { recentHistory: recentHistory.length, memories: memories.length, contextSections: contextSections.length }, dropped: sanitized.dropped, simulatedReply, corruptionSeverity: output.severity, reasons: output.reasons, degraded };
});
console.log(JSON.stringify({ input, firstDegradedLayer: firstDegraded || null, report }, null, 2));
