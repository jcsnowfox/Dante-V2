const TRAILING_URL_PUNCTUATION_PATTERN = /[),.!?]+$/;
const URL_PATTERN = /https?:\/\/[^\s<>)]+/gi;

function normalizeUrl(value) {
  return String(value || "")
    .trim()
    .replace(/^<|>$/g, "")
    .replace(TRAILING_URL_PUNCTUATION_PATTERN, "");
}

function isLikelyGifUrl(value) {
  const normalized = normalizeUrl(value).toLowerCase();

  if (!normalized) {
    return false;
  }

  return normalized.endsWith(".gif")
    || normalized.includes("giphy.com/gifs/")
    || normalized.includes("media.giphy.com/media/")
    || normalized.includes("tenor.com/view/")
    || normalized.includes("media.tenor.com/")
    || normalized.includes("c.tenor.com/");
}

function collectUserGifUrls(input = {}) {
  const urls = new Set();
  const content = String(input.content || "");
  const contentUrls = content.match(URL_PATTERN) || [];

  for (const url of contentUrls) {
    if (isLikelyGifUrl(url)) {
      urls.add(normalizeUrl(url));
    }
  }

  for (const attachment of input.attachments || []) {
    const url = normalizeUrl(attachment.url);
    const kind = String(attachment.kind || "").toLowerCase();
    const contentType = String(attachment.contentType || "").toLowerCase();
    const name = String(attachment.name || "").toLowerCase();

    if (
      url
      && (
        kind === "gif"
        || contentType === "image/gif"
        || name.endsWith(".gif")
        || isLikelyGifUrl(url)
      )
    ) {
      urls.add(url);
    }
  }

  return urls;
}

function stripMirroredUserGifUrls(text, input) {
  const userGifUrls = collectUserGifUrls(input);

  if (!userGifUrls.size) {
    return String(text || "").trim();
  }

  return String(text || "")
    .split("\n")
    .filter((line) => {
      const trimmedLine = line.trim();
      return !(userGifUrls.has(normalizeUrl(trimmedLine)));
    })
    .join("\n")
    .trim();
}

function cleanModelReplyText(text, input) {
  const originalText = String(text || "").trim();
  const strippedText = stripMirroredUserGifUrls(originalText, input);

  if (originalText && !strippedText) {
    return "I see that GIF. I am not handing the exact same one back.";
  }

  return strippedText;
}

function buildReply({ mode, input, recentHistory, memories, modelOutput }) {
  if (modelOutput?.provider !== "placeholder" && (modelOutput?.text?.trim() || (Array.isArray(modelOutput?.files) && modelOutput.files.length))) {
    const imageWarnings = Array.isArray(modelOutput.imageWarnings)
      ? modelOutput.imageWarnings.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const audioCaptions = Array.isArray(modelOutput.audioCaptions)
      ? modelOutput.audioCaptions.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const generatedAudioIds = Array.isArray(modelOutput.generatedAudioIds)
      ? modelOutput.generatedAudioIds
      : [];
    const replyText = audioCaptions.length && generatedAudioIds.length
      ? ""
      : cleanModelReplyText(modelOutput.text, input);
    const content = [
      replyText,
      ...audioCaptions,
      ...imageWarnings,
    ].filter(Boolean).join("\n\n");
    const reply = {
      content,
      suppressEmbeds: Boolean(modelOutput.webSearchUsed),
    };

    if (Array.isArray(modelOutput.files) && modelOutput.files.length) {
      reply.files = modelOutput.files;
    }

    if (Array.isArray(modelOutput.generatedImageIds) && modelOutput.generatedImageIds.length) {
      reply.generatedImageIds = modelOutput.generatedImageIds;
    }

    if (generatedAudioIds.length) {
      reply.generatedAudioIds = generatedAudioIds;
    }

    if (imageWarnings.length) {
      reply.imageWarnings = imageWarnings;
    }

    return reply;
  }

  return {
    content: [
    `Mode: ${mode.name}`,
    "Ghostlight received your message and passed it through the starter chat pipeline.",
    `Message: ${input.content}`,
    `Recent history items: ${recentHistory.length}`,
    `Memories found: ${memories.length}`,
    "No model provider is wired yet, so this is a placeholder response.",
    ].join("\n"),
    suppressEmbeds: false,
  };
}

module.exports = {
  buildReply,
  cleanModelReplyText,
  collectUserGifUrls,
  stripMirroredUserGifUrls,
};
