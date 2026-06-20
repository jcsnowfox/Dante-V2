const { promoteApprovedGeneratedMemories } = require("./promoteGeneratedMemories");

function promoteApprovedStagedMemories(options) {
  return promoteApprovedGeneratedMemories({
    ...options,
    generatedMemories: options.generatedMemories || options.stagedMemories,
    generatedMemoryId: options.generatedMemoryId || options.stagedMemoryId,
  });
}

module.exports = {
  promoteApprovedStagedMemories,
};
