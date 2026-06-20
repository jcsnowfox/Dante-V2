function handleReady({ config = {}, logger }) {
  return (client) => {
    logger.info(`[bot] Logged in as ${client.user.tag}`, {
      respondToMentionsOnly: Boolean(config.discord?.respondToMentionsOnly),
    });
  };
}

module.exports = {
  handleReady,
};
