function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function buildHeaders(apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["api-key"] = apiKey;
  }

  return headers;
}

function resolveCollectionName(config = {}, collectionName = "") {
  const normalized = String(collectionName || "").trim();
  return normalized || config.qdrant?.collection;
}

function classifyFetchError(err) {
  const message = String(err?.message || err || "");
  const cause = String(err?.cause?.message || err?.cause?.code || "");
  const combined = `${message} ${cause}`.toLowerCase();

  if (/invalid url|failed to parse|is not a valid url/i.test(message)) return "invalid_url";
  if (/enotfound|dns|getaddrinfo/i.test(combined)) return "dns_failed";
  if (/econnrefused|connection refused/i.test(combined)) return "connection_refused";
  if (/etimedout|timed? ?out/i.test(combined)) return "timeout";
  if (/401|403|unauthorized|forbidden/i.test(message)) return "auth_failed";
  if (/bad_json|json|syntax error/i.test(message)) return "bad_json";
  return "unknown_network_error";
}

function validateQdrantUrl(url) {
  const s = String(url || "").trim();
  if (!s) return { valid: false, reason: "empty" };
  if (!/^https?:\/\//i.test(s)) return { valid: false, reason: "missing_protocol" };
  try {
    new URL(s);
    return { valid: true };
  } catch {
    return { valid: false, reason: "invalid_url" };
  }
}

async function checkQdrantHealth({ config }) {
  const url = config?.qdrant?.url || "";
  const apiKey = config?.qdrant?.apiKey || "";
  const collectionName = config?.qdrant?.collection || "ghostlight-memory";
  const safeHost = url
    ? String(url).replace(/^https?:\/\//, "").replace(/:\d+.*/, "") + "…"
    : "not_configured";

  const urlValidation = validateQdrantUrl(url);
  const result = {
    enabled: Boolean(url),
    urlConfigured: Boolean(url),
    keyConfigured: Boolean(apiKey),
    collectionName,
    baseUrlSafe: safeHost,
    reachable: false,
    statusCode: null,
    safeErrorReason: null,
    lastCheckedAt: new Date().toISOString(),
  };

  if (!url) {
    result.safeErrorReason = "qdrant_url_not_configured";
    return result;
  }

  if (!urlValidation.valid) {
    result.safeErrorReason = urlValidation.reason === "missing_protocol"
      ? "url_missing_http_protocol"
      : "invalid_url";
    return result;
  }

  try {
    const baseUrl = normalizeBaseUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch(`${baseUrl}/healthz`, {
        method: "GET",
        headers: buildHeaders(apiKey),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    result.statusCode = response.status;
    result.reachable = response.ok || response.status === 404;
    if (!response.ok && response.status !== 404) {
      result.safeErrorReason = (response.status === 401 || response.status === 403)
        ? "auth_failed"
        : `http_${response.status}`;
    }
  } catch (err) {
    result.reachable = false;
    result.safeErrorReason = classifyFetchError(err);
  }

  return result;
}

const FETCH_ERROR_HINTS = {
  dns_failed: "Qdrant hostname could not be resolved — check QDRANT_URL hostname",
  connection_refused: "Qdrant refused the connection — check QDRANT_URL port and that the service is running",
  timeout: "Qdrant connection timed out — check network or service health",
  invalid_url: "QDRANT_URL is malformed — must be a full URL including http://",
  auth_failed: "Qdrant rejected the request — check QDRANT_API_KEY",
  bad_json: "Qdrant returned an unexpected response format",
  unknown_network_error: "Network error reaching Qdrant",
};

async function qdrantRequest({ config, method, path, body, allow404 = false }) {
  const baseUrl = normalizeBaseUrl(config.qdrant.url);

  if (!baseUrl) {
    throw new Error("QDRANT_URL is required.");
  }

  const urlValidation = validateQdrantUrl(baseUrl);
  if (!urlValidation.valid) {
    const hint = urlValidation.reason === "missing_protocol"
      ? " (must include http:// or https://)"
      : "";
    throw new Error(`QDRANT_URL is not a valid URL${hint}`);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: buildHeaders(config.qdrant.apiKey),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    const reason = classifyFetchError(err);
    const hint = FETCH_ERROR_HINTS[reason] || FETCH_ERROR_HINTS.unknown_network_error;
    throw new Error(`${hint} [${reason}]`);
  }

  if (allow404 && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Qdrant request failed (${response.status} ${response.statusText}): ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function getCollection({ config, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);

  return qdrantRequest({
    config,
    method: "GET",
    path: `/collections/${collection}`,
    allow404: true,
  });
}

async function deleteCollection({ config, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);

  return qdrantRequest({
    config,
    method: "DELETE",
    path: `/collections/${collection}`,
    allow404: true,
  });
}

async function ensureCollection({ config, vectorSize, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);
  const existingCollection = await getCollection({ config, collectionName: collection });

  if (existingCollection) {
    return existingCollection;
  }

  return qdrantRequest({
    config,
    method: "PUT",
    path: `/collections/${collection}`,
    body: {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    },
  });
}

function buildQdrantPoint(memory, vector) {
  return {
    id: memory.memoryId,
    vector,
    payload: {
      memory_id: memory.memoryId,
      title: memory.title,
      content: memory.content,
      memory_type: memory.memoryType,
      domain: memory.domain,
      sensitivity: memory.sensitivity,
      source: memory.source,
      active: memory.active,
      importance: memory.importance,
      user_scope: memory.userScope,
      reference_date: memory.referenceDate,
      created_at: memory.createdAt,
      updated_at: memory.updatedAt,
      last_used_at: memory.lastUsedAt,
    },
  };
}

async function upsertPoints({ config, points, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);

  return qdrantRequest({
    config,
    method: "PUT",
    path: `/collections/${collection}/points?wait=true`,
    body: {
      points,
    },
  });
}

async function deletePoints({ config, ids, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);
  const pointIds = Array.isArray(ids)
    ? ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!pointIds.length) {
    return null;
  }

  return qdrantRequest({
    config,
    method: "POST",
    path: `/collections/${collection}/points/delete?wait=true`,
    body: {
      points: pointIds,
    },
  });
}

async function deletePointsByFilter({ config, filter, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);

  if (!filter) {
    return null;
  }

  return qdrantRequest({
    config,
    method: "POST",
    path: `/collections/${collection}/points/delete?wait=true`,
    body: {
      filter,
    },
  });
}

async function getPoints({ config, ids, withVector = false, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);
  const pointIds = Array.isArray(ids)
    ? ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!pointIds.length) {
    return [];
  }

  const response = await qdrantRequest({
    config,
    method: "POST",
    path: `/collections/${collection}/points`,
    body: {
      ids: pointIds,
      with_payload: true,
      with_vector: Boolean(withVector),
    },
    allow404: true,
  });

  return response?.result || [];
}

async function scrollPoints({ config, limit = 20, offset = null, filter = null, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);
  const response = await qdrantRequest({
    config,
    method: "POST",
    path: `/collections/${collection}/points/scroll`,
    body: {
      limit,
      with_payload: true,
      with_vector: false,
      offset: offset || undefined,
      filter: filter || undefined,
    },
    allow404: true,
  });

  return {
    points: response?.result?.points || [],
    nextOffset: response?.result?.next_page_offset || null,
  };
}

async function searchPoints({ config, vector, limit, filter, collectionName = "" }) {
  const collection = resolveCollectionName(config, collectionName);
  const response = await qdrantRequest({
    config,
    method: "POST",
    path: `/collections/${collection}/points/search`,
    body: {
      vector,
      limit,
      with_payload: true,
      with_vector: false,
      filter,
    },
    allow404: true,
  });

  return response?.result || [];
}

module.exports = {
  normalizeBaseUrl,
  resolveCollectionName,
  classifyFetchError,
  validateQdrantUrl,
  checkQdrantHealth,
  getCollection,
  deleteCollection,
  ensureCollection,
  buildQdrantPoint,
  upsertPoints,
  deletePoints,
  deletePointsByFilter,
  getPoints,
  scrollPoints,
  searchPoints,
};
