const crypto = require("node:crypto");
const fsPromises = require("node:fs/promises");
const nodePath = require("node:path");

function hasBucketConfig(config = {}) {
  return Boolean(
    config.bucket?.name
    && config.bucket?.accessKeyId
    && config.bucket?.secretAccessKey
    && config.bucket?.endpoint,
  );
}

function hasLocalStorageConfig(config = {}) {
  return Boolean(String(config.localStorage?.dir || "").trim());
}

// True when any media backend is available: an S3-compatible bucket OR a local
// directory (e.g. a Railway volume mounted at /data). The bucket takes priority
// when both are set.
function hasStorageConfig(config = {}) {
  return hasBucketConfig(config) || hasLocalStorageConfig(config);
}

function resolveLocalObjectPath(config, key) {
  const dir = String(config.localStorage?.dir || "").trim();
  if (!dir) {
    throw new Error("Local media storage is not configured.");
  }
  const normalizedKey = nodePath.normalize(String(key || "")).replace(/^(\.\.[/\\])+/, "");
  if (!normalizedKey || normalizedKey.startsWith("..") || nodePath.isAbsolute(normalizedKey)) {
    throw new Error("Invalid media storage key.");
  }
  // Defense-in-depth: resolve and verify the final path stays within the
  // storage root before any filesystem access.
  const baseResolved = nodePath.resolve(dir);
  const fullPath = nodePath.resolve(baseResolved, normalizedKey);
  if (fullPath !== baseResolved && !fullPath.startsWith(baseResolved + nodePath.sep)) {
    throw new Error("Invalid media storage key.");
  }
  return fullPath;
}

function inferMimeTypeFromKey(key) {
  switch (nodePath.extname(String(key || "")).toLowerCase()) {
    case ".webp": return "image/webp";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".png": return "image/png";
    case ".mp3": return "audio/mpeg";
    case ".wav": return "audio/wav";
    case ".ogg": return "audio/ogg";
    default: return "application/octet-stream";
  }
}

function buildLocalMediaUrl(key) {
  const encoded = String(key || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/admin/media/${encoded}`;
}

// Resolves a browser-usable URL for a stored object. Bucket mode returns a
// short-lived presigned S3 URL; local mode returns a relative admin route that
// streams the file from disk (auth-protected by the admin server).
function buildMediaGetUrl({ config, key, now, expiresInSeconds } = {}) {
  if (hasBucketConfig(config)) {
    return buildPresignedBucketGetUrl({ config, key, now, expiresInSeconds });
  }
  if (hasLocalStorageConfig(config)) {
    return buildLocalMediaUrl(key);
  }
  throw new Error("No media storage backend is configured.");
}

function buildBucketObjectUrl(config, key) {
  const endpoint = new URL(config.bucket.endpoint);
  const encodedKey = key.split("/").map((segment) => encodeRfc3986(segment)).join("/");
  // Default to virtual-hosted-style URLs (bucket.endpoint-host/key), which most
  // S3-compatible providers (incl. Tigris / storageapi.dev) require. Set
  // BUCKET_FORCE_PATH_STYLE=true for providers that only support path-style
  // (endpoint-host/bucket/key), e.g. self-hosted MinIO without DNS.
  if (config.bucket.forcePathStyle) {
    return new URL(`${endpoint.origin}/${config.bucket.name}/${encodedKey}`);
  }
  return new URL(`${endpoint.protocol}//${config.bucket.name}.${endpoint.host}/${encodedKey}`);
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function createCanonicalHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [String(key).toLowerCase().trim(), String(value || "").trim()])
    .sort((left, right) => left[0].localeCompare(right[0]));
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getSigningKey(secretAccessKey, shortDate, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function buildStorageKey({ prefix = "generated-images", userScope, imageId, mimeType }) {
  const now = new Date();
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  const extension = normalizedMimeType === "image/webp"
    ? "webp"
    : normalizedMimeType === "image/jpeg"
      ? "jpg"
      : normalizedMimeType === "image/gif"
        ? "gif"
        : "png";
  return [
    String(prefix || "generated-images").replace(/^\/+|\/+$/g, ""),
    String(userScope || "user").replace(/[^\w-]+/g, "-") || "user",
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${imageId}.${extension}`,
  ].join("/");
}

async function uploadBufferToBucket({
  config,
  key,
  body,
  contentType,
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  if (!hasBucketConfig(config) && hasLocalStorageConfig(config)) {
    const filePath = resolveLocalObjectPath(config, key);
    await fsPromises.mkdir(nodePath.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, body);
    return { key, url: buildLocalMediaUrl(key) };
  }

  if (!hasBucketConfig(config)) {
    throw new Error("Bucket storage is not configured.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for bucket uploads.");
  }

  const url = buildBucketObjectUrl(config, key);
  const payloadHash = hash(body);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const canonicalHeaders = createCanonicalHeaders({
    host: url.host,
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  });
  const signedHeaders = canonicalHeaders.map(([keyName]) => keyName).join(";");
  const canonicalRequest = [
    "PUT",
    url.pathname,
    "",
    canonicalHeaders.map(([keyName, value]) => `${keyName}:${value}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${shortDate}/${config.bucket.region || "auto"}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    getSigningKey(
      config.bucket.secretAccessKey,
      shortDate,
      config.bucket.region || "auto",
      "s3",
    ),
    stringToSign,
    "hex",
  );
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.bucket.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetchImpl(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Bucket upload failed with status ${response.status}.`);
  }

  return {
    key,
    url: url.toString(),
  };
}

async function downloadBufferFromBucket({
  config,
  key,
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  if (!hasBucketConfig(config) && hasLocalStorageConfig(config)) {
    const filePath = resolveLocalObjectPath(config, key);
    const buffer = await fsPromises.readFile(filePath);
    return { key, buffer, mimeType: inferMimeTypeFromKey(key) };
  }

  if (!hasBucketConfig(config)) {
    throw new Error("Bucket storage is not configured.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for bucket downloads.");
  }

  const url = buildBucketObjectUrl(config, key);
  const payloadHash = hash("");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const canonicalHeaders = createCanonicalHeaders({
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  });
  const signedHeaders = canonicalHeaders.map(([keyName]) => keyName).join(";");
  const canonicalRequest = [
    "GET",
    url.pathname,
    "",
    canonicalHeaders.map(([keyName, value]) => `${keyName}:${value}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${shortDate}/${config.bucket.region || "auto"}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    getSigningKey(
      config.bucket.secretAccessKey,
      shortDate,
      config.bucket.region || "auto",
      "s3",
    ),
    stringToSign,
    "hex",
  );
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.bucket.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
  });

  if (!response.ok) {
    throw new Error(`Bucket download failed with status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    key,
    buffer: Buffer.from(arrayBuffer),
    mimeType: String(response.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase() || "",
  };
}

async function deleteObjectFromBucket({
  config,
  key,
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  if (!hasBucketConfig(config) && hasLocalStorageConfig(config)) {
    const filePath = resolveLocalObjectPath(config, key);
    await fsPromises.rm(filePath, { force: true });
    return { key };
  }

  if (!hasBucketConfig(config)) {
    throw new Error("Bucket storage is not configured.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for bucket deletes.");
  }

  const url = buildBucketObjectUrl(config, key);
  const payloadHash = hash("");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const canonicalHeaders = createCanonicalHeaders({
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  });
  const signedHeaders = canonicalHeaders.map(([keyName]) => keyName).join(";");
  const canonicalRequest = [
    "DELETE",
    url.pathname,
    "",
    canonicalHeaders.map(([keyName, value]) => `${keyName}:${value}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${shortDate}/${config.bucket.region || "auto"}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    getSigningKey(
      config.bucket.secretAccessKey,
      shortDate,
      config.bucket.region || "auto",
      "s3",
    ),
    stringToSign,
    "hex",
  );
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.bucket.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetchImpl(url, {
    method: "DELETE",
    headers: {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
  });

  if (!response.ok) {
    throw new Error(`Bucket delete failed with status ${response.status}.`);
  }

  return { key };
}

function buildPresignedBucketGetUrl({
  config,
  key,
  now = new Date(),
  expiresInSeconds = 15 * 60,
}) {
  if (!hasBucketConfig(config)) {
    throw new Error("Bucket storage is not configured.");
  }

  const url = buildBucketObjectUrl(config, key);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const credentialScope = `${shortDate}/${config.bucket.region || "auto"}/s3/aws4_request`;
  const signedHeaders = "host";

  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${config.bucket.accessKeyId}/${credentialScope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  url.searchParams.set("X-Amz-SignedHeaders", signedHeaders);

  const canonicalQueryString = Array.from(url.searchParams.entries())
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]))
    .map(([queryKey, value]) => `${encodeRfc3986(queryKey)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    url.pathname,
    canonicalQueryString,
    `host:${url.host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    getSigningKey(
      config.bucket.secretAccessKey,
      shortDate,
      config.bucket.region || "auto",
      "s3",
    ),
    stringToSign,
    "hex",
  );

  url.searchParams.set("X-Amz-Signature", signature);
  return url.toString();
}

module.exports = {
  hasBucketConfig,
  hasLocalStorageConfig,
  hasStorageConfig,
  inferMimeTypeFromKey,
  buildStorageKey,
  uploadBufferToBucket,
  downloadBufferFromBucket,
  deleteObjectFromBucket,
  buildPresignedBucketGetUrl,
  buildLocalMediaUrl,
  buildMediaGetUrl,
};
