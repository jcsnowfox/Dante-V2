"use strict";

/**
 * promptAuditCapture
 *
 * Debug-only mechanism for capturing a sanitised snapshot of the prompt
 * before it is sent to the LLM. Disabled in production by default.
 *
 * Env vars:
 *   DANTE_PROMPT_AUDIT_ENABLED      — "true" to enable (default: false)
 *   DANTE_PROMPT_AUDIT_SAMPLE_RATE  — float 0–1, fraction of requests captured (default: 0)
 *   DANTE_PROMPT_AUDIT_MAX_CHARS    — max chars of each section excerpt (default: 12000)
 *
 * Privacy contract:
 *   - Never captures raw private messages
 *   - Never captures full memories or journals
 *   - Never captures raw Discord payloads
 *   - Never captures secrets, tokens, or API keys
 *   - Only captures section names + length + redacted excerpt
 */

const ENABLED   = process.env.DANTE_PROMPT_AUDIT_ENABLED === "true";
const SAMPLE_RATE = Math.min(1, Math.max(0, Number(process.env.DANTE_PROMPT_AUDIT_SAMPLE_RATE) || 0));
const MAX_CHARS = Math.min(12000, Math.max(500, Number(process.env.DANTE_PROMPT_AUDIT_MAX_CHARS) || 12000));

const SENSITIVE_FIELD_RE = /secret|token|password|api_?key|credential|authorization|bearer|private_key/i;

function _redactExcerpt(content, maxLen) {
  const s = String(content || "").trim();
  if (!s) return "";
  const capped = s.slice(0, maxLen);
  return capped
    .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, "[CARD]")
    .replace(/\bhttps?:\/\/[^\s<>)]+/g, "[URL]");
}

/**
 * capturePromptAudit
 *
 * Call this just before callModel() to capture a sanitised prompt snapshot.
 * Returns null when auditing is disabled or not sampled.
 *
 * @param {{ modelId: string, temperature?: number, topP?: number, maxTokens?: number, contextSections: Array<{label:string,content:string}>, corruptionScan?: object }} params
 * @returns {object|null}
 */
function capturePromptAudit({ modelId, temperature, topP, maxTokens, contextSections, corruptionScan } = {}) {
  if (!ENABLED) return null;
  if (Math.random() > SAMPLE_RATE) return null;

  try {
    let totalChars = 0;
    const sections = [];

    for (const sec of (contextSections || [])) {
      const label   = String(sec.label   || "").slice(0, 80);
      const content = String(sec.content || "");
      const chars   = content.length;
      totalChars   += chars;

      if (SENSITIVE_FIELD_RE.test(label) || SENSITIVE_FIELD_RE.test(content)) {
        sections.push({ label, chars, excerpt: "[REDACTED — sensitive label or content]" });
        continue;
      }

      const excerpt = _redactExcerpt(content, 300);
      sections.push({ label, chars, excerpt });
    }

    return {
      capturedAt: new Date().toISOString(),
      modelId: String(modelId || "unknown"),
      modelParams: {
        temperature: temperature != null ? Number(temperature) : null,
        topP:        topP        != null ? Number(topP)        : null,
        maxTokens:   maxTokens   != null ? Number(maxTokens)   : null,
      },
      totalContextChars: totalChars,
      sectionCount: sections.length,
      sections,
      corruptionScan: corruptionScan || null,
      maxCharsConfig: MAX_CHARS,
    };
  } catch (_) {
    return null;
  }
}

/**
 * logAuditCapture
 *
 * Logs the audit snapshot to the provided logger at debug level.
 * Call after capturePromptAudit if the result is non-null.
 *
 * @param {object|null} audit
 * @param {object} logger
 * @param {string} messageId
 */
function logAuditCapture(audit, logger, messageId) {
  if (!audit || !logger?.debug) return;
  try {
    logger.debug("[prompt-audit] snapshot captured", {
      messageId,
      modelId: audit.modelId,
      totalContextChars: audit.totalContextChars,
      sectionCount: audit.sectionCount,
      sections: audit.sections.map(s => ({ label: s.label, chars: s.chars })),
    });
  } catch (_) {}
}

module.exports = { capturePromptAudit, logAuditCapture };
