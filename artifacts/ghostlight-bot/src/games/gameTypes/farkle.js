const SCORE_COMBOS = [
  { name: "Six of a kind", pattern: [6], points: (face) => (face === 1 ? 10000 : face * 1000) },
  { name: "Five of a kind", pattern: [5], points: (face) => (face === 1 ? 4000 : face * 500) },
  { name: "Four of a kind", pattern: [4], points: (face) => (face === 1 ? 2000 : face * 200) },
  { name: "Three 1s", pattern: null, points: () => 1000 },
  { name: "Straight 1-6", pattern: null, points: () => 1500 },
  { name: "Three pairs", pattern: null, points: () => 1500 },
  { name: "Three of a kind", pattern: [3], points: (face) => (face === 1 ? 1000 : face * 100) },
  { name: "Single 1", pattern: null, points: () => 100 },
  { name: "Single 5", pattern: null, points: () => 50 },
];

function rollDice(count) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

function countFaces(dice) {
  const counts = Array(7).fill(0);
  for (const d of dice) counts[d]++;
  return counts;
}

function scoreDice(dice) {
  if (!dice || !dice.length) return { total: 0, combinations: [], isFarkle: true, scoringDice: [] };

  const counts = countFaces(dice);
  const sorted = [...dice].sort((a, b) => a - b);
  let total = 0;
  const combinations = [];
  const scoringDice = [];

  const isStraight = sorted.length === 6 && sorted.join("") === "123456";
  if (isStraight) {
    return { total: 1500, combinations: ["Straight 1-6"], isFarkle: false, scoringDice: [...dice] };
  }

  const isThreePairs = sorted.length === 6 && Object.values(counts).filter((c) => c === 2).length === 3;
  if (isThreePairs) {
    return { total: 1500, combinations: ["Three pairs"], isFarkle: false, scoringDice: [...dice] };
  }

  for (let face = 1; face <= 6; face++) {
    const count = counts[face];
    if (count >= 6) {
      const pts = face === 1 ? 10000 : face * 1000;
      total += pts;
      combinations.push(`Six ${face}s (${pts})`);
      for (let i = 0; i < 6; i++) scoringDice.push(face);
    } else if (count >= 5) {
      const pts = face === 1 ? 4000 : face * 500;
      total += pts;
      combinations.push(`Five ${face}s (${pts})`);
      for (let i = 0; i < 5; i++) scoringDice.push(face);
    } else if (count >= 4) {
      const pts = face === 1 ? 2000 : face * 200;
      total += pts;
      combinations.push(`Four ${face}s (${pts})`);
      for (let i = 0; i < 4; i++) scoringDice.push(face);
    } else if (count >= 3) {
      const pts = face === 1 ? 1000 : face * 100;
      total += pts;
      combinations.push(`Three ${face}s (${pts})`);
      for (let i = 0; i < 3; i++) scoringDice.push(face);
    } else {
      if (face === 1) {
        for (let i = 0; i < count; i++) {
          total += 100;
          scoringDice.push(1);
        }
        if (count > 0) combinations.push(`${count}x 1 (${count * 100})`);
      } else if (face === 5) {
        for (let i = 0; i < count; i++) {
          total += 50;
          scoringDice.push(5);
        }
        if (count > 0) combinations.push(`${count}x 5 (${count * 50})`);
      }
    }
  }

  return {
    total,
    combinations,
    isFarkle: total === 0,
    scoringDice,
  };
}

function companionDecide(state) {
  const { roundPoints, totalScores, companionId, targetScore } = state;
  const companionScore = totalScores[companionId] || 0;
  const remaining = targetScore - companionScore;
  const safe = roundPoints >= 300;
  const ahead = companionScore > (Object.values(totalScores).reduce((a, b) => a + b, 0) / Object.keys(totalScores).length);

  if (roundPoints + companionScore >= targetScore) return { action: "bank", reason: "winning_bank" };
  if (roundPoints >= 500 && remaining < 2000) return { action: "bank", reason: "safe_bank" };
  if (roundPoints >= 400 && ahead) return { action: "bank", reason: "conservative" };
  if (roundPoints < 300) return { action: "roll", reason: "need_more" };
  if (safe && remaining > 3000) return { action: "roll", reason: "aggressive" };
  return { action: "bank", reason: "default_safe" };
}

module.exports = {
  id: "farkle",
  displayName: "Farkle",
  description: "A press-your-luck dice game. Roll, score combinations, and bank points before you Farkle!",
  category: "dice",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Farkle Rules:**",
    "• Roll six dice each turn. Set aside scoring dice and choose to roll again or bank your points.",
    "• If none of your dice score, you Farkle — lose all round points and end your turn.",
    "• **Scoring:** 1s = 100pts, 5s = 50pts, Three of a kind = face×100 (1s = 1000), Three 1s = 1000",
    "• Four/Five/Six of a kind multiply the three-of-a-kind value by 2/4/8.",
    "• Straight 1-6 or three pairs = 1500pts.",
    "• **If all 6 dice score**, roll all 6 again!",
    "• First to reach the target score (default 10,000) wins!",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const targetScore = Number(settings.targetScore) || 10000;
    const playerIds = [...humanPlayerIds, companionId];
    const totalScores = Object.fromEntries(playerIds.map((id) => [id, 0]));

    return {
      dice: [],
      heldDice: [],
      roundPoints: 0,
      totalScores,
      targetScore,
      activePlayer: humanPlayerIds[0] || "user",
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      turn: 0,
      hasRolled: false,
      lastRollResult: null,
      winner: null,
      phase: "waiting_roll",
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (action === "roll") {
      const activeDiceCount = 6 - (newState.heldDice?.length || 0);
      const rolled = rollDice(Math.max(1, activeDiceCount));
      newState.dice = rolled;
      newState.hasRolled = true;
      const result = scoreDice(rolled);
      newState.lastRollResult = result;

      if (result.isFarkle) {
        newState.roundPoints = 0;
        newState.heldDice = [];
        newState.hasRolled = false;
        newState.phase = "farkle";
        events.push({ type: "farkle", message: `🎲 Rolled: **${rolled.join(", ")}** — Farkle! No scoring dice. Turn over.` });
        newState.phase = "waiting_roll";
        newState.dice = [];
        newState.activePlayer = newState.activePlayer === newState.companionId
          ? (newState.humanPlayerIds[0] || "user")
          : newState.companionId;
        newState.turn++;
      } else {
        newState.phase = "scoring";
        events.push({
          type: "roll",
          message: `🎲 Rolled: **${rolled.join(", ")}**\n📊 Scoring options: ${result.combinations.join(", ")} = **${result.total} pts**`,
        });
      }
      return { newState, events };
    }

    if (action === "hold") {
      const indices = Array.isArray(payload.indices) ? payload.indices : [];
      const heldValues = indices.map((i) => newState.dice[i]).filter((v) => v !== undefined);
      const heldScore = scoreDice(heldValues);
      newState.heldDice = [...(newState.heldDice || []), ...heldValues];
      newState.roundPoints += heldScore.total;
      newState.dice = newState.dice.filter((_, i) => !indices.includes(i));
      newState.phase = "held";
      events.push({ type: "hold", message: `✋ Held dice: **${heldValues.join(", ")}** (+${heldScore.total} pts). Round total: **${newState.roundPoints}**` });
      return { newState, events };
    }

    if (action === "bank") {
      const { activePlayer, companionId, humanPlayerIds } = newState;
      if (!newState.hasRolled || newState.roundPoints === 0) {
        events.push({ type: "error", message: "Nothing to bank yet — roll first!" });
        return { newState, events };
      }
      newState.totalScores[activePlayer] = (newState.totalScores[activePlayer] || 0) + newState.roundPoints;
      const banked = newState.roundPoints;
      newState.roundPoints = 0;
      newState.heldDice = [];
      newState.hasRolled = false;
      newState.dice = [];
      newState.phase = "banked";

      if (newState.totalScores[activePlayer] >= newState.targetScore) {
        newState.winner = activePlayer;
        newState.phase = "game_over";
        events.push({ type: "win", message: `🏆 **Banked ${banked} pts!** Total: **${newState.totalScores[activePlayer]}** — that's the game!` });
      } else {
        events.push({ type: "bank", message: `💰 Banked **${banked} pts**! Total: **${newState.totalScores[activePlayer]}/${newState.targetScore}**` });
        newState.activePlayer = activePlayer === companionId
          ? (humanPlayerIds[0] || "user")
          : companionId;
        newState.turn++;
        newState.phase = "waiting_roll";
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { totalScores, roundPoints, dice, heldDice, activePlayer, companionId, targetScore, winner, phase } = state;
    const isCompanionTurn = activePlayer === companionId;

    const scoreLines = Object.entries(totalScores || {})
      .map(([id, pts]) => {
        const name = id === companionId ? companionName : humanName;
        return `${name}: **${pts}/${targetScore}**`;
      })
      .join("\n");

    const diceDisplay = dice?.length ? `🎲 Dice: **${dice.join("  ")}**` : "";
    const heldDisplay = heldDice?.length ? `✋ Held: **${heldDice.join("  ")}**` : "";
    const roundDisplay = roundPoints > 0 ? `Round points: **${roundPoints}**` : "";

    return {
      title: winner ? "🏆 Farkle — Game Over!" : "🎲 Farkle",
      description: winner
        ? `**${winner === companionId ? companionName : humanName} wins!**\n\n${scoreLines}`
        : [scoreLines, diceDisplay, heldDisplay, roundDisplay].filter(Boolean).join("\n"),
      color: winner ? 0xffd700 : (isCompanionTurn ? 0x9b59b6 : 0x3498db),
      footer: winner ? null : `${isCompanionTurn ? companionName : humanName}'s turn • Phase: ${phase}`,
    };
  },

  buildButtons({ state }) {
    const { phase, hasRolled, roundPoints, winner, activePlayer, companionId } = state;
    if (winner || activePlayer === companionId) return [];

    if (!hasRolled || phase === "waiting_roll" || phase === "banked") {
      return [{ customId: "roll", label: "🎲 Roll", style: "PRIMARY" }];
    }

    return [
      { customId: "bank", label: `💰 Bank (${roundPoints} pts)`, style: "SUCCESS" },
      { customId: "roll", label: "🎲 Roll Again", style: "PRIMARY" },
    ];
  },

  getCompanionMove({ state }) {
    if (state.activePlayer !== state.companionId) return null;
    if (!state.hasRolled) return { action: "roll", payload: {} };
    const decision = companionDecide(state);
    return { action: decision.action, payload: {} };
  },

  scoreDice,
  rollDice,
};
