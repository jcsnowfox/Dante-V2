"use strict";

const { detectOutputCorruption } = require("../src/chat/outputCorruptionDetector");

const sample = process.env.PROVIDER_SMOKE_REPLY || "This is one normal sentence in English.";
const result = detectOutputCorruption(sample, { userText: "Say one normal sentence in English.", expectsText: true });
if (result.severity === "block") {
  console.error("provider smoke failed", result);
  process.exit(1);
}
console.log("provider smoke passed");
