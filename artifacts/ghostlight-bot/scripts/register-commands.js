#!/usr/bin/env node
// register-commands — Deploy slash commands to your Discord guild
const { loadConfig } = require("../src/config/env");
const { createDiscordClient } = require("../src/bot/createDiscordClient");
const { loadCommands } = require("../src/bot/commands");
const { registerCommands } = require("../src/bot/registerCommands");
const { createLogger } = require("../src/utils/logger");

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const commands = loadCommands(config);
  await registerCommands({ config, commands, logger });
  logger.info("[commands] Slash commands registered successfully");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
