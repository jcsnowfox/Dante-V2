function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch (_error) {
    return null;
  }
}

module.exports = {
  safeJsonParse,
};
