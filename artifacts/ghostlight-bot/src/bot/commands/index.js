const pingCommand = require("./ping");
const modeCommand = require("./mode");
const channelIdCommand = require("./channelId");
const userIdCommand = require("./userId");
const timeContextCommand = require("./timeContext");
const statusContextCommand = require("./statusContext");
const readCommand = require("./read");

function loadCommands(config = {}) {
  void config;
  return [pingCommand, channelIdCommand, userIdCommand, timeContextCommand, statusContextCommand, modeCommand, readCommand];
}

module.exports = {
  loadCommands,
};
