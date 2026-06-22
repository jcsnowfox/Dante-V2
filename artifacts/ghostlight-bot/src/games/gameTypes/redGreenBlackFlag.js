const scenarios = require("../content/adultParty/redGreenBlackFlag.json");

const VOTE_OPTIONS = ["green_flag", "red_flag", "black_flag"];
const VOTE_LABELS = {
  green_flag: "🟢 Green Flag",
  red_flag: "🔴 Red Flag",
  black_flag: "⚫ Black Flag",
};
const VOTE_DESCRIPTIONS = {
  green_flag: "Total green flag — love it!",
  red_flag: "Absolute red flag — stay away.",
  black_flag: "It's complicated... could go either way.",
};

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function filterScenarios({ categories = [], allowExplicit = false } = {}) {
  return scenarios.filter((s) => {
    if (!allowExplicit && s.intensity === "explicit") return false;
    if (categories.length && !categories.includes(s.category)) return false;
    return true;
  });
}

module.exports = {
  id: "red-green-black-flag",
  displayName: "Red Flag, Green Flag, Black Flag",
  description: "Vote on dating and life scenarios — Green, Red, or Black flag?",
  category: "adult_party",
  defaultEnabled: false,
  requiresAdultPartyGames: true,
  requiresAdultPrivateChannel: true,
  minPlayers: 1,
  maxPlayers: 4,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Red Flag, Green Flag, Black Flag Rules:**",
    "• A scenario appears about dating, relationships, or chaotic adult life.",
    "• Vote: 🟢 Green Flag (positive), 🔴 Red Flag (warning), or ⚫ Black Flag (complicated).",
    "• The companion votes and explains its reasoning in its own voice.",
    "• Optional points for matching the companion or majority vote.",
    "• No targeting real people. Consent-safe scenarios only.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const maxRounds = Number(settings.maxRounds) || 10;
    const categories = settings.categories || [];
    const allowExplicit = settings.allowExplicit === true;
    const pool = shuffleArray(filterScenarios({ categories, allowExplicit }));

    return {
      scenarios: pool,
      currentIndex: 0,
      maxRounds: Math.min(maxRounds, pool.length),
      votes: {},
      companionVote: null,
      scores: Object.fromEntries([...humanPlayerIds, companionId].map((id) => [id, 0])),
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      round: 1,
      phase: "voting",
      revealed: false,
      winner: null,
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];
    const currentScenario = newState.scenarios[newState.currentIndex];
    if (!currentScenario) return { newState, events };

    if (action === "vote") {
      const { vote, playerId } = payload;
      if (!VOTE_OPTIONS.includes(vote)) {
        events.push({ type: "error", message: "Invalid vote option." });
        return { newState, events };
      }

      const voterId = playerId || (newState.humanPlayerIds[0] || "user");
      newState.votes[voterId] = vote;

      const companionVote = currentScenario.defaultCompanionVote || "black_flag";
      newState.companionVote = companionVote;

      if (vote === companionVote) {
        newState.scores[voterId] = (newState.scores[voterId] || 0) + 1;
      }

      newState.phase = "revealed";
      newState.revealed = true;

      events.push({
        type: "vote_reveal",
        message: [
          `You voted: **${VOTE_LABELS[vote]}**`,
          `Companion voted: **${VOTE_LABELS[companionVote]}**`,
          vote === companionVote ? "✅ You matched!" : "You had different takes.",
        ].join("\n"),
        humanVote: vote,
        companionVote,
        matched: vote === companionVote,
      });
      return { newState, events };
    }

    if (action === "next") {
      newState.currentIndex++;
      newState.round++;
      newState.votes = {};
      newState.companionVote = null;
      newState.revealed = false;

      if (newState.round > newState.maxRounds || newState.currentIndex >= newState.scenarios.length) {
        newState.phase = "game_over";
        const topPlayer = Object.entries(newState.scores).sort((a, b) => b[1] - a[1])[0];
        newState.winner = topPlayer?.[0] || null;
        events.push({ type: "game_over", message: "🏆 Game over!" });
      } else {
        newState.phase = "voting";
        events.push({ type: "next", message: `Round ${newState.round}/${newState.maxRounds}` });
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { scenarios, currentIndex, round, maxRounds, scores, phase, companionVote, votes, humanPlayerIds, companionId, winner } = state;
    const scenario = scenarios[currentIndex];
    const humanId = humanPlayerIds[0] || "user";
    const humanVote = votes[humanId];

    if (phase === "game_over") {
      return {
        title: "🚩 Red/Green/Black Flag — Game Over!",
        description: Object.entries(scores).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s} pts**`).join("\n"),
        color: 0xffd700,
        footer: winner === companionId ? `${companionName} called it best!` : `${humanName} thinks like ${companionName}!`,
      };
    }

    const scoreLines = Object.entries(scores).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s}**`).join(" | ");

    return {
      title: `🚩 Red/Green/Black Flag — Round ${round}/${maxRounds}`,
      description: [
        scenario ? `**"${scenario.scenario}"**` : "No scenario.",
        "",
        phase === "revealed" ? [
          `Your vote: **${humanVote ? VOTE_LABELS[humanVote] : "?"}**`,
          `${companionName}: **${companionVote ? VOTE_LABELS[companionVote] : "?"}**`,
        ].join("\n") : "*Vote to see the companion's take.*",
        "",
        scoreLines,
      ].filter(Boolean).join("\n"),
      color: 0x2c3e50,
      footer: `Category: ${scenario?.category || "?"} | +1 pt for matching ${companionName}`,
    };
  },

  buildButtons({ state }) {
    const { phase, winner } = state;
    if (winner || phase === "game_over") return [];

    if (phase === "voting") {
      return [
        { customId: "vote_green_flag", label: "🟢 Green Flag", style: "SUCCESS" },
        { customId: "vote_red_flag", label: "🔴 Red Flag", style: "DANGER" },
        { customId: "vote_black_flag", label: "⚫ Black Flag", style: "SECONDARY" },
      ];
    }

    if (phase === "revealed") {
      return [{ customId: "next", label: "➡️ Next Scenario", style: "PRIMARY" }];
    }

    return [];
  },

  getCompanionMove() { return null; },

  VOTE_OPTIONS,
  VOTE_LABELS,
  VOTE_DESCRIPTIONS,
  filterScenarios,
};
