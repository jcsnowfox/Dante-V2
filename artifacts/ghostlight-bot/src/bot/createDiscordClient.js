const { Client, GatewayIntentBits, Partials } = require("discord.js");

const GATEWAY_INTENT_NAMES = new Map([
  [GatewayIntentBits.Guilds, "Guilds"],
  [GatewayIntentBits.GuildMessages, "GuildMessages"],
  [GatewayIntentBits.MessageContent, "MessageContent"],
  [GatewayIntentBits.GuildPresences, "GuildPresences"],
  [GatewayIntentBits.GuildMessageReactions, "GuildMessageReactions"],
]);

function buildDiscordClientOptions({ config = {} } = {}) {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ];
  const partials = [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User];

  if (config.heartbeat?.userPresenceContextEnabled) {
    intents.push(GatewayIntentBits.GuildPresences);
  }

  return { intents, partials };
}

function describeGatewayIntents(intents = []) {
  return intents.map((intent) => GATEWAY_INTENT_NAMES.get(intent) || String(intent));
}

function getDiscordGatewayIntentDiagnostics({ config = {} } = {}) {
  const { intents, partials } = buildDiscordClientOptions({ config });
  const requestedIntents = describeGatewayIntents(intents);
  const privilegedPortalToggles = ["Message Content Intent"];

  if (intents.includes(GatewayIntentBits.GuildPresences)) {
    privilegedPortalToggles.push("Presence Intent");
  }

  return {
    requestedIntents,
    privilegedPortalToggles,
    featuresUsingGatewayIntents: {
      discordStatusContext: Boolean(config.heartbeat?.userPresenceContextEnabled),
      discordReactionContext: true,
    },
    partials: partials.map((partial) => String(partial)),
  };
}

function createDiscordClient({ config = {} } = {}) {
  return new Client(buildDiscordClientOptions({ config }));
}

module.exports = {
  buildDiscordClientOptions,
  createDiscordClient,
  getDiscordGatewayIntentDiagnostics,
};
