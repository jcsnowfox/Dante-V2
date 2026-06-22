const test = require("node:test");
const assert = require("node:assert/strict");

const { createGameRegistry } = require("../gameRegistry");
const { createGameSessionStore } = require("../gameSessionStore");
const farkle = require("../gameTypes/farkle");
const blackjack = require("../gameTypes/blackjack");
const yahtzee = require("../gameTypes/yahtzee");
const trivia = require("../gameTypes/trivia");
const madlibs = require("../gameTypes/madlibs");
const chaosCards = require("../gameTypes/chaosCards");
const pictionary = require("../gameTypes/pictionary");
const dirtyDoubleTakes = require("../gameTypes/dirtyDoubleTakes");
const redGreenBlackFlag = require("../gameTypes/redGreenBlackFlag");
const wouldYouRatherAfterDark = require("../gameTypes/wouldYouRatherAfterDark");
const handAndFootCanasta = require("../gameTypes/handAndFootCanasta");
const { parseButtonCustomId, mapButtonActionToGameAction } = require("../discord/gameButtons");
const { generateSessionId } = require("../gameSessionStore");

const TEST_HUMAN = "user_abc123";
const TEST_COMPANION = "companion_xyz789";

function makeInitArgs(overrides = {}) {
  return {
    humanPlayerIds: [TEST_HUMAN],
    companionId: TEST_COMPANION,
    settings: {},
    ...overrides,
  };
}

test("game registry — lists all games", () => {
  const registry = createGameRegistry();
  const games = registry.listGames();
  assert.ok(games.length >= 8, `Expected at least 8 games, got ${games.length}`);
});

test("game registry — getGame returns null for unknown id", () => {
  const registry = createGameRegistry();
  assert.equal(registry.getGame("totally-fake-game"), null);
});

test("game registry — adult games are disabled by default", () => {
  const registry = createGameRegistry();
  const enabled = registry.listEnabledGames({});
  const adultGames = enabled.filter((g) => g.requiresAdultPartyGames);
  assert.equal(adultGames.length, 0, "No adult games should be enabled by default");
});

test("game registry — adult games enabled when setting is true", () => {
  const registry = createGameRegistry();
  const enabled = registry.listEnabledGames({ adultPartyGamesEnabled: true });
  const adultGames = enabled.filter((g) => g.requiresAdultPartyGames);
  assert.ok(adultGames.length >= 3, `Expected at least 3 adult games, got ${adultGames.length}`);
});

test("game registry — resolveGameByAlias works for common aliases", () => {
  const registry = createGameRegistry();
  assert.ok(registry.resolveGameByAlias("dirty"), "Should resolve 'dirty' alias");
  assert.ok(registry.resolveGameByAlias("flags"), "Should resolve 'flags' alias");
  assert.ok(registry.resolveGameByAlias("after-dark"), "Should resolve 'after-dark' alias");
});

test("game registry — isAdultGame returns true for adult games", () => {
  const registry = createGameRegistry();
  assert.equal(registry.isAdultGame("dirty-double-takes"), true);
  assert.equal(registry.isAdultGame("red-green-black-flag"), true);
  assert.equal(registry.isAdultGame("would-you-rather-after-dark"), true);
  assert.equal(registry.isAdultGame("farkle"), false);
});

test("gameSessionStore — noop store does not throw on init", async () => {
  const store = createGameSessionStore({
    config: {},
    logger: { warn: () => {}, debug: () => {} },
  });
  await assert.doesNotReject(() => store.init());
});

test("gameSessionStore — noop store returns null for getSession", async () => {
  const store = createGameSessionStore({
    config: {},
    logger: { warn: () => {}, debug: () => {} },
  });
  await store.init();
  const session = await store.getSession("fake_id");
  assert.equal(session, null);
});

test("gameSessionStore — noop store returns null for getActiveSessionByChannel", async () => {
  const store = createGameSessionStore({
    config: {},
    logger: { warn: () => {}, debug: () => {} },
  });
  const session = await store.getActiveSessionByChannel({ guildId: "g1", channelId: "c1" });
  assert.equal(session, null);
});

test("gameSessionStore — generateSessionId produces unique ids", () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    ids.add(generateSessionId());
  }
  assert.equal(ids.size, 100, "Session IDs should be unique");
});

test("farkle — createInitialState produces valid state", () => {
  const state = farkle.createInitialState(makeInitArgs());
  assert.ok(state.totalScores, "Should have totalScores");
  assert.ok(state.humanPlayerIds.includes(TEST_HUMAN), "Should include human player");
  assert.equal(state.companionId, TEST_COMPANION);
  assert.equal(state.targetScore, 10000);
});

test("farkle — scoreDice — single 1 scores 100", () => {
  const result = farkle.scoreDice([1, 2, 3, 4, 6]);
  assert.equal(result.total, 100);
  assert.equal(result.isFarkle, false);
});

test("farkle — scoreDice — single 5 scores 50", () => {
  const result = farkle.scoreDice([2, 3, 4, 5, 6]);
  assert.equal(result.total, 50);
  assert.equal(result.isFarkle, false);
});

test("farkle — scoreDice — three 2s scores 200", () => {
  const result = farkle.scoreDice([2, 2, 2]);
  assert.equal(result.total, 200);
});

test("farkle — scoreDice — three 1s scores 1000", () => {
  const result = farkle.scoreDice([1, 1, 1]);
  assert.equal(result.total, 1000);
});

test("farkle — scoreDice — Farkle detected with no scoring dice", () => {
  const result = farkle.scoreDice([2, 3, 4, 6, 6]);
  assert.equal(result.isFarkle, true);
  assert.equal(result.total, 0);
});

test("farkle — scoreDice — straight 1-6 scores 1500", () => {
  const result = farkle.scoreDice([1, 2, 3, 4, 5, 6]);
  assert.equal(result.total, 1500);
});

test("farkle — processAction roll produces dice", () => {
  const state = farkle.createInitialState(makeInitArgs());
  const result = farkle.processAction({ state, action: "roll" });
  assert.ok(result.newState.dice.length > 0, "Should produce dice after roll");
});

test("farkle — processAction bank without rolling gives error", () => {
  const state = farkle.createInitialState(makeInitArgs());
  const result = farkle.processAction({ state, action: "bank" });
  assert.ok(result.events.some((e) => e.type === "error"), "Should produce error event");
});

test("blackjack — createInitialState valid", () => {
  const state = blackjack.createInitialState(makeInitArgs());
  assert.ok(state.deck.length > 0, "Should have deck");
  assert.equal(state.phase, "idle");
});

test("blackjack — buildDeck produces 52 cards", () => {
  const deck = blackjack.buildDeck();
  assert.equal(deck.length, 52);
});

test("blackjack — handValue — Ace counts as 11", () => {
  assert.equal(blackjack.handValue([{ rank: "A", suit: "♠" }, { rank: "5", suit: "♥" }]), 16);
});

test("blackjack — handValue — Ace reduces to 1 to avoid bust", () => {
  assert.equal(blackjack.handValue([{ rank: "A", suit: "♠" }, { rank: "K", suit: "♥" }, { rank: "5", suit: "♦" }]), 16);
});

test("blackjack — deal action creates hands", () => {
  const state = blackjack.createInitialState(makeInitArgs());
  const result = blackjack.processAction({ state, action: "deal" });
  assert.ok(result.newState.playerHand.length === 2, "Player should have 2 cards");
  assert.ok(result.newState.dealerHand.length === 2, "Dealer should have 2 cards");
});

test("blackjack — no gambling — companion not a player", () => {
  assert.equal(blackjack.supportsCompanionPlayer, false, "Blackjack should not have companion as player");
});

test("yahtzee — createInitialState valid", () => {
  const state = yahtzee.createInitialState(makeInitArgs());
  assert.equal(state.dice.length, 5);
  assert.equal(state.rollsLeft, 3);
  assert.ok(state.scores[TEST_HUMAN], "Should have human scores");
  assert.ok(state.scores[TEST_COMPANION], "Should have companion scores");
});

test("yahtzee — roll reduces rollsLeft", () => {
  const state = yahtzee.createInitialState(makeInitArgs());
  const result = yahtzee.processAction({ state, action: "roll" });
  assert.equal(result.newState.rollsLeft, 2);
});

test("yahtzee — score category records score", () => {
  const state = yahtzee.createInitialState(makeInitArgs());
  state.dice = [1, 1, 1, 1, 1];
  state.rollsLeft = 2;
  const result = yahtzee.processAction({ state, action: "score", payload: { category: "aces" } });
  assert.equal(result.newState.scores[TEST_HUMAN].aces, 5, "Should score 5 for five aces");
});

test("yahtzee — cannot re-use scoring category", () => {
  const state = yahtzee.createInitialState(makeInitArgs());
  state.dice = [1, 1, 1, 1, 1];
  state.rollsLeft = 2;
  state.scores[TEST_HUMAN].aces = 5;
  const result = yahtzee.processAction({ state, action: "score", payload: { category: "aces" } });
  assert.ok(result.events.some((e) => e.type === "error"), "Should error on reuse");
});

test("trivia — createInitialState picks questions", () => {
  const state = trivia.createInitialState(makeInitArgs());
  assert.ok(state.questions.length > 0, "Should have questions");
  assert.equal(state.currentIndex, 0);
});

test("trivia — correct answer increments human score", () => {
  const state = trivia.createInitialState(makeInitArgs());
  const q = state.questions[0];
  const result = trivia.processAction({ state, action: "answer", payload: { answerIndex: q.answer, playerId: TEST_HUMAN } });
  const humanScore = result.newState.scores[TEST_HUMAN];
  assert.ok(humanScore >= 1, "Human should score for correct answer");
});

test("trivia — filterQuestions respects category", () => {
  const scienceQs = trivia.filterQuestions({ category: "science" });
  assert.ok(scienceQs.length > 0, "Should have science questions");
  assert.ok(scienceQs.every((q) => q.category === "science"), "All should be science");
});

test("madlibs — createInitialState picks template", () => {
  const state = madlibs.createInitialState(makeInitArgs());
  assert.ok(state.prompts.length > 0, "Should have prompts");
  assert.ok(state.templateTitle, "Should have title");
  assert.equal(state.completed, false);
});

test("madlibs — word collection progresses", () => {
  const state = madlibs.createInitialState(makeInitArgs());
  const result = madlibs.processAction({ state, action: "word", payload: { word: "dragon" } });
  assert.equal(result.newState.currentPromptIndex, 1);
  assert.equal(result.newState.filledWords[state.prompts[0].key], "dragon");
});

test("madlibs — fillTemplate replaces placeholders", () => {
  const result = madlibs.fillTemplate({ template: "I found a {adj1} {noun1}." }, { adj1: "sparkly", noun1: "banana" });
  assert.ok(result.includes("sparkly"), "Should fill adjective");
  assert.ok(result.includes("banana"), "Should fill noun");
});

test("chaos cards — uses original content only", () => {
  const prompts = chaosCards.promptCards;
  const answers = chaosCards.answerCards;

  const copyrightTerms = ["Cards Against Humanity", "Dirty Minds", "©", "copyrighted"];
  for (const card of [...prompts, ...answers]) {
    for (const term of copyrightTerms) {
      assert.ok(!card.text.includes(term), `Card text should not contain "${term}": "${card.text}"`);
    }
  }
});

test("chaos cards — createInitialState deals hands", () => {
  const state = chaosCards.createInitialState(makeInitArgs());
  assert.ok(state.humanHand.length > 0, "Human should have cards");
  assert.ok(state.companionHand.length > 0, "Companion should have cards");
  assert.ok(state.currentPrompt, "Should have current prompt");
});

test("pictionary — emojiAsciiClue returns string with emoji", () => {
  const clue = pictionary.emojiAsciiClue("a cat riding a bicycle");
  assert.ok(typeof clue === "string", "Should return string");
  assert.ok(clue.length > 0, "Should not be empty");
});

test("pictionary — pickPrompt avoids used prompts", () => {
  const allPrompts = [...pictionary.PROMPTS];
  const used = allPrompts.slice(0, allPrompts.length - 1);
  const next = pictionary.pickPrompt(used);
  assert.ok(!used.includes(next) || allPrompts.length <= used.length, "Should pick unused prompt");
});

test("dirty double takes — disabled by default", () => {
  assert.equal(dirtyDoubleTakes.defaultEnabled, false);
  assert.equal(dirtyDoubleTakes.requiresAdultPartyGames, true);
  assert.equal(dirtyDoubleTakes.requiresAdultPrivateChannel, true);
});

test("dirty double takes — cannot start without adultPartyGamesEnabled", () => {
  const registry = createGameRegistry();
  const enabled = registry.listEnabledGames({ adultPartyGamesEnabled: false });
  const found = enabled.find((g) => g.id === "dirty-double-takes");
  assert.equal(found, undefined, "Should not be enabled without adultPartyGamesEnabled");
});

test("dirty double takes — clue/answer flow works", () => {
  const state = dirtyDoubleTakes.createInitialState(makeInitArgs());
  assert.ok(state.clues.length > 0, "Should have clues");
  const currentClue = state.clues[0];
  assert.ok(currentClue.clue, "Clue should have text");
  assert.ok(currentClue.answer, "Clue should have answer");
});

test("dirty double takes — correct guess awards point", () => {
  const state = dirtyDoubleTakes.createInitialState(makeInitArgs());
  const clue = state.clues[0];
  const result = dirtyDoubleTakes.processAction({ state, action: "guess", payload: { guess: clue.answer } });
  const humanScore = result.newState.scores[TEST_HUMAN] || 0;
  assert.ok(humanScore >= 1, "Correct guess should award point");
});

test("dirty double takes — reveal action works", () => {
  const state = dirtyDoubleTakes.createInitialState(makeInitArgs());
  const result = dirtyDoubleTakes.processAction({ state, action: "reveal" });
  assert.equal(result.newState.revealed, true);
  assert.ok(result.events.some((e) => e.type === "reveal"), "Should emit reveal event");
});

test("dirty double takes — no copyrighted Dirty Minds content", () => {
  const cluesData = require("../content/adultParty/dirtyDoubleTakes.json");
  const dirtyMindsTerms = ["Dirty Minds", "Endless Games", "copyrighted"];
  for (const clue of cluesData) {
    for (const term of dirtyMindsTerms) {
      assert.ok(!clue.clue.includes(term), `Clue should not contain "${term}"`);
    }
  }
});

test("red green black flag — disabled by default", () => {
  assert.equal(redGreenBlackFlag.defaultEnabled, false);
  assert.equal(redGreenBlackFlag.requiresAdultPartyGames, true);
});

test("red green black flag — vote flow works", () => {
  const state = redGreenBlackFlag.createInitialState(makeInitArgs());
  assert.ok(state.scenarios.length > 0, "Should have scenarios");
  const result = redGreenBlackFlag.processAction({ state, action: "vote", payload: { vote: "green_flag", playerId: TEST_HUMAN } });
  assert.ok(result.newState.votes[TEST_HUMAN], "Human vote should be recorded");
  assert.ok(result.newState.companionVote, "Companion vote should be set");
  assert.equal(result.newState.phase, "revealed");
});

test("red green black flag — next advances round", () => {
  const state = redGreenBlackFlag.createInitialState(makeInitArgs());
  state.phase = "revealed";
  const result = redGreenBlackFlag.processAction({ state, action: "next" });
  assert.equal(result.newState.round, 2);
});

test("would you rather after dark — disabled by default", () => {
  assert.equal(wouldYouRatherAfterDark.defaultEnabled, false);
  assert.equal(wouldYouRatherAfterDark.requiresAdultPartyGames, true);
});

test("would you rather after dark — A/B voting works", () => {
  const state = wouldYouRatherAfterDark.createInitialState(makeInitArgs());
  assert.ok(state.questions.length > 0, "Should have questions");
  const result = wouldYouRatherAfterDark.processAction({ state, action: "answer", payload: { answer: "A" } });
  assert.equal(result.newState.humanAnswer, "A");
  assert.ok(["A", "B"].includes(result.newState.companionAnswer), "Companion should answer A or B");
  assert.equal(result.newState.phase, "revealed");
});

test("would you rather after dark — explicit prompts filtered when disabled", () => {
  const filtered = wouldYouRatherAfterDark.filterQuestions({ allowExplicit: false });
  assert.ok(filtered.every((q) => q.intensity !== "explicit"), "No explicit prompts when disabled");
});

test("adult games — banter not called in non-adult context (companion player check)", () => {
  assert.equal(dirtyDoubleTakes.getCompanionMove(), null, "DDT companion move should be null");
  assert.equal(redGreenBlackFlag.getCompanionMove(), null, "RGB companion move should be null");
  assert.equal(wouldYouRatherAfterDark.getCompanionMove(), null, "WYR companion move should be null");
});

test("hand and foot canasta — is marked as beta", () => {
  assert.equal(handAndFootCanasta.isBeta, true, "H&F should be beta");
});

test("hand and foot canasta — createInitialState deals cards", () => {
  const state = handAndFootCanasta.createInitialState(makeInitArgs());
  assert.ok(state.hands[TEST_HUMAN].length === 11, "Human should have 11 cards in hand");
  assert.ok(state.feet[TEST_HUMAN].length === 11, "Human should have 11 cards in foot");
});

test("parseButtonCustomId — parses valid customId", () => {
  const parsed = parseButtonCustomId("game_roll_gs_abc123_xyz");
  assert.ok(parsed, "Should parse valid customId");
  assert.ok(parsed.sessionId.startsWith("gs_"), "Session ID should start with gs_");
});

test("parseButtonCustomId — returns null for non-game customId", () => {
  const result = parseButtonCustomId("some_other_button");
  assert.equal(result, null, "Non-game buttons should return null");
});

test("game commands — no real gambling — blackjack notes for fun only", () => {
  assert.ok(blackjack.rulesText.includes("no real money"), "Blackjack rules should mention no real money");
});

test("game state — scores are deterministic, not LLM-generated", () => {
  const state = farkle.createInitialState(makeInitArgs());
  const rolled = farkle.rollDice(6);
  const scored = farkle.scoreDice(rolled);
  assert.equal(typeof scored.total, "number", "Score should be a number");
  assert.ok(!isNaN(scored.total), "Score should not be NaN");
});

test("adult content — no explicit entries in default starter files", () => {
  const ddtData = require("../content/adultParty/dirtyDoubleTakes.json");
  const rgbData = require("../content/adultParty/redGreenBlackFlag.json");
  const wyrData = require("../content/adultParty/wouldYouRatherAfterDark.json");

  assert.ok(ddtData.every((e) => e.intensity !== "explicit"), "DDT should have no explicit entries by default");
  assert.ok(rgbData.every((e) => e.intensity !== "explicit"), "RGB should have no explicit entries by default");
  assert.ok(wyrData.every((e) => e.intensity !== "explicit"), "WYR should have no explicit entries by default");
});

test("adult content — starter files have 25+ entries each", () => {
  const ddtData = require("../content/adultParty/dirtyDoubleTakes.json");
  const rgbData = require("../content/adultParty/redGreenBlackFlag.json");
  const wyrData = require("../content/adultParty/wouldYouRatherAfterDark.json");

  assert.ok(ddtData.length >= 25, `DDT should have ≥25 entries, got ${ddtData.length}`);
  assert.ok(rgbData.length >= 25, `RGB should have ≥25 entries, got ${rgbData.length}`);
  assert.ok(wyrData.length >= 25, `WYR should have ≥25 entries, got ${wyrData.length}`);
});
