function stripCodeFences(text) {
  const normalized = String(text || "").trim();

  if (!normalized.startsWith("```")) {
    return normalized;
  }

  return normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function repairJsonishText(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\/\/[^\n\r]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, "$1\"$2\"$3")
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, value) => `"${value.replace(/"/g, "\\\"")}"`)
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function findFirstBalancedJsonValue(text, opener) {
  const value = String(text || "");
  const start = value.indexOf(opener);

  if (start === -1) {
    return "";
  }

  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;

      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return "";
}

function parseJsonOutput(text) {
  const stripped = stripCodeFences(text);
  const direct = tryParseJson(stripped);

  if (direct !== null) {
    return direct;
  }

  const repairedDirect = tryParseJson(repairJsonishText(stripped));
  if (repairedDirect !== null) {
    return repairedDirect;
  }

  const fencedMatch = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const fenced = tryParseJson(fencedMatch[1].trim());

    if (fenced !== null) {
      return fenced;
    }

    const repairedFenced = tryParseJson(repairJsonishText(fencedMatch[1]));
    if (repairedFenced !== null) {
      return repairedFenced;
    }
  }

  const objectText = findFirstBalancedJsonValue(stripped, "{");
  const repairedObjectText = repairJsonishText(objectText);
  const objectParsed = objectText ? tryParseJson(objectText) || tryParseJson(repairedObjectText) : null;

  if (objectParsed !== null) {
    return objectParsed;
  }

  const arrayText = findFirstBalancedJsonValue(stripped, "[");
  const repairedArrayText = repairJsonishText(arrayText);

  return arrayText ? tryParseJson(arrayText) || tryParseJson(repairedArrayText) : null;
}

module.exports = {
  parseJsonOutput,
  stripCodeFences,
};
