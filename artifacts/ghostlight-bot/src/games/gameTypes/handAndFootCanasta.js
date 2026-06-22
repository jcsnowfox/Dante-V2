/**
 * Hand and Foot Canasta — BETA / SCAFFOLDED
 *
 * This implementation is a scaffold only.
 * Full game logic (meld rules, canasta scoring, foot phase, end-game) is not yet
 * implemented. The module defines the structure and placeholder flows so the game
 * can be registered and started, but play is limited to dealing and turn display.
 *
 * Status: BETA — clearly incomplete. Do not advertise as fully playable.
 */

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function buildDoubleDeck() {
  const single = [];
  for (let i = 0; i < 2; i++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        single.push({ suit, rank });
      }
    }
    single.push({ suit: "🃏", rank: "W" });
    single.push({ suit: "🃏", rank: "W" });
  }
  return shuffleDeck(single);
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function dealHands(deck, players) {
  const hands = Object.fromEntries(players.map((p) => [p, []]));
  const feet = Object.fromEntries(players.map((p) => [p, []]));
  const remaining = [...deck];

  for (const playerId of players) {
    hands[playerId] = remaining.splice(0, 11);
    feet[playerId] = remaining.splice(0, 11);
  }

  return { hands, feet, remaining };
}

module.exports = {
  id: "hand-and-foot-canasta",
  displayName: "Hand & Foot Canasta",
  description: "[BETA] A long-form canasta variant. Full rules scaffolded — play is limited in this version.",
  category: "card",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  isBeta: true,
  rulesText: [
    "**Hand and Foot Canasta — BETA**",
    "⚠️ This game is in beta. Full meld and scoring rules are not yet implemented.",
    "",
    "**Basic rules (scaffold):**",
    "• Each player receives a 'hand' of 11 cards and a 'foot' of 11 cards.",
    "• Players draw 2 cards per turn and discard 1.",
    "• When your hand is exhausted, pick up your foot.",
    "• Build melds of 3+ cards of the same rank.",
    "• A canasta is 7 cards of the same rank.",
    "• Full scoring and win conditions coming in a future update.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId }) {
    const players = [...humanPlayerIds, companionId];
    const deck = buildDoubleDeck();
    const { hands, feet, remaining } = dealHands(deck, players);

    return {
      deck: remaining,
      discardPile: [],
      hands,
      feet,
      melds: Object.fromEntries(players.map((p) => [p, []])),
      activeHandOrFoot: Object.fromEntries(players.map((p) => [p, "hand"])),
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      activePlayer: humanPlayerIds[0] || "user",
      round: 1,
      turn: 0,
      phase: "draw",
      betaWarningShown: false,
      winner: null,
      isBeta: true,
    };
  },

  processAction({ state, action }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (!newState.betaWarningShown) {
      newState.betaWarningShown = true;
      events.push({
        type: "beta_notice",
        message: "⚠️ **Hand & Foot Canasta is in BETA.** Full rules are not yet implemented. You can draw and discard, but scoring and melds are placeholder only.",
      });
    }

    if (action === "draw") {
      if (newState.deck.length < 2) {
        events.push({ type: "error", message: "Not enough cards in deck." });
        return { newState, events };
      }
      const card1 = newState.deck.pop();
      const card2 = newState.deck.pop();
      const { activePlayer } = newState;
      const currentHand = newState.activeHandOrFoot[activePlayer] === "hand"
        ? newState.hands[activePlayer]
        : newState.feet[activePlayer];
      currentHand.push(card1, card2);
      newState.phase = "discard";
      events.push({ type: "draw", message: `Drew 2 cards. Hand size: ${currentHand.length}. Now discard 1.` });
      return { newState, events };
    }

    if (action === "discard") {
      const { cardIndex } = action.payload || {};
      const { activePlayer } = newState;
      const currentHand = newState.activeHandOrFoot[activePlayer] === "hand"
        ? newState.hands[activePlayer]
        : newState.feet[activePlayer];
      const idx = Number(cardIndex || 0);
      const [discarded] = currentHand.splice(idx, 1);
      if (discarded) newState.discardPile.push(discarded);
      newState.phase = "draw";
      newState.turn++;
      newState.activePlayer = activePlayer === newState.companionId
        ? (newState.humanPlayerIds[0] || "user")
        : newState.companionId;
      events.push({ type: "discard", message: `[BETA] Discarded. Turn passes.` });
      return { newState, events };
    }

    events.push({ type: "beta_action", message: "[BETA] This action is not fully implemented yet." });
    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { activePlayer, companionId, hands, feet, activeHandOrFoot, discardPile, deck, phase, isBeta } = state;
    const humanId = state.humanPlayerIds[0] || "user";

    return {
      title: `🃏 Hand & Foot Canasta ${isBeta ? "[BETA]" : ""}`,
      description: [
        "⚠️ **Beta version — full rules not yet implemented.**",
        "",
        `${humanName} hand: **${hands[humanId]?.length || 0}** cards | foot: **${feet[humanId]?.length || 0}** cards`,
        `${companionName} hand: **${hands[companionId]?.length || 0}** cards | foot: **${feet[companionId]?.length || 0}** cards`,
        `Deck: ${deck?.length || 0} | Discard pile: ${discardPile?.length || 0}`,
        `\nPhase: ${phase} | Turn: ${activePlayer === companionId ? companionName : humanName}`,
      ].join("\n"),
      color: 0x95a5a6,
      footer: "BETA — meld tracking and scoring coming soon",
    };
  },

  buildButtons({ state }) {
    const { phase, activePlayer, companionId } = state;
    if (activePlayer === companionId) return [];
    if (phase === "draw") return [{ customId: "draw", label: "🃏 Draw 2", style: "PRIMARY" }];
    if (phase === "discard") return [{ customId: "discard_0", label: "Discard Card 1", style: "SECONDARY" }];
    return [];
  },

  getCompanionMove({ state }) {
    const { activePlayer, companionId } = state;
    if (activePlayer !== companionId) return null;
    if (state.phase === "draw") return { action: "draw", payload: {} };
    return { action: "discard", payload: { cardIndex: 0 } };
  },

  buildDoubleDeck,
  dealHands,
};
