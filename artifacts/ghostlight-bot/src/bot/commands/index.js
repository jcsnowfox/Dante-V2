const pingCommand = require("./ping");
const modeCommand = require("./mode");
const channelIdCommand = require("./channelId");
const userIdCommand = require("./userId");
const timeContextCommand = require("./timeContext");
const statusContextCommand = require("./statusContext");
const readCommand = require("./read");
const gameCommands = require("../../games/discord/gameCommands");
const norwegianCommand = require("./norwegian");

function loadCommands(config = {}) {
  void config;
  return [pingCommand, channelIdCommand, userIdCommand, timeContextCommand, statusContextCommand, modeCommand, readCommand, gameCommands, norwegianCommand];
}

module.exports = {
  loadCommands,
};
