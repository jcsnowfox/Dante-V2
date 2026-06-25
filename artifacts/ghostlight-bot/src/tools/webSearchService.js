"use strict";

const https = require("https");
const http = require("http");

const SEARCH_INTENT_PATTERNS = [
  { regex: /\bsearch the (?:internet|web|net)\b/i, confidence: 0.95, requestedFreshness: true },
  { regex: /\b(?:search|google)\b.*\b(?:internet|web|online)\b/i, confidence: 0.92, requestedFreshness: true },
  { regex: /\blook (?:this|it) up\b/i, confidence: 0.9, requestedFreshness: false },
  { regex: /\bcheck (?:online|the (?:internet|web))\b/i, confidence: 0.9, requestedFreshness: true },
  { regex: /\bcan you (?:search|check|look up)\b/i, confidence: 0.88, requestedFreshness: false },
  { regex: /\bgive me (?:links?|urls?)\b/i, confidence: 0.87, requestedFreshness: false, needsLinks: true },
  { regex: /\bfind (?:links?|urls?)\b/i, confidence: 0.85, requestedFreshness: false, needsLinks: true },
  { regex: /\bfind (?:current|latest|recent)\b/i, confidence: 0.85, requestedFreshness: true },
  { regex: /\bwhat'?s? the latest\b/i, confidence: 0.83, requestedFreshness: true },
  { regex: /\bcurrent (?:docs?|documentation|api|pricing|models?|voices?)\b/i, confidence: 0.82, requestedFreshness: true },
  { regex: /\bcheck if (?:this|the) api\b/i, confidence: 0.82, requestedFreshness: false },
  { regex: /\blook up current\b/i, confidence: 0.85, requestedFreshness: true },
  { regex: /\bsearch\b.*\bfor\b/i, confidence: 0.78, requestedFreshness: false },
  { regex: /\blook up\b/i, confidence: 0.75, requestedFreshness: false },
];

const NO_SEARCH_PATTERNS = [
  /\b(?:do you remember|what did we|what were you thinking)\b/i,
  /\bstate of us\b/i,
  /\b(?:what did i say|what did we fix|what we (?:talked|discussed))\b/i,
  /\b(?:our (?:project|timeline|history))\b/i,
  /\b(?:how are you|how do you feel|are you okay)\b/i,
  /\b(?:i love you|miss you|need you)\b/i,
];

function extractSearchQuery(text) {
  const patterns = [
    /search (?:the (?:internet|web|net) )?for (.+)/i,
    /search\s+(.+?)\s+for (.+)/i,
    /look (?:this )?up:?\s+(.+)/i,
    /check (?:online|the (?:internet|web)) (?:for )?(.+)/i,
    /find (?:current|latest|recent)?\s*(?:info(?:rmation)? (?:on|about)|docs? (?:for|on))?\s*(.+)/i,
    /what'?s? the latest (?:on|about)?\s*(.+)/i,
    /give me (?:links?|urls?) (?:for|on|to|about)\s+(.+)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const q = (m[2] || m[1] || '').trim().replace(/[.?!]+$/, '').trim();
      if (q.length > 3) return q;
    }
  }
  return text.trim().replace(/^(?:dante,?\s+)?/i, '').slice(0, 120);
}

function detectSearchIntent(text) {
  const t = String(text || '');
  for (const np of NO_SEARCH_PATTERNS) {
    if (np.test(t)) {
      return { shouldSearch: false, searchQuery: null, reason: 'memory_or_relationship_query', confidence: 0, requestedFreshness: false, needsLinks: false };
    }
  }
  for (const pat of SEARCH_INTENT_PATTERNS) {
    if (pat.regex.test(t)) {
      const q = extractSearchQuery(t);
      return {
        shouldSearch: true,
        searchQuery: q,
        reason: 'explicit_search_request',
        confidence: pat.confidence,
        requestedFreshness: !!pat.requestedFreshness,
        needsLinks: !!pat.needsLinks,
      };
    }
  }
  return { shouldSearch: false, searchQuery: null, reason: 'no_search_intent', confidence: 0, requestedFreshness: false, needsLinks: false };
}

function normalizeResult(raw, provider, rank) {
  if (provider === 'brave') {
    return { title: raw.title || '', url: raw.url || '', snippet: raw.description || raw.extra_snippets?.[0] || '', source: raw.meta_url?.hostname || '', published_at: raw.page_age || null, fetched_at: new Date().toISOString(), rank };
  }
  if (provider === 'serper') {
    return { title: raw.title || '', url: raw.link || '', snippet: raw.snippet || '', source: raw.displayLink || '', published_at: raw.date || null, fetched_at: new Date().toISOString(), rank };
  }
  if (provider === 'tavily') {
    let src = '';
    try { src = new URL(raw.url || '').hostname; } catch { src = ''; }
    return { title: raw.title || '', url: raw.url || '', snippet: raw.content || raw.snippet || '', source: src, published_at: raw.published_date || null, fetched_at: new Date().toISOString(), rank };
  }
  if (provider === 'bing') {
    return { title: raw.name || '', url: raw.url || '', snippet: raw.snippet || '', source: raw.displayUrl || '', published_at: raw.dateLastCrawled || null, fetched_at: new Date().toISOString(), rank };
  }
  return { title: raw.title || '', url: raw.url || raw.link || '', snippet: raw.snippet || raw.description || raw.content || '', source: raw.source || '', published_at: raw.published_at || null, fetched_at: new Date().toISOString(), rank };
}

function makeRequest(url, { method = 'GET', headers = {}, body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Dante-Bot/1.0', ...headers },
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function createWebSearchService({ config, logger } = {}) {
  const enabled = String(process.env.DANTE_WEB_SEARCH_ENABLED || '').toLowerCase() === 'true';
  const provider = String(process.env.DANTE_WEB_SEARCH_PROVIDER || 'brave').toLowerCase();
  const apiKey = process.env.DANTE_WEB_SEARCH_API_KEY || '';
  const maxResults = Math.min(Number(process.env.DANTE_WEB_SEARCH_MAX_RESULTS || '5') || 5, 10);
  const fetchEnabled = String(process.env.DANTE_WEB_FETCH_ENABLED || '').toLowerCase() === 'true';
  const timeoutMs = Math.min(Number(process.env.DANTE_WEB_SEARCH_TIMEOUT_MS || '10000') || 10000, 30000);

  let lastSearchTime = null;
  let lastResultCount = 0;
  let lastSafeError = null;
  let lastQuerySummary = null;

  async function search(query, opts = {}) {
    const n = Math.min(opts.maxResults || maxResults, 10);
    const q = String(query || '').trim().slice(0, 200);
    lastQuerySummary = q.length > 40 ? q.slice(0, 40) + '…' : q;

    logger?.info?.(`[web-search] provider=${provider} enabled=${enabled}`);
    logger?.info?.(`[web-search] query="${q.slice(0, 50)}"`);

    if (!enabled) {
      lastSafeError = 'web_search_disabled';
      logger?.info?.('[web-search] failed reason=web_search_disabled');
      return { results: [], unavailable: true, reason: 'web_search_disabled', suggestedReply: "I can search once web search is enabled." };
    }
    if (!apiKey) {
      lastSafeError = 'no_api_key';
      logger?.warn?.('[web-search] failed reason=no_api_key');
      return { results: [], unavailable: true, reason: 'no_api_key', suggestedReply: "I can search once the web search key is connected." };
    }

    try {
      let rawResults = [];

      if (provider === 'brave') {
        const resp = await makeRequest(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`,
          { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey }, timeoutMs }
        );
        if (resp.status !== 200) throw new Error(`Brave API ${resp.status}`);
        const data = JSON.parse(resp.body);
        rawResults = data?.web?.results || [];
      } else if (provider === 'serper') {
        const body = JSON.stringify({ q, num: n });
        const resp = await makeRequest('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
          body,
          timeoutMs,
        });
        if (resp.status !== 200) throw new Error(`Serper API ${resp.status}`);
        rawResults = JSON.parse(resp.body)?.organic || [];
      } else if (provider === 'tavily') {
        const body = JSON.stringify({ api_key: apiKey, query: q, max_results: n });
        const resp = await makeRequest('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          timeoutMs,
        });
        if (resp.status !== 200) throw new Error(`Tavily API ${resp.status}`);
        rawResults = JSON.parse(resp.body)?.results || [];
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      const results = rawResults.slice(0, n).map((r, i) => normalizeResult(r, provider, i + 1));
      lastSearchTime = new Date().toISOString();
      lastResultCount = results.length;
      lastSafeError = null;
      logger?.info?.(`[web-search] results count=${results.length}`);
      logger?.info?.(`[web-search] fetch enabled=${fetchEnabled} fetched=0`);
      logger?.info?.(`[web-search] reply citations required=${results.length > 0}`);
      return { results, unavailable: false };
    } catch (err) {
      const safeReason = err.message.includes('timeout') ? 'timeout' : 'provider_error';
      lastSafeError = safeReason;
      logger?.warn?.(`[web-search] failed reason=${safeReason}`);
      return { results: [], unavailable: true, reason: safeReason, suggestedReply: "Search failed — I'll answer from what I know." };
    }
  }

  return {
    isEnabled: () => enabled && Boolean(apiKey),
    isSearchEnabled: () => enabled,
    getProvider: () => provider,
    getStatus: () => ({
      enabled,
      provider,
      apiKeyConfigured: Boolean(apiKey),
      apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}****` : null,
      fetchEnabled,
      maxResults,
      timeoutMs,
      lastSearchTime,
      lastResultCount,
      lastSafeError,
      lastQuerySummary,
    }),
    detectSearchIntent,
    search,
  };
}

module.exports = { createWebSearchService, detectSearchIntent };
