const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");

function formatState(enabled) {
  return enabled ? "on" : "off";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("time-context")
    .setDescription("Control whether your AI can see the current date and time.")
    .addSubcommand((subcommand) => subcommand
      .setName("view")
      .setDescription("See whether time context is currently on."))
    .addSubcommand((subcommand) => subcommand
      .setName("on")
      .setDescription("Let your AI see the current date and time in chat."))
    .addSubcommand((subcommand) => subcommand
      .setName("off")
      .setDescription("Stop your AI from seeing the current date and time in chat.")),

  async execute(interaction) {
    const { config, settingsStore } = interaction.client.appContext;
    const subcommand = interaction.options.getSubcommand();
    const currentValue = config.chat?.includeTimeContext !== false;

    if (subcommand === "view") {
      await interaction.reply({
        content: `Time context is currently \`${formatState(currentValue)}\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const nextValue = subcommand === "on";
    const persisted = await settingsStore.upsertSettings({
      "chat.includeTimeContext": nextValue,
    });
    applyRuntimeSettings(config, persisted);

    await interaction.reply({
      content: nextValue
        ? "Time context is now `on`. Your AI can see the current date and time when replying."
        : "Time context is now `off`. Your AI won't be given the current date and time in chat.",
      flags: MessageFlags.Ephemeral,
    });
  },
};