const questions = require("../content/trivia/questions.json");

const SUPPORTED_CATEGORIES = ["general", "movies", "tv", "music", "gaming", "mythology", "history", "science", "weird_facts"];
const SUPPORTED_DIFFICULTIES = ["easy", "medium", "hard"];
const OPTION_LABELS = ["A", "B", "C", "D"];

function filterQuestions({ category, difficulty }) {
  return questions.filter((q) => {
    if (category && category !== "all" && q.category !== category) return false;
    if (difficulty && difficulty !== "all" && q.difficulty !== difficulty) return false;
    return true;
  });
}

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickQuestions({ category, difficulty, count = 10 }) {
  const pool = shuffleArray(filterQuestions({ category, difficulty }));
  return pool.slice(0, Math.min(count, pool.length));
}

function companionAnswer(question) {
  if (Math.random() < 0.65) return question.answer;
  const wrong = question.options.map((_, i) => i).filter((i) => i !== question.answer);
  return wrong[Math.floor(Math.random() * wrong.length)];
}

module.exports = {
  id: "trivia",
  displayName: "Trivia",
  description: "Answer multiple-choice questions across many categories. The companion plays too!",
  category: "trivia",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Trivia Rules:**",
    "• Pick a category and difficulty, then answer multiple-choice questions.",
    "• The companion also answers each question.",
    "• Each correct answer = 1 point.",
    "• Categories: General, Movies/TV, Music, Gaming, Mythology, History, Science, Weird Facts.",
    "• Difficulties: Easy, Medium, Hard.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const category = settings.category || "all";
    const difficulty = settings.difficulty || "all";
    const maxRounds = Number(settings.maxRounds) || 10;
    const questionList = pickQuestions({ category, difficulty, count: maxRounds });

    return {
      questions: questionList,
      currentIndex: 0,
      scores: {
        [humanPlayerIds[0] || "user"]: 0,
        [companionId]: 0,
      },
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      category,
      difficulty,
      maxRounds: questionList.length,
      humanAnswer: null,
      companionAnswer: null,
      phase: "answering",
      winner: null,
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (action === "answer") {
      const { answerIndex, playerId } = payload;
      const q = newState.questions[newState.currentIndex];
      if (!q) return { newState, events };

      const isCorrect = Number(answerIndex) === q.answer;
      const isHuman = !playerId || playerId !== newState.companionId;

      if (isHuman) {
        newState.humanAnswer = Number(answerIndex);
        if (isCorrect) {
          newState.scores[newState.humanPlayerIds[0] || "user"]++;
        }
        const cAnswer = companionAnswer(q);
        newState.companionAnswer = cAnswer;
        const cCorrect = cAnswer === q.answer;
        if (cCorrect) newState.scores[newState.companionId]++;

        events.push({
          type: "answer_reveal",
          message: [
            `The answer was **${OPTION_LABELS[q.answer]}: ${q.options[q.answer]}**`,
            isCorrect ? "✅ You got it!" : `❌ You answered ${OPTION_LABELS[Number(answerIndex)]}.`,
            cCorrect ? `✅ Companion got it!` : `❌ Companion answered ${OPTION_LABELS[cAnswer]}.`,
          ].join("\n"),
          isCorrect,
          cCorrect,
          correctAnswer: q.answer,
          humanAnswer: Number(answerIndex),
          companionAnswer: cAnswer,
        });

        newState.phase = "revealed";
      }
      return { newState, events };
    }

    if (action === "next") {
      newState.currentIndex++;
      newState.humanAnswer = null;
      newState.companionAnswer = null;

      if (newState.currentIndex >= newState.questions.length) {
        const humanScore = newState.scores[newState.humanPlayerIds[0] || "user"];
        const companionScore = newState.scores[newState.companionId];
        if (humanScore > companionScore) newState.winner = newState.humanPlayerIds[0] || "user";
        else if (companionScore > humanScore) newState.winner = newState.companionId;
        else newState.winner = "tie";
        newState.phase = "game_over";
        events.push({ type: "game_over", message: "🏆 Trivia over!" });
      } else {
        newState.phase = "answering";
        events.push({ type: "next_question", message: `Question ${newState.currentIndex + 1}/${newState.questions.length}` });
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { questions, currentIndex, scores, phase, winner, companionId } = state;
    const q = questions[currentIndex];

    if (phase === "game_over" || !q) {
      return {
        title: "🏆 Trivia — Game Over!",
        description: Object.entries(scores)
          .map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s} pts**`)
          .join("\n"),
        color: 0xffd700,
        footer: winner === "tie" ? "It's a tie!" : (winner === companionId ? `${companionName} wins!` : `${humanName} wins!`),
      };
    }

    const optionLines = q.options.map((opt, i) => `**${OPTION_LABELS[i]}:** ${opt}`).join("\n");
    const scoreLines = Object.entries(scores)
      .map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s}**`)
      .join(" | ");

    return {
      title: `🧠 Trivia — Q${currentIndex + 1}/${questions.length}`,
      description: [`**${q.question}**`, "", optionLines, "", scoreLines].join("\n"),
      color: 0x1abc9c,
      footer: `Category: ${q.category} | Difficulty: ${q.difficulty}`,
    };
  },

  buildButtons({ state }) {
    const { phase, questions, currentIndex, winner } = state;
    if (winner || phase === "game_over") return [];

    if (phase === "answering") {
      const q = questions[currentIndex];
      if (!q) return [];
      return q.options.map((opt, i) => ({
        customId: `answer_${i}`,
        label: `${OPTION_LABELS[i]}: ${opt.slice(0, 40)}`,
        style: "PRIMARY",
      }));
    }

    if (phase === "revealed") {
      return [{ customId: "next", label: "➡️ Next Question", style: "SECONDARY" }];
    }

    return [];
  },

  getCompanionMove() { return null; },

  SUPPORTED_CATEGORIES,
  SUPPORTED_DIFFICULTIES,
  filterQuestions,
  pickQuestions,
};
