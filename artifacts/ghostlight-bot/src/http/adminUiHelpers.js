const { SUPPORTED_MEMORY_DOMAINS } = require("../memory/domains");
const { SUPPORTED_AUTOMATION_TYPES } = require("../storage");

const MEMORY_CATEGORY_OPTIONS = Object.freeze(
  SUPPORTED_MEMORY_DOMAINS.filter((value) => !["recent_events", "timeline"].includes(value)),
);

function normalizeTheme(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "dark" ? "dark" : "light";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOptions(options, selectedValue) {
  const optionLabels = {
    timeline_daily: "Daily",
    timeline_weekly: "Weekly",
  };

  return options.map((option) => {
    const selected = option === selectedValue ? " selected" : "";
    return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(optionLabels[option] || option)}</option>`;
  }).join("");
}

function getAutomationTypeLabel(type) {
  if (type === "nudge" || type === "check_in") {
    return "check-in";
  }

  if (type === "daily_thread") {
    return "daily thread";
  }

  return String(type || "");
}

function renderAutomationTypeOptions(selectedValue) {
  return SUPPORTED_AUTOMATION_TYPES
    .filter((option) => option !== "daily_thread")
    .map((option) => {
      const selected = option === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(getAutomationTypeLabel(option))}</option>`;
    }).join("");
}

function buildMemoryCategoryOptions(selectedValue = "") {
  const options = new Set(MEMORY_CATEGORY_OPTIONS);

  if (selectedValue && !options.has(selectedValue)) {
    options.add(selectedValue);
  }

  return Array.from(options);
}

function withThemeField(theme) {
  return `<input type="hidden" name="theme" value="${escapeHtml(theme)}">`;
}

function buildThemeLinks(url) {
  const lightParams = new URLSearchParams(url.searchParams);
  lightParams.set("theme", "light");
  const darkParams = new URLSearchParams(url.searchParams);
  darkParams.set("theme", "dark");

  return {
    light: `${url.pathname}?${lightParams.toString()}`,
    dark: `${url.pathname}?${darkParams.toString()}`,
  };
}

function buildAdminLocation({ path = "/admin", message = "", error = "", theme = "light", extra = {} } = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  if (theme) {
    params.set("theme", normalizeTheme(theme));
  }

  if (message) {
    params.set("message", message);
  }

  if (error) {
    params.set("error", error);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function normalizeAdminReturnPath(value, fallback = "/admin") {
  const raw = String(value || "").trim();

  if (!raw) {
    return fallback;
  }

  if (!raw.startsWith("/admin")) {
    return fallback;
  }

  return raw;
}

function buildReturnLocation({
  returnTo = "",
  fallbackPath = "/admin",
  message = "",
  error = "",
  theme = "light",
  extra = {},
} = {}) {
  const safePath = normalizeAdminReturnPath(returnTo, fallbackPath);
  const url = new URL(safePath, "http://localhost");
  const mergedExtras = {};

  for (const [key, value] of url.searchParams.entries()) {
    mergedExtras[key] = value;
  }

  for (const [key, value] of Object.entries(extra)) {
    mergedExtras[key] = value;
  }

  return buildAdminLocation({
    path: url.pathname,
    message,
    error,
    theme,
    extra: mergedExtras,
  });
}

function getMessage(url) {
  return url.searchParams.get("message") || "";
}

function getError(url) {
  return url.searchParams.get("error") || "";
}

module.exports = {
  normalizeTheme,
  escapeHtml,
  renderOptions,
  getAutomationTypeLabel,
  renderAutomationTypeOptions,
  buildMemoryCategoryOptions,
  withThemeField,
  buildThemeLinks,
  buildAdminLocation,
  buildReturnLocation,
  getMessage,
  getError,
};
