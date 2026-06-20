const MARKDOWN_LINK_PATTERN = /!?\[([^\]]*)\]\(([^)]+)\)/g;
const CODE_FENCE_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`([^`]+)`/g;
const DISCORD_MENTION_PATTERN = /<[@#][!&]?\d+>/g;
const STANDALONE_URL_PATTERN = /^https?:\/\/\S+$/i;

function preserveInlineSpeechEmphasis(value = "") {
  const emphasis = [];
  const saveEmphasis = (text) => {
    const index = emphasis.push(String(text || "").trim()) - 1;
    return `GHOSTLIGHTTTSEMPHASIS${index}TOKEN`;
  };

  return String(value || "")
    .replace(/\\([*_~])/g, "")
    .replace(/~~([^~\n]+?)~~/g, "$1")
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, (_match, text) => saveEmphasis(text))
    .replace(/\*\*([^*\n]+?)\*\*/g, (_match, text) => saveEmphasis(text))
    .replace(/__([^_\n]+?)__/g, (_match, text) => saveEmphasis(text))
    .replace(/(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/g, (_match, prefix, text) => `${prefix}${saveEmphasis(text)}`)
    .replace(/(^|[^\w])\*([^*\n]+?)\*(?=[^\w]|$)/g, (_match, prefix, text) => `${prefix}${saveEmphasis(text)}`)
    .replace(/[*_~]{1,3}/g, "")
    .replace(/GHOSTLIGHTTTSEMPHASIS(\d+)TOKEN/g, (_match, index) => {
      const text = emphasis[Number(index)] || "";
      return text ? `*${text}*` : "";
    });
}

function normalizeTextForSpeech(value = "") {
  const stripped = String(value || "")
    .replace(CODE_FENCE_PATTERN, " ")
    .replace(DISCORD_MENTION_PATTERN, " ")
    .replace(MARKDOWN_LINK_PATTERN, (_match, label, url) => {
      const normalizedLabel = String(label || "").trim();
      const normalizedUrl = String(url || "").trim();

      if (!normalizedLabel || /^https?:\/\//i.test(normalizedLabel)) {
        return " ";
      }

      if (/\.(?:png|jpe?g|gif|webp|mp3|wav|ogg|m4a)(?:\?|#|$)/i.test(normalizedUrl)) {
        return normalizedLabel;
      }

      return normalizedLabel;
    })
    .replace(INLINE_CODE_PATTERN, "$1");

  return stripped
    .split(/\r?\n/)
    .map((line) => line
      .trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s?/, "")
      .trim())
    .map((line) => preserveInlineSpeechEmphasis(line)
      .trim())
    .filter((line) => line && !STANDALONE_URL_PATTERN.test(line))
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/\b(?:and|or)\s*([.?!])/gi, "$1")
    .replace(/,\s*([.?!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSpeechText(value = "", maxLength = 4800) {
  const normalized = normalizeTextForSpeech(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength - 1).trimEnd();
}

module.exports = {
  normalizeTextForSpeech,
  truncateSpeechText,
};
