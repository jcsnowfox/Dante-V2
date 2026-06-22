const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cardValue(rank) {
  if (["J", "Q", "K"].includes(rank)) return 10;
  if (rank === "A") return 11;
  return parseInt(rank, 10);
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function formatCard(card) {
  return `${card.rank}${card.suit}`;
}

function formatHand(hand, hideSecond = false) {
  if (hideSecond && hand.length >= 2) {
    return `${formatCard(hand[0])} 🂠`;
  }
  return hand.map(formatCard).join(" ");
}

function dealInitial(deck) {
  const newDeck = [...deck];
  const playerHand = [newDeck.pop(), newDeck.pop()];
  const dealerHand = [newDeck.pop(), newDeck.pop()];
  return { deck: newDeck, playerHand, dealerHand };
}

module.exports = {
  id: "blackjack",
  displayName: "Blackjack",
  description: "Classic card game. Get closer to 21 than the dealer without going over. For fun only — no real money.",
  category: "card",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 1,
  supportsCompanionPlayer: false,
  supportsButtons: true,
  rulesText: [
    "**Blackjack Rules:**",
    "• Try to get closer to 21 than the dealer without going over.",
    "• Number cards = face value, J/Q/K = 10, Ace = 11 or 1.",
    "• Dealer hits on 16 or less, stands on 17 or more.",
    "• Blackjack (Ace + 10-value on first deal) beats a regular 21.",
    "• **For fun only — no real money or gambling.**",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    return {
      deck: buildDeck(),
      playerHand: [],
      dealerHand: [],
      phase: "idle",
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      scores: { player: 0, dealer: 0 },
      roundResult: null,
      round: 0,
      message: "Use **Deal** to start a new round.",
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (action === "deal") {
      if (newState.deck.length < 10) {
        newState.deck = buildDeck();
      }
      const { deck, playerHand, dealerHand } = dealInitial(newState.deck);
      newState.deck = deck;
      newState.playerHand = playerHand;
      newState.dealerHand = dealerHand;
      newState.phase = "player_turn";
      newState.roundResult = null;
      newState.round++;
      newState.message = "";

      const playerVal = handValue(playerHand);
      if (playerVal === 21) {
        const dealerVal = handValue(dealerHand);
        if (dealerVal === 21) {
          newState.phase = "done";
          newState.roundResult = "push";
          newState.message = "Both have Blackjack — Push!";
          events.push({ type: "blackjack_push", message: "Both Blackjack — Push!" });
        } else {
          newState.phase = "done";
          newState.roundResult = "player_blackjack";
          newState.scores.player++;
          newState.message = "🎉 Blackjack!";
          events.push({ type: "blackjack", message: "Blackjack! Player wins!" });
        }
      } else {
        events.push({ type: "deal", message: `Cards dealt. Your hand: ${formatHand(playerHand)} (${playerVal})` });
      }
      return { newState, events };
    }

    if (action === "hit") {
      if (newState.phase !== "player_turn") return { newState, events };
      const card = newState.deck.pop();
      newState.playerHand.push(card);
      const val = handValue(newState.playerHand);

      if (val > 21) {
        newState.phase = "done";
        newState.roundResult = "player_bust";
        newState.scores.dealer++;
        newState.message = `Bust! Hand: ${formatHand(newState.playerHand)} (${val})`;
        events.push({ type: "bust", message: `Bust with ${val}!` });
      } else if (val === 21) {
        events.push({ type: "hit", message: `Hit! Hand: ${formatHand(newState.playerHand)} (${val}) — Auto stand at 21.` });
        newState.phase = "dealer_turn";
        const dealerResult = runDealerTurn(newState);
        newState.deck = dealerResult.deck;
        newState.dealerHand = dealerResult.dealerHand;
        const outcome = resolveOutcome(newState);
        newState.phase = "done";
        newState.roundResult = outcome.result;
        if (outcome.result === "player_win") newState.scores.player++;
        else if (outcome.result === "dealer_win") newState.scores.dealer++;
        newState.message = outcome.message;
        events.push({ type: "result", message: outcome.message });
      } else {
        events.push({ type: "hit", message: `Hit! Hand: ${formatHand(newState.playerHand)} (${val})` });
      }
      return { newState, events };
    }

    if (action === "stand") {
      if (newState.phase !== "player_turn") return { newState, events };
      newState.phase = "dealer_turn";
      const dealerResult = runDealerTurn(newState);
      newState.deck = dealerResult.deck;
      newState.dealerHand = dealerResult.dealerHand;
      const outcome = resolveOutcome(newState);
      newState.phase = "done";
      newState.roundResult = outcome.result;
      if (outcome.result === "player_win") newState.scores.player++;
      else if (outcome.result === "dealer_win") newState.scores.dealer++;
      newState.message = outcome.message;
      events.push({ type: "result", message: outcome.message });
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { playerHand, dealerHand, phase, scores, round, message } = state;
    const playerVal = handValue(playerHand || []);
    const dealerVal = handValue(dealerHand || []);
    const hideDealer = phase === "player_turn";

    return {
      title: "🃏 Blackjack",
      description: [
        playerHand?.length ? `${humanName}: ${formatHand(playerHand)} **(${playerVal})**` : "",
        dealerHand?.length ? `Dealer: ${hideDealer ? formatHand(dealerHand, true) : `${formatHand(dealerHand)} **(${dealerVal})**`}` : "",
        message ? `\n${message}` : "",
        `\nWins — ${humanName}: **${scores?.player || 0}** | Dealer: **${scores?.dealer || 0}**`,
        `Round: ${round || 0}`,
      ].filter(Boolean).join("\n"),
      color: phase === "done"
        ? (["player_win", "player_blackjack"].includes(state.roundResult) ? 0x2ecc71 : 0xe74c3c)
        : 0x2c3e50,
      footer: `${companionName} is watching — no real money involved`,
    };
  },

  buildButtons({ state }) {
    const { phase } = state;
    if (phase === "idle" || phase === "done") {
      return [{ customId: "deal", label: "🃏 Deal", style: "PRIMARY" }];
    }
    if (phase === "player_turn") {
      return [
        { customId: "hit", label: "👆 Hit", style: "PRIMARY" },
        { customId: "stand", label: "✋ Stand", style: "SECONDARY" },
      ];
    }
    return [];
  },

  getCompanionMove() { return null; },

  handValue,
  buildDeck,
  shuffleDeck,
};

function runDealerTurn(state) {
  const deck = [...state.deck];
  const dealerHand = [...state.dealerHand];
  while (handValue(dealerHand) < 17) {
    dealerHand.push(deck.pop());
  }
  return { deck, dealerHand };
}

function resolveOutcome(state) {
  const playerVal = handValue(state.playerHand);
  const dealerVal = handValue(state.dealerHand);

  if (dealerVal > 21) return { result: "player_win", message: `Dealer busts at ${dealerVal}! You win!` };
  if (playerVal > dealerVal) return { result: "player_win", message: `You win! ${playerVal} vs ${dealerVal}.` };
  if (dealerVal > playerVal) return { result: "dealer_win", message: `Dealer wins. ${dealerVal} vs ${playerVal}.` };
  return { result: "push", message: `Push — both at ${playerVal}.` };
}
