const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildGameMessage, buildStopMessage, buildErrorMessage, buildLeaderboardEmbed } = require("./gameEmbeds");
const { generateBanter } = require("../ai/gameBanter");
const { resolveCompanionId } = require("../../companion/resolveCompanionId");

const ADULT_DISABLED_MSG = "Adult party games are not enabled for this companion. An admin can enable them in Settings > Games.";
const ADULT_CHANNEL_MSG = "Adult party games can only be played in approved adult/private channels.";

function resolveCompanionSafe(config) {
  try {
    return resolveCompanionId(config) || "companion";
  } catch {
    return "companion";
  }
}

function resolveHumanName(interaction) {
  return interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || "You";
}

function getGameSettings(appContext) {
  return appContext?.gameSettings || {};
}

function isAdultChannelAllowed(interaction, gameSettings) {
  if (!gameSettings.requireAdultPrivateChannel) return true;
  const allowedChannels = gameSettings.allowedAdultGameChannels || [];
  if (allowedChannels.length && !allowedChannels.includes(interaction.channelId)) return false;
  const blockedChannels = gameSettings.blockedAdultGameChannels || [];
  if (blockedChannels.includes(interaction.channelId)) return false;
  return true;
}

function isAllowedChannel(interaction, gameSettings, game) {
  const allowedChannels = gameSettings.allowedGameChannels || [];
  const blockedChannels = gameSettings.blockedGameChannels || [];

  if (blockedChannels.includes(interaction.channelId)) return false;
  if (allowedChannels.length && !allowedChannels.includes(interaction.channelId)) return false;
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Play games with the companion.")
    .addSubcommand((sub) => sub
      .setName("start")
      .setDescription("Start a new game.")
      .addStringOption((opt) => opt
        .setName("name")
        .setDescription("Which game to play.")
        .setRequired(true)
        .addChoices(
          { name: "Farkle", value: "farkle" },
          { name: "Blackjack", value: "blackjack" },
          { name: "Yahtzee", value: "yahtzee" },
          { name: "Trivia", value: "trivia" },
          { name: "Mad Libs", value: "madlibs" },
          { name: "Pictionary", value: "pictionary" },
          { name: "Chaos Cards", value: "chaos-cards" },
          { name: "Hand & Foot Canasta (Beta)", value: "hand-and-foot-canasta" },
          { name: "Dirty Double Takes (18+)", value: "dirty-double-takes" },
          { name: "Red/Green/Black Flag (18+)", value: "red-green-black-flag" },
          { name: "Would You Rather: After Dark (18+)", value: "would-you-rather-after-dark" },
        )))
    .addSubcommand((sub) => sub
      .setName("stop")
      .setDescription("Stop the current game in this channel."))
    .addSubcommand((sub) => sub
      .setName("rules")
      .setDescription("Show the rules for a game.")
      .addStringOption((opt) => opt
        .setName("name")
        .setDescription("Which game's rules to show.")
        .setRequired(true)
        .addChoices(
          { name: "Farkle", value: "farkle" },
          { name: "Blackjack", value: "blackjack" },
          { name: "Yahtzee", value: "yahtzee" },
          { name: "Trivia", value: "trivia" },
          { name: "Mad Libs", value: "madlibs" },
          { name: "Pictionary", value: "pictionary" },
          { name: "Chaos Cards", value: "chaos-cards" },
          { name: "Hand & Foot Canasta", value: "hand-and-foot-canasta" },
          { name: "Dirty Double Takes", value: "dirty-double-takes" },
          { name: "Red/Green/Black Flag", value: "red-green-black-flag" },
          { name: "Would You Rather: After Dark", value: "would-you-rather-after-dark" },
        )))
    .addSubcommand((sub) => sub
      .setName("score")
      .setDescription("Show the current score of the active game."))
    .addSubcommand((sub) => sub
      .setName("resume")
      .setDescription("Resume a paused game in this channel."))
    .addSubcommand((sub) => sub
      .setName("leaderboard")
      .setDescription("Show completed game scores for this server.")
      .addStringOption((opt) => opt
        .setName("game")
        .setDescription("Filter by game type.")
        .setRequired(false)))
    .addSubcommand((sub) => sub
      .setName("invite")
      .setDescription("Have the companion invite you to play a game."))
    .addSubcommand((sub) => sub
      .setName("settings")
      .setDescription("Show current game settings (admin info)."))
    .addSubcommand((sub) => sub
      .setName("list")
      .setDescription("List available games.")),

  async execute(interaction) {
    const { gameSessionStore, gameRegistry, config, logger } = interaction.client.appContext;
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId || "";
    const channelId = interaction.channelId || "";
    const gameSettings = getGameSettings(interaction.client.appContext);
    const companionId = resolveCompanionSafe(config);
    const humanId = interaction.user.id;
    const humanName = resolveHumanName(interaction);

    if (subcommand === "list") {
      const enabled = gameRegistry.listEnabledGames(gameSettings);
      const lines = enabled.map((g) => {
        const tags = [g.isBeta ? "BETA" : "", g.requiresAdultPartyGames ? "18+" : ""].filter(Boolean).join(", ");
        return `• **${g.displayName}**${tags ? ` (${tags})` : ""} — ${g.description}`;
      });
      await interaction.reply({
        content: lines.length ? `**Available Games:**\n${lines.join("\n")}` : "No games are currently enabled.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "rules") {
      const gameName = interaction.options.getString("name", true);
      const game = gameRegistry.resolveGameByAlias(gameName) || gameRegistry.getGame(gameName);
      if (!game) {
        await interaction.reply({ content: `Unknown game: **${gameName}**. Use \`/game list\` to see available games.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: game.rulesText || "No rules available.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "settings") {
      const lines = [
        `**Game Settings:**`,
        `• Games enabled: ${gameSettings.gamesEnabled !== false ? "Yes" : "No"}`,
        `• Adult party games: ${gameSettings.adultPartyGamesEnabled ? "Enabled" : "Disabled (default)"}`,
        `• Max active sessions: ${gameSettings.maxActiveSessions || "unlimited"}`,
      ];
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "leaderboard") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const gameTypeFilter = interaction.options.getString("game") || "";
      const sessions = await gameSessionStore.getLeaderboard({ guildId, gameType: gameTypeFilter, limit: 10 });
      const msg = buildLeaderboardEmbed({ sessions, gameType: gameTypeFilter, companionName: companionId, humanName });
      await interaction.editReply(msg);
      return;
    }

    if (!gameSessionStore) {
      await interaction.reply({ content: "The game system is not available — database may not be configured.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "invite") {
      const { generateGameInvite } = require("../ai/gameBanter");
      const enabled = gameRegistry.listEnabledGames(gameSettings).filter((g) => !g.requiresAdultPartyGames);
      if (!enabled.length) {
        await interaction.reply({ content: "No games are available to invite you to!", flags: MessageFlags.Ephemeral });
        return;
      }
      const picked = enabled[Math.floor(Math.random() * enabled.length)];
      await interaction.deferReply();
      const invite = await generateGameInvite({ gameType: picked.id, gameDisplayName: picked.displayName, config, logger });
      await interaction.editReply({ content: invite });
      return;
    }

    if (subcommand === "stop") {
      const existing = await gameSessionStore.getActiveSessionByChannel({ guildId, channelId });
      if (!existing) {
        await interaction.reply({ content: "No active game found in this channel.", flags: MessageFlags.Ephemeral });
        return;
      }
      await gameSessionStore.cancelSession(existing.id);
      const game = gameRegistry.getGame(existing.gameType);
      const msg = buildStopMessage({ gameDisplayName: game?.displayName || existing.gameType, reason: "stopped by player" });
      await interaction.reply(msg);
      return;
    }

    if (subcommand === "score") {
      const existing = await gameSessionStore.getActiveSessionByChannel({ guildId, channelId });
      if (!existing) {
        await interaction.reply({ content: "No active game in this channel.", flags: MessageFlags.Ephemeral });
        return;
      }
      const game = gameRegistry.getGame(existing.gameType);
      const state = existing.gameState || {};
      const embedData = game
        ? game.buildEmbedData({ state, companionName: companionId, humanName })
        : { title: "Current Score", description: JSON.stringify(existing.scoreState || {}) };
      const msg = buildGameMessage({ embedData, buttons: [], sessionId: existing.id });
      await interaction.reply({ ...msg, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "resume") {
      const existing = await gameSessionStore.getActiveSessionByChannel({ guildId, channelId });
      if (!existing) {
        await interaction.reply({ content: "No paused game found to resume.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (existing.status !== "paused") {
        await interaction.reply({ content: `The game is already **${existing.status}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await gameSessionStore.resumeSession(existing.id);
      const game = gameRegistry.getGame(existing.gameType);
      const state = existing.gameState || {};
      const embedData = game ? game.buildEmbedData({ state, companionName: companionId, humanName }) : { title: "Game Resumed", description: "Your game has been resumed." };
      const buttons = game ? game.buildButtons({ state }) : [];
      const msg = buildGameMessage({ embedData, buttons, sessionId: existing.id });
      await interaction.reply(msg);
      return;
    }

    if (subcommand === "start") {
      const gameName = interaction.options.getString("name", true);
      const game = gameRegistry.resolveGameByAlias(gameName) || gameRegistry.getGame(gameName);

      if (!game) {
        await interaction.reply({ content: `Unknown game: **${gameName}**. Use \`/game list\` to see available games.`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (!gameRegistry.isGameEnabled(game.id, gameSettings)) {
        if (game.requiresAdultPartyGames) {
          await interaction.reply({ content: ADULT_DISABLED_MSG, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `**${game.displayName}** is not enabled. Contact an admin to enable it.`, flags: MessageFlags.Ephemeral });
        }
        return;
      }

      if (game.requiresAdultPartyGames) {
        if (!gameSettings.adultPartyGamesEnabled) {
          await interaction.reply({ content: ADULT_DISABLED_MSG, flags: MessageFlags.Ephemeral });
          return;
        }
        if (!isAdultChannelAllowed(interaction, gameSettings)) {
          await interaction.reply({ content: ADULT_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
          return;
        }
      }

      if (!isAllowedChannel(interaction, gameSettings, game)) {
        await interaction.reply({ content: "Games are not allowed in this channel.", flags: MessageFlags.Ephemeral });
        return;
      }

      const existingSession = await gameSessionStore.getActiveSessionByChannel({ guildId, channelId });
      if (existingSession) {
        await interaction.reply({
          content: `A **${existingSession.gameType}** game is already active here. Use \`/game stop\` first or \`/game resume\` to continue.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      const gameSettings2 = gameSettings[`game_${game.id}_settings`] || {};
      const initialState = game.createInitialState({
        humanPlayerIds: [humanId],
        companionId,
        settings: gameSettings2,
      });

      const session = await gameSessionStore.createSession({
        guildId,
        channelId,
        companionId,
        gameType: game.id,
        humanPlayerIds: [humanId],
        activePlayer: initialState.activePlayer || humanId,
        gameState: initialState,
        scoreState: initialState.totalScores || initialState.scores || {},
        settings: gameSettings2,
        status: "active",
      });

      if (!session) {
        await interaction.editReply(buildErrorMessage("Failed to create game session. Is the database configured?"));
        return;
      }

      const embedData = game.buildEmbedData({ state: initialState, companionName: companionId, humanName });
      const buttons = game.buildButtons({ state: initialState });

      if (game.isBeta) {
        embedData.title = `${embedData.title || game.displayName} ⚠️ BETA`;
        embedData.description = `⚠️ **${game.displayName} is in beta — some features may be limited.**\n\n${embedData.description || ""}`;
      }

      const gameMessage = buildGameMessage({ embedData, buttons, sessionId: session.id });

      const banter = await generateBanter({ context: "game_start", gameState: session, config, logger }).catch(() => "");
      if (banter) gameMessage.content = banter;

      await interaction.editReply(gameMessage);
    }
  },
};
