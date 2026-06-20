const CUSTOM_REACTION_EMOJI_LIMIT = 24;
const CUSTOM_REACTION_MOOD_LIMIT = 120;

function readBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeCustomReactionEmoji(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id || "").trim();
  const name = String(value.name || "").trim();

  if (!/^\d{5,32}$/.test(id) || !/^[A-Za-z0-9_]{2,32}$/.test(name)) {
    return null;
  }

  return {
    id,
    name,
    animated: readBoolean(value.animated),
    mood: String(value.mood || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, CUSTOM_REACTION_MOOD_LIMIT),
  };
}

function normalizeCustomReactionEmojis(value) {
  let raw = value;

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (_error) {
      raw = [];
    }
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const item of raw) {
    const emoji = normalizeCustomReactionEmoji(item);

    if (!emoji || seen.has(emoji.id)) {
      continue;
    }

    seen.add(emoji.id);
    normalized.push(emoji);

    if (normalized.length >= CUSTOM_REACTION_EMOJI_LIMIT) {
      break;
    }
  }

  return normalized;
}

function customReactionLabel(emoji = {}) {
  const name = String(emoji.name || "").trim();
  return name ? `:${name}:` : "";
}

function customReactionIdentifier(emoji = {}) {
  const normalized = normalizeCustomReactionEmoji(emoji);

  if (!normalized) {
    return "";
  }

  return normalized.animated
    ? `<a:${normalized.name}:${normalized.id}>`
    : `<:${normalized.name}:${normalized.id}>`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceCustomEmojiLabelsForDiscord(text, customEmojis = []) {
  const original = String(text || "");
  const emojis = normalizeCustomReactionEmojis(customEmojis)
    .map((emoji) => ({
      label: customReactionLabel(emoji),
      identifier: customReactionIdentifier(emoji),
    }))
    .filter((emoji) => emoji.label && emoji.identifier)
    .sort((left, right) => right.label.length - left.label.length);

  if (!original || !emojis.length) {
    return original;
  }

  const existingEmojiTokenPattern = /(<a?:[A-Za-z0-9_]{2,32}:\d{5,32}>)/g;

  return original
    .split(existingEmojiTokenPattern)
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }

      return emojis.reduce(
        (textPart, emoji) => textPart.replace(new RegExp(escapeRegExp(emoji.label), "g"), emoji.identifier),
        part,
      );
    })
    .join("");
}

module.exports = {
  CUSTOM_REACTION_EMOJI_LIMIT,
  CUSTOM_REACTION_MOOD_LIMIT,
  customReactionIdentifier,
  customReactionLabel,
  normalizeCustomReactionEmoji,
  normalizeCustomReactionEmojis,
  replaceCustomEmojiLabelsForDiscord,
};
