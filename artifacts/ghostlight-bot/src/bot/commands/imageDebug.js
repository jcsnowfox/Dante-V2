const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { formatLastImageRequestDiagnostics } = require("../../images/imageRequestDiagnostics");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("image-debug")
    .setDescription("Show image generation diagnostics.")
    .addSubcommand((subcommand) => subcommand
      .setName("last")
      .setDescription("Show the last image request diagnostic state.")),

  async execute(interaction) {
    await interaction.reply({
      content: `\`\`\`\n${formatLastImageRequestDiagnostics()}\n\`\`\``,
      flags: MessageFlags.Ephemeral,
    });
  },
};
