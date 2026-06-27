"use strict";

const { dispatchDiagnosticEntry, getDiagnosticChannelId } = require("./innerLifeDispatch");

const DEFAULT_SELF_CHECK_HOURS = Object.freeze([8, 12, 21]);
const CHECK_INTERVAL_MS = 60 * 1000;

function parseSelfCheckHours(value) {
  if (Array.isArray(value)) return normalizeHours(value);
  const text = String(value || "").trim();
  if (!text) return DEFAULT_SELF_CHECK_HOURS.slice();
  return normalizeHours(text.split(/[\s,]+/));
}

function normalizeHours(values) {
  const hours = values
    .map((item) => Number.parseInt(String(item).trim(), 10))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
  return [...new Set(hours)].sort((a, b) => a - b);
}

function buildSelfCheckContent({ now = new Date(), recentDiagnosticEntries = [], config = {} } = {}) {
  const unresolved = recentDiagnosticEntries.filter((entry) => entry?.status !== "archived" && entry?.status !== "expired");
  const confidence = unresolved.length ? "low" : "steady";
  const lines = [
    "**Dante self-check**",
    `time: ${now.toISOString()}`,
    `self-confidence: ${confidence}`,
    `diagnostic-channel: ${getDiagnosticChannelId(config)}`,
  ];

  if (unresolved.length) {
    lines.push("", "open diagnostic flags:");
    for (const entry of unresolved.slice(0, 5)) {
      lines.push(`- ${entry.title || entry.summary || entry.entryType || "diagnostic journal"}`);
    }
  } else {
    lines.push("", "no unresolved self-diagnostic journal flags found in the recent inner-life store.");
  }

  lines.push("", "check: identity favours honesty over speed; if a reply felt drifted, duplicated, wrong-language, or inconsistent, double-check before treating it as settled.");
  return lines.join("\n");
}

function createSelfCheckScheduler({ client, config = {}, logger, storeWrapper, nowFn = () => new Date() } = {}) {
  const selfCheckConfig = config?.innerLife?.selfCheck || {};
  const enabled = selfCheckConfig.enabled !== false && process.env.INNER_LIFE_SELF_CHECK_ENABLED !== "false";
  const hours = parseSelfCheckHours(selfCheckConfig.hours || process.env.INNER_LIFE_SELF_CHECK_HOURS);
  const sentKeys = new Set();
  let timer = null;

  async function tick(now = nowFn()) {
    if (!enabled) return { skipped: true, reason: "disabled" };
    if (!hours.includes(now.getHours())) return { skipped: true, reason: "not_scheduled_hour" };

    const key = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getHours()}`;
    if (sentKeys.has(key)) return { skipped: true, reason: "already_sent" };
    sentKeys.add(key);

    const recentDiagnosticEntries = storeWrapper?.list
      ? await storeWrapper.list({ entryType: "journal_entry", status: "active", limit: 10 }).catch(() => [])
      : [];
    const diagnostics = recentDiagnosticEntries.filter((entry) => entry?.metadata?.kind === "diagnostic_carry_forward");
    const content = buildSelfCheckContent({ now, recentDiagnosticEntries: diagnostics, config });
    const result = await dispatchDiagnosticEntry({ client, config, logger, content });
    logger?.info?.("[inner-life] self-check completed", { result: result?.sent ? "sent" : result?.reason, hour: now.getHours() });
    return result;
  }

  function start() {
    if (timer || !enabled) return;
    timer = setInterval(() => tick().catch((error) => logger?.warn?.("[inner-life] self-check failed", { error: error?.message })), CHECK_INTERVAL_MS);
    if (typeof timer.unref === "function") timer.unref();
    tick().catch((error) => logger?.warn?.("[inner-life] initial self-check failed", { error: error?.message }));
    logger?.info?.("[inner-life] self-check scheduler started", { hours });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick, buildSelfCheckContent, hours };
}

module.exports = {
  DEFAULT_SELF_CHECK_HOURS,
  parseSelfCheckHours,
  buildSelfCheckContent,
  createSelfCheckScheduler,
};
