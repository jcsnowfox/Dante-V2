const MAX_BODY_BYTES = 16 * 1024;

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
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
      if (!raw) return resolve({});
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

function cleanReply(text) {
  return String(text || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function createSecondLifeMessage({ companionId, avatarKey, avatarName, region, message }) {
  const now = new Date();
  const safeAvatarKey = String(avatarKey || "second-life-owner").trim() || "second-life-owner";
  const safeAvatarName = String(avatarName || "Second Life owner").trim() || "Second Life owner";
  const safeCompanionId = String(companionId || "companion").trim() || "companion";

  return {
    id: `sl-${Date.now()}`,
    content: String(message || ""),
    createdAt: now,
    channelId: `sl-private-666-${safeCompanionId}`,
    guildId: "second-life",
    author: {
      id: safeAvatarKey,
      username: safeAvatarName,
      globalName: safeAvatarName,
      bot: false,
    },
    member: { displayName: safeAvatarName },
    client: { user: { id: "second-life-bridge" } },
    channel: {
      id: `sl-private-666-${safeCompanionId}`,
      name: `Second Life private /666${region ? ` in ${region}` : ""}`,
      type: 1,
      isDMBased: () => true,
      isThread: () => false,
    },
    attachments: new Map(),
    stickers: new Map(),
  };
}

async function handleSimpleSecondLifeChat({ req, res, url, context }) {
  if (url.pathname !== "/sl/chat") return false;

  const logger = context.logger || console;

  if (req.method !== "POST") {
    sendText(res, 405, "Method not allowed");
    return true;
  }

  try {
    const body = await readJsonBody(req);
    const companionId = String(body.companionId || "").trim();
    const avatarKey = String(body.avatarKey || "").trim();
    const avatarName = String(body.avatarName || "").trim();
    const region = String(body.region || "").trim();
    const message = String(body.message || "").trim();

    logger.info?.("[sl/chat] Second Life message received", {
      companionId,
      avatarKey,
      avatarName,
      region,
      messageLength: message.length,
    });

    if (!process.env.SL_BRIDGE_KEY || String(body.bridgeKey || "") !== process.env.SL_BRIDGE_KEY) {
      logger.warn?.("[sl/chat] Bridge key denied", { companionId, avatarKey });
      sendText(res, 403, "Forbidden");
      return true;
    }

    logger.info?.("[sl/chat] Bridge key accepted", { companionId, avatarKey });
    logger.info?.("[sl/chat] Companion ID used", { companionId });

    if (!message) {
      sendText(res, 400, "Message is required");
      return true;
    }

    const chatPipeline = context.chatPipeline;
    if (!chatPipeline || typeof chatPipeline.run !== "function") {
      throw new Error("chat_pipeline_unavailable");
    }

    const reply = await chatPipeline.run({
      message: createSecondLifeMessage({ companionId, avatarKey, avatarName, region, message }),
      modeName: "chat",
    });

    const plainText = cleanReply(reply?.content || reply?.text || reply || "");
    logger.info?.("[sl/chat] Reply returned", { companionId, replyLength: plainText.length });
    sendText(res, 200, plainText);
    return true;
  } catch (error) {
    logger.error?.("[sl/chat] Error if failed", { message: error?.message });
    sendText(res, 500, "Second Life bridge error");
    return true;
  }
}

module.exports = {
  handleSimpleSecondLifeChat,
  cleanReply,
};
