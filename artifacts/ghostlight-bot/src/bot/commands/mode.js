const { MessageFlags, SlashCommandBuilder } = require("discord.js");

function truncate(text, length = 100) {
  const normalized = String(text || "").trim();

  if (normalized.length <= length) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(length - 1, 0)).trimEnd()}…`;
}

function normalizeSearchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildModeSummary(mode) {
  const bits = [mode.label || mode.name || mode.modeKey];
  const memoryTypes = Array.isArray(mode.memoryTypes)
    ? mode.memoryTypes
    : String(mode.memoryTypes || "").split(",").map((item) => item.trim()).filter(Boolean);

  if (mode.chatModel) {
    bits.push(`model: ${mode.chatModel}`);
  }

  if (memoryTypes.length) {
    bits.push(`memory: ${memoryTypes.join(", ")}`);
  }

  if (mode.memorySensitivity) {
    bits.push(`sensitivity: ${mode.memorySensitivity}`);
  }

  if (mode.includeTimeContext) {
    bits.push(`time context: ${mode.includeTimeContext}`);
  }

  if (mode.retrievalSource || mode.retrievalAccess) {
    bits.push(`retrieval: source ${mode.retrievalSource || "off"}, access ${mode.retrievalAccess || "off"}`);
  }

  if (mode.heartbeatRole) {
    bits.push(`heartbeat: ${mode.heartbeatRole}`);
  }

  if (mode.instructions) {
    bits.push(truncate(mode.instructions, 140));
  }

  return bits.join(" | ");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mode")
    .setDescription("View or change channel mode behaviour in this channel.")
    .addSubcommand((subcommand) => subcommand
      .setName("set")
      .setDescription("Use a saved channel mode here.")
      .addStringOption((option) => option
        .setName("mode")
        .setDescription("Choose the channel mode Ghostlight should use here.")
        .setRequired(true)
        .setAutocomplete(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("clear")
      .setDescription("Go back to the default or inherited mode."))
    .addSubcommand((subcommand) => subcommand
      .setName("view")
      .setDescription("See which mode Ghostlight is using here."))
    .addSubcommand((subcommand) => subcommand
      .setName("list")
      .setDescription("Show the channel modes currently available.")),

  async autocomplete(interaction) {
    const { channelModes } = interaction.client.appContext;
    const focusedValue = normalizeSearchValue(interaction.options.getFocused());
    const choices = await channelModes.listModeChoices(25);
    const filteredChoices = choices
      .filter((choice) => {
        if (!focusedValue) {
          return true;
        }

        return choice.value.includes(focusedValue) || choice.name.toLowerCase().includes(focusedValue);
      })
      .slice(0, 25);

    await interaction.respond(filteredChoices);
  },

  async execute(interaction) {
    const { channelModes } = interaction.client.appContext;

    const subcommand = interaction.options.getSubcommand();
    const target = channelModes.resolveTargetChannel(interaction);

    if (!target.guildId || !target.targetChannelId) {
      await interaction.reply({
        content: "I can only manage modes inside a normal private server channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "list") {
      const modes = await channelModes.listModes();
      const lines = modes.map((mode) => `- \`${mode.modeKey}\` - ${buildModeSummary(mode)}`);

      await interaction.reply({
        content: lines.length ? lines.join("\n") : "No channel modes are available yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "set") {
      const modeKey = interaction.options.getString("mode", true);
      const assignment = await channelModes.assignModeToChannel({
        guildId: target.guildId,
        channelId: target.targetChannelId,
        modeKey,
      });

      await interaction.reply({
        content: target.inheritedFromParent
          ? `Mode \`${assignment.modeKey}\` is now set on the parent channel \`${target.targetChannelId}\`, so this thread will inherit it.`
          : `Mode \`${assignment.modeKey}\` is now active in this channel.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "clear") {
      const cleared = await channelModes.clearChannelMode({
        guildId: target.guildId,
        channelId: target.targetChannelId,
      });

      await interaction.reply({
        content: cleared
          ? (target.inheritedFromParent
            ? `Cleared the mode override on the parent channel \`${target.targetChannelId}\`.`
            : "Cleared the mode override for this channel.")
          : "There wasn't a saved mode override here to clear.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const resolvedMode = await channelModes.resolveModeForChannel({
      guildId: target.guildId,
      channelId: target.currentChannelId,
      parentChannelId: target.parentChannelId,
    });

    const assignmentLine = resolvedMode.assignment
      ? `Mode override: \`${resolvedMode.assignment.channelId}\` on channel \`${resolvedMode.assignment.modeKey}\``
      : "Mode override: none — using the fallback mode";
    const inheritanceLine = resolvedMode.inheritedFromParent
      ? `Inherited from parent channel \`${target.parentChannelId}\``
      : "Not inherited from a parent channel";

    await interaction.reply({
      content: [
        `Active mode: \`${resolvedMode.name}\``,
        assignmentLine,
        inheritanceLine,
        buildModeSummary(resolvedMode),
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  },
};
