const { createGameRegistry } = require("./gameRegistry");
const { createGameSessionStore } = require("./gameSessionStore");
const gameCommands = require("./discord/gameCommands");
const { createGameButtonHandler } = require("./discord/gameButtons");

function createGameSystem({ config, logger }) {
  const gameRegistry = createGameRegistry();
  const gameSessionStore = createGameSessionStore({ config, logger });

  return {
    gameRegistry,
    gameSessionStore,
    gameCommands,

    createButtonHandler({ appContext }) {
      return createGameButtonHandler({
        gameSessionStore,
        gameRegistry,
        config,
        logger,
      });
    },

    async init() {
      await gameSessionStore.init();
      logger.debug?.("[games] Game system initialized", {
        gameCount: gameRegistry.listGames().length,
      });
    },

    async close() {
      await gameSessionStore.close();
    },
  };
}

module.exports = {
  createGameSystem,
  createGameRegistry,
  createGameSessionStore,
};
