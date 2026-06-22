const { MessageFlags } = require("discord.js");
const { buildGameMessage, buildErrorMessage } = require("./gameEmbeds");
const { runCompanionTurn, shouldCompanionTakeTurn } = require("../ai/companionGamePlayer");
const { generateBanter } = require("../ai/gameBanter");
const { resolveCompanionId } = require("../../companion/resolveCompanionId");

function parseButtonCustomId(customId) {
  if (!customId?.startsWith("game_")) return null;
  const withoutPrefix = customId.slice("game_".length);
  const sessionIdPattern = /^(.+?)_(gs_[a-z0-9_]+)$/;
  const match = sessionIdPattern.exec(withoutPrefix);
  if (!match) return null;

  return {
    actionStr: match[1],
    sessionId: match[2],
  };
}

function mapButtonActionToGameAction(actionStr, game) {
  if (!actionStr || !game) return null;

  const actionMap = {
    roll: { action: "roll", payload: {} },
    bank: { action: "bank", payload: {} },
    hit: { action: "hit", payload: {} },
    stand: { action: "stand", payload: {} },
    deal: { action: "deal", payload: {} },
    next: { action: "next", payload: {} },
    next_round: { action: "next_round", payload: {} },
    skip: { action: "skip", payload: {} },
    reveal: { action: "reveal", payload: {} },
    hint: { action: "hint", payload: {} },
    draw: { action: "draw", payload: {} },
  };

  if (actionMap[actionStr]) return actionMap[actionStr];

  if (actionStr.startsWith("answer_")) {
    const rest = actionStr.slice("answer_".length);
    if (["A", "B"].includes(rest)) return { action: "answer", payload: { answer: rest } };
    const idx = parseInt(rest, 10);
    if (!Number.isNaN(idx)) return { action: "answer", payload: { answerIndex: idx } };
  }

  if (actionStr.startsWith("choose_")) {
    const idx = parseInt(actionStr.slice("choose_".length), 10);
    if (!Number.isNaN(idx)) return { action: "choose_answer", payload: { cardIndex: idx } };
  }

  if (actionStr.startsWith("hold_")) {
    const idx = parseInt(actionStr.slice("hold_".length), 10);
    if (!Number.isNaN(idx)) return { action: "hold", payload: { index: idx } };
  }

  if (actionStr.startsWith("vote_")) {
    const voteValue = actionStr.slice("vote_".length);
    return { action: "vote", payload: { vote: voteValue } };
  }

  if (actionStr === "judge_human") return { action: "judge", payload: { winner: "__human__" } };
  if (actionStr === "judge_companion") return { action: "judge", payload: { winner: "__companion__" } };
  if (actionStr === "judge_draw") return { action: "judge", payload: { winner: null } };

  if (actionStr.startsWith("discard_")) {
    const idx = parseInt(actionStr.slice("discard_".length), 10);
    if (!Number.isNaN(idx)) return { action: "discard", payload: { cardIndex: idx } };
  }

  return null;
}

function createGameButtonHandler({ gameSessionStore, gameRegistry, config, logger }) {
  return async (interaction) => {
    if (!interaction.isButton()) return;

    const parsed = parseButtonCustomId(interaction.customId);
    if (!parsed) return;

    const { actionStr, sessionId } = parsed;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
      const session = await gameSessionStore.getSession(sessionId);
      if (!session) {
        await interaction.editReply({ content: "Game session not found or has ended." });
        return;
      }

      if (!["active", "waiting"].includes(session.status)) {
        await interaction.editReply({ content: `This game is ${session.status}. Start a new one with \`/game start\`.` });
        return;
      }

      const humanId = interaction.user.id;
      if (!session.humanPlayerIds.includes(humanId)) {
        await interaction.editReply({ content: "This is not your game session.", flags: MessageFlags.Ephemeral });
        return;
      }

      const game = gameRegistry.getGame(session.gameType);
      if (!game) {
        await interaction.editReply({ content: "Unknown game type in this session." });
        return;
      }

      let mappedAction = mapButtonActionToGameAction(actionStr, game);
      if (!mappedAction) {
        await interaction.editReply({ content: "Unknown game action." });
        return;
      }

      if (mappedAction.payload?.winner === "__human__") {
        mappedAction = { action: "judge", payload: { winner: humanId } };
      } else if (mappedAction.payload?.winner === "__companion__") {
        mappedAction = { action: "judge", payload: { winner: session.companionId } };
      }

      if (mappedAction.payload && !mappedAction.payload.playerId) {
        mappedAction.payload.playerId = humanId;
      }

      const state = session.gameState || {};
      const result = game.processAction({ state, action: mappedAction.action, payload: mappedAction.payload });
      const { newState, events = [] } = result;

      const scoreState = newState.totalScores || newState.scores || session.scoreState || {};
      const isOver = newState.winner || newState.phase === "game_over";

      const updatedSession = await gameSessionStore.updateGameState(session.id, {
        gameState: newState,
        scoreState,
        activePlayer: newState.activePlayer,
        status: isOver ? "completed" : "active",
        lastMessageId: interaction.message?.id,
      });

      const humanName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username || "You";
      let companionName = "Companion";
      try {
        const companionId = resolveCompanionId(config);
        companionName = companionId || "Companion";
      } catch {}

      const embedData = game.buildEmbedData({ state: newState, companionName, humanName });
      const buttons = isOver ? [] : game.buildButtons({ state: newState });
      const gameMessage = buildGameMessage({ embedData, buttons, sessionId: session.id });

      const eventMessages = events
        .filter((e) => e.message && e.type !== "error")
        .map((e) => e.message)
        .join("\n");

      const replyContent = eventMessages || null;

      try {
        await interaction.message.edit(gameMessage);
      } catch {}

      await interaction.editReply({
        content: replyContent || "Turn processed!",
        embeds: [],
        components: [],
      });

      const banterContext = events.find((e) => e.type && e.type !== "error")?.type
        ? `${game.id}_${events.find((e) => e.type !== "error")?.type}`
        : null;

      if (banterContext && !isOver) {
        const banter = await generateBanter({
          context: banterContext,
          gameState: updatedSession,
          config,
          logger,
        }).catch(() => "");

        if (banter) {
          await interaction.followUp({ content: banter, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }

      if (shouldCompanionTakeTurn({ session: updatedSession, game })) {
        const { session: afterCompanion, banterContext: companionBanterCtx } = await runCompanionTurn({
          session: updatedSession,
          game,
          gameSessionStore,
          config,
          logger,
        });

        if (afterCompanion) {
          const companionState = afterCompanion.gameState || {};
          const companionEmbedData = game.buildEmbedData({ state: companionState, companionName, humanName });
          const companionButtons = companionState.winner ? [] : game.buildButtons({ state: companionState });
          const companionMessage = buildGameMessage({ embedData: companionEmbedData, buttons: companionButtons, sessionId: session.id });

          try {
            await interaction.message.edit(companionMessage);
          } catch {}

          if (companionBanterCtx) {
            const companionBanter = await generateBanter({
              context: companionBanterCtx,
              gameState: afterCompanion,
              config,
              logger,
            }).catch(() => "");

            if (companionBanter) {
              await interaction.followUp({ content: `${companionName}: ${companionBanter}` }).catch(() => {});
            }
          }
        }
      }
    } catch (error) {
      logger?.error("[games] Button handler error", { error: error?.message, customId: interaction.customId });

      try {
        await interaction.editReply({ content: "Something went wrong with that game action.", embeds: [], components: [] });
      } catch {}
    }
  };
}

module.exports = {
  createGameButtonHandler,
  parseButtonCustomId,
  mapButtonActionToGameAction,
};
