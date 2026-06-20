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

const REASONING_TAG_NAMES = "think|thinking|reason|reasoning|reflection|analysis|scratchpad";
const REASONING_TAG_BLOCK_PATTERN = new RegExp(`<(${REASONING_TAG_NAMES})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, "gi");
const REASONING_TAG_CAPTURE_PATTERN = new RegExp(`<(${REASONING_TAG_NAMES})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
const REASONING_TAG_OPEN_PATTERN = new RegExp(`<(${REASONING_TAG_NAMES})\\b[^>]*>`, "i");
const REASONING_TAG_CLOSE_PATTERN = new RegExp(`<\\/(${REASONING_TAG_NAMES})\\s*>`, "i");

// stripReasoningMarkup (visible text) and extractReasoningMarkup (private
// thought) are exact inverses: whatever one removes, the other captures. Both
// handle fully matched blocks anywhere, a dangling close tag (output that began
// mid-reasoning), and an unclosed open tag (leading or mid-text). The private
// reasoning is NEVER sent to a user on any channel.
function stripReasoningMarkup(text) {
  let result = String(text || "");
  let previous;

  // Iterate until stable so repeated/malformed tags (e.g. multiple dangling
  // close tags) are all consumed, not just the first occurrence.
  do {
    previous = result;

    // Remove all fully matched reasoning blocks anywhere.
    result = result.replace(REASONING_TAG_BLOCK_PATTERN, "");

    // Drop a dangling close tag (and the leaked reasoning before it) when no
    // matching open tag precedes it.
    const closeMatch = result.match(REASONING_TAG_CLOSE_PATTERN);
    const openMatch = result.match(REASONING_TAG_OPEN_PATTERN);

    if (closeMatch && (!openMatch || openMatch.index > closeMatch.index)) {
      result = result.slice(closeMatch.index + closeMatch[0].length);
    }
  } while (result !== previous);

  // Drop any remaining unclosed open tag (leading or mid-text) through end.
  const trailingOpen = result.match(REASONING_TAG_OPEN_PATTERN);

  if (trailingOpen) {
    result = result.slice(0, trailingOpen.index);
  }

  return result.trim();
}

function extractReasoningMarkup(text) {
  const thoughts = [];

  const pushThought = (value) => {
    const inner = String(value || "").trim();

    if (inner) {
      thoughts.push(inner);
    }
  };

  let rest = String(text || "");
  let previous;

  // Mirror stripReasoningMarkup's state machine exactly so what is captured is
  // precisely what is hidden — iterate until stable.
  do {
    previous = rest;

    // Capture and remove the inner content of every fully matched block.
    const blockPattern = new RegExp(REASONING_TAG_CAPTURE_PATTERN.source, "gi");
    rest = rest.replace(blockPattern, (_match, _tag, inner) => {
      pushThought(inner);
      return "";
    });

    // Dangling close tag: capture the leaked reasoning before it.
    const closeMatch = rest.match(REASONING_TAG_CLOSE_PATTERN);
    const openMatch = rest.match(REASONING_TAG_OPEN_PATTERN);

    if (closeMatch && (!openMatch || openMatch.index > closeMatch.index)) {
      pushThought(rest.slice(0, closeMatch.index));
      rest = rest.slice(closeMatch.index + closeMatch[0].length);
    }
  } while (rest !== previous);

  // Unclosed open tag: capture everything after it.
  const trailingOpen = rest.match(REASONING_TAG_OPEN_PATTERN);

  if (trailingOpen) {
    pushThought(rest.slice(trailingOpen.index + trailingOpen[0].length));
  }

  return thoughts.join("\n\n").trim();
}

function cleanModelReplyText(text, input) {
  const originalText = stripReasoningMarkup(text);
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

    // Capture the model's private reasoning (never sent to the user) so the
    // memory curator can use it. Kept off the visible content entirely.
    const internalThought = extractReasoningMarkup(modelOutput.text);

    if (internalThought) {
      reply.internalThought = internalThought;
    }

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
  stripReasoningMarkup,
  extractReasoningMarkup,
};
