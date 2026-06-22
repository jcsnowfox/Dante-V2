const farkle = require("./gameTypes/farkle");
const blackjack = require("./gameTypes/blackjack");
const yahtzee = require("./gameTypes/yahtzee");
const trivia = require("./gameTypes/trivia");
const madlibs = require("./gameTypes/madlibs");
const pictionary = require("./gameTypes/pictionary");
const chaosCards = require("./gameTypes/chaosCards");
const handAndFootCanasta = require("./gameTypes/handAndFootCanasta");
const dirtyDoubleTakes = require("./gameTypes/dirtyDoubleTakes");
const redGreenBlackFlag = require("./gameTypes/redGreenBlackFlag");
const wouldYouRatherAfterDark = require("./gameTypes/wouldYouRatherAfterDark");

const ALL_GAMES = [
  farkle,
  blackjack,
  yahtzee,
  trivia,
  madlibs,
  pictionary,
  chaosCards,
  handAndFootCanasta,
  dirtyDoubleTakes,
  redGreenBlackFlag,
  wouldYouRatherAfterDark,
];

function createGameRegistry() {
  const gameMap = new Map(ALL_GAMES.map((g) => [g.id, g]));

  return {
    getGame(id) {
      return gameMap.get(String(id || "").toLowerCase().trim()) || null;
    },

    listGames() {
      return [...ALL_GAMES];
    },

    listEnabledGames(gameSettings = {}) {
      return ALL_GAMES.filter((game) => {
        if (game.requiresAdultPartyGames && !gameSettings.adultPartyGamesEnabled) {
          return false;
        }
        const overrideKey = `game_${game.id}_enabled`;
        if (Object.prototype.hasOwnProperty.call(gameSettings, overrideKey)) {
          return Boolean(gameSettings[overrideKey]);
        }
        if (game.requiresAdultPartyGames) {
          return true;
        }
        return game.defaultEnabled !== false;
      });
    },

    isGameEnabled(id, gameSettings = {}) {
      const game = this.getGame(id);
      if (!game) return false;
      return this.listEnabledGames(gameSettings).some((g) => g.id === game.id);
    },

    isAdultGame(id) {
      const game = this.getGame(id);
      return Boolean(game?.requiresAdultPartyGames);
    },

    resolveGameByAlias(input) {
      if (!input) return null;
      const normalized = String(input).toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
      const directMatch = this.getGame(normalized);
      if (directMatch) return directMatch;

      const aliases = {
        dirty: "dirty-double-takes",
        "double-takes": "dirty-double-takes",
        flags: "red-green-black-flag",
        "red-flag": "red-green-black-flag",
        "after-dark": "would-you-rather-after-dark",
        wyr: "would-you-rather-after-dark",
        chaos: "chaos-cards",
        "bad-answers": "chaos-cards",
        canasta: "hand-and-foot-canasta",
        "hand-foot": "hand-and-foot-canasta",
        "mad-lib": "madlibs",
        "mad-libs": "madlibs",
        quiz: "trivia",
        draw: "pictionary",
        cards: "chaos-cards",
      };

      const aliasTarget = aliases[normalized];
      return aliasTarget ? this.getGame(aliasTarget) : null;
    },
  };
}

module.exports = { createGameRegistry };
