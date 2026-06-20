const { renderGeneratedMemoryDetailPage } = require("./renderGeneratedMemoryDetail");

function renderStagedDetailPage(options) {
  return renderGeneratedMemoryDetailPage(options);
}

module.exports = {
  renderStagedDetailPage,
};
