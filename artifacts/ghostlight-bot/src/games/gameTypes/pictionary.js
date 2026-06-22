const PROMPTS = [
  "a castle made of cheese",
  "a cat riding a bicycle",
  "a dragon ordering coffee",
  "a volcano with a tiny umbrella",
  "a robot doing yoga",
  "a penguin in a business suit",
  "a haunted toaster",
  "a wizard stuck in traffic",
  "a shark at a library",
  "a cloud that is having a bad day",
  "a bear playing guitar at a concert",
  "a snail who runs very fast",
  "a ghost trying to use a smartphone",
  "a dinosaur at the grocery store",
  "a mermaid working at a desk job",
  "a giant rubber duck saving the world",
  "a very small dragon with big feelings",
  "a skeleton who is extremely cheerful",
  "a dog who is also a famous chef",
  "a moon who is embarrassed",
  "a pirate afraid of water",
  "a talking mailbox",
  "a lighthouse in the middle of a desert",
  "a teapot growing legs and running away",
  "a planet wearing a party hat",
];

function pickPrompt(used = []) {
  const available = PROMPTS.filter((p) => !used.includes(p));
  const pool = available.length ? available : PROMPTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function emojiAsciiClue(prompt) {
  const lower = prompt.toLowerCase();
  const clues = [];

  if (lower.includes("cat")) clues.push("🐱");
  if (lower.includes("dog")) clues.push("🐶");
  if (lower.includes("dragon")) clues.push("🐉");
  if (lower.includes("robot")) clues.push("🤖");
  if (lower.includes("wizard") || lower.includes("magic")) clues.push("🧙");
  if (lower.includes("shark")) clues.push("🦈");
  if (lower.includes("castle")) clues.push("🏰");
  if (lower.includes("coffee")) clues.push("☕");
  if (lower.includes("ghost")) clues.push("👻");
  if (lower.includes("piano") || lower.includes("guitar") || lower.includes("music")) clues.push("🎸");
  if (lower.includes("fire") || lower.includes("volcano")) clues.push("🌋");
  if (lower.includes("moon")) clues.push("🌙");
  if (lower.includes("sun") || lower.includes("star")) clues.push("⭐");
  if (lower.includes("boat") || lower.includes("ship") || lower.includes("pirate")) clues.push("🚢");
  if (lower.includes("book") || lower.includes("library")) clues.push("📚");
  if (lower.includes("penguin")) clues.push("🐧");
  if (lower.includes("bear")) clues.push("🐻");
  if (lower.includes("mermaid")) clues.push("🧜");
  if (lower.includes("dinosaur")) clues.push("🦕");
  if (lower.includes("snail")) clues.push("🐌");
  if (lower.includes("duck")) clues.push("🦆");
  if (lower.includes("skeleton")) clues.push("💀");
  if (lower.includes("cloud")) clues.push("☁️");
  if (lower.includes("ocean") || lower.includes("water") || lower.includes("sea")) clues.push("🌊");
  if (lower.includes("planet")) clues.push("🪐");

  if (!clues.length) {
    clues.push("🖼️", "❓");
  }

  return clues.join(" ") + "\n*(Text-based clue mode — no image generation configured)*";
}

module.exports = {
  id: "pictionary",
  displayName: "Pictionary",
  description: "Draw a prompt — the companion guesses! Or describe your drawing in emoji/ASCII.",
  category: "creative",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: true,
  rulesText: [
    "**Pictionary Rules:**",
    "• A prompt is given. Draw it and upload your image, or describe it!",
    "• If image vision is enabled, the companion will try to guess from your image.",
    "• If not, the companion gives you an emoji/text clue and you guess.",
    "• Correct guesses = points!",
    "• Rounds are short and fun.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const maxRounds = Number(settings.maxRounds) || 5;
    const usedPrompts = [];
    const firstPrompt = pickPrompt(usedPrompts);
    usedPrompts.push(firstPrompt);

    return {
      currentPrompt: firstPrompt,
      usedPrompts,
      round: 1,
      maxRounds,
      scores: {
        [humanPlayerIds[0] || "user"]: 0,
        [companionId]: 0,
      },
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      imageUrl: null,
      guess: null,
      correct: false,
      phase: "drawing",
      mode: "text",
      winner: null,
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (action === "submit_drawing") {
      const { imageUrl } = payload;
      newState.imageUrl = imageUrl || null;
      newState.phase = "guessing";
      events.push({ type: "drawing_submitted", message: imageUrl ? "Drawing received! Asking the companion to guess..." : "Drawing described! Companion is thinking..." });
      return { newState, events };
    }

    if (action === "guess") {
      const { guess } = payload;
      const g = String(guess || "").trim().toLowerCase();
      const answer = (newState.currentPrompt || "").toLowerCase();
      const isCorrect = answer.split(" ").some((word) => g.includes(word) && word.length > 3) || g === answer;

      newState.guess = g;
      newState.correct = isCorrect;
      if (isCorrect) {
        const playerId = payload.playerId || newState.humanPlayerIds[0] || "user";
        newState.scores[playerId] = (newState.scores[playerId] || 0) + 1;
      }
      newState.phase = "revealed";
      events.push({
        type: "guess_result",
        message: isCorrect
          ? `✅ Correct! The prompt was: **${newState.currentPrompt}**`
          : `❌ Not quite. The prompt was: **${newState.currentPrompt}**`,
        correct: isCorrect,
      });
      return { newState, events };
    }

    if (action === "next") {
      if (newState.round >= newState.maxRounds) {
        const scores = newState.scores;
        const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
        newState.winner = winner;
        newState.phase = "game_over";
        events.push({ type: "game_over", message: "🏆 Pictionary over!" });
      } else {
        newState.round++;
        const nextPrompt = pickPrompt(newState.usedPrompts);
        newState.usedPrompts.push(nextPrompt);
        newState.currentPrompt = nextPrompt;
        newState.imageUrl = null;
        newState.guess = null;
        newState.correct = false;
        newState.phase = "drawing";
        events.push({ type: "next_round", message: `Round ${newState.round}! New prompt ready.` });
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { currentPrompt, round, maxRounds, scores, phase, companionId, winner, guess, correct } = state;

    if (phase === "game_over") {
      return {
        title: "🎨 Pictionary — Game Over!",
        description: Object.entries(scores || {}).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s} pts**`).join("\n"),
        color: 0xffd700,
        footer: winner === companionId ? `${companionName} wins!` : `${humanName} wins!`,
      };
    }

    const clue = phase === "guessing" && !state.imageUrl ? emojiAsciiClue(currentPrompt) : "";
    const scoreLines = Object.entries(scores || {}).map(([id, s]) => `${id === companionId ? companionName : humanName}: **${s}**`).join(" | ");

    return {
      title: `🎨 Pictionary — Round ${round}/${maxRounds}`,
      description: [
        phase === "drawing" ? `Draw or describe: **${currentPrompt}**` : "",
        phase === "guessing" ? (clue || "Companion is guessing from your image...") : "",
        phase === "revealed" ? `The prompt was: **${currentPrompt}**\nGuess: "${guess}" — ${correct ? "✅ Correct!" : "❌ Not quite"}` : "",
        `\n${scoreLines}`,
      ].filter(Boolean).join("\n"),
      color: 0xe74c3c,
      footer: phase === "drawing" ? `Upload a drawing or type a description!` : undefined,
    };
  },

  buildButtons({ state }) {
    const { phase, winner } = state;
    if (winner) return [];
    if (phase === "revealed") return [{ customId: "next", label: "➡️ Next Round", style: "PRIMARY" }];
    if (phase === "drawing") return [{ customId: "skip", label: "⏭️ Skip Prompt", style: "DANGER" }];
    return [];
  },

  getCompanionMove() { return null; },

  emojiAsciiClue,
  pickPrompt,
  PROMPTS,
};
