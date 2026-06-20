/**
 * http/secondLifeApi
 *
 * Phase 5 — authenticated Second Life bridge API.
 *
 * A Second Life relay script / bot controller talks to these endpoints over the
 * same HTTP server the admin dashboard uses. Every request authenticates with
 * the owner-configured shared secret (sha256 compared in constant time against
 * the stored hash; the plaintext is never logged). Requests normalize into the
 * ONE shared companion pipeline via the Second Life adapter.
 *
 * Endpoints:
 *   POST /api/second-life/register
 *   POST /api/second-life/heartbeat
 *   POST /api/second-life/event
 *   POST /api/second-life/poll
 *   POST /api/second-life/command-result
 *   POST /api/second-life/avatar-scan
 *   POST /api/second-life/object-scan
 *   POST /api/second-life/location
 *   GET  /api/second-life/status/:companionId
 *
 * This handler is intentionally NOT behind admin basic-auth — it is machine to
 * machine and guarded by the shared secret instead. It returns `false` when the
 * path is not a Second Life API path so the caller can continue routing.
 */

const { resolveCompanionId } = require("../companion/promptProfileService");

const API_PREFIX = "/api/second-life";
const MAX_BODY_BYTES = 256 * 1024;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload == null ? {} : payload);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function extractSecret(req, body) {
  const header = req.headers["x-bridge-secret"];
  if (header) return String(Array.isArray(header) ? header[0] : header);
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  if (body && body.secret) return String(body.secret);
  return "";
}

function normalizeEventFromBody(body, fallbackType) {
  return {
    eventType: String(body.type || body.eventType || fallbackType || "").trim(),
    externalUserId: body.avatarUuid != null ? String(body.avatarUuid) : "",
    userDisplayName: body.avatarName != null ? String(body.avatarName) : "",
    messageText: body.message != null ? String(body.message) : (body.messageText != null ? String(body.messageText) : ""),
    region: body.region != null ? String(body.region) : "",
    parcel: body.parcel != null ? String(body.parcel) : "",
    coordinates: body.coordinates != null ? body.coordinates : undefined,
    activity: body.activity != null ? String(body.activity) : "",
    outfit: body.outfit != null ? String(body.outfit) : "",
    animation: body.animation != null ? String(body.animation) : "",
    object: body.object != null ? body.object : undefined,
    nearbyAvatars: Array.isArray(body.nearbyAvatars) ? body.nearbyAvatars : undefined,
    nearbyObjects: Array.isArray(body.nearbyObjects) ? body.nearbyObjects : undefined,
    ownerPresent: body.ownerPresent !== undefined ? Boolean(body.ownerPresent) : undefined,
    privacyLevel: body.privacyLevel != null ? String(body.privacyLevel) : "public",
    agentUuid: body.agentUuid != null ? String(body.agentUuid) : "",
    sourceEventId: body.eventId != null ? String(body.eventId) : (body.sourceEventId != null ? String(body.sourceEventId) : ""),
    timestamp: body.timestamp != null ? String(body.timestamp) : "",
  };
}

async function handleSecondLifeApiRequest({ req, res, url, context }) {
  if (!url.pathname.startsWith(API_PREFIX)) {
    return false;
  }

  const logger = context.logger || null;
  const secondLife = context.secondLife || null;
  const adapter = context.secondLifeAdapter || null;
  const config = context.config || {};

  if (!secondLife || secondLife.available !== true) {
    sendJson(res, 503, { ok: false, error: "second_life_store_unavailable" });
    return true;
  }

  const subPath = url.pathname.slice(API_PREFIX.length) || "/";

  // GET status/:companionId — the only GET endpoint.
  if (req.method === "GET" && subPath.startsWith("/status/")) {
    const companionId = decodeURIComponent(subPath.slice("/status/".length)).trim()
      || resolveCompanionId(config);
    const secret = extractSecret(req, {});
    const authed = await secondLife.verifySharedSecret({ companionId, secret });
    if (!authed) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    try {
      const status = await secondLife.getBridgeStatus({ companionId });
      sendJson(res, 200, { ok: true, companionId, status });
    } catch (error) {
      logger?.error?.("[second-life-api] status failed.", { error: error.message });
      sendJson(res, 500, { ok: false, error: "status_failed" });
    }
    return true;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const status = error.message === "payload_too_large" ? 413 : 400;
    sendJson(res, status, { ok: false, error: error.message });
    return true;
  }

  const companionId = (body.companionId != null ? String(body.companionId) : "").trim()
    || resolveCompanionId(config);
  const secret = extractSecret(req, body);

  const authed = await secondLife.verifySharedSecret({ companionId, secret });
  if (!authed) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  try {
    switch (subPath) {
      case "/register": {
        const settings = await secondLife.registerAgent({
          companionId,
          agentName: body.agentName,
          agentUuid: body.agentUuid,
          ownerAvatarUuid: body.ownerAvatarUuid,
        });
        sendJson(res, 200, { ok: true, companionId, settings });
        return true;
      }

      case "/heartbeat": {
        if (!adapter) {
          await secondLife.recordHeartbeat({ companionId, agentUuid: String(body.agentUuid || "") });
        } else {
          await adapter.handleEvent({
            companionId,
            event: {
              eventType: "heartbeat",
              agentUuid: String(body.agentUuid || ""),
              ownerPresent: body.ownerPresent !== undefined ? Boolean(body.ownerPresent) : undefined,
            },
          });
        }
        sendJson(res, 200, { ok: true, companionId });
        return true;
      }

      case "/event": {
        if (!adapter) {
          sendJson(res, 503, { ok: false, error: "adapter_unavailable" });
          return true;
        }
        const result = await adapter.handleEvent({ companionId, event: normalizeEventFromBody(body) });
        sendJson(res, 200, { ok: true, companionId, result });
        return true;
      }

      case "/poll": {
        const commands = await secondLife.claimPendingCommands({
          companionId,
          agentUuid: String(body.agentUuid || ""),
          limit: Number(body.limit) || 20,
        });
        sendJson(res, 200, { ok: true, companionId, commands });
        return true;
      }

      case "/command-result": {
        const updated = await secondLife.markCommandResult({
          companionId,
          commandId: String(body.commandId || ""),
          status: String(body.status || "completed"),
          errorMessage: String(body.errorMessage || ""),
        });
        sendJson(res, 200, { ok: true, companionId, command: updated });
        return true;
      }

      case "/avatar-scan": {
        if (adapter) {
          await adapter.handleEvent({
            companionId,
            event: { eventType: "avatar_nearby", nearbyAvatars: Array.isArray(body.nearbyAvatars) ? body.nearbyAvatars : [] },
          });
        } else {
          await secondLife.upsertWorldState({
            companionId,
            patch: { nearbyAvatars: Array.isArray(body.nearbyAvatars) ? body.nearbyAvatars : [] },
          });
        }
        sendJson(res, 200, { ok: true, companionId });
        return true;
      }

      case "/object-scan": {
        if (Array.isArray(body.objects)) {
          for (const obj of body.objects) {
            if (obj && obj.objectUuid) {
              await secondLife.upsertObject({ companionId, ...obj });
            }
          }
        }
        await secondLife.upsertWorldState({
          companionId,
          patch: { nearbyObjects: Array.isArray(body.nearbyObjects) ? body.nearbyObjects : [] },
        });
        sendJson(res, 200, { ok: true, companionId });
        return true;
      }

      case "/location": {
        await secondLife.upsertWorldState({
          companionId,
          patch: {
            currentRegion: body.region,
            currentParcel: body.parcel,
            currentCoordinates: body.coordinates,
          },
        });
        sendJson(res, 200, { ok: true, companionId });
        return true;
      }

      default:
        sendJson(res, 404, { ok: false, error: "unknown_endpoint" });
        return true;
    }
  } catch (error) {
    logger?.error?.("[second-life-api] Request handler failed.", {
      endpoint: subPath,
      error: error.message,
    });
    sendJson(res, 500, { ok: false, error: "internal_error" });
    return true;
  }
}

module.exports = { handleSecondLifeApiRequest, API_PREFIX };
