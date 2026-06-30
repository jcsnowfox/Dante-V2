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

const crypto = require("node:crypto");

const { resolveCompanionId } = require("../companion/resolveCompanionId");

const API_PREFIX = "/api/second-life";
const SL_PING_PATH = "/sl/ping";
const SL_CHAT_PATH = "/sl/chat";
const SL_DEBUG_PATH = "/sl/debug";
const MAX_BODY_BYTES = 256 * 1024;
const SL_DANTE_COMPANION_ID = "dante_sølvane";
const SL_AVATAR_USERNAME = "Dante0Solvane";
const SL_MAX_RESPONSE_CHARS = 900;

function sendPlainText(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload == null ? {} : payload);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function resolveSecondLifeChatCompanionId(requestedCompanionId, config) {
  const requested = String(requestedCompanionId || "").trim();
  if (!requested) return resolveCompanionId(config);
  if (
    requested.toLowerCase() === "dante"
    || requested === SL_DANTE_COMPANION_ID
  ) {
    return SL_DANTE_COMPANION_ID;
  }
  return requested;
}

function normalizePlainTextReply(reply) {
  return String(reply == null ? "" : reply).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function capPlainTextReply(reply) {
  return normalizePlainTextReply(reply).slice(0, SL_MAX_RESPONSE_CHARS);
}

function getPipelineReturnType(result) {
  if (result == null) return String(result);
  if (Array.isArray(result)) return "array";
  return typeof result;
}

function getPipelineReturnKeys(result) {
  return result && typeof result === "object" && !Array.isArray(result) ? Object.keys(result) : [];
}

function extractSlChatReply(result) {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";

  const direct = result.reply
    || result.text
    || result.content
    || result.message
    || result.output
    || result.response
    || result.finalText
    || result.assistantMessage
    || result.assistant?.content
    || result.responseText
    || result.replyText
    || result.outbound?.responseText
    || "";
  if (direct) return String(direct);

  if (Array.isArray(result.messages)) {
    for (let index = result.messages.length - 1; index >= 0; index -= 1) {
      const message = result.messages[index];
      if (message?.role === "assistant" && message?.content) {
        return String(message.content);
      }
    }
  }

  return "";
}

function previewReply(reply) {
  return String(reply == null ? "" : reply).replace(/\s+/g, " ").trim().slice(0, 120);
}

function readRequestBody(req) {
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
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseRequestBody(raw, contentType = "") {
  const text = String(raw || "").trim();
  if (!text) return {};

  if (String(contentType).includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : { message: text };
  } catch {
    return { message: text, rawBody: text };
  }
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

function firstPresentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value) !== "") {
      return String(value);
    }
  }
  return "";
}

function hasPresentValue(value) {
  return value !== undefined && value !== null && String(value) !== "";
}

function compareSecrets(received, expected) {
  const receivedValue = String(received || "");
  const expectedValue = String(expected || "");
  if (!receivedValue || !expectedValue) return false;

  const receivedBuffer = Buffer.from(receivedValue, "utf8");
  const expectedBuffer = Buffer.from(expectedValue, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function extractSecret(req, body, url = null) {
  const header = req.headers["x-bridge-secret"];
  if (header) return String(Array.isArray(header) ? header[0] : header);
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  return firstPresentValue(
    body?.bridgeKey,
    body?.token,
    url?.searchParams?.get("bridgeKey"),
    url?.searchParams?.get("token"),
    body?.secret,
  );
}

function logSlChatAuthDebug(logger, { body, url, receivedSecret, expectedSecret, accepted }) {
  const bridgeKeyPresent = hasPresentValue(body?.bridgeKey) || hasPresentValue(url?.searchParams?.get("bridgeKey"));
  const tokenPresent = hasPresentValue(body?.token) || hasPresentValue(url?.searchParams?.get("token"));
  logger?.info?.("[sl-bridge] bridgeKey present", { present: bridgeKeyPresent });
  logger?.info?.("[sl-bridge] token present", { present: tokenPresent });
  logger?.info?.("[sl-bridge] received key length", { length: String(receivedSecret || "").length });
  logger?.info?.("[sl-bridge] SL_BRIDGE_KEY exists", { exists: hasPresentValue(expectedSecret) });
  logger?.info?.("[sl-bridge] SL_BRIDGE_KEY length", { length: String(expectedSecret || "").length });
  logger?.info?.(accepted ? "[sl-bridge] auth accepted" : "[sl-bridge] auth denied");
}

/**
 * Parse a field value that a LSL script may send as boolean, integer, or string.
 * Returns true/false for recognised truthy/falsy values, undefined for anything else.
 */
function parseTruthy(value) {
  if (value === true || value === 1) return true;
  if (value === "true" || value === "1") return true;
  if (value === false || value === 0) return false;
  if (value === "false" || value === "0") return false;
  return undefined;
}

/**
 * Normalize an event body from the Second Life relay.
 *
 * Phase 21 adds LSL field aliases so that scripts sending snake_case or
 * alternate field names are normalized to the canonical event shape:
 *
 *   companion_slug    → companionId (resolved at auth time, not here)
 *   speaker_key       → avatarUuid / externalUserId
 *   speaker_name      → avatarName / userDisplayName
 *   speaker_desc      → objectDescription
 *   object_key        → objectUuid
 *   object_name       → objectName
 *   source_type       → sourceType
 *   message           → messageText (existing)
 *   context_last_10   → contextLast10
 *   recentContext     → contextLast10 (alternate)
 *
 * directlyAddressed is true when any of the following are truthy/set:
 *   directlyAddressed / is_direct_mention / direct_mention / mentioned / direct
 *   OR trigger is "name_mention" or "private_666"
 */
function normalizeEventFromBody(body, fallbackType) {
  // LSL alias resolution for avatarUuid / speaker
  const avatarUuid = body.avatarUuid != null ? String(body.avatarUuid)
    : body.speaker_key != null ? String(body.speaker_key)
    : "";
  const avatarName = body.avatarName != null ? String(body.avatarName)
    : body.speaker_name != null ? String(body.speaker_name)
    : "";

  // LSL alias resolution for messageText
  const messageText = body.message != null ? String(body.message)
    : body.messageText != null ? String(body.messageText)
    : "";

  // LSL alias resolution for object fields
  const objectUuid = body.objectUuid != null ? String(body.objectUuid)
    : body.object_key != null ? String(body.object_key)
    : "";
  const objectName = body.objectName != null ? String(body.objectName)
    : body.object_name != null ? String(body.object_name)
    : "";
  const objectDescription = body.objectDescription != null ? String(body.objectDescription)
    : body.speaker_desc != null ? String(body.speaker_desc)
    : "";

  // sourceType (avatar vs object)
  const sourceType = body.sourceType != null ? String(body.sourceType)
    : body.source_type != null ? String(body.source_type)
    : "";

  // directlyAddressed — handle all LSL field aliases and string/integer truthy forms.
  const rawTrigger = body.trigger != null ? String(body.trigger).trim() : "";
  const directlyAddressedFromTrigger = rawTrigger === "name_mention" || rawTrigger === "private_666";
  const directlyAddressedRaw =
    parseTruthy(body.directlyAddressed) ??
    parseTruthy(body.is_direct_mention) ??
    parseTruthy(body.direct_mention) ??
    parseTruthy(body.mentioned) ??
    parseTruthy(body.direct) ??
    (directlyAddressedFromTrigger ? true : undefined);
  const directlyAddressed = directlyAddressedRaw !== undefined ? Boolean(directlyAddressedRaw) : undefined;

  // context_last_10 — recent local chat context lines
  const contextLast10 = body.context_last_10 != null ? String(body.context_last_10)
    : body.recentContext != null ? String(body.recentContext)
    : "";

  return {
    eventType: String(body.type || body.eventType || fallbackType || "").trim(),
    externalUserId: avatarUuid,
    userDisplayName: avatarName,
    avatarUuid,
    avatarName,
    messageText,
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
    // Phase 21 — new fields
    objectUuid,
    objectName,
    objectDescription,
    sourceType,
    directlyAddressed,
    contextLast10,
  };
}

async function handleSecondLifeApiRequest({ req, res, url, context }) {
  const logger = context.logger || null;

  if (req.method === "GET" && url.pathname === SL_PING_PATH) {
    logger?.info?.("[second-life-api] GET /sl/ping health check hit.");
    sendPlainText(res, 200, "secondlife bridge alive");
    return true;
  }

  if (req.method === "GET" && url.pathname === SL_CHAT_PATH) {
    logger?.info?.("[second-life-api] GET /sl/chat health check hit.");
    sendPlainText(res, 200, "secondlife chat route alive - use POST");
    return true;
  }

  if (req.method === "POST" && url.pathname === SL_DEBUG_PATH) {
    try {
      await readRequestBody(req);
    } catch (error) {
      sendPlainText(res, error.message === "payload_too_large" ? 413 : 400, error.message);
      return true;
    }
    sendPlainText(res, 200, "secondlife post received");
    return true;
  }

  if (req.method === "POST" && url.pathname === SL_CHAT_PATH) {
    logger?.info?.("[sl-bridge] POST /sl/chat hit");

    let body;
    try {
      const raw = await readRequestBody(req);
      body = parseRequestBody(raw, req.headers["content-type"]);
    } catch (error) {
      sendPlainText(res, error.message === "payload_too_large" ? 413 : 400, error.message);
      return true;
    }

    const secondLife = context.secondLife || null;
    const adapter = context.secondLifeAdapter || null;
    const config = context.config || {};
    const requestedCompanionId = (
      body.companionId != null ? String(body.companionId)
      : body.companion_slug != null ? String(body.companion_slug)
      : ""
    ).trim();
    const companionId = resolveSecondLifeChatCompanionId(requestedCompanionId, config);
    const messageText = body.message != null ? String(body.message) : "";

    const avatarName = body.avatarName != null ? String(body.avatarName)
      : body.speaker_name != null ? String(body.speaker_name)
      : "";
    const avatarKey = body.avatarKey != null ? String(body.avatarKey)
      : body.speaker_key != null ? String(body.speaker_key)
      : body.avatarUuid != null ? String(body.avatarUuid)
      : "";
    const region = body.region != null ? String(body.region) : "";

    logger?.info?.("[sl-bridge] requested companionId", { requestedCompanionId });
    logger?.info?.("[sl-bridge] resolved companionId", { resolvedCompanionId: companionId });
    logger?.info?.("[sl-bridge] user message preview", { preview: messageText.slice(0, 80), length: messageText.length });
    logger?.info?.("[sl-bridge] POST /sl/chat request", {
      requestedCompanionId,
      resolvedCompanionId: companionId,
      avatarName,
      avatarKey,
      region,
      messageLength: messageText.length,
    });

    if (!secondLife || secondLife.available !== true || !adapter) {
      sendPlainText(res, 503, "secondlife bridge unavailable");
      return true;
    }

    const secret = extractSecret(req, body, url);
    const expectedSecret = process.env.SL_BRIDGE_KEY;
    const authed = compareSecrets(secret, expectedSecret);
    logSlChatAuthDebug(logger, {
      body,
      url,
      receivedSecret: secret,
      expectedSecret,
      accepted: authed,
    });
    if (!authed) {
      sendPlainText(res, 401, "unauthorized");
      return true;
    }

    try {
      const event = normalizeEventFromBody({
        ...body,
        type: body.type || body.eventType || "local_chat",
        message: messageText,
      }, "local_chat");
      event.source = "secondlife";
      event.platform = "secondlife";
      event.channel = "secondlife";
      event.slAvatarUsername = SL_AVATAR_USERNAME;
      event.avatarName = avatarName || event.avatarName;
      event.avatarKey = avatarKey || event.avatarUuid;
      event.channelNumber = body.channel != null ? String(body.channel) : "";

      logger?.info?.("[sl-bridge] pipeline function called", { functionName: "secondLifeAdapter.handleEvent" });
      const result = await adapter.handleEvent({ companionId, event });
      let reply = extractSlChatReply(result);
      if (!normalizePlainTextReply(reply)) {
        reply = "SL bridge reached Dante, but no assistant text was produced.";
      }
      const finalReply = capPlainTextReply(reply);
      logger?.info?.("[sl-bridge] pipeline return type", { returnType: getPipelineReturnType(result) });
      logger?.info?.("[sl-bridge] pipeline return keys", { returnKeys: getPipelineReturnKeys(result) });
      logger?.info?.("[sl-bridge] extracted reply length", { length: finalReply.length });
      logger?.info?.("[sl-bridge] extracted reply preview", { preview: previewReply(finalReply) });
      logger?.info?.("[sl-bridge] POST /sl/chat reply", {
        requestedCompanionId,
        resolvedCompanionId: companionId,
        avatarName,
        avatarKey,
        region,
        messageLength: messageText.length,
        pipelineReturnType: getPipelineReturnType(result),
        pipelineReturnKeys: getPipelineReturnKeys(result),
        finalReplyLength: finalReply.length,
        finalReplyPreview: previewReply(finalReply),
      });
      sendPlainText(res, 200, finalReply);
    } catch (error) {
      logger?.error?.("[sl-bridge] POST /sl/chat failed", { error: error.message });
      sendPlainText(res, 500, "internal_error");
    }
    return true;
  }

  if (!url.pathname.startsWith(API_PREFIX)) {
    return false;
  }

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
    const secret = extractSecret(req, {}, url);
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

  // Phase 21 — accept companion_slug as an alias for companionId (LSL scripts).
  const companionId = (
    body.companionId != null ? String(body.companionId)
    : body.companion_slug != null ? String(body.companion_slug)
    : ""
  ).trim() || resolveCompanionId(config);
  const secret = extractSecret(req, body, url);

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

module.exports = { handleSecondLifeApiRequest, normalizeEventFromBody, parseTruthy, API_PREFIX };
