const { MessageFlags, SlashCommandBuilder } = require("discord.js");

function buildChannelMessage(interaction) {
  const channelId = interaction.channelId || interaction.channel?.id || "";

  if (!channelId) {
    return "I couldn’t find a channel ID here.";
  }

  const parentId = interaction.channel?.isThread?.() ? interaction.channel?.parentId : null;

  if (parentId) {
    return [
      `Current thread ID: \`${channelId}\``,
      `Parent channel ID: \`${parentId}\``,
      "Use the thread ID if you want something to post inside this thread.",
      "Use the parent channel ID if you want it to post in the main channel instead.",
    ].join("\n");
  }

  return [
    `Current channel ID: \`${channelId}\``,
    "Use this ID when you want automations or scheduled messages to post here.",
  ].join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("channel-id")
    .setDescription("Get the ID for this channel or thread."),

  async execute(interaction) {
    await interaction.reply({
      content: buildChannelMessage(interaction),
      flags: MessageFlags.Ephemeral,
    });
  },
};