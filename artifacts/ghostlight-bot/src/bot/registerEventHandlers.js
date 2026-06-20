const { Events, Collection } = require("discord.js");
const { handleReady } = require("./events/ready");
const { createInteractionHandler } = require("./events/interactionCreate");
const { createMessageCreateHandler } = require("./events/messageCreate");

function registerEventHandlers({ client, config, logger, commands, chatPipeline, companion, conversations, channelModes, generatedImages, generatedAudio, cache, reactionContext, settingsStore }) {
  client.commands = new Collection();

  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }

  client.once(Events.ClientReady, handleReady({ config, logger }));
  client.appContext?.mainUserPresence?.register(client);
  (reactionContext || client.appContext?.reactionContext)?.register?.(client);
  client.on(Events.InteractionCreate, createInteractionHandler({ logger }));
  client.on(Events.MessageCreate, createMessageCreateHandler({
    config,
    logger,
    chatPipeline,
    companion,
    conversations,
    channelModes,
    generatedImages,
    generatedAudio,
    cache,
    reactionContext,
    settingsStore,
  }));
}

module.exports = {
  registerEventHandlers,
};
