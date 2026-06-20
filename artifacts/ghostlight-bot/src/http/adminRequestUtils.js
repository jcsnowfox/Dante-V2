const crypto = require("node:crypto");

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseBasicAuthHeader(header) {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

function timingSafeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeConfiguredCredential(value) {
  return String(value || "").trim();
}

const SESSION_COOKIE_NAME = "ghostlight_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// The signing key is derived from SESSION_SECRET *and* the configured credentials,
// so changing the admin username/password automatically invalidates old sessions.
function deriveSessionKey(adminConfig = {}) {
  const username = normalizeConfiguredCredential(adminConfig.username);
  const password = normalizeConfiguredCredential(adminConfig.password);
  const secret = normalizeConfiguredCredential(adminConfig.secret);
  const credentialFingerprint = username && password ? `${username}:${password}` : secret;

  if (!credentialFingerprint) {
    return "";
  }

  const base = String(process.env.SESSION_SECRET || "").trim() || "ghostlight-admin-session";
  return crypto.createHmac("sha256", base).update(credentialFingerprint).digest();
}

// Validate posted credentials with the exact same comparison rules as Basic Auth.
function validateAdminCredentials(adminConfig = {}, candidateUsername, candidatePassword) {
  const username = normalizeConfiguredCredential(adminConfig.username);
  const password = normalizeConfiguredCredential(adminConfig.password);
  const secret = normalizeConfiguredCredential(adminConfig.secret);

  if (username && password) {
    return timingSafeEqualStrings(candidateUsername, username)
      && timingSafeEqualStrings(candidatePassword, password);
  }

  if (!secret) {
    return false;
  }

  return timingSafeEqualStrings(candidatePassword, secret);
}

function createSessionToken(adminConfig = {}) {
  const key = deriveSessionKey(adminConfig);

  if (!key) {
    return "";
  }

  const payload = base64url(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  const signature = base64url(crypto.createHmac("sha256", key).update(payload).digest());
  return `${payload}.${signature}`;
}

function verifySessionToken(token, adminConfig = {}) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return false;
  }

  const key = deriveSessionKey(adminConfig);

  if (!key) {
    return false;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return false;
  }

  const expected = base64url(crypto.createHmac("sha256", key).update(payload).digest());

  if (!timingSafeEqualStrings(signature, expected)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch (_error) {
    return false;
  }
}

function parseCookies(header) {
  const cookies = {};
  const raw = String(header || "");

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }

  return cookies;
}

function hasValidSessionCookie(req, adminConfig = {}) {
  const cookies = parseCookies(req.headers?.cookie);
  return verifySessionToken(cookies[SESSION_COOKIE_NAME], adminConfig);
}

function issueSessionCookie(res, adminConfig = {}) {
  const token = createSessionToken(adminConfig);

  if (!token) {
    return false;
  }

  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ].join("; "));
  return true;
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=0",
  ].join("; "));
}

function isAuthorized(req, adminConfig = {}) {
  if (hasValidSessionCookie(req, adminConfig)) {
    return true;
  }

  const auth = parseBasicAuthHeader(req.headers.authorization);

  if (!auth) {
    return false;
  }

  return validateAdminCredentials(adminConfig, auth.username, auth.password);
}

function prefersHtml(req) {
  return String(req?.headers?.accept || "").includes("text/html");
}

function sendAuthRequired(res) {
  res.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Ghostlight Admin"',
  });
  res.end("Authentication required.");
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function getFirstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "").split(",")[0].trim();
}

function inferRequestOrigin(req) {
  const headers = req?.headers || {};
  const host = getFirstHeaderValue(headers["x-forwarded-host"]) || getFirstHeaderValue(headers.host);

  if (!host) {
    return "";
  }

  const proto = getFirstHeaderValue(headers["x-forwarded-proto"]) || "https";
  const normalizedProto = proto === "http" ? "http" : "https";

  return `${normalizedProto}://${host}`;
}

function inferSpotifyRedirectUri(req) {
  const origin = inferRequestOrigin(req);

  if (!origin) {
    return "";
  }

  return `${origin}/admin/actions/music-spotify-callback`;
}

function appendFieldValue(target, key, value) {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = value;
    return;
  }

  if (Array.isArray(target[key])) {
    target[key].push(value);
    return;
  }

  target[key] = [target[key], value];
}

function parseUrlEncoded(body) {
  const params = new URLSearchParams(body.toString("utf8"));
  const fields = {};

  for (const [key, value] of params.entries()) {
    appendFieldValue(fields, key, value);
  }

  return fields;
}

function parseMultipartFormData(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);

  if (!boundaryMatch) {
    throw new Error("Missing multipart boundary.");
  }

  const boundary = `--${boundaryMatch[1]}`;
  const bodyText = body.toString("latin1");
  const parts = bodyText.split(boundary).slice(1, -1);
  const fields = {};
  const files = {};

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    const separatorIndex = part.indexOf("\r\n\r\n");

    if (separatorIndex === -1) {
      continue;
    }

    const headerText = part.slice(0, separatorIndex);
    const valueText = part.slice(separatorIndex + 4).replace(/\r\n$/, "");
    const headers = headerText.split("\r\n");
    const disposition = headers.find((line) => line.toLowerCase().startsWith("content-disposition:"));
    const contentTypeHeader = headers.find((line) => line.toLowerCase().startsWith("content-type:"));

    if (!disposition) {
      continue;
    }

    const nameMatch = disposition.match(/name="([^"]+)"/i);
    const fileMatch = disposition.match(/filename="([^"]*)"/i);

    if (!nameMatch) {
      continue;
    }

    const fieldName = nameMatch[1];

    if (fileMatch && fileMatch[1]) {
      const mimeType = contentTypeHeader
        ? String(contentTypeHeader.split(":").slice(1).join(":") || "").trim().toLowerCase()
        : "";
      const contentBuffer = Buffer.from(valueText, "latin1");
      const fileEntry = {
        filename: fileMatch[1],
        content: contentBuffer.toString("utf8"),
        contentBuffer,
        mimeType,
      };

      if (!files[fieldName]) {
        files[fieldName] = fileEntry;
        continue;
      }

      if (Array.isArray(files[fieldName])) {
        files[fieldName].push(fileEntry);
        continue;
      }

      files[fieldName] = [files[fieldName], fileEntry];
      continue;
    }

    appendFieldValue(fields, fieldName, Buffer.from(valueText, "latin1").toString("utf8"));
  }

  return {
    fields,
    files,
  };
}

async function parseRequestForm(req) {
  const body = await readRequestBody(req);
  const contentType = req.headers["content-type"] || "";

  if (contentType.includes("multipart/form-data")) {
    return parseMultipartFormData(body, contentType);
  }

  return {
    fields: parseUrlEncoded(body),
    files: {},
  };
}

module.exports = {
  parseBasicAuthHeader,
  parseMultipartFormData,
  parseRequestForm,
  isAuthorized,
  sendAuthRequired,
  redirect,
  inferRequestOrigin,
  inferSpotifyRedirectUri,
  validateAdminCredentials,
  issueSessionCookie,
  clearSessionCookie,
  prefersHtml,
};
