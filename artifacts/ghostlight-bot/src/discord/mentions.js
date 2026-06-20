function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingUserMentions(text, userId = "") {
  let output = String(text || "").trim();
  const normalizedUserId = String(userId || "").trim();

  if (!output) {
    return "";
  }

  const patterns = [];

  if (normalizedUserId) {
    patterns.push(new RegExp(`^<@!?${escapeRegExp(normalizedUserId)}>\\s*[,;:!?.-]*\\s*`));
  }

  patterns.push(/^@[^\s,;:!?]+(?:\s*[,;:!?.-]+)?\s*/u);

  let changed = true;
  while (changed) {
    changed = false;

    for (const pattern of patterns) {
      const next = output.replace(pattern, "").trimStart();

      if (next !== output) {
        output = next;
        changed = true;
      }
    }
  }

  return output.trim();
}

function prependUserMention(text, userId = "") {
  const normalizedUserId = String(userId || "").trim();
  const body = stripLeadingUserMentions(text, normalizedUserId);

  if (!normalizedUserId) {
    return body;
  }

  return body ? `<@${normalizedUserId}> ${body}` : `<@${normalizedUserId}>`;
}

module.exports = {
  stripLeadingUserMentions,
  prependUserMention,
};
