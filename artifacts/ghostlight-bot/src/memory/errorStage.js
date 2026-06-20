function annotateMemoryStageError(error, stage) {
  const normalizedStage = String(stage || "").trim();
  const message = String(error?.message || error || "Unknown error").trim() || "Unknown error";

  if (!normalizedStage) {
    return error instanceof Error ? error : new Error(message);
  }

  if (message.startsWith(`${normalizedStage}:`)) {
    return error instanceof Error ? error : new Error(message);
  }

  const wrapped = new Error(`${normalizedStage}: ${message}`);

  if (error !== undefined) {
    wrapped.cause = error;
  }

  return wrapped;
}

module.exports = {
  annotateMemoryStageError,
};
