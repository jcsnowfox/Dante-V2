const clues = require("../content/adultParty/dirtyDoubleTakes.json");

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function filterClues({ allowExplicit = false } = {}) {
  return clues.filter((c) => {
    if (!allowExplicit && c.intensity === "explicit") return false;
    return true;
  });
}

module.exports = {
  id: "dirty-double-takes",
  displayName: "Dirty Double Takes",
  description: "Clues that sound naughty but have an innocent answer. Guess the clean punchline!",
  category: "adult_party",
  defaultEnabled: false,
  requiresAdultPartyGames: true,
  requiresAdultPrivateChannel: true,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Dirty Double Takes Rules:**",
    "• The companion presents a clue that sounds suggestive.",
    "• The answer is always innocent!",
    "• Guess correctly to earn a point.",
    "• Use Hint if you're stuck, or Reveal if you give up.",
    "• Original content only — no copyrighted material.",
    "• This game requires adult party games to be enabled in admin settings.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const maxRounds = Number(settings.maxRounds) || 10;
    const allowExplicit = settings.allowExplicit === true;
    const pool = shuffleArray(filterClues({ allowExplicit }));

    return {
      clues: pool,
      currentIndex: 0,
      maxRounds: Math.min(maxRounds, pool.length),
      scores: { [humanPlayerIds[0] || "user"]: 0 },
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      hintsUsed: 0,
      currentHintIndex: 0,
      guesses: [],
      revealed: false,
      round: 1,
      phase: "guessing",
      winner: null,
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];
    const currentClue = newState.clues[newState.currentIndex];
    if (!currentClue) return { newState, events };

    if (action === "guess") {
      const { guess } = payload;
      const g = String(guess || "").trim().toLowerCase();
      const answer = currentClue.answer.toLowerCase();
      const isCorrect = g === answer || answer.split(" ").some((w) => w.length > 3 && g.includes(w));

      newState.guesses.push(g);
      if (isCorrect) {
        const humanId = newState.humanPlayerIds[0] || "user";
        newState.scores[humanId] = (newState.scores[humanId] || 0) + 1;
        newState.revealed = true;
        newState.phase = "revealed";
        events.push({ type: "correct", message: `✅ Correct! The answer was **${currentClue.answer}**.` });
      } else {
        events.push({ type: "wrong", message: `❌ Nope! Try again or use a Hint.` });
      }
      return { newState, events };
    }

    if (action === "hint") {
      const hints = currentClue.hints || [];
      if (newState.currentHintIndex < hints.length) {
        const hint = hints[newState.currentHintIndex];
        newState.currentHintIndex++;
        newState.hintsUsed++;
        events.push({ type: "hint", message: `💡 Hint: ${hint}` });
      } else {
        events.push({ type: "hint", message: "No more hints! Try Reveal." });
      }
      return { newState, events };
    }

    if (action === "reveal") {
      newState.revealed = true;
      newState.phase = "revealed";
      events.push({ type: "reveal", message: `🔍 The answer was: **${currentClue.answer}**` });
      return { newState, events };
    }

    if (action === "next") {
      newState.currentIndex++;
      newState.round++;
      newState.revealed = false;
      newState.guesses = [];
      newState.currentHintIndex = 0;

      if (newState.round > newState.maxRounds || newState.currentIndex >= newState.clues.length) {
        newState.phase = "game_over";
        const humanId = newState.humanPlayerIds[0] || "user";
        newState.winner = humanId;
        events.push({ type: "game_over", message: `🏆 Game over! You got **${newState.scores[humanId] || 0}/${newState.maxRounds}** correct!` });
      } else {
        newState.phase = "guessing";
        events.push({ type: "next", message: `Round ${newState.round}/${newState.maxRounds}` });
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { clues, currentIndex, round, maxRounds, scores, phase, revealed, humanPlayerIds, guesses } = state;
    const clue = clues[currentIndex];
    const humanId = humanPlayerIds[0] || "user";

    if (phase === "game_over") {
      return {
        title: "😏 Dirty Double Takes — Game Over!",
        description: `Final score: **${scores[humanId] || 0}/${maxRounds}**`,
        color: 0xe74c3c,
        footer: "The answer was always innocent. Mostly.",
      };
    }

    return {
      title: `😏 Dirty Double Takes — Round ${round}/${maxRounds}`,
      description: [
        clue ? `**${clue.clue}**` : "No clue available.",
        "",
        guesses.length ? `Guesses so far: ${guesses.join(", ")}` : "",
        revealed && clue ? `\n✅ **Answer: ${clue.answer}**` : "",
        `\nScore: **${scores[humanId] || 0}**`,
      ].filter(Boolean).join("\n"),
      color: 0xe74c3c,
      footer: `Category: ${clue?.category || "?"} | ${companionName} is watching`,
    };
  },

  buildButtons({ state }) {
    const { phase, revealed, clues, currentIndex } = state;
    const clue = clues[currentIndex];
    if (phase === "game_over") return [];

    if (revealed || phase === "revealed") {
      return [{ customId: "next", label: "➡️ Next Clue", style: "PRIMARY" }];
    }

    const buttons = [
      { customId: "hint", label: "💡 Hint", style: "SECONDARY" },
      { customId: "reveal", label: "🔍 Reveal", style: "DANGER" },
    ];

    if (clue && (clue.hints?.length ?? 0) === 0) {
      return [{ customId: "reveal", label: "🔍 Reveal", style: "DANGER" }];
    }

    return buttons;
  },

  getCompanionMove() { return null; },

  filterClues,
};
