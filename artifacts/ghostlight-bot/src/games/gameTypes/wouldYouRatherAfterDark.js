const questions = require("../content/adultParty/wouldYouRatherAfterDark.json");

const SUPPORTED_CATEGORIES = ["flirty", "romantic", "embarrassing", "chaotic_party", "dark_humor", "couples_only", "custom"];
const SUPPORTED_INTENSITIES = ["suggestive", "explicit"];

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function filterQuestions({ categories = [], allowExplicit = false } = {}) {
  return questions.filter((q) => {
    if (!allowExplicit && q.intensity === "explicit") return false;
    if (categories.length && !categories.includes(q.category)) return false;
    return true;
  });
}

function companionChoose(question) {
  return Math.random() < 0.5 ? "A" : "B";
}

module.exports = {
  id: "would-you-rather-after-dark",
  displayName: "Would You Rather: After Dark",
  description: "Adult party Would You Rather — flirty, embarrassing, romantic, and chaotic options.",
  category: "adult_party",
  defaultEnabled: false,
  requiresAdultPartyGames: true,
  requiresAdultPrivateChannel: true,
  minPlayers: 1,
  maxPlayers: 4,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Would You Rather: After Dark Rules:**",
    "• A Would You Rather question appears with two options.",
    "• Answer A or B.",
    "• The companion also answers and reacts in character.",
    "• +1 point if you match the companion's answer.",
    "• Default questions are suggestive and funny, not explicit.",
    "• Explicit mode requires admin settings to unlock.",
    "• No prohibited content, ever.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const maxRounds = Number(settings.maxRounds) || 10;
    const categories = settings.categories || [];
    const allowExplicit = settings.allowExplicit === true;
    const pool = shuffleArray(filterQuestions({ categories, allowExplicit }));

    return {
      questions: pool,
      currentIndex: 0,
      maxRounds: Math.min(maxRounds, pool.length),
      humanAnswer: null,
      companionAnswer: null,
      scores: Object.fromEntries([...humanPlayerIds, companionId].map((id) => [id, 0])),
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      round: 1,
      phase: "answering",
      revealed: false,
      winner: null,
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];
    const currentQuestion = newState.questions[newState.currentIndex];
    if (!currentQuestion) return { newState, events };

    if (action === "answer") {
      const { answer } = payload;
      if (!["A", "B"].includes(answer)) {
        events.push({ type: "error", message: "Choose A or B." });
        return { newState, events };
      }

      newState.humanAnswer = answer;
      const cAnswer = companionChoose(currentQuestion);
      newState.companionAnswer = cAnswer;

      const humanId = newState.humanPlayerIds[0] || "user";
      if (answer === cAnswer) {
        newState.scores[humanId] = (newState.scores[humanId] || 0) + 1;
      }

      newState.phase = "revealed";
      newState.revealed = true;

      events.push({
        type: "reveal",
        message: [
          `You chose: **${answer}: ${answer === "A" ? currentQuestion.optionA : currentQuestion.optionB}**`,
          `Companion chose: **${cAnswer}: ${cAnswer === "A" ? currentQuestion.optionA : currentQuestion.optionB}**`,
          answer === cAnswer ? "✅ You matched!" : "Different takes — fair enough.",
        ].join("\n"),
        humanAnswer: answer,
        companionAnswer: cAnswer,
        matched: answer === cAnswer,
        question: currentQuestion,
      });
      return { newState, events };
    }

    if (action === "next") {
      newState.currentIndex++;
      newState.round++;
      newState.humanAnswer = null;
      newState.companionAnswer = null;
      newState.revealed = false;

      if (newState.round > newState.maxRounds || newState.currentIndex >= newState.questions.length) {
        newState.phase = "game_over";
        const topPlayer = Object.entries(newState.scores).sort((a, b) => b[1] - a[1])[0];
        newState.winner = topPlayer?.[0] || null;
        events.push({ type: "game_over", message: "🏆 Game over!" });
      } else {
        newState.phase = "answering";
        events.push({ type: "next", message: `Round ${newState.round}/${newState.maxRounds}` });
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { questions, currentIndex, round, maxRounds, scores, phase, humanAnswer, companionAnswer, humanPlayerIds, companionId, winner } = state;
    const q = questions[currentIndex];
    const humanId = humanPlayerIds[0] || "user";

    if (phase === "game_over") {
      return {
        title: "🔥 Would You Rather: After Dark — Game Over!",
        description: Object.entries(scores).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s} pts**`).join("\n"),
        color: 0xffd700,
        footer: "No wrong answers. Well, maybe a few.",
      };
    }

    const scoreLines = Object.entries(scores).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s}**`).join(" | ");

    return {
      title: `🔥 Would You Rather: After Dark — Round ${round}/${maxRounds}`,
      description: [
        q ? `**Would you rather...**\n\n**A:** ${q.optionA}\n\n**B:** ${q.optionB}` : "No question available.",
        "",
        phase === "revealed" ? [
          `Your answer: **${humanAnswer}**`,
          `${companionName}: **${companionAnswer}**`,
          humanAnswer === companionAnswer ? "✅ Same!" : "Different!",
        ].join("\n") : "",
        "",
        scoreLines,
      ].filter(Boolean).join("\n"),
      color: 0xe74c3c,
      footer: `Category: ${q?.category || "?"} | +1 pt for matching ${companionName}`,
    };
  },

  buildButtons({ state }) {
    const { phase, winner } = state;
    if (winner || phase === "game_over") return [];

    if (phase === "answering") {
      const q = state.questions[state.currentIndex];
      return [
        { customId: "answer_A", label: `A: ${q?.optionA?.slice(0, 40) || "Option A"}`, style: "PRIMARY" },
        { customId: "answer_B", label: `B: ${q?.optionB?.slice(0, 40) || "Option B"}`, style: "SECONDARY" },
      ];
    }

    if (phase === "revealed") {
      return [{ customId: "next", label: "➡️ Next Question", style: "PRIMARY" }];
    }

    return [];
  },

  getCompanionMove() { return null; },

  SUPPORTED_CATEGORIES,
  SUPPORTED_INTENSITIES,
  filterQuestions,
};
