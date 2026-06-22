const CATEGORIES = [
  { id: "aces", label: "Aces", section: "upper", score: (d) => d.filter((v) => v === 1).reduce((a, b) => a + b, 0) },
  { id: "twos", label: "Twos", section: "upper", score: (d) => d.filter((v) => v === 2).reduce((a, b) => a + b, 0) },
  { id: "threes", label: "Threes", section: "upper", score: (d) => d.filter((v) => v === 3).reduce((a, b) => a + b, 0) },
  { id: "fours", label: "Fours", section: "upper", score: (d) => d.filter((v) => v === 4).reduce((a, b) => a + b, 0) },
  { id: "fives", label: "Fives", section: "upper", score: (d) => d.filter((v) => v === 5).reduce((a, b) => a + b, 0) },
  { id: "sixes", label: "Sixes", section: "upper", score: (d) => d.filter((v) => v === 6).reduce((a, b) => a + b, 0) },
  { id: "threeKind", label: "3 of a Kind", section: "lower", score: (d) => hasCounts(d, 3) ? sum(d) : 0 },
  { id: "fourKind", label: "4 of a Kind", section: "lower", score: (d) => hasCounts(d, 4) ? sum(d) : 0 },
  { id: "fullHouse", label: "Full House", section: "lower", score: (d) => isFullHouse(d) ? 25 : 0 },
  { id: "smStraight", label: "Small Straight", section: "lower", score: (d) => isStraight(d, 4) ? 30 : 0 },
  { id: "lgStraight", label: "Large Straight", section: "lower", score: (d) => isStraight(d, 5) ? 40 : 0 },
  { id: "yahtzee", label: "Yahtzee!", section: "lower", score: (d) => hasCounts(d, 5) ? 50 : 0 },
  { id: "chance", label: "Chance", section: "lower", score: (d) => sum(d) },
];

function sum(dice) { return dice.reduce((a, b) => a + b, 0); }

function countFaces(dice) {
  const counts = Array(7).fill(0);
  for (const d of dice) counts[d]++;
  return counts;
}

function hasCounts(dice, n) {
  const counts = countFaces(dice);
  return counts.some((c) => c >= n);
}

function isFullHouse(dice) {
  const counts = countFaces(dice).filter((c) => c > 0).sort();
  return counts.length === 2 && counts[0] === 2 && counts[1] === 3;
}

function isStraight(dice, len) {
  const unique = [...new Set(dice)].sort((a, b) => a - b);
  let maxRun = 1, run = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] + 1) { run++; maxRun = Math.max(maxRun, run); }
    else run = 1;
  }
  return maxRun >= len;
}

function rollDice(count) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

function companionChooseCategory(dice, availableCategories) {
  let best = null, bestScore = -1;
  for (const catId of availableCategories) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat) continue;
    const score = cat.score(dice);
    if (score > bestScore || (score === bestScore && best === "chance")) {
      bestScore = score;
      best = catId;
    }
  }
  return best;
}

module.exports = {
  id: "yahtzee",
  displayName: "Yahtzee",
  description: "Roll five dice up to three times per turn. Score in 13 categories to win!",
  category: "dice",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Yahtzee Rules:**",
    "• Each turn: roll 5 dice up to 3 times. Hold dice between rolls.",
    "• After rolling, choose a scoring category.",
    "• Upper section: score face values (Aces–Sixes). 63+ total = 35pt bonus.",
    "• Lower: 3/4-of-a-kind, Full House (25), Small Straight (30), Large Straight (40), Yahtzee (50), Chance.",
    "• Each category can only be used once. If Yahtzee is already scored, bonuses apply.",
    "• 13 rounds total. Highest final score wins!",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId }) {
    const emptyScores = () => Object.fromEntries(CATEGORIES.map((c) => [c.id, null]));
    return {
      dice: [1, 1, 1, 1, 1],
      heldDice: [false, false, false, false, false],
      rollsLeft: 3,
      scores: {
        [humanPlayerIds[0] || "user"]: emptyScores(),
        [companionId]: emptyScores(),
      },
      activePlayer: humanPlayerIds[0] || "user",
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      round: 1,
      maxRounds: 13,
      phase: "waiting_roll",
      winner: null,
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (action === "roll") {
      if (newState.rollsLeft <= 0) {
        events.push({ type: "error", message: "No rolls left — choose a category!" });
        return { newState, events };
      }
      const newDice = newState.dice.map((d, i) => newState.heldDice[i] ? d : (rollDice(1)[0]));
      newState.dice = newDice;
      newState.rollsLeft--;
      newState.phase = newState.rollsLeft === 0 ? "must_score" : "scoring";
      events.push({ type: "roll", message: `🎲 Rolled: **${newDice.join("  ")}** (${newState.rollsLeft} roll${newState.rollsLeft !== 1 ? "s" : ""} left)` });
      return { newState, events };
    }

    if (action === "hold") {
      const index = Number(payload.index);
      if (index >= 0 && index < 5) {
        newState.heldDice[index] = !newState.heldDice[index];
        events.push({ type: "hold", message: `${newState.heldDice[index] ? "Held" : "Unheld"} die ${index + 1} (${newState.dice[index]})` });
      }
      return { newState, events };
    }

    if (action === "score") {
      const { category } = payload;
      const { activePlayer, companionId, humanPlayerIds, scores, dice } = newState;
      const catDef = CATEGORIES.find((c) => c.id === category);
      if (!catDef || scores[activePlayer][category] !== null) {
        events.push({ type: "error", message: "Invalid or already used category." });
        return { newState, events };
      }
      const pts = catDef.score(dice);
      newState.scores[activePlayer][category] = pts;
      events.push({ type: "score", message: `📝 **${catDef.label}**: ${pts} pts` });

      newState.rollsLeft = 3;
      newState.heldDice = [false, false, false, false, false];
      newState.dice = [1, 1, 1, 1, 1];
      newState.phase = "waiting_roll";

      newState.activePlayer = activePlayer === companionId
        ? (humanPlayerIds[0] || "user")
        : companionId;

      const allDone = Object.values(newState.scores).every((s) => Object.values(s).every((v) => v !== null));
      if (allDone) {
        const finalScores = computeFinalScores(newState.scores);
        newState.winner = Object.entries(finalScores).sort((a, b) => b[1] - a[1])[0][0];
        newState.finalScores = finalScores;
        newState.phase = "game_over";
        events.push({ type: "game_over", message: "🏆 Game over!" });
      } else if (newState.activePlayer === companionId) {
        newState.round++;
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { dice, heldDice, rollsLeft, scores, activePlayer, companionId, round, maxRounds, winner, finalScores } = state;
    const isCompanionTurn = activePlayer === companionId;

    const diceDisplay = dice.map((d, i) => heldDice[i] ? `[**${d}**]` : `${d}`).join("  ");
    const upperBonusInfo = (playerScores) => {
      const upper = ["aces","twos","threes","fours","fives","sixes"].reduce((a, k) => a + (playerScores[k] ?? 0), 0);
      return upper >= 63 ? ` (upper bonus ✓)` : ` (upper: ${upper}/63)`;
    };

    const scoreLines = Object.entries(scores || {}).map(([id, s]) => {
      const name = id === companionId ? companionName : humanName;
      const total = computeTotalScore(s);
      return `${name}: **${total}**${upperBonusInfo(s)}`;
    }).join("\n");

    return {
      title: winner ? "🏆 Yahtzee — Game Over!" : "🎲 Yahtzee",
      description: winner
        ? `**${winner === companionId ? companionName : humanName} wins!**\n\n${Object.entries(finalScores || {}).map(([id, pts]) => `${id === companionId ? companionName : humanName}: **${pts}**`).join("\n")}`
        : [`Round ${round}/${maxRounds}`, scoreLines, `\n🎲 ${diceDisplay}`, `Rolls left: **${rollsLeft}**`].join("\n"),
      color: winner ? 0xffd700 : (isCompanionTurn ? 0x9b59b6 : 0x3498db),
      footer: isCompanionTurn ? `${companionName}'s turn` : `${humanName}'s turn`,
    };
  },

  buildButtons({ state }) {
    const { phase, rollsLeft, activePlayer, companionId } = state;
    if (state.winner || activePlayer === companionId) return [];
    const buttons = [];
    if (rollsLeft > 0 && phase !== "game_over") {
      buttons.push({ customId: "roll", label: `🎲 Roll (${rollsLeft} left)`, style: "PRIMARY" });
    }
    if (rollsLeft < 3 && phase !== "waiting_roll") {
      buttons.push({ customId: "score_menu", label: "📝 Score Category", style: "SECONDARY" });
    }
    return buttons;
  },

  getCompanionMove({ state }) {
    const { activePlayer, companionId, rollsLeft, scores, dice, phase } = state;
    if (activePlayer !== companionId) return null;

    if (rollsLeft > 0 && phase !== "must_score") {
      if (rollsLeft === 3) return { action: "roll", payload: {} };
      const available = CATEGORIES.map((c) => c.id).filter((id) => scores[companionId][id] === null);
      const potentialScore = available.map((id) => {
        const cat = CATEGORIES.find((c) => c.id === id);
        return { id, score: cat.score(dice) };
      });
      const best = potentialScore.sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 30) return { action: "score", payload: { category: best.id } };
      return { action: "roll", payload: {} };
    }

    const available = CATEGORIES.map((c) => c.id).filter((id) => scores[companionId][id] === null);
    const chosen = companionChooseCategory(dice, available);
    return chosen ? { action: "score", payload: { category: chosen } } : null;
  },

  CATEGORIES,
  computeFinalScores,
};

function computeTotalScore(scores) {
  const upper = ["aces","twos","threes","fours","fives","sixes"].reduce((a, k) => a + (scores[k] ?? 0), 0);
  const upperBonus = upper >= 63 ? 35 : 0;
  const lower = ["threeKind","fourKind","fullHouse","smStraight","lgStraight","yahtzee","chance"].reduce((a, k) => a + (scores[k] ?? 0), 0);
  const yahtzeeBonus = scores.yahtzeeBonus || 0;
  return upper + upperBonus + lower + yahtzeeBonus;
}

function computeFinalScores(allScores) {
  return Object.fromEntries(Object.entries(allScores).map(([id, s]) => [id, computeTotalScore(s)]));
}
