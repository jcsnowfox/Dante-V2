const templates = require("../content/madlibs/templates.json");

const SUPPORTED_CATEGORIES = ["adventure", "romance_safe", "fantasy", "sitcom", "horror_lite", "chaotic", "custom"];

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickTemplate(category) {
  const pool = category && category !== "all"
    ? templates.filter((t) => t.category === category)
    : templates;
  const available = pool.length ? pool : templates;
  return available[Math.floor(Math.random() * available.length)];
}

function fillTemplate(template, words) {
  let story = template.template;
  for (const [key, value] of Object.entries(words)) {
    story = story.replace(new RegExp(`\\{${key}\\}`, "g"), `**${value}**`);
  }
  return story;
}

module.exports = {
  id: "madlibs",
  displayName: "Mad Libs",
  description: "Fill in the blanks to create an absurd story together!",
  category: "word",
  defaultEnabled: true,
  requiresAdultPartyGames: false,
  requiresAdultPrivateChannel: false,
  minPlayers: 1,
  maxPlayers: 2,
  supportsCompanionPlayer: true,
  supportsButtons: false,
  rulesText: [
    "**Mad Libs Rules:**",
    "• The companion picks a story template.",
    "• You fill in the blanks one at a time: nouns, verbs, adjectives, places, names, etc.",
    "• The companion can contribute some words too.",
    "• When all blanks are filled, the story is revealed!",
    "• Results are always gloriously absurd.",
  ].join("\n"),

  createInitialState({ humanPlayerIds, companionId, settings = {} }) {
    const category = settings.category || "all";
    const template = pickTemplate(category);

    return {
      templateId: template.id,
      templateTitle: template.title,
      category: template.category,
      prompts: template.prompts,
      template: template.template,
      filledWords: {},
      currentPromptIndex: 0,
      humanPlayerIds: [...humanPlayerIds],
      companionId,
      companionTurns: settings.companionTurns !== false,
      completed: false,
      story: null,
      phase: "collecting",
    };
  },

  processAction({ state, action, payload = {} }) {
    const newState = JSON.parse(JSON.stringify(state));
    const events = [];

    if (action === "word") {
      const { word } = payload;
      const prompt = newState.prompts[newState.currentPromptIndex];
      if (!prompt) return { newState, events };

      const cleanWord = String(word || "").trim().replace(/\n/g, " ").slice(0, 50);
      if (!cleanWord) {
        events.push({ type: "error", message: "Please provide a word!" });
        return { newState, events };
      }

      newState.filledWords[prompt.key] = cleanWord;
      events.push({ type: "word_collected", message: `Got it! **${prompt.label}**: "${cleanWord}"` });
      newState.currentPromptIndex++;

      if (newState.currentPromptIndex >= newState.prompts.length) {
        newState.story = fillTemplate({ template: newState.template }, newState.filledWords);
        newState.completed = true;
        newState.phase = "complete";
        events.push({ type: "complete", message: "All blanks filled! Here's your story:", story: newState.story });
      } else {
        const nextPrompt = newState.prompts[newState.currentPromptIndex];
        events.push({ type: "next_prompt", message: `Next: give me a **${nextPrompt.label}**` });
      }
      return { newState, events };
    }

    return { newState, events };
  },

  buildEmbedData({ state, companionName = "Companion", humanName = "You" }) {
    const { prompts, currentPromptIndex, completed, story, templateTitle, filledWords } = state;

    if (completed) {
      return {
        title: `📖 Mad Libs: ${templateTitle}`,
        description: story || "Story complete!",
        color: 0xe67e22,
        footer: "The end. Probably.",
      };
    }

    const currentPrompt = prompts[currentPromptIndex];
    const progress = `${currentPromptIndex}/${prompts.length} words collected`;
    const filled = Object.entries(filledWords).map(([k, v]) => {
      const p = prompts.find((pr) => pr.key === k);
      return `• ${p?.label || k}: **${v}**`;
    }).join("\n");

    return {
      title: `📖 Mad Libs: ${templateTitle}`,
      description: currentPrompt
        ? [`Give me a **${currentPrompt.label}**!`, "", filled ? `So far:\n${filled}` : ""].filter(Boolean).join("\n")
        : "Done!",
      color: 0xe67e22,
      footer: progress,
    };
  },

  buildButtons() { return []; },
  getCompanionMove() { return null; },

  SUPPORTED_CATEGORIES,
  fillTemplate,
  pickTemplate,
};
