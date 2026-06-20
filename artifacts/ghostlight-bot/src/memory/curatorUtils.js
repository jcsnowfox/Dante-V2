const crypto = require("node:crypto");
const { parseJsonOutput } = require("../llm/jsonOutput");

function stableUuid(seed) {
  const hex = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function safeJsonParse(value) {
  return parseJsonOutput(value);
}

module.exports = {
  safeJsonParse,
  stableUuid,
};
