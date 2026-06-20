const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// In-memory ring buffer — last N log lines for dev diagnostics.
// Read via getLogRingBuffer(); written to by every log method below.
const LOG_RING_BUFFER_SIZE = 200;
const logRingBuffer = [];

function pushToLogRingBuffer(level, message, meta) {
  logRingBuffer.push({
    ts: new Date().toISOString(),
    level,
    message: String(message || "").slice(0, 500),
    meta: meta || undefined,
  });
  if (logRingBuffer.length > LOG_RING_BUFFER_SIZE) {
    logRingBuffer.shift();
  }
}

function getLogRingBuffer(limit = LOG_RING_BUFFER_SIZE) {
  return logRingBuffer.slice(-Math.max(1, limit));
}

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|authorization|cookie|password|secret|token)/i;
const OMITTED_ERROR_KEYS = new Set([
  "client",
  "connection",
  "domainEmitter",
  "domainThrown",
  "stack",
]);

function normalizeLevel(level) {
  return LEVELS[level] ? level : "info";
}

function shouldLog(currentLevel, targetLevel) {
  return LEVELS[targetLevel] >= LEVELS[currentLevel];
}

function isErrorLike(value) {
  return value instanceof Error || (
    value
      && typeof value === "object"
      && typeof value.message === "string"
      && (
        typeof value.name === "string"
        || typeof value.code === "string"
        || typeof value.severity === "string"
      )
  );
}

function formatErrorForLog(error) {
  if (!isErrorLike(error)) {
    return sanitizeLogValue(error);
  }

  const formatted = {
    name: error.name || "Error",
    message: error.message,
  };

  for (const key of [
    "code",
    "severity",
    "detail",
    "hint",
    "schema",
    "table",
    "column",
    "constraint",
    "routine",
    "where",
    "position",
  ]) {
    if (error[key] !== undefined) {
      formatted[key] = sanitizeLogValue(error[key]);
    }
  }

  return formatted;
}

function sanitizeLogValue(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (isErrorLike(value)) {
    return formatErrorForLog(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value !== "object") {
    return value;
  }

  if (depth >= 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeLogValue(item, depth + 1));
  }

  const sanitized = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (OMITTED_ERROR_KEYS.has(key)) {
      continue;
    }

    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = REDACTED;
      continue;
    }

    sanitized[key] = sanitizeLogValue(entryValue, depth + 1);
  }

  return sanitized;
}

function formatMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return "";
  }

  const sanitizedMeta = sanitizeLogValue(meta);
  const entries = Object.entries(sanitizedMeta).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return "";
  }

  return entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
}

function createLogMethod(currentLevel, targetLevel, writer) {
  return (message, meta, ...rest) => {
    if (!shouldLog(currentLevel, targetLevel)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${targetLevel}]`;
    const formattedMeta = formatMeta(meta);

    pushToLogRingBuffer(targetLevel, message, formattedMeta || undefined);

    if (formattedMeta) {
      writer(prefix, message, formattedMeta, ...rest);
      return;
    }

    writer(prefix, message, ...(meta === undefined ? rest : [meta, ...rest]));
  };
}

function createLogger(level = "info") {
  const currentLevel = normalizeLevel(String(level).toLowerCase());

  return {
    debug: createLogMethod(currentLevel, "debug", console.log),
    info: createLogMethod(currentLevel, "info", console.log),
    warn: createLogMethod(currentLevel, "warn", console.warn),
    error: createLogMethod(currentLevel, "error", console.error),
  };
}

module.exports = {
  formatErrorForLog,
  sanitizeLogValue,
  getLogRingBuffer,
  createLogger,
};
