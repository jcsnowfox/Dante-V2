const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { createAudioGenerationService } = require("../../audio/generateAudio");
const { shouldSaveAudioToGallery } = require("../../audio/galleryPolicy");
const { buildLatestTtsCacheKey } = require("../../audio/latestReplyCache");

function getInteractionConversationId(interaction) {
  return interaction.channel?.isThread?.() ? interaction.channel.id : interaction.channelId;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("read")
    .setDescription("Read your AI's latest reply aloud."),

  async execute(interaction) {
    const {
      config,
      logger,
      cache,
      generatedAudio,
    } = interaction.client.appContext;
    const conversationId = getInteractionConversationId(interaction);

    if (!config.audio?.ttsEnabled) {
      await interaction.reply({
        content: "Read aloud TTS audio isn't enabled yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (shouldSaveAudioToGallery(config, "read_aloud") && !generatedAudio?.persistenceEnabled) {
      await interaction.reply({
        content: "Read-aloud clips need audio storage before they can be saved and attached.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const latest = await cache.get(buildLatestTtsCacheKey(conversationId), {
      userScope: config.memory?.userScope,
    });

    if (!latest?.text) {
      await interaction.reply({
        content: "I can't find a recent reply from me to read aloud in this channel yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const audioGeneration = createAudioGenerationService({
      config,
      logger,
      generatedAudio,
    });
    const result = await audioGeneration.generate({
      text: latest.text,
      prompt: latest.text,
      caption: "",
      title: "Read Aloud",
      kind: "TTS",
      model: config.audio?.readAloudModel || "eleven_flash_v2_5",
      context: {
        userScope: config.memory?.userScope,
        sourceSurface: "read_aloud",
        conversationId,
        channelId: interaction.channelId,
        sourceMessageId: latest.messageId || "",
      },
    });

    const sent = await interaction.editReply({
      content: "🔊 Reading your AI's latest reply:",
      files: [result.file],
    });

    if (generatedAudio && result.record?.audioId) {
      await generatedAudio.updateAudioRecord(result.record.audioId, {
        discordMessageId: sent?.id || interaction.id,
      }, {
        userScope: config.memory?.userScope,
      }).catch(() => {});
    }
  },
};
