const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { isConfiguredMainUser } = require("../mainUserPresence");

function formatState(enabled) {
  return enabled ? "on" : "off";
}

function formatActivity(activity = {}) {
  const parts = [
    activity.type && activity.name ? `${activity.type}: ${activity.name}` : activity.name,
    activity.details ? `details: ${activity.details}` : "",
    activity.state ? `state: ${activity.state}` : "",
  ].filter(Boolean);

  return parts.join("; ");
}

function buildStatusContextViewMessage({ enabled, snapshot } = {}) {
  const lines = [
    `Discord presence context is currently \`${formatState(enabled)}\`.`,
  ];

  if (!enabled) {
    return lines.join("\n");
  }

  if (!snapshot) {
    lines.push("Cached presence snapshot: `none yet`.");
    lines.push("If the bot was just redeployed, change your Discord status, Spotify track, or game activity once so Discord sends a fresh presence update.");
    return lines.join("\n");
  }

  lines.push(`Cached presence snapshot: \`${snapshot.status || "unknown"}\`.`);

  const activities = Array.isArray(snapshot.activities)
    ? snapshot.activities.map(formatActivity).filter(Boolean)
    : [];

  if (activities.length) {
    lines.push("Cached activity:");
    lines.push(...activities.map((activity) => `- ${activity}`));
  } else {
    lines.push("Cached activity: `none`.");
  }

  if (snapshot.updatedAt) {
    lines.push(`Snapshot updated: ${snapshot.updatedAt}.`);
  }

  return lines.join("\n");
}

function userCanManageStatusContext({ config = {}, userId = "" } = {}) {
  return isConfiguredMainUser(config, userId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status-context")
    .setDescription("Control whether your AI can notice your Discord presence.")
    .addSubcommand((subcommand) => subcommand
      .setName("view")
      .setDescription("See whether Discord presence context is currently on."))
    .addSubcommand((subcommand) => subcommand
      .setName("on")
      .setDescription("Let Ghostlight use your Discord status, music, and games as light context."))
    .addSubcommand((subcommand) => subcommand
      .setName("off")
      .setDescription("Stop Ghostlight using your Discord presence as context.")),

  userCanManageStatusContext,
  buildStatusContextViewMessage,

  async execute(interaction) {
    const { config, settingsStore, mainUserPresence } = interaction.client.appContext;
    const subcommand = interaction.options.getSubcommand();
    const currentValue = Boolean(config.heartbeat?.userPresenceContextEnabled);
    const configuredUserId = String(config.chat?.userId || "").trim();

    if (!configuredUserId) {
      await interaction.reply({
        content: "Add your Discord User ID in Behaviour (in the Ghostlight Admin) before turning on Discord presence context.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!userCanManageStatusContext({ config, userId: interaction.user?.id })) {
      await interaction.reply({
        content: "Only the configured main user can change Discord presence context.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "view") {
      await interaction.reply({
        content: buildStatusContextViewMessage({
          enabled: currentValue,
          snapshot: mainUserPresence?.getSnapshot?.() || null,
        }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const nextValue = subcommand === "on";
    const persisted = await settingsStore.upsertSettings({
      "heartbeat.userPresenceContextEnabled": nextValue,
    });
    applyRuntimeSettings(config, persisted);

    await interaction.reply({
      content: nextValue
        ? [
            "Discord presence context is now `on`.",
            "Ghostlight can use light context from your current Discord status and activity, like music or games, when it's useful.",
            "If this was off when the bot started, restart the bot after enabling the Discord Presence Intent.",
          ].join("\n")
        : "Discord presence context is now `off`. Ghostlight won't use your Discord status, music, or games as context.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
