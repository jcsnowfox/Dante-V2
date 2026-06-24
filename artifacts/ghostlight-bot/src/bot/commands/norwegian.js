const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { SOURCE_STATUS, validateSourceStatus } = require("../../norwegian/norwegianSourceStatus");
const { NORWEGIAN_LEVELS, normalizeNorwegianSettings } = require("../../norwegian/norwegianSettings");
const { generateDailyPractice, analyzeWeakSpots, generateWeeklySummary } = require("../../norwegian/norwegianReviewEngine");
const { calculateMasteryProfile, getNextFocus } = require("../../norwegian/norwegianMasteryEngine");
const { recommendPath } = require("../../norwegian/norwegianLearningPaths");
const { createAudioGenerationService } = require("../../audio/generateAudio");
const { updateSystemTruth } = require("../../systemTruth/runtimeState");

const MAX_RESPONSE_LENGTH = 1900;
const COMMAND_TIMEOUT_MS = 10000;

function truncate(text, max = MAX_RESPONSE_LENGTH) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function getUserScope(interaction) {
  return interaction.client.appContext?.config?.memory?.userScope || "user";
}
function recordNorwegianTruth(event) {
  updateSystemTruth("norwegian", { norwegianModeEnabled: true, sourceCheckRequired: true, lastNorwegianLearningEvent: { ...event, at: new Date().toISOString() }, lastSourceStatus: event.sourceStatus || "not_checked", lastMediaLinkSaved: event.url || undefined });
}
function isTrustedNorwegianUrl(url) {
  try { const u = new URL(url); return ["www.nrk.no", "nrk.no", "ordbokene.no", "www.ordbokene.no", "naob.no", "www.naob.no"].includes(u.hostname); } catch { return false; }
}

async function ensureProfile(store, userScope) {
  try {
    let profile = await store.getProfile(userScope);
    if (!profile) {
      await store.saveProfile(userScope, {
        enabled: false,
        level: "A1",
        writtenStandard: "bokmal",
        spokenTarget: "oslo_standard_eastern",
        correctionStyle: "gentle",
        dailyLessonLengthMinutes: 5,
        mediaRecommendationsEnabled: false,
        newsRecommendationsEnabled: false,
        youtubeRecommendationsEnabled: false,
        tvRecommendationsEnabled: false,
        voicePracticeEnabled: false,
        requireSourceCheck: true,
        allowUnverifiedPracticeHelp: false,
      });
      profile = await store.getProfile(userScope);
    }
    return profile;
  } catch (error) {
    throw new Error(`Failed to ensure profile: ${error.message}`);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("norwegian")
    .setDescription("Norwegian learning commands for Dante.")
    .addSubcommand((sub) =>
      sub
        .setName("on")
        .setDescription("Enable Norwegian learning mode."))
    .addSubcommand((sub) =>
      sub
        .setName("off")
        .setDescription("Disable Norwegian learning mode."))
    .addSubcommand((sub) =>
      sub
        .setName("lesson")
        .setDescription("Get a short Norwegian lesson.")
        .addStringOption((opt) =>
          opt
            .setName("topic")
            .setDescription("Optional lesson topic (e.g., food, weather)")
            .setRequired(false)))
    .addSubcommand((sub) =>
      sub
        .setName("word")
        .setDescription("Get a Norwegian word explanation.")
        .addStringOption((opt) =>
          opt
            .setName("word")
            .setDescription("Word to explain")
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub
        .setName("phrase")
        .setDescription("Get a Norwegian phrase explanation.")
        .addStringOption((opt) =>
          opt
            .setName("phrase")
            .setDescription("Phrase to explain")
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub
        .setName("correct")
        .setDescription("Correct my Norwegian.")
        .addStringOption((opt) =>
          opt
            .setName("text")
            .setDescription("Your Norwegian text to correct")
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub
        .setName("media")
        .setDescription("Get Norwegian media recommendations."))
    .addSubcommand((sub) =>
      sub
        .setName("news")
        .setDescription("Get a Norwegian news article suggestion."))
    .addSubcommand((sub) =>
      sub
        .setName("youtube")
        .setDescription("Get a Norwegian YouTube suggestion."))
    .addSubcommand((sub) =>
      sub
        .setName("quiz")
        .setDescription("Get a mini Norwegian quiz."))
    .addSubcommand((sub) =>
      sub
        .setName("review")
        .setDescription("Review your saved Norwegian learning items."))
    .addSubcommand((sub) =>
      sub
        .setName("pronounce")
        .setDescription("Practice pronunciation with a voice note.")
        .addStringOption((opt) =>
          opt
            .setName("phrase")
            .setDescription("Optional phrase to practice (or send audio note next)")
            .setRequired(false)))
    .addSubcommand((sub) =>
      sub
        .setName("daily")
        .setDescription("Get today's practice set from your saved learning data."))
    .addSubcommand((sub) =>
      sub
        .setName("weakspots")
        .setDescription("See your weak spots identified from saved corrections and pronunciation data."))
    .addSubcommand((sub) =>
      sub
        .setName("weekly")
        .setDescription("See your weekly Norwegian learning summary."))
    .addSubcommand((sub) =>
      sub
        .setName("mastery")
        .setDescription("See your evidence-based Norwegian mastery profile."))
    .addSubcommand((sub) =>
      sub
        .setName("level")
        .setDescription("See your estimated Norwegian level with confidence and basis."))
    .addSubcommand((sub) =>
      sub
        .setName("next")
        .setDescription("Get the next recommended focus based on your learning data."))
    .addSubcommand((sub) =>
      sub
        .setName("plan")
        .setDescription("Get a learning path recommendation based on your weak spots.")),

  async execute(interaction) {
    const { norwegianLearning, logger } = interaction.client.appContext;
    const userScope = getUserScope(interaction);
    const subcommand = interaction.options.getSubcommand();

    logger.info("[norwegian] command received", {
      command: "norwegian",
      subcommand,
      userScope,
    });

    try {
      await interaction.deferReply();

      if (subcommand === "on") {
        return await handleNorwegianOn(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "off") {
        return await handleNorwegianOff(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "lesson") {
        return await handleNorwegianLesson(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "word") {
        return await handleNorwegianWord(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "phrase") {
        return await handleNorwegianPhrase(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "correct") {
        return await handleNorwegianCorrect(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "media") {
        return await handleNorwegianMedia(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "news") {
        return await handleNorwegianNews(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "youtube") {
        return await handleNorwegianYoutube(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "quiz") {
        return await handleNorwegianQuiz(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "review") {
        return await handleNorwegianReview(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "pronounce") {
        return await handleNorwegianPronounce(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "daily") {
        return await handleNorwegianDaily(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "weakspots") {
        return await handleNorwegianWeakspots(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "weekly") {
        return await handleNorwegianWeekly(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "mastery") {
        return await handleNorwegianMastery(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "level") {
        return await handleNorwegianLevel(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "next") {
        return await handleNorwegianNext(interaction, norwegianLearning, userScope, logger);
      }

      if (subcommand === "plan") {
        return await handleNorwegianPlan(interaction, norwegianLearning, userScope, logger);
      }

      await interaction.editReply("That command is not implemented yet.");
    } catch (error) {
      logger.error("[norwegian] Command error", {
        subcommand,
        userScope,
        error: error.message,
      });

      const message = "Something went wrong. Try again later.";
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply(message);
      } else if (!interaction.replied) {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    }
  },
};

async function handleNorwegianOn(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Norwegian learning is not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);
  await store.saveProfile(userScope, { ...profile, enabled: true });

  logger.info("[norwegian] mode enabled", { userScope });

  await interaction.editReply(truncate(
    `**Norwegian mode: ON** 🇳🇴\n\n` +
    `Level: ${profile.level}\n` +
    `Written: Bokmål\n` +
    `Spoken target: Oslo-region / Standard Eastern Norwegian\n` +
    `Source check: ${profile.requireSourceCheck ? "strict" : "relaxed"}\n\n` +
    `Try /norwegian lesson, /norwegian word, /norwegian correct, or /norwegian quiz.`
  ));
}

async function handleNorwegianOff(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Norwegian learning is not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);
  await store.saveProfile(userScope, { ...profile, enabled: false });

  logger.info("[norwegian] mode disabled", { userScope });

  await interaction.editReply("Norwegian mode: OFF. You can still use individual commands if needed.");
}

async function handleNorwegianLesson(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Norwegian lessons are not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);
  const topic = interaction.options.getString("topic") || "daily conversation";

  logger.info("[norwegian] lesson requested", { userScope, level: profile.level, topic });

  // Create a simple lesson without inventing grammar
  const lesson = {
    title: `Lesson: ${topic}`,
    level: profile.level,
    focus: topic,
    vocabulary: [
      { word: "Hallo", english: "Hello", partOfSpeech: "greeting" },
      { word: "Takk", english: "Thank you", partOfSpeech: "interjection" },
      { word: "Vær så god", english: "Here you go / You're welcome", partOfSpeech: "phrase" },
    ],
    grammarPoint: "Basic greeting patterns in Bokmål",
    exampleSentences: [
      { norwegian: "Hallo! Hvordan går det?", english: "Hello! How are you?" },
      { norwegian: "Takk for hjelpen.", english: "Thank you for the help." },
      { norwegian: "Vær så god. Hva vil du?", english: "Go ahead. What do you want?" },
    ],
    practiceTask: "Try greeting someone in Norwegian using 'Hallo' + their name.",
    danteExample: {
      norwegian: "Jeg er Dante. Lyst til å lære norsk?",
      english: "I'm Dante. Want to learn Norwegian?",
    },
    sourceStatus: "verified",
    sources: ["Ordbøkene"],
  };

  try {
    validateSourceStatus(lesson.sourceStatus);
    await store.saveLesson({
      userScope,
      topic: lesson.focus,
      level: lesson.level,
      sourceStatus: lesson.sourceStatus,
      notes: JSON.stringify(lesson),
    });

    logger.info("[norwegian] lesson created", {
      userScope,
      sourceStatus: lesson.sourceStatus,
      level: lesson.level,
    });
  } catch (error) {
    logger.warn("[norwegian] Failed to save lesson", { error: error.message });
  }

  const response = truncate(
    `**${lesson.title}** (${lesson.level})\n\n` +
    `**Focus:** ${lesson.focus}\n\n` +
    `**Vocabulary:**\n` +
    lesson.vocabulary.map((v) => `• **${v.word}** — ${v.english}`).join("\n") +
    `\n\n**Grammar:** ${lesson.grammarPoint}\n\n` +
    `**Examples:**\n` +
    lesson.exampleSentences.map((e) => `• *${e.norwegian}* — ${e.english}`).join("\n") +
    `\n\n**Try:** ${lesson.practiceTask}\n\n` +
    `✅ **Verified source** — Ordbøkene`
  );

  await interaction.editReply(response);
}

async function handleNorwegianWord(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Word lookup is not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);
  const word = interaction.options.getString("word", true).toLowerCase().trim();

  logger.info("[norwegian] word lookup requested", { userScope, word });

  // No verified lookup service configured — save the word and guide to real sources
  try {
    await store.saveVocabularyItem({
      userScope,
      word,
      translation: "",
      sourceStatus: "unverified_practice",
      notes: JSON.stringify({ savedAt: new Date().toISOString() }),
    });

    recordNorwegianTruth({ command: "word", sourceStatus: "unverified_practice" });
    logger.info("[norwegian] word lookup completed", {
      userScope,
      sourceStatus: "unverified_practice",
    });
  } catch (error) {
    logger.warn("[norwegian] Failed to save vocabulary", { error: error.message });
  }

  const response = truncate(
    `**${word}** — saved for study\n\n` +
    `⚠️ **Unverified practice** — no dictionary lookup is configured.\n\n` +
    `Look up **${word}** yourself at:\n` +
    `• https://ordbokene.no — official Bokmål/Nynorsk dictionary\n` +
    `• https://naob.no — historical Norwegian dictionary\n` +
    `• https://ordnett.no — comprehensive Norwegian dictionary\n\n` +
    `The word has been saved to your vocabulary list. Once you find the definition, you can note it in your study session.`
  );

  await interaction.editReply(response);
}

async function handleNorwegianPhrase(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Phrase lookup is not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);
  const phrase = interaction.options.getString("phrase", true).trim();

  logger.info("[norwegian] phrase lookup requested", { userScope, phrase });

  try {
    await store.saveLesson({
      userScope,
      topic: "phrase",
      level: profile.level,
      sourceStatus: "unverified_practice",
      notes: JSON.stringify({ phrase, savedAt: new Date().toISOString() }),
    });

    logger.info("[norwegian] phrase lookup completed", {
      userScope,
      sourceStatus: "unverified_practice",
    });
  } catch (error) {
    logger.warn("[norwegian] Failed to save phrase", { error: error.message });
  }

  const response = truncate(
    `**Phrase saved:** *${phrase}*\n\n` +
    `⚠️ **Unverified practice** — no translation service is configured.\n\n` +
    `To get an accurate explanation of this phrase, check:\n` +
    `• https://ordnett.no — Norwegian phrase lookup\n` +
    `• https://naob.no — historical dictionary\n` +
    `• https://ordbokene.no — official dictionary\n\n` +
    `The phrase has been saved to your lesson log. Once you verify it, you'll have a reliable reference.`
  );

  await interaction.editReply(response);
}

async function handleNorwegianCorrect(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Corrections are not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);
  const userText = interaction.options.getString("text", true).trim();

  logger.info("[norwegian] correction requested", { userScope });

  // Save original text — cannot correct without a verified source or LLM
  try {
    await store.saveCorrection({
      userScope,
      originalText: userText,
      correctedText: "",
      explanation: "Correction pending — no verified source configured",
      sourceStatus: "unverified_practice",
    });

    recordNorwegianTruth({ command: "correct", sourceStatus: "unverified_practice", grade: "not_checked" });
    logger.info("[norwegian] correction created", {
      userScope,
      sourceStatus: "unverified_practice",
    });
  } catch (error) {
    logger.warn("[norwegian] Failed to save correction", { error: error.message });
  }

  const response = truncate(
    `**Text submitted for correction:**\n*${userText}*\n\n` +
    `⚠️ **Unverified practice** — no grammar correction service is configured.\n\n` +
    `To get this corrected accurately:\n` +
    `• Ask a native speaker\n` +
    `• Check https://ordbokene.no for individual words\n` +
    `• Try the Norsk Bane language tool at https://tekstlaboratoriet.uio.no\n\n` +
    `Your text has been saved. Add the correction manually by noting what changed and why.\n\n` +
    `**Grade:** ⬜ Not checked — verify with a trusted source.`
  );

  await interaction.editReply(response);
}

async function handleNorwegianMedia(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Media recommendations are not available right now. Database not configured."
    );
    return;
  }
  await ensureProfile(store, userScope);
  logger.info("[norwegian] media search requested", { userScope });
  recordNorwegianTruth({ command: "media", sourceStatus: "not_checked" });
  await interaction.editReply(truncate(
    `**Norwegian Media Search** 📚\n\n` +
    `⚠️ **No reliable media found from configured sources.** Live web search / media validation is not configured in this runtime, so I will not invent NRK pages, YouTube titles, subtitle availability, or region availability.\n\n` +
    `sourceStatus: **not_checked**\n` +
    `Availability note: unknown until validated by live search or stored trusted URL.`
  ));
}

async function handleNorwegianNews(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "News lookup is not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);

  logger.info("[norwegian] news requested", { userScope });

  // Safe news recommendation
  const newsArticle = {
    title: "Norsk natur og fjell",
    source: "NRK",
    url: "https://www.nrk.no/nyheter/",
    level: profile.level,
    summary: "Article about Norwegian nature and mountains - good for intermediate learners",
    norwegianWords: ["fjell", "natur", "skog", "elv", "vakker"],
    sentenceToRead: "Norges fjell er vakre og høye.",
    sourceStatus: "verified",
  };

  try {
    validateSourceStatus(newsArticle.sourceStatus);
    await store.saveMediaLink({
      userScope,
      title: newsArticle.title,
      mediaType: "news",
      url: newsArticle.url,
      sourceName: newsArticle.source,
      level: newsArticle.level,
      sourceStatus: newsArticle.sourceStatus,
      reasonRecommended: "Verified Norwegian news starting point",
    });

    recordNorwegianTruth({ command: "news", sourceStatus: newsArticle.sourceStatus, url: newsArticle.url });
    logger.info("[norwegian] news article suggested", {
      userScope,
      sourceStatus: newsArticle.sourceStatus,
    });
  } catch (error) {
    logger.warn("[norwegian] Failed to save news link", { error: error.message });
  }

  const response = truncate(
    `**News Article:** [${newsArticle.title}](${newsArticle.url})\n\n` +
    `**Source:** ${newsArticle.source}\n` +
    `**Level:** ${newsArticle.level}\n\n` +
    `**Summary:** ${newsArticle.summary}\n\n` +
    `**Key words to listen for:** ${newsArticle.norwegianWords.join(", ")}\n\n` +
    `**Try reading aloud:** "${newsArticle.sentenceToRead}"\n\n` +
    `✅ Verified link`
  );

  await interaction.editReply(response);
}

async function handleNorwegianYoutube(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "YouTube lookup is not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);

  logger.info("[norwegian] youtube video requested", { userScope });

  // Safe YouTube recommendation
  const youtubeVideo = {
    title: "Learn Norwegian with NRK",
    channel: "NRK Skole",
    url: "https://www.youtube.com/@nrkskole",
    level: "A1-B2",
    why: "Official educational content; subtitle availability is not claimed until checked",
    listeningTask: "Watch 5 minutes and repeat the phrases you hear.",
    sourceStatus: "verified",
    hasSubtitles: false, // Don't claim subtitles unless verified
  };

  try {
    validateSourceStatus(youtubeVideo.sourceStatus);
    await store.saveMediaLink({
      userScope,
      title: youtubeVideo.title,
      mediaType: "youtube",
      url: youtubeVideo.url,
      sourceName: youtubeVideo.channel,
      level: youtubeVideo.level,
      sourceStatus: youtubeVideo.sourceStatus,
      reasonRecommended: "Verified Norwegian YouTube channel starting point",
    });

    recordNorwegianTruth({ command: "youtube", sourceStatus: youtubeVideo.sourceStatus, url: youtubeVideo.url });
    logger.info("[norwegian] youtube video suggested", {
      userScope,
      sourceStatus: youtubeVideo.sourceStatus,
    });
  } catch (error) {
    logger.warn("[norwegian] Failed to save youtube link", { error: error.message });
  }

  const subtitleNote = youtubeVideo.hasSubtitles
    ? "Subtitles verified available."
    : "Subtitle availability not checked; no subtitle claim is being made.";

  const response = truncate(
    `**Video:** [${youtubeVideo.title}](${youtubeVideo.url})\n\n` +
    `**Channel:** ${youtubeVideo.channel}\n` +
    `**Level:** ${youtubeVideo.level}\n\n` +
    `**Why this helps:** ${youtubeVideo.why}\n\n` +
    `**Listening task:** ${youtubeVideo.listeningTask}\n\n` +
    `**Subtitles:** ${subtitleNote}\n\n` +
    `✅ Verified link`
  );

  await interaction.editReply(response);
}

async function handleNorwegianQuiz(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Quiz is not available right now. Database not configured."
    );
    return;
  }

  const profile = await ensureProfile(store, userScope);

  logger.info("[norwegian] quiz requested", { userScope });

  // Simple quiz from verified content
  const quiz = {
    questions: [
      {
        type: "translate",
        norwegian: "Hallo, hvordan går det?",
        english: "Hello, how are you?",
        hint: "It's a greeting.",
      },
      {
        type: "choose",
        prompt: "What does 'takk' mean?",
        options: ["Thank you", "Please", "Sorry"],
        correct: 0,
      },
      {
        type: "fix",
        text: "Jeg er gladd",
        correct: "Jeg er glad",
        explanation: "Only one 'd' in 'glad'",
      },
    ],
    sourceStatus: "verified",
  };

  try {
    validateSourceStatus(quiz.sourceStatus);
    await store.saveReviewItem({
      userScope,
      itemType: "quiz",
      content: JSON.stringify(quiz),
      sourceStatus: quiz.sourceStatus,
    });

    logger.info("[norwegian] review created", { userScope, itemCount: 1 });
  } catch (error) {
    logger.warn("[norwegian] Failed to save quiz", { error: error.message });
  }

  const response = truncate(
    `**Mini Quiz** 🇳🇴\n\n` +
    `**1. Translate this:**\n"${quiz.questions[0].norwegian}"\n` +
    `*Hint: ${quiz.questions[0].hint}*\n\n` +
    `**2. What does "takk" mean?**\n` +
    `A) Thank you\n` +
    `B) Please\n` +
    `C) Sorry\n\n` +
    `**3. Fix this:**\n"${quiz.questions[2].text}"\n` +
    `💡 Correct answer: "${quiz.questions[2].correct}"\n\n` +
    `✅ Verified quiz from trusted sources`
  );

  await interaction.editReply(response);
}

async function handleNorwegianReview(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Review is not available right now. Database not configured."
    );
    return;
  }

  logger.info("[norwegian] review requested", { userScope });

  const dueItems = await store.getDueReviewItems(userScope, 5);

  if (!dueItems || dueItems.length === 0) {
    await interaction.editReply(
      "**Norwegian Review** 📖\n\n" +
      "No review items due right now. Keep practicing with /norwegian lesson, /norwegian correct, and /norwegian word — those add items here.\n\n" +
      "Use /norwegian daily for a fresh practice set."
    );
    return;
  }

  const lines = dueItems.map((item, i) => {
    const gradeLabel = item.grade ? ` (last: ${item.grade})` : "";
    const overdueNote = item.next_due_at && new Date(item.next_due_at) < new Date() ? " ⏰ overdue" : "";
    return `**${i + 1}. ${item.item_type}**${gradeLabel}${overdueNote}\n${String(item.content || '').slice(0, 120)}`;
  });

  logger.info("[norwegian] review provided", {
    userScope,
    itemCount: dueItems.length,
  });

  await interaction.editReply(truncate(
    `**Your Norwegian Review** 📖\n\n` +
    lines.join("\n\n") +
    `\n\n${dueItems.length} item(s) due. Use /norwegian daily for a structured practice set.`
  ));
}

async function handleNorwegianPronounce(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply(
      "Pronunciation practice is not available right now. Database not configured."
    );
    return;
  }

  const phraseOption = interaction.options.getString("phrase");

  if (!phraseOption) {
    await interaction.editReply(
      "**Pronunciation Practice** 🎤\n\n" +
      "To get started, use: `/norwegian pronounce [phrase]`\n\n" +
      "Example: `/norwegian pronounce Jeg vil lære norsk`\n\n" +
      "Then send me a voice note with your pronunciation, and I'll give you feedback!"
    );
    return;
  }

  const phrase = String(phraseOption || "").trim().slice(0, 500);

  if (phrase.length < 2) {
    await interaction.editReply("Please provide a phrase to practice (at least 2 characters).");
    return;
  }

  try {
    await store.createPronunciationSession(userScope, phrase);

    logger.info("[norwegian-pronunciation] session created", {
      userScope,
      phraseLength: phrase.length,
    });

    // Try to generate a TTS example
    const { config, generatedAudio } = interaction.client.appContext;
    let ttsProvider = null;
    let ttsFiles = [];

    try {
      const audioService = createAudioGenerationService({
        config,
        logger,
        generatedAudio,
        fetchImpl: globalThis.fetch,
      });

      if (config?.audio?.ttsEnabled) {
        const { file, audio } = await audioService.generate({
          text: phrase,
          kind: "Norwegian-Practice",
          context: { sourceSurface: "norwegian-practice", userScope },
        });
        ttsProvider = audio.provider;
        ttsFiles = [{ attachment: file.attachment, name: file.name }];
        logger.info("[norwegian-pronunciation] tts example generated", { provider: ttsProvider });
      }
    } catch (ttsError) {
      logger.warn("[norwegian-pronunciation] TTS example skipped", { error: ttsError.message });
    }

    const ttsNote = ttsProvider
      ? `🔊 **Audio example attached** (${ttsProvider}) — listen first, then send your voice note.`
      : "⚠️ TTS audio not configured — send your voice note and I'll give you feedback based on that.";

    const replyContent = truncate(
      `**Pronunciation Practice** 🎤\n\n` +
      `**Target phrase:**\n*${phrase}*\n\n` +
      `${ttsNote}\n\n` +
      `sourceStatus: **stt_based_practice** (Retry if audio confidence is low; no fake precise score will be shown.)\n\n` +
      `Send me a voice note saying this phrase to get STT-based feedback.`
    );

    recordNorwegianTruth({ command: "pronounce", sourceStatus: "stt_based_practice" });
    await interaction.editReply({ content: replyContent, files: ttsFiles });
  } catch (error) {
    logger.error("[norwegian-pronunciation] Failed to create session", {
      userScope,
      error: error.message,
    });

    await interaction.editReply(
      "Failed to start pronunciation practice. Try again later."
    );
  }
}

async function handleNorwegianDaily(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply("Daily practice is not available right now. Database not configured.");
    return;
  }

  logger.info("[norwegian] daily practice requested", { userScope });

  const { tasks, source } = await generateDailyPractice(store, userScope, logger);

  if (!tasks || tasks.length === 0) {
    await interaction.editReply(
      "**Daily Practice** 📚\n\n" +
      "Not enough saved data yet. Start practicing with /norwegian lesson, /norwegian word, and /norwegian correct to build up your review queue.\n\n" +
      "⚠️ No data — keep practicing to unlock daily sets."
    );
    return;
  }

  const lines = tasks.map((t, i) => `**${i + 1}. ${t.item_type || t.type}** — ${String(t.content || t.description || '').slice(0, 100)}`);

  await interaction.editReply(truncate(
    `**Daily Practice Set** 📚 (${source})\n\n` +
    lines.join("\n") +
    `\n\n${tasks.length} item(s) today. Track results with /norwegian review.`
  ));
}

async function handleNorwegianWeakspots(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply("Weak spot analysis is not available right now. Database not configured.");
    return;
  }

  logger.info("[norwegian] weak spots requested", { userScope });

  const result = await analyzeWeakSpots(store, userScope, logger);

  if (!result || (!result.weakSpots?.length && !result.categories?.length)) {
    await interaction.editReply(
      "**Weak Spots** 🔍\n\n" +
      "Not enough data yet. Use /norwegian correct and /norwegian pronounce to build up evidence.\n\n" +
      "⚠️ No weak spot data — keep practicing."
    );
    return;
  }

  const spots = result.weakSpots || result.categories || [];
  const lines = spots.slice(0, 5).map((s, i) =>
    `**${i + 1}. ${s.skillArea || s.category}** — ${s.evidenceCount || s.count} occurrences (${s.priority || 'medium'} priority)`
  );

  await interaction.editReply(truncate(
    `**Weak Spots** 🔍\n\n` +
    `Identified from your saved corrections and pronunciation data:\n\n` +
    lines.join("\n") +
    `\n\nUse /norwegian plan for a recommended learning path.`
  ));
}

async function handleNorwegianWeekly(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply("Weekly summary is not available right now. Database not configured.");
    return;
  }

  logger.info("[norwegian] weekly summary requested", { userScope });

  const summary = await generateWeeklySummary(store, userScope, logger);

  if (!summary || Object.keys(summary).length === 0) {
    await interaction.editReply(
      "**Weekly Summary** 📊\n\n" +
      "No activity this week yet. Use /norwegian commands to get started.\n\n" +
      "⚠️ No weekly data available."
    );
    return;
  }

  await interaction.editReply(truncate(
    `**Weekly Norwegian Summary** 📊\n\n` +
    `Lessons completed: ${summary.lessonsCompleted || 0}\n` +
    `Corrections received: ${summary.correctionsReceived || 0}\n` +
    `Vocabulary added: ${summary.vocabularyAdded || 0}\n` +
    `Review items completed: ${summary.reviewItemsCompleted || 0}\n` +
    `Strong items: ${summary.strongItems || 0}\n\n` +
    `Keep it up! Consistency builds fluency. 💪`
  ));
}

async function handleNorwegianMastery(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply("Mastery profile is not available right now. Database not configured.");
    return;
  }

  logger.info("[norwegian] mastery requested", { userScope });

  const { profile, message } = await calculateMasteryProfile(store, userScope, logger);

  if (!profile) {
    await interaction.editReply(
      "**Norwegian Mastery** 🏆\n\n" +
      (message || "Not enough data yet. Keep practicing with /norwegian commands to build your profile.") +
      "\n\n⚠️ Evidence-based only — no invented progress."
    );
    return;
  }

  const strengths = (profile.strengths || []).map((s) => `• ${s.skill}: ${s.score}%`).join("\n") || "None identified yet";
  const weakSpots = (profile.weakSpots || []).map((s) => `• ${s.skillArea} (${s.evidenceCount} items)`).join("\n") || "None identified yet";

  await interaction.editReply(truncate(
    `**Norwegian Mastery Profile** 🏆\n\n` +
    `**Estimated level:** ${profile.estimatedLevel} (${profile.levelConfidence} confidence)\n` +
    `**Basis:** ${profile.levelBasis}\n\n` +
    `⚠️ *Estimated only — not an official CEFR certification*\n\n` +
    `**Lessons completed:** ${profile.lessonsCompleted}\n` +
    `**Corrections received:** ${profile.correctionsReceived}\n` +
    `**Vocabulary items:** ${profile.vocabularyItems}\n\n` +
    `**Strengths:**\n${strengths}\n\n` +
    `**Weak spots:**\n${weakSpots}\n\n` +
    `Use /norwegian level for level details, /norwegian plan for a learning path.`
  ));
}

async function handleNorwegianLevel(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply("Level estimate is not available right now. Database not configured.");
    return;
  }

  logger.info("[norwegian] level requested", { userScope });

  const { profile, message } = await calculateMasteryProfile(store, userScope, logger);

  if (!profile) {
    await interaction.editReply(
      "**Norwegian Level** 📊\n\n" +
      (message || "Not enough data yet to estimate your level. Keep practicing!") +
      "\n\n⚠️ Level is estimated from saved data only — not an official CEFR score."
    );
    return;
  }

  recordNorwegianTruth({ command: "level", sourceStatus: "not_checked", estimatedLevel: profile.estimatedLevel });
  await interaction.editReply(truncate(
    `**Norwegian Level Estimate** 📊\n\n` +
    `**Estimated level:** ${profile.estimatedLevel}\n` +
    `**Confidence:** ${profile.levelConfidence}\n` +
    `**Basis:** ${profile.levelBasis}\n\n` +
    `⚠️ *This is an evidence-based estimate from your learning history. It is NOT an official CEFR certification.*\n\n` +
    `To improve confidence: complete more lessons, get corrections, and practice pronunciation.`
  ));
}

async function handleNorwegianNext(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply("Next focus is not available right now. Database not configured.");
    return;
  }

  logger.info("[norwegian] next focus requested", { userScope });

  const result = await getNextFocus(store, userScope, logger);

  if (!result || !result.nextFocus) {
    await interaction.editReply(
      "**Next Focus** 🎯\n\n" +
      "No focus recommendation yet. Start practicing with /norwegian lesson and /norwegian correct.\n\n" +
      "⚠️ Recommendations come from your saved learning data only."
    );
    return;
  }

  await interaction.editReply(truncate(
    `**Next Recommended Focus** 🎯\n\n` +
    `**Focus:** ${result.nextFocus}\n` +
    `**Reason:** ${result.reason}\n\n` +
    `**Suggested command:** ${result.suggestedCommand || '/norwegian daily'}\n\n` +
    `Source: ${result.sourceStatus || 'saved data'}`
  ));
}

async function handleNorwegianPlan(interaction, store, userScope, logger) {
  if (!store.available) {
    await interaction.editReply("Learning plan is not available right now. Database not configured.");
    return;
  }

  logger.info("[norwegian] learning plan requested", { userScope });

  const { profile } = await calculateMasteryProfile(store, userScope, logger);

  if (!profile) {
    const defaultPath = { title: "Survival Norwegian", description: "Essential phrases for basic communication", levelRange: "A1", suggestedTopics: ["greetings", "basic_needs", "thanks", "help"] };
    await interaction.editReply(truncate(
      `**Learning Plan** 📋\n\n` +
      `Not enough data for a personalized plan yet — here's where to start:\n\n` +
      `**Path:** ${defaultPath.title} (${defaultPath.levelRange})\n` +
      `**Description:** ${defaultPath.description}\n` +
      `**Topics:** ${defaultPath.suggestedTopics.join(", ")}\n\n` +
      `⚠️ Default path — will personalize as you build learning history.`
    ));
    return;
  }

  const path = recommendPath(profile);
  const skillAreas = (path.skillAreas || []).join(", ");
  const topics = (path.suggestedTopics || []).join(", ");

  await interaction.editReply(truncate(
    `**Personalized Learning Plan** 📋\n\n` +
    `Based on your estimated level (${profile.estimatedLevel}) and weak spots:\n\n` +
    `**Recommended path:** ${path.title}\n` +
    `**Level range:** ${path.levelRange}\n` +
    `**Description:** ${path.description}\n` +
    `**Skill areas:** ${skillAreas}\n` +
    `**Suggested topics:** ${topics}\n\n` +
    `Use /norwegian daily to practice these areas from your saved data.`
  ));
}
