const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const BUTTON_STYLE_MAP = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

function buildGameEmbed(embedData = {}) {
  const embed = new EmbedBuilder();

  if (embedData.title) embed.setTitle(embedData.title);
  if (embedData.description) embed.setDescription(embedData.description);
  if (typeof embedData.color === "number") embed.setColor(embedData.color);
  if (embedData.footer) embed.setFooter({ text: String(embedData.footer) });
  if (embedData.imageUrl) embed.setImage(embedData.imageUrl);

  return embed;
}

function buildButtonRow(buttons = [], sessionId = "") {
  if (!buttons.length) return null;

  const row = new ActionRowBuilder();

  for (const btn of buttons.slice(0, 5)) {
    const style = BUTTON_STYLE_MAP[btn.style] || ButtonStyle.Primary;
    const customId = sessionId ? `game_${btn.customId}_${sessionId}` : `game_${btn.customId}`;
    const button = new ButtonBuilder()
      .setCustomId(customId.slice(0, 100))
      .setLabel(String(btn.label || "Button").slice(0, 80))
      .setStyle(style);

    if (btn.disabled) button.setDisabled(true);
    row.addComponents(button);
  }

  return row;
}

function buildGameMessage({ embedData, buttons = [], sessionId = "" }) {
  const embed = buildGameEmbed(embedData);
  const rows = [];

  if (buttons.length) {
    const chunks = [];
    for (let i = 0; i < buttons.length; i += 5) {
      chunks.push(buttons.slice(i, i + 5));
    }
    for (const chunk of chunks.slice(0, 5)) {
      const row = buildButtonRow(chunk, sessionId);
      if (row) rows.push(row);
    }
  }

  return {
    embeds: [embed],
    components: rows,
  };
}

function buildStopMessage({ gameDisplayName, reason = "stopped" }) {
  const embed = new EmbedBuilder()
    .setTitle(`${gameDisplayName} — Game Stopped`)
    .setDescription(`The game was ${reason}.`)
    .setColor(0x95a5a6);

  return { embeds: [embed], components: [] };
}

function buildErrorMessage(message) {
  const embed = new EmbedBuilder()
    .setTitle("Game Error")
    .setDescription(message)
    .setColor(0xe74c3c);

  return { embeds: [embed], components: [] };
}

function buildLeaderboardEmbed({ sessions, gameType, companionName = "Companion", humanName = "You" }) {
  const lines = sessions.slice(0, 10).map((session, i) => {
    const scores = session.scoreState || {};
    const scoreStr = Object.entries(scores)
      .map(([id, s]) => `${id === session.companionId ? companionName : humanName}: ${s}`)
      .join(" | ");
    return `**${i + 1}.** Round ${session.gameState?.round || "?"} — ${scoreStr}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Leaderboard${gameType ? ` — ${gameType}` : ""}`)
    .setDescription(lines.length ? lines.join("\n") : "No completed games yet.")
    .setColor(0xffd700);

  return { embeds: [embed], components: [] };
}

module.exports = {
  buildGameEmbed,
  buildButtonRow,
  buildGameMessage,
  buildStopMessage,
  buildErrorMessage,
  buildLeaderboardEmbed,
  BUTTON_STYLE_MAP,
};
