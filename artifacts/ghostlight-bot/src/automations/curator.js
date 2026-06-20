const { runMemoryAttentionScan, runMemoryCurator } = require("../memory/curator");

const CURATOR_ATTENTION_INTERVAL_HOURS = 6;
const CURATOR_ATTENTION_LOOKBACK_HOURS = 8;
const CURATOR_LONG_INTERVAL_HOURS = 24;
const CURATOR_LONG_LOOKBACK_HOURS = 28;

function getHoursSince(value, now = new Date()) {
  const previous = new Date(value || "");

  if (Number.isNaN(previous.getTime())) {
    return Infinity;
  }

  return Math.max(0, (now.getTime() - previous.getTime()) / (60 * 60 * 1000));
}

function isMemoryCuratorAttentionScanDue(config, now = new Date()) {
  if (!config.memoryCurator?.enabled) {
    return false;
  }

  return getHoursSince(config.memoryCurator?.attentionScanLastRunAt, now) >= CURATOR_ATTENTION_INTERVAL_HOURS;
}

function isMemoryCuratorLongScanDue(config, now = new Date()) {
  if (!config.memoryCurator?.enabled) {
    return false;
  }

  return getHoursSince(config.memoryCurator?.longScanLastRunAt, now) >= CURATOR_LONG_INTERVAL_HOURS;
}

async function markCuratorScanAttempt({ config, settingsStore, key, now }) {
  const timestamp = now.toISOString();
  config.memoryCurator = config.memoryCurator || {};
  config.memoryCurator[key] = timestamp;

  if (settingsStore?.upsertSettings) {
    await settingsStore.upsertSettings({
      [`memoryCurator.${key}`]: timestamp,
    });
  }
}

async function runAutomatedMemoryCuratorScans({
  config,
  logger,
  conversations,
  generatedMemories,
  memory,
  settingsStore,
  now = new Date(),
  runAttentionScan = runMemoryAttentionScan,
  runLongScan = runMemoryCurator,
}) {
  const results = {
    attention: null,
    long: null,
  };

  if (isMemoryCuratorAttentionScanDue(config, now)) {
    try {
      logger.info?.("[automations] Running automated recent attention scan", {
        lookbackHours: CURATOR_ATTENTION_LOOKBACK_HOURS,
      });
      results.attention = await runAttentionScan({
        config,
        conversations,
        generatedMemories,
        memory,
        lookbackHours: CURATOR_ATTENTION_LOOKBACK_HOURS,
        now,
        debugTrace: false,
      });
      logger.info?.("[automations] Automated recent attention scan completed", {
        stagedCount: results.attention?.stagedCount || 0,
        sourceEventCount: results.attention?.sourceEventCount || 0,
        skipped: Boolean(results.attention?.skipped),
        reason: results.attention?.reason || "",
      });
    } catch (error) {
      results.attention = { error: error.message };
      logger.error?.("[automations] Automated recent attention scan failed", {
        error: error.message,
      }, error);
    } finally {
      await markCuratorScanAttempt({
        config,
        settingsStore,
        key: "attentionScanLastRunAt",
        now,
      });
    }
  }

  if (isMemoryCuratorLongScanDue(config, now)) {
    try {
      logger.info?.("[automations] Running automated long-window memory curator scan", {
        lookbackHours: CURATOR_LONG_LOOKBACK_HOURS,
      });
      results.long = await runLongScan({
        config,
        conversations,
        generatedMemories,
        memory,
        lookbackHours: CURATOR_LONG_LOOKBACK_HOURS,
        now,
        debugTrace: false,
      });
      logger.info?.("[automations] Automated long-window memory curator scan completed", {
        stagedCount: results.long?.stagedCount || 0,
        sourceEventCount: results.long?.sourceEventCount || 0,
        skipped: Boolean(results.long?.skipped),
        reason: results.long?.reason || "",
      });
    } catch (error) {
      results.long = { error: error.message };
      logger.error?.("[automations] Automated long-window memory curator scan failed", {
        error: error.message,
      }, error);
    } finally {
      await markCuratorScanAttempt({
        config,
        settingsStore,
        key: "longScanLastRunAt",
        now,
      });
    }
  }

  return results;
}

module.exports = {
  CURATOR_ATTENTION_INTERVAL_HOURS,
  CURATOR_ATTENTION_LOOKBACK_HOURS,
  CURATOR_LONG_INTERVAL_HOURS,
  CURATOR_LONG_LOOKBACK_HOURS,
  getHoursSince,
  isMemoryCuratorAttentionScanDue,
  isMemoryCuratorLongScanDue,
  runAutomatedMemoryCuratorScans,
};
