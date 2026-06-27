"use strict";

/**
 * webLearningTool
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Disabled by default. When DANTE_WEB_LEARNING_ENABLED=true and a web search
 * provider is configured, Dante can discover real learning resources via web
 * search to satisfy learning/novelty/beauty needs.
 *
 * When disabled (default), any call to search() returns null and the caller
 * should fall back to creating a resource_request for Jenna or a private
 * reflection — never fake a result.
 *
 * Daily limit: DANTE_WEB_SEARCH_DAILY_LIMIT (default 5) prevents runaway costs.
 * Provider: DANTE_WEB_SEARCH_PROVIDER (only "brave" supported for now).
 * API key: DANTE_WEB_SEARCH_API_KEY.
 *
 * When DANTE_RESOURCE_DISCOVERY_ENABLED=true, discovered results are added
 * to resourceDiscoveryEngine automatically by the executor, not here.
 * This module's only job is: search → return structured result or null.
 */

const ENABLED     = process.env.DANTE_WEB_LEARNING_ENABLED === "true";
const DAILY_LIMIT = Number(process.env.DANTE_WEB_SEARCH_DAILY_LIMIT ?? 5);
const PROVIDER    = process.env.DANTE_WEB_SEARCH_PROVIDER || "";
const API_KEY     = process.env.DANTE_WEB_SEARCH_API_KEY  || "";

// Simple in-memory daily usage counter. Resets at midnight UTC.
let _dailyDate  = null;
let _dailyCount = 0;

function _resetIfNewDay(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (_dailyDate !== today) {
    _dailyDate  = today;
    _dailyCount = 0;
  }
}

function isEnabled() {
  return ENABLED && Boolean(PROVIDER) && Boolean(API_KEY);
}

function getDailyUsage(now = new Date()) {
  _resetIfNewDay(now);
  return { used: _dailyCount, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - _dailyCount) };
}

function incrementUsage(now = new Date()) {
  _resetIfNewDay(now);
  _dailyCount++;
}

function _overLimit(now = new Date()) {
  _resetIfNewDay(now);
  return _dailyCount >= DAILY_LIMIT;
}

/**
 * search — attempt one web search for a learning resource.
 *
 * Returns: { title, url, summary, source } on success, or null.
 * Never throws — callers must handle null as "discovery unavailable".
 */
async function search({ query, needType = "learning", logger = null, now = new Date() } = {}) {
  if (!isEnabled()) {
    logger?.debug("[web-learning] disabled — returning null");
    return null;
  }
  if (_overLimit(now)) {
    logger?.debug("[web-learning] daily limit reached", { used: _dailyCount, limit: DAILY_LIMIT });
    return null;
  }
  if (!query || typeof query !== "string" || query.trim().length < 3) {
    return null;
  }

  try {
    if (PROVIDER === "brave") {
      const result = await _braveSearch(query, logger);
      if (result) {
        incrementUsage(now);
        return result;
      }
    }
    return null;
  } catch (error) {
    logger?.warn("[web-learning] search error", { error: error?.message, query, needType });
    return null;
  }
}

async function _braveSearch(query, logger) {
  // Dynamic import so the module loads without crashing when not configured.
  let https;
  try {
    https = require("https");
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const safeQuery = encodeURIComponent(query.trim().slice(0, 120));
    const options = {
      hostname: "api.search.brave.com",
      path:     `/res/v1/web/search?q=${safeQuery}&count=1`,
      method:   "GET",
      headers: {
        "Accept":              "application/json",
        "Accept-Encoding":     "gzip",
        "X-Subscription-Token": API_KEY,
      },
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString();
          const data = JSON.parse(body);
          const hit  = data?.web?.results?.[0];
          if (!hit) { resolve(null); return; }
          resolve({
            title:   hit.title   || "",
            url:     hit.url     || "",
            summary: hit.description || hit.extra_snippets?.[0] || "",
            source:  "brave_search",
          });
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = { search, isEnabled, getDailyUsage, incrementUsage };
