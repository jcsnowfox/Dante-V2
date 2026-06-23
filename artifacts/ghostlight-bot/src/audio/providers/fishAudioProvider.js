// Minimal msgpack encoder for Fish Audio API requests.
// Fish Audio POST /v1/tts requires Content-Type: application/msgpack.
// We implement only the subset needed for TTS request objects
// (fixmap of string keys → string/bool/int values) to avoid adding a dependency.

function packStr(str) {
  const buf = Buffer.from(str, "utf8");
  const len = buf.length;

  if (len <= 31) {
    return Buffer.concat([Buffer.from([0xa0 | len]), buf]);
  }

  if (len <= 0xff) {
    return Buffer.concat([Buffer.from([0xd9, len]), buf]);
  }

  const header = Buffer.alloc(3);
  header[0] = 0xda;
  header.writeUInt16BE(len, 1);
  return Buffer.concat([header, buf]);
}

function packValue(value) {
  if (value === null || value === undefined) {
    return Buffer.from([0xc0]);
  }

  if (typeof value === "boolean") {
    return Buffer.from([value ? 0xc3 : 0xc2]);
  }

  if (typeof value === "string") {
    return packStr(value);
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 0 && value <= 0x7f) {
      return Buffer.from([value]);
    }

    if (value >= 0 && value <= 0xff) {
      return Buffer.from([0xcc, value]);
    }

    const buf = Buffer.alloc(3);
    buf[0] = 0xcd;
    buf.writeUInt16BE(value, 1);
    return buf;
  }

  throw new Error(`Cannot msgpack-encode type: ${typeof value}`);
}

function packObject(obj) {
  const keys = Object.keys(obj);
  const len = keys.length;
  let header;

  if (len <= 15) {
    header = Buffer.from([0x80 | len]);
  } else {
    header = Buffer.alloc(3);
    header[0] = 0xde;
    header.writeUInt16BE(len, 1);
  }

  const parts = [header];

  for (const key of keys) {
    parts.push(packValue(key));
    parts.push(packValue(obj[key]));
  }

  return Buffer.concat(parts);
}

function resolveFishAudioBaseUrl(config = {}) {
  return String(config.fishAudio?.baseURL || "https://api.fish.audio").trim().replace(/\/+$/, "");
}

function formatFishAudioRequestError({ status, errorText = "" }) {
  const statusLabel = Number(status || 0) ? `status ${status}` : "an unknown status";
  const raw = String(errorText || "").trim();

  if (!raw) {
    return `Fish Audio request failed with ${statusLabel}.`;
  }

  try {
    const parsed = JSON.parse(raw);
    const message = String(parsed?.message || parsed?.detail || parsed?.error || "").trim();

    if (message) {
      return `Fish Audio request failed with ${statusLabel}: ${message}`;
    }
  } catch {
    // fall through to raw text
  }

  return `Fish Audio request failed with ${statusLabel}: ${raw.slice(0, 300)}`;
}

async function generateFishAudioClip({
  config,
  text,
  fetchImpl = globalThis.fetch,
  logger = null,
}) {
  const apiKey = String(config.fishAudio?.apiKey || "").trim();
  const voiceId = String(config.audio?.fishVoiceId || config.fishAudio?.voiceId || "").trim();
  const modelId = String(config.audio?.fishModelId || config.fishAudio?.modelId || "").trim();
  const baseUrl = resolveFishAudioBaseUrl(config);

  if (!apiKey) {
    logger?.warn?.("[audio] fish synthesis failed", { stage: "provider_config", reason: "apiKey missing" });
    throw new Error("Fish Audio API key is not configured.");
  }

  if (!voiceId) {
    logger?.warn?.("[audio] fish synthesis failed", { stage: "provider_config", reason: "voiceId missing" });
    throw new Error("Fish Audio voice ID is not configured.");
  }

  const bodyObj = {
    text,
    format: "mp3",
    latency: "normal",
    reference_id: voiceId,
  };

  if (modelId) {
    bodyObj.model = modelId;
  }

  let body;
  try {
    body = packObject(bodyObj);
  } catch (packError) {
    logger?.warn?.("[audio] fish synthesis failed", { stage: "request_build", error: packError.message });
    throw packError;
  }

  let response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/tts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/msgpack",
      },
      body,
    });
  } catch (fetchError) {
    logger?.warn?.("[audio] fish synthesis failed", { stage: "fish_api_request", error: fetchError.message });
    throw fetchError;
  }

  logger?.info?.(`[audio] fish response status=${response.status}`);

  if (!response.ok) {
    const errorText = typeof response.text === "function" ? await response.text() : "";
    const errMsg = formatFishAudioRequestError({ status: response.status, errorText });
    logger?.warn?.("[audio] fish synthesis failed", { stage: "fish_api_response", status: response.status });
    throw new Error(errMsg);
  }

  let arrayBuffer;
  try {
    arrayBuffer = await response.arrayBuffer();
  } catch (decodeError) {
    logger?.warn?.("[audio] fish synthesis failed", { stage: "audio_decode", error: decodeError.message });
    throw decodeError;
  }

  try {
    return Buffer.from(arrayBuffer);
  } catch (bufferError) {
    logger?.warn?.("[audio] fish synthesis failed", { stage: "audio_decode", error: bufferError.message });
    throw bufferError;
  }
}

module.exports = {
  generateFishAudioClip,
  formatFishAudioRequestError,
  resolveFishAudioBaseUrl,
};
