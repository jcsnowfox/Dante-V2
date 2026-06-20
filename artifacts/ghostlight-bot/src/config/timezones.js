function formatTimezoneError(value) {
  return `Invalid timezone "${value}". Use an IANA timezone like America/Chicago, Europe/London, or UTC. Fixed GMT offsets like GMT-5 are not supported.`;
}

function isFixedOffsetTimezone(value) {
  const normalized = String(value || "").trim();
  return /^(?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::?[0-5]\d)?$/i.test(normalized)
    || /^Etc\/GMT[+-]\d{1,2}$/i.test(normalized);
}

function normalizeIanaTimezone(value, { defaultValue = "UTC" } = {}) {
  const normalized = String(value || "").trim() || defaultValue;

  if (!normalized) {
    return "UTC";
  }

  if (isFixedOffsetTimezone(normalized)) {
    throw new Error(formatTimezoneError(value));
  }

  try {
    const resolved = new Intl.DateTimeFormat("en-US", {
      timeZone: normalized,
    }).resolvedOptions().timeZone || normalized;

    if (isFixedOffsetTimezone(resolved)) {
      throw new Error(formatTimezoneError(value));
    }

    return resolved;
  } catch (error) {
    if (error?.message === formatTimezoneError(value)) {
      throw error;
    }

    throw new Error(formatTimezoneError(value));
  }
}

module.exports = {
  normalizeIanaTimezone,
  isFixedOffsetTimezone,
};
