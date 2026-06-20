const { defaultMode } = require("./defaultMode");

const MODES = {
  [defaultMode.name]: defaultMode,
};

function getMode(name) {
  return MODES[name] || defaultMode;
}

module.exports = {
  getMode,
  MODES,
};
