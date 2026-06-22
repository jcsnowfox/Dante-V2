const { getLlmClient, resolveChatModel } = require("../../llm/client");

const BANTER_CONTEXTS = {
  farkle_farkle: "The AI companion just Farkled (lost all round points). React playfully in character.",
  farkle_bank: "The AI companion banked points wisely. Remark on the decision with confidence.",
  farkle_roll_again: "The AI companion chose to roll again despite decent points — show some risk-taking personality.",
  farkle_win: "The AI companion won a game of Farkle! Celebrate in character, playfully.",
  farkle_lose: "The AI companion lost Farkle to the human. React with good-natured defeat.",
  blackjack_bust: "The human busted in Blackjack (over 21). React with sympathy or teasing, in character.",
  blackjack_win: "The human won a hand of Blackjack. Cheer them on in character.",
  blackjack_blackjack: "The human got Blackjack! React with genuine excitement in character.",
  yahtzee_yahtzee: "The human rolled Yahtzee (five of a kind)! React with enthusiasm in character.",
  yahtzee_turn: "The AI companion just took a Yahtzee turn. Comment briefly on the dice or score in character.",
  trivia_correct: "The human got a trivia question right. Congratulate them in character.",
  trivia_wrong: "The human got a trivia question wrong. React with gentle teasing or sympathy in character.",
  trivia_companion_correct: "The AI companion got a trivia question right. React with confidence or light smugness in character.",
  trivia_companion_wrong: "The AI companion got a trivia question wrong. React with self-deprecating humor in character.",
  madlibs_complete: "The Mad Libs story is complete and it's gloriously absurd. React to the finished story in character.",
  madlibs_word: "The human gave an unexpected or funny word in Mad Libs. React briefly in character.",
  pictionary_correct_guess: "A Pictionary drawing was guessed correctly. React with excitement in character.",
  pictionary_wrong_guess: "A Pictionary guess was wrong. React with humor or mild exasperation in character.",
  chaos_cards_judgment: "Just judged a round of Chaos Cards. Comment on the winning answer in character.",
  chaos_cards_own_win: "The AI companion won a Chaos Cards round. Respond with mock pride in character.",
  ddt_correct: "The human guessed the Dirty Double Takes answer correctly. React with delight in character.",
  ddt_wrong: "The human guessed wrong in Dirty Double Takes. React with playful teasing in character.",
  ddt_reveal: "The Dirty Double Takes answer was revealed. React to the innocent answer with amusement in character.",
  rgb_vote_match: "The human and companion voted the same way in Red/Green/Black Flag. React to the shared opinion in character.",
  rgb_vote_differ: "The human and companion voted differently in Red/Green/Black Flag. Explain the companion's take briefly in character.",
  wyr_match: "The human and companion chose the same Would You Rather option. React with solidarity in character.",
  wyr_differ: "The human and companion chose different Would You Rather options. Comment on the companion's choice in character.",
  game_invite: "The AI companion wants to invite the human to play a game. Write a brief, playful in-character invitation.",
  game_start: "A game is starting. The AI companion greets the human and sets the mood in character.",
  game_over_win_human: "The human won the game. Congratulate them in character.",
  game_over_win_companion: "The AI companion won the game. Celebrate modestly but genuinely in character.",
  game_over_tie: "The game ended in a tie. React to the draw in character.",
};

async function generateBanter({ context, gameState, companionContext = "", config, logger }) {
  if (!context) return "";

  const client = getLlmClient(config, "chat");
  if (!client) return "";

  const model = resolveChatModel(config);
  if (!model) return "";

  const contextDescription = BANTER_CONTEXTS[context] || String(context);
  const gameInfo = gameState
    ? `\nCurrent game: ${gameState.gameType || "unknown"}, phase: ${gameState.gameState?.phase || "?"}` : "";
  const companionInfo = companionContext ? `\nCompanion context: ${companionContext}` : "";

  const systemPrompt = [
    "You are an AI companion playing games with a human in Discord.",
    "Respond with a single short, natural, in-character reaction (1-3 sentences max).",
    "Stay true to your configured personality and voice — do not become generic or robotic.",
    "No emojis unless they fit naturally. No hashtags. No lists.",
    "Do not invent game scores, dice results, or card values — comment on what's already happened.",
    "Keep it playful, genuine, and human-feeling.",
    companionInfo,
  ].filter(Boolean).join("\n");

  const userPrompt = [
    contextDescription,
    gameInfo,
  ].filter(Boolean).join("\n");

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.85,
    });

    return response?.choices?.[0]?.message?.content?.trim() || "";
  } catch (error) {
    logger?.debug?.("[games] Banter generation skipped", { error: error?.message });
    return "";
  }
}

async function generateGameInvite({ gameType, gameDisplayName, companionContext = "", config, logger }) {
  const client = getLlmClient(config, "chat");
  if (!client) return `Want to play **${gameDisplayName}**?`;

  const model = resolveChatModel(config);
  if (!model) return `Want to play **${gameDisplayName}**?`;

  const systemPrompt = [
    "You are an AI companion inviting a human to play a game in Discord.",
    "Write a single short, playful, in-character invitation (1-2 sentences max).",
    "Name the game naturally. Keep your configured voice and personality.",
    "Be charming, not spammy. No hashtags. No lists.",
    companionContext ? `Companion context: ${companionContext}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Game to invite them to: ${gameDisplayName} (${gameType})` },
      ],
      max_tokens: 80,
      temperature: 0.9,
    });

    return response?.choices?.[0]?.message?.content?.trim() || `Want to play **${gameDisplayName}**?`;
  } catch {
    return `Want to play **${gameDisplayName}**?`;
  }
}

module.exports = {
  generateBanter,
  generateGameInvite,
  BANTER_CONTEXTS,
};
