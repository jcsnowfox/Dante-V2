const promptCards = require("../content/chaosCards/promptCards.json");
const answerCards = require("../content/chaosCards/answerCards.json");

const SUPPORTED_CATEGORIES = ["clean", "silly", "dark_humor", "fantasy", "custom"];

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function filterCards(cards, allowedCategories) {
  if (!allowedCategories || allowedCategories.includes("all")) return cards;
  return cards.filter((c) => allowedCategories.includes(c.category));
}

function dealAnswerCards(deck, count = 5) {
  const hand = deck.splice(0, count);
  return { hand, remaining: deck };
}

module.exports = {
  id: "chaos-cards",
  displayName: "Chaos Cards",
  description: "Original fill-in-the-blank party card game. Funniest answer wins!",
  category: "party",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Chaos Cards Rules:**",
    "• A prompt card appears with a blank.",
    "• You and the companion each choose an answer card.",
    "• The funniest or best-fitting answer wins the round.",
    "• First to the target score wins!",
    "• This game uses original content only — no copyrighted card game text.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const allowedCategories = settings.categories || ["clean", "silly", "dark_humor", "fantasy"];
    const targetScore = Number(settings.targetScore) || 5;

    const filteredPrompts = shuffleArray(filterCards(promptCards, allowedCategories));
    const filteredAnswers = shuffleArray(filterCards(answerCards, allowedCategories));

    const { hand: humanHand, remaining: answerDeck } = dealAnswerCards([...filteredAnswers], 5);
    const { hand: companionHand, remaining: finalAnswerDeck } = dealAnswerCards(answerDeck, 5);

    return {
      promptDeck: filteredPrompts,
      answerDeck: finalAnswerDeck,
      currentPrompt: filteredPrompts[0] || null,
      currentPromptIndex: 0,
      humanHand,
      companionHand,
      humanAnswer: null,
      companionAnswer: null,
      scores: {
        [humanPlayerIds[0] || "user"]: 0,
        [companionId]: 0,
      },
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      targetScore,
      round: 1,
      phase: "choosing",
      winner: null,
      judgedWinner: null,
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (action === "choose_answer") {
      const { cardIndex, playerId } = payload;
      const isHuman = !playerId || playerId !== newState.companionId;

      if (isHuman) {
        const card = newState.humanHand[Number(cardIndex)];
        if (!card) { events.push({ type: "error", message: "Invalid card selection." }); return { newState, events }; }
        newState.humanAnswer = card;

        const cCard = newState.companionHand[Math.floor(Math.random() * newState.companionHand.length)];
        newState.companionAnswer = cCard;

        newState.phase = "judging";
        events.push({
          type: "answers_in",
          message: [
            `📝 Prompt: *${newState.currentPrompt?.text}*`,
            `Your answer: **"${card.text}"**`,
            `Companion's answer: **"${cCard.text}"**`,
            `Who wins this round? Use the buttons to judge!`,
          ].join("\n"),
        });
      }
      return { newState, events };
    }

    if (action === "judge") {
      const { winner: judgedWinnerId } = payload;
      newState.judgedWinner = judgedWinnerId;

      if (judgedWinnerId && newState.scores[judgedWinnerId] !== undefined) {
        newState.scores[judgedWinnerId]++;
      }

      const { scores, targetScore, companionId, humanPlayerIds } = newState;
      const humanId = humanPlayerIds[0] || "user";
      if (scores[humanId] >= targetScore) {
        newState.winner = humanId;
        newState.phase = "game_over";
      } else if (scores[companionId] >= targetScore) {
        newState.winner = companionId;
        newState.phase = "game_over";
      } else {
        newState.phase = "next_round";
      }

      events.push({
        type: "judgment",
        message: judgedWinnerId
          ? `🏆 This round goes to: **${judgedWinnerId === companionId ? "Companion" : "You"}**!`
          : "Round called as a draw!",
      });
      return { newState, events };
    }

    if (action === "next_round") {
      newState.round++;
      newState.currentPromptIndex++;
      const nextPrompt = newState.promptDeck[newState.currentPromptIndex];

      if (!nextPrompt) {
        newState.phase = "game_over";
        const humanScore = newState.scores[newState.humanPlayerIds[0] || "user"];
        const companionScore = newState.scores[newState.companionId];
        newState.winner = humanScore > companionScore
          ? (newState.humanPlayerIds[0] || "user")
          : (companionScore > humanScore ? newState.companionId : "tie");
        events.push({ type: "game_over", message: "No more prompt cards!" });
      } else {
        newState.currentPrompt = nextPrompt;
        newState.humanAnswer = null;
        newState.companionAnswer = null;
        newState.judgedWinner = null;

        const newHumanCard = newState.answerDeck.shift();
        if (newHumanCard) newState.humanHand.push(newHumanCard);
        const newCompanionCard = newState.answerDeck.shift();
        if (newCompanionCard) newState.companionHand.push(newCompanionCard);

        newState.phase = "choosing";
        events.push({ type: "next_round", message: `Round ${newState.round}!` });
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { currentPrompt, humanHand, humanAnswer, companionAnswer, scores, phase, companionId, round, targetScore, winner } = state;

    if (phase === "game_over") {
      return {
        title: "🃏 Chaos Cards — Game Over!",
        description: Object.entries(scores).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s}**`).join("\n"),
        color: 0xffd700,
        footer: winner === companionId ? `${companionName} wins!` : (winner === "tie" ? "It's a tie!" : `${humanName} wins!`),
      };
    }

    const scoreLines = Object.entries(scores).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s}/${targetScore}**`).join(" | ");

    if (phase === "choosing") {
      const handLines = humanHand.map((c, i) => `**${i + 1}.** "${c.text}"`).join("\n");
      return {
        title: `🃏 Chaos Cards — Round ${round}`,
        description: [`📋 *${currentPrompt?.text}*`, "", "**Your hand:**", handLines, "", scoreLines].join("\n"),
        color: 0x9b59b6,
        footer: "Pick an answer card!",
      };
    }

    if (phase === "judging") {
      return {
        title: `🃏 Chaos Cards — Round ${round} — Judge!`,
        description: [
          `📋 *${currentPrompt?.text}*`,
          "",
          `${humanName}: **"${humanAnswer?.text}"**`,
          `${companionName}: **"${companionAnswer?.text}"**`,
          "",
          scoreLines,
        ].join("\n"),
        color: 0xe67e22,
        footer: "Who wins this round?",
      };
    }

    return { title: "🃏 Chaos Cards", description: scoreLines, color: 0x9b59b6, footer: null };
  },

  buildButtons({ state }) {
    const { phase, humanHand, companionId, companionAnswer, humanAnswer } = state;

    if (phase === "choosing") {
      return humanHand.slice(0, 5).map((card, i) => ({
        customId: `choose_${i}`,
        label: `${i + 1}: ${card.text.slice(0, 40)}`,
        style: "PRIMARY",
      }));
    }

    if (phase === "judging") {
      return [
        { customId: "judge_human", label: "🏆 My answer wins!", style: "SUCCESS" },
        { customId: "judge_companion", label: `🏆 ${companionId}'s answer wins!`, style: "SECONDARY" },
        { customId: "judge_draw", label: "🤝 It's a draw", style: "DANGER" },
      ];
    }

    if (phase === "next_round") {
      return [{ customId: "next_round", label: "➡️ Next Round", style: "PRIMARY" }];
    }

    return [];
  },

  getCompanionMove() { return null; },

  SUPPORTED_CATEGORIES,
  promptCards,
  answerCards,
};
