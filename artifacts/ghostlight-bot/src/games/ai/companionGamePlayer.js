async function runCompanionTurn({ session, game, gameSessionStore, config, logger }) {
  if (!session || !game) return { session, banterContext: null };

  const state = session.gameState || {};
  const companionMove = game.getCompanionMove?.({ state, config });
  if (!companionMove) return { session, banterContext: null };

  const { action, payload = {} } = companionMove;

  let newSession = session;
  let banterContext = null;

  try {
    const result = game.processAction({ state, action, payload });
    const newState = result.newState;
    const events = result.events || [];

    const scoreState = extractScoreState(newState, game);

    newSession = await gameSessionStore.updateGameState(session.id, {
      gameState: newState,
      scoreState,
      activePlayer: newState.activePlayer,
      status: newState.winner || newState.phase === "game_over" ? "completed" : session.status,
    });

    banterContext = deriveBanterContext(game.id, action, events, newState);
  } catch (error) {
    logger?.warn("[games] Companion turn error", {
      gameType: game.id,
      action,
      error: error?.message,
    });
  }

  return { session: newSession, banterContext };
}

function extractScoreState(state, game) {
  if (!state) return {};
  if (state.totalScores) return state.totalScores;
  if (state.scores) return state.scores;
  return {};
}

function deriveBanterContext(gameId, action, events, newState) {
  const eventTypes = events.map((e) => e.type);

  if (gameId === "farkle") {
    if (eventTypes.includes("farkle")) return "farkle_farkle";
    if (action === "bank") return "farkle_bank";
    if (action === "roll") return "farkle_roll_again";
    if (eventTypes.includes("win")) return newState?.winner === newState?.companionId ? "farkle_win" : "farkle_lose";
  }

  if (gameId === "yahtzee") {
    if (eventTypes.includes("score")) {
      if (events.find((e) => e.type === "score" && e.message?.includes("Yahtzee"))) return "yahtzee_yahtzee";
      return "yahtzee_turn";
    }
  }

  if (gameId === "trivia" && eventTypes.includes("answer_reveal")) {
    const ev = events.find((e) => e.type === "answer_reveal");
    return ev?.cCorrect ? "trivia_companion_correct" : "trivia_companion_wrong";
  }

  return null;
}

function shouldCompanionTakeTurn({ session, game }) {
  if (!session || !game) return false;
  const state = session.gameState || {};
  const { activePlayer, companionId, winner, phase } = state;

  if (winner || phase === "game_over") return false;
  if (activePlayer !== companionId) return false;
  if (!game.supportsCompanionPlayer) return false;
  if (!game.getCompanionMove) return false;

  return true;
}

module.exports = {
  runCompanionTurn,
  shouldCompanionTakeTurn,
  extractScoreState,
  deriveBanterContext,
};
