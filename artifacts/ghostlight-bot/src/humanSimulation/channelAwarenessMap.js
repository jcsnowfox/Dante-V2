"use strict";

// Channel kind detection from name patterns
const NAME_KIND_MAP = [
  { re: /(?:adult|private|nsfw|explicit|intimate|18\+)/i, kind: "private_adult", adult: true, privacy: "private" },
  { re: /(?:norsk|norwegian|learning|language)/i, kind: "norwegian_learning", norwegian: true },
  { re: /(?:project|build|dev|deploy|code|tech|git|pr\b|merge)/i, kind: "project_build", project: true },
  { re: /(?:image|art|visual|gallery|dall.e|midjourney)/i, kind: "image_lab", image: true },
  { re: /(?:voice|audio|tts|speech|sound|fish)/i, kind: "voice_audio", voice: true },
  { re: /(?:memory|memories|repair|continuity)/i, kind: "memory_repair" },
  { re: /(?:music|spotify|playlist|song|jam)/i, kind: "music" },
  { re: /(?:second.life|sl\b|avatar|inworld)/i, kind: "second_life" },
  { re: /(?:admin|test|debug|staging)/i, kind: "admin_testing" },
  { re: /(?:journal|diary|log)/i, kind: "journal" },
  { re: /(?:general|chat|lounge|hall|main|lobby|home)/i, kind: "general" },
];

const KIND_DEFAULTS = {
  private_adult: { tone: "intimate", privacy: "private", adult_allowed: true, proactive_allowed: false },
  norwegian_learning: { tone: "educational", project_allowed: true },
  project_build: { tone: "practical", project_allowed: true },
  image_lab: { tone: "creative", image_allowed: true },
  voice_audio: { tone: "expressive", voice_allowed: true },
  memory_repair: { tone: "reflective" },
  music: { tone: "relaxed" },
  second_life: { tone: "playful" },
  admin_testing: { tone: "technical", proactive_allowed: false },
  journal: { tone: "reflective", proactive_allowed: false },
  general: { tone: "neutral" },
  hall: { tone: "neutral" },
  unknown: { tone: "neutral" },
};

const KIND_PURPOSE = {
  private_adult: "Private intimate space. Use intimate tone. Adult content allowed.",
  norwegian_learning: "Norwegian learning channel. Focus on language practice.",
  project_build: "Project build channel. Keep replies focused and practical.",
  image_lab: "Image generation and art channel. Creative mode.",
  voice_audio: "Voice and audio channel. Audio-focused replies.",
  memory_repair: "Memory and repair channel. Reflective, continuity-focused.",
  music: "Music and Spotify channel. Relaxed tone.",
  second_life: "Second Life / avatar channel.",
  admin_testing: "Admin testing channel. Technical mode.",
  journal: "Journal and reflection channel.",
  general: "General conversation channel.",
  hall: "Main chat hall.",
  unknown: "Unknown channel type. Use safe normal mode.",
};

function detectChannelKind({ channelName, channelId, adultChannelId, norwegianMode }) {
  const name = String(channelName || "").toLowerCase();

  // Configured adult channel takes precedence over name detection
  if (adultChannelId && channelId && String(channelId) === String(adultChannelId)) {
    return "private_adult";
  }

  if (norwegianMode) return "norwegian_learning";

  for (const { re, kind } of NAME_KIND_MAP) {
    if (re.test(name)) return kind;
  }

  return "unknown";
}

async function loadOrCreateChannelAwareness({ store, guildId, channelId, channelName, userScope, companionId, config, adultScope }) {
  if (!store?.getChannel) return null;

  try {
    let awareness = await store.getChannel({ channel_id: channelId, user_scope: userScope, companion_id: companionId });

    const adultChannelId = config?.chat?.adultPrivateMode?.channelId || "";
    const kind = awareness?.channel_kind && awareness.channel_kind !== "unknown"
      ? awareness.channel_kind
      : detectChannelKind({ channelName, channelId, adultChannelId });

    const kindDefaults = KIND_DEFAULTS[kind] || KIND_DEFAULTS.unknown;
    const purposeSummary = KIND_PURPOSE[kind] || KIND_PURPOSE.unknown;

    const upserted = await store.upsertChannel({
      guild_id: guildId || "",
      channel_id: channelId,
      user_scope: userScope,
      companion_id: companionId,
      channel_name: channelName || "",
      channel_kind: kind,
      purpose_summary: awareness?.purpose_summary || purposeSummary,
      tone_default: awareness?.tone_default || kindDefaults.tone || "neutral",
      privacy_scope: kind === "private_adult" ? "private" : (awareness?.privacy_scope || "normal"),
      adult_allowed: kind === "private_adult" || !!adultScope?.active || !!awareness?.adult_allowed,
      norwegian_allowed: kind === "norwegian_learning" || !!awareness?.norwegian_allowed,
      project_allowed: kind === "project_build" || !!awareness?.project_allowed,
      image_allowed: awareness?.image_allowed !== false,
      voice_allowed: awareness?.voice_allowed !== false,
      memory_allowed: awareness?.memory_allowed !== false,
      proactive_allowed: kind !== "admin_testing" && kind !== "private_adult" && awareness?.proactive_allowed !== false,
    });

    return upserted;
  } catch {
    return null;
  }
}

function formatChannelPrelude(awareness) {
  if (!awareness) return null;
  const lines = [
    `* Current channel: ${awareness.channel_kind} (${awareness.channel_name || awareness.channel_id})`,
    `* ${awareness.purpose_summary || KIND_PURPOSE[awareness.channel_kind] || "Normal conversation mode."}`,
  ];
  if (!awareness.adult_allowed) lines.push("* Keep replies work-appropriate. Intimate tone is off here.");
  if (awareness.project_allowed) lines.push("* Project mode allowed. Keep replies practical and proof-based.");
  if (awareness.norwegian_allowed) lines.push("* Norwegian learning mode available.");
  return { label: 'CHANNEL AWARENESS', content: lines.join('\n') };
}

module.exports = { detectChannelKind, loadOrCreateChannelAwareness, formatChannelPrelude, KIND_DEFAULTS, KIND_PURPOSE };
