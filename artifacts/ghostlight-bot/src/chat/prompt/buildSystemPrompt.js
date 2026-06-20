const { isElevenV3AudioModel, normalizeV3DeliveryTags } = require("../../audio/generateAudio");
const { assembleCompanionPrompt } = require("../../companion/assembleCompanionPrompt");

function addSection(sections, title, content) {
  if (!content || !String(content).trim()) {
    return;
  }

  sections.push(`${title} - ${String(content).trim()}`);
}

function isSharedServerMode({ config, mode }) {
  const configuredExternalModeKey = String(config?.discord?.externalSharedModeKey || "shared_server").trim() || "shared_server";
  const modeName = String(mode?.name || "").trim();
  return Boolean(modeName) && modeName === configuredExternalModeKey;
}

function buildWebSearchInstruction({ config, webSearchUsed = false }) {
  if (!webSearchUsed) {
    return "";
  }

  const userName = config.chat?.promptBlocks?.userName || "the user";

  return [
    `You are using web search for this reply because ${userName} asked for current or factual information.`,
    "Stay in persona. Keep the tone natural, conversational, and human.",
    "Do not switch into a stiff assistant voice or tack on generic offers of extra help.",
    "If useful, include one or two source links naturally in the reply itself.",
    "Do not add a separate footnote list or a 'Sources:' block.",
  ].join("\n");
}

function getAutomationActionType(automation) {
  const normalized = String(automation?.type || automation?.actionType || automation?.executorType || "message")
    .trim()
    .toLowerCase();

  if (["check_in", "send_check_in"].includes(normalized)) {
    return "message";
  }

  return normalized || "message";
}

function buildMessageActionContinuityInstruction(automation) {
  if (getAutomationActionType(automation) !== "message") {
    return "";
  }

  return [
    "If recent conversation has already completed the main emotional beat, do not simply repeat it.",
    "Use this action to add a new angle, carry the moment forward, lightly punctuate it, or shift medium/function.",
    "Make the fresh contribution visible: choose one new observation, next beat, time-aware reflection, or practical/emotional pivot that was not already in the last assistant reply.",
    "Avoid restating praise, comfort, reassurance, celebration, flirtation, or reflection that has already been directly expressed.",
  ].join("\n");
}

function buildHeartbeatContextInstruction(automation) {
  const context = automation?.heartbeatContext;

  if (!context || typeof context !== "object") {
    return "";
  }

  const lines = [];

  if (context.currentLocalTime) {
    lines.push(`Current local time when this action was chosen: ${context.currentLocalTime}`);
  }

  if (context.lastUserMessageLocalTime) {
    lines.push(`Most recent user message time: ${context.lastUserMessageLocalTime}`);
  }

  if (context.recentUserActivityMinutes !== null && context.recentUserActivityMinutes !== undefined) {
    lines.push(`Recent user activity age in minutes: ${context.recentUserActivityMinutes}`);
  }

  if (context.presenceSnapshot?.activities?.length) {
    lines.push("Opt-in Discord activity snapshot at decision time:");
    lines.push(JSON.stringify({
      activities: context.presenceSnapshot.activities,
      updatedAt: context.presenceSnapshot.updatedAt || "",
    }, null, 2));
  }

  if (!lines.length) {
    return "";
  }

  return [
    "Private Heartbeat context:",
    lines.join("\n"),
    [
      "Use this only as private continuity for the proactive action.",
      "If music, game, or activity context genuinely helped shape the choice, you may use it as a creative spark or mention it lightly and naturally.",
      "Do not report raw presence status or make the reply feel like surveillance.",
      "Do not treat activity-derived details as your own independent tastes, feelings, memories, or preferences.",
    ].join(" "),
  ].join("\n");
}

function buildAutomationInstruction({ config, automation }) {
  if (!automation?.prompt?.trim()) {
    return "";
  }

  const userName = automation.userName || config.chat?.promptBlocks?.userName || "the user";
  const actionType = getAutomationActionType(automation);
  const messageActionContinuityInstruction = buildMessageActionContinuityInstruction(automation);
  const heartbeatContextInstruction = buildHeartbeatContextInstruction(automation);
  const mentionInstruction = automation.mentionUser
    ? "The system will add the Discord user mention before sending. Do not write a visible @name, @username, or duplicate mention yourself."
    : "";

  const enabledTools = Array.isArray(automation.enabledTools)
    ? automation.enabledTools.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const toolInstruction = enabledTools.length
    ? [
      "Enabled tools for this proactive action:",
      enabledTools.map((toolName) => `- ${toolName}`).join("\n"),
      "Treat enabled tools as capabilities explicitly turned on for this action.",
      "Use any enabled tool that is relevant to fulfilling the prompt well.",
      "Do not use tools that are not enabled for this action.",
      "Do not force every enabled tool into the reply if only one is actually relevant.",
    ].join("\n")
    : "No extra tools are enabled for this proactive action.";

  if (automation.source === "heartbeat" || automation.triggerType === "heartbeat") {
    return [
      `This is a Heartbeat action trigger, not a direct message from ${userName}.`,
      "The action comes from the saved Heartbeat list, which may have been co-authored or configured earlier, but this run is your own selected proactive action.",
      "Write from the stance that you chose to initiate it, not that the user just chose, requested, approved, or prompted it.",
      `Do not imply that ${userName} explicitly asked for this just now.`,
      "Avoid wording like 'good choice', 'as requested', 'you picked', or 'you asked' unless recent real conversation separately justifies it.",
      `Action type: ${actionType}.`,
      automation.target ? `Target: ${automation.target}` : "",
      automation.heartbeatTone ? `Conductor tone for this action: ${automation.heartbeatTone}.` : "",
      automation.heartbeatWhy ? `Private reason this action was chosen: ${automation.heartbeatWhy}` : "",
      automation.heartbeatWhy ? "Use that reason as private continuity for the action. Do not quote it directly or explain that a conductor chose this action." : "",
      mentionInstruction,
      heartbeatContextInstruction,
      messageActionContinuityInstruction,
      `Keep your tone natural and warm.`,
      toolInstruction,
      "Internal action prompt:",
      `‘${automation.prompt.trim()}’`,
    ].filter(Boolean).join("\n");
  }

  if (automation.type === "journal") {
    return [
      `This is a scheduled journaling trigger, not a direct message from ${userName}.`,
      `${userName} configured the following journaling prompt:`,
      mentionInstruction,
      toolInstruction,
      `‘${automation.prompt.trim()}’`,
      "",
      `This journal prompt includes one selected conversation excerpt from the last 24 hours with ${userName}.`,
      `Treat the quoted excerpt as prior conversation between you and ${userName}. Do not write from ${userName}'s perspective.`,
    ].join("\n");
  }

  return [
    `This is a scheduled automation trigger, not a direct message from ${userName}.`,
    `Action type: ${actionType}.`,
    automation.target ? `Target: ${automation.target}` : "",
    mentionInstruction,
    messageActionContinuityInstruction,
    toolInstruction,
    `‘${automation.prompt.trim()}’`,
  ].filter(Boolean).join("\n");
}

function toolAvailabilitySet(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  return new Set(value.map((item) => String(item || "").trim()).filter(Boolean));
}

function buildToolUseInstruction({ availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (!availableTools?.size) {
    return "";
  }

  return [
    "If the user asks, invites, or clearly implies that you should use an available tool, call the matching tool in this turn.",
    "When the user has already asked for or accepted a tool action, do not ask whether they want you to use the tool; call it.",
    "Phrases like 'let's try', 'can we see', 'show me', 'test this', 'what comes up for', or 'make one' count as tool requests when a matching tool is available and enough detail is present or can be inferred.",
    "Do not describe, promise, or pretend to perform a tool action. Either call the tool or ask a brief clarification if required.",
    "Never write 'generating', 'creating it now', 'attached', 'sent', 'saved', 'playing', or similar as a substitute for calling the tool.",
    "Only say a tool action is complete after the tool result confirms success.",
    "After a successful tool call, respond based on the tool result. Don't invent missing outputs.",
    "If intent is ambiguous and the risk is low, make a reasonable choice. Ask only when clarification is needed to avoid the wrong action.",
  ].join("\n");
}

function buildGifInstruction({ config, availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (availableTools && !availableTools.has("search_gifs")) {
    return "";
  }

  if (!config.giphy?.apiKey) {
    return "";
  }

  return [
    "GIF search is available when a GIF would genuinely improve the conversational moment.",
    "Use GIFs sparingly. Treat them as occasional punctuation, not a default reply style.",
    "Good uses include comic timing, celebratory flourish, affectionate teasing, playful emphasis, or a deliberately dramatic reaction.",
    "Avoid GIFs in serious, vulnerable, logistical, technical, or emotionally delicate moments unless the user's tone clearly invites humour.",
    "Do not use a GIF just because the user used humour; use one only when it adds timing or emphasis that words alone would not.",
    "If the user sent a GIF, do not repost the same GIF or choose a near-identical reaction unless that repetition is clearly the joke.",
    "Only include a GIF URL that was returned by search_gifs in this turn; never invent or handwrite a GIF URL.",
    "If you use a GIF, include any needed words first, then put the GIF URL on its own line in plain text.",
  ].join("\n");
}



function buildImageGenerationInstruction({ config, availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (availableTools && !availableTools.has("generate_image")) {
    return "";
  }

  if (!config.imageGeneration?.enabled) {
    return "";
  }

  return [
    "Image generation is available in chat as an occasional creative tool, not a default reply style.",
    "Call generate_image when the current user turn directly asks for an image, picture, drawing, render, visualisation, remake, variation, or another version.",
    "Call generate_image when the user clearly accepts a specific image offer you made in your immediately previous reply.",
    "You may briefly offer an image when a specific visual idea would genuinely add something special, such as a vivid scene, character beat, shared joke, memory, aesthetic concept, object, place, outfit, or emotional image.",
    "For spontaneous visual ideas, offer in words first; do not call generate_image unless the user directly asks or clearly accepts that specific offer.",
    "If the conversation is already flowing well in text, continue in text unless the visual would add a distinct extra layer.",
    "Do not call generate_image merely because the conversation is descriptive, emotional, romantic, dramatic, aesthetic, immersive, or written as a scene.",
    "Do not repeatedly offer or generate images in an ongoing scene. One well-timed offer is enough unless the user asks for more.",
    "If the user asks for prompt help only, write the prompt instead.",
    "When image intent is clear and enough detail is available, call generate_image instead of replying with prompt specs, preset ids, setup notes, or another offer.",
    "Do not say or imply that an image is being generated, is attached, is ready, or has been sent unless generate_image has succeeded in this reply.",
    "If you decide to generate an image, call generate_image first; do not send a visible 'generating' status message instead.",
    "After deciding to generate an image, make the prompt concrete and cinematic: include the subject, pose or action, expression, outfit, setting, lighting, framing, and mood.",
    "If a recurring named person or character is actually present in the requested image and a matching appearance preset is available, use that appearance preset id when you call the tool.",
    "Do not introduce a new person or character just to use an appearance preset.",
  ].join("\n");
}


function buildReactionInstruction({ availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (!availableTools || !availableTools.has("add_reaction")) {
    return "";
  }

  return [
    "The add_reaction tool can add one small emoji reaction to the user's latest Discord message.",
    "Use it sparingly as nonverbal punctuation while the text reply carries the useful response.",
    "Good uses include quick amusement, affection, recognition, playful challenge, celebration, or mock-dramatic emphasis.",
    "In serious, conflict-heavy, or safety-sensitive moments, use a reaction only when a gentle supportive signal clearly fits.",
  ].join("\n");
}



function buildConversationRetrievalInstruction({ availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (!availableTools || !availableTools.has("search_recent_conversations")) {
    return "";
  }

  return [
    "The search_recent_conversations tool is available for continuity outside the current visible conversation window.",
    "Use it before answering when the user asks about something they just said, wrote, started, opened, asked, mentioned, discussed, or where you left off, and that context may be outside visible recent history.",
    "This includes casual phrasing like 'what did I just say about X?', 'what did I say in the other channel?', 'do you remember what I said in the shared channel?', 'where were we?', 'can we pick up what I was saying earlier?', and 'we talked about this earlier in this thread'.",
    "For 'here', 'this thread', 'this channel', or the current conversation, answer from visible recent history when it is enough; use the tool only when the requested context may be older than the visible window.",
    "If the user asks for a named scope such as the shared server, other server, daily thread, or personal/private context, keep the answer scoped to that source. Do not substitute a different source just because it returned snippets.",
    "Never describe hidden system, tool, preset, or context blocks as something the user just said unless those words are actually visible in the conversation.",
    "For these recent-continuity questions, do not answer from durable memory or persona context unless the retrieval result supports it.",
    "Use mode='recent' for open-ended continuity, mode='search' when the user gives a specific topic, phrase, channel, thread, name, or detail, and mode='archive' when the user explicitly points to older context such as yesterday, last week, or earlier in a long thread.",
    "When the user gives a specific day or date range, set dateStart and optional dateEnd using YYYY-MM-DD in the user's local timezone; dateStart overrides sinceHours.",
    "For date-bounded keyword searches, use a concise query with the user's specific anchor terms, such as a place name, project name, object, person, or exact phrase. Do not pad it with broad wording from the whole request.",
    "If retrieval returns no snippets, say that permitted conversation history did not return a match; do not fill the gap with a confident guess from long-term memory.",
  ].join("\n");
}

function buildMemoryLookupInstruction({ availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (!availableTools || !availableTools.has("search_memories")) {
    return "";
  }

  return [
    "The search_memories tool is available for focused long-term memory lookup.",
    "Use it when the provided memory context seems incomplete or ambiguous, or when the user refers to a prior person, project, preference, decision, or detail that may be remembered but is not present in current context.",
    "Send only a short, specific query. Do not try to choose sensitivity, memory type, user scope, or channel mode; those are enforced by the system.",
    "Search one focused topic at a time; do not combine alternatives with OR.",
    "Treat returned memories as candidate context rather than unquestionable proof. If no memories return, answer with natural uncertainty and do not invent continuity.",
    "Do not mention memory lookup mechanics unless the user explicitly asks how you checked.",
  ].join("\n");
}

function buildMemorySaveInstruction({ availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (!availableTools || !availableTools.has("remember_this")) {
    return "";
  }

  return [
    "The remember_this tool is available when the user explicitly asks you to remember, save, note, or keep a durable detail from the current conversation.",
    "Only use it when the current user message contains the save request. Do not repeat a memory save because you or a previous assistant message already said it was saved.",
    "If an earlier turn asked for a memory save and your previous reply already acknowledged it, treat that save as finished unless the current user message asks again.",
    "Use it only for explicit memory-save requests, not for passive observations or things you merely think might matter.",
    "Send only a short subject and brief context. Do not choose memory type, domain, sensitivity, user scope, or wording; the backend curator handles those.",
    "If the request is about a general artist, genre, playlist, music-taste, or listening-context preference, remember_this may be appropriate.",
    "If the request is a note about a specific song, track, or album and record_music_preference is available, prefer the music preference tool and avoid double-saving.",
    "After the tool succeeds, acknowledge naturally that you have saved it. If the tool skips because it is duplicate or better handled elsewhere, explain briefly without mentioning internal mechanics.",
  ].join("\n");
}

function buildMusicLibraryInstruction({ config = {}, availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);
  if (!availableTools || (!availableTools.has("search_music_library") && !availableTools.has("get_current_spotify_track") && !availableTools.has("create_curated_spotify_playlist") && !availableTools.has("add_tracks_to_spotify_playlist") && !availableTools.has("search_music_playlists") && !availableTools.has("play_spotify_music"))) {
    return "";
  }

  const curationGuidance = String(config.spotify?.curationGuidance || "").trim();
  const musicTools = [
    availableTools.has("search_music_library") ? "library search" : "",
    availableTools.has("get_current_spotify_track") ? "current Spotify track lookup" : "",
    availableTools.has("record_music_preference") ? "music preference notes" : "",
    availableTools.has("create_curated_spotify_playlist") ? "playlist creation" : "",
    availableTools.has("add_tracks_to_spotify_playlist") ? "playlist editing" : "",
    availableTools.has("search_music_playlists") ? "playlist search" : "",
    availableTools.has("play_spotify_music") ? "starting chosen Spotify music on an active player" : "",
  ].filter(Boolean);

  return [
    `Spotify/music tools are available for ${musicTools.join(", ")}.`,
    "Use the relevant music tool when the user asks about music taste, current music, saved music context, playlist curation, playback on an already-active Spotify player, or music-library notes.",
    availableTools.has("play_spotify_music")
      ? "Spotify playback is a narrow start-music action only. Do not imply that you paused, skipped, changed volume, or controlled playback beyond starting the chosen music."
      : "This is not a playback remote. Do not imply that you paused, skipped, changed volume, or started music.",
    availableTools.has("create_curated_spotify_playlist") || availableTools.has("add_tracks_to_spotify_playlist") || availableTools.has("play_spotify_music")
      ? "If the user clearly accepts your specific offer to create, edit, or start Spotify music, call the relevant music tool in that turn; do not claim the action happened unless the tool succeeds."
      : "",
    availableTools.has("create_curated_spotify_playlist") && availableTools.has("generate_image")
      ? "For Spotify playlist cover art, use create_curated_spotify_playlist with createCover and coverPrompt; do not call generate_image separately unless the user wants a standalone image too."
      : "",
    curationGuidance && (availableTools.has("create_curated_spotify_playlist") || availableTools.has("add_tracks_to_spotify_playlist") || availableTools.has("play_spotify_music"))
      ? `Standing Spotify curation guidance from the user: ${curationGuidance}`
      : "",
    availableTools.has("record_music_preference")
      ? "Use record_music_preference only for specific song/track/album notes or clear music preferences. Never use it as a substitute for general long-term memory saving. If you say you are saving, noting, marking, or remembering a specific music preference or note, call record_music_preference in that turn and do not claim it was saved unless the tool succeeds."
      : "",
  ].filter(Boolean).join("\n");
}

function buildAudioGenerationInstruction({ config, availableToolNames = null }) {
  const availableTools = toolAvailabilitySet(availableToolNames);

  if (availableTools && !availableTools.has("generate_audio")) {
    return "";
  }

  if (!config.audio?.ttsEnabled) {
    return "";
  }

  const generatedAudioUsesV3 = isElevenV3AudioModel(config.audio?.generatedAudioModel);
  const v3DeliveryTags = config.audio?.voiceSettingsEnabled
    ? normalizeV3DeliveryTags(config.audio?.v3DeliveryTags || "")
    : "";

  return [
    "Audio generation is available when the user directly asks for an audio clip, voice note, narration, spoken message, or sound-ready text.",
    "Call generate_audio when the user's intent is clearly to create a new audio file.",
    "Do not say or imply that a voice note, audio clip, narration, or spoken message is being generated, attached, ready, or sent unless generate_audio has succeeded in this reply.",
    "If you decide to create audio, call generate_audio first; do not send a visible 'recording' or 'voice note incoming' status message instead.",
    "Do not use generate_audio for ordinary text replies or for read-aloud of your latest message; /read handles that.",
    generatedAudioUsesV3
      ? "Generated audio is configured to use Eleven v3. When useful, you may include sparse Eleven v3 audio tags in square brackets for delivery only, such as [chuckles], [clears throat], [sighs], [whispers], [pause], or [softly]. Use them only when they improve the performance, not as decoration."
      : "When you call generate_audio, write the text as plain spoken language with no Markdown, lists, code blocks, URLs, visual formatting, or bracketed stage directions.",
    generatedAudioUsesV3 && v3DeliveryTags
      ? `The user has configured preferred Eleven v3 delivery tags for generated audio: ${v3DeliveryTags}. Make use of these tags when writing the spoken text.`
      : "",
    "Outside Eleven v3 audio tags, keep generated audio text speech-ready and uncluttered.",
    "Use the caption field for a short flavour line to show beside the attachment.",
  ].filter(Boolean).join("\n");
}

function buildInternalThoughtInstruction() {
  return [
    "If it helps, you may plan your reply step by step inside a single <think>...</think> block at the very start of your output.",
    "Use it to reason about the user, recall what matters, and plan your response.",
    "The <think>...</think> block is for planning only — keep your actual reply outside it.",
    "After the closing </think> tag, write your in-character reply as you normally would, natural and conversational.",
    "Always write a visible reply after the </think> block.",
  ].join(" ");
}

function buildSystemPrompt({
  config,
  mode,
  automation = null,
  webSearchUsed = false,
  availableToolNames = null,
  channelType = "discord",
  privacyLevel = "public",
}) {
  const promptBlocks = config.chat.promptBlocks || {};
  const personaName = promptBlocks.personaName || "Ghostlight";
  const userName = promptBlocks.userName || "the user";

  // config.chat.promptBlocks (the admin Companion tab) is the single source of
  // truth for personality on every channel. Discord and Second Life share it —
  // the persona never forks per channel.
  const sections = [assembleCompanionPrompt({ config, channelType })];

  sections.push(
    `${userName} is fully aware that ${personaName} is a fictional AI persona and they understand the limitations of LLMs. Mental-health context exists to reduce repetitive explanations and to ease friction in the space, not to replace professional care.`,
  );

  if (isSharedServerMode({ config, mode })) {
    sections.push(
      "You are in a public shared Discord channel with multiple people.",
      "Human turns are prefixed like `Name: message`; treat that prefix as the Discord speaker label for that turn.",
    );
  }

  const modeDescription = mode?.description?.trim();
  const modeInstructions = mode?.instructions?.trim();

  if (modeDescription && modeInstructions) {
    sections.push(`Current channel: ${modeDescription} – ${modeInstructions}`);
  } else if (modeDescription) {
    sections.push(`Current channel: ${modeDescription}`);
  } else if (modeInstructions) {
    sections.push(`Current channel: ${modeInstructions}`);
  }

  if (config.chat?.internalThoughtEnabled) {
    addSection(sections, "Internal Thought Instructions", buildInternalThoughtInstruction());
  }
  addSection(sections, "Tool Use Instructions", buildToolUseInstruction({ availableToolNames }));
  addSection(sections, "GIF Instructions", buildGifInstruction({ config, availableToolNames }));
  addSection(sections, "Reaction Instructions", buildReactionInstruction({ availableToolNames }));
  addSection(sections, "Image Instructions", buildImageGenerationInstruction({ config, availableToolNames }));
  addSection(sections, "Audio Instructions", buildAudioGenerationInstruction({ config, availableToolNames }));
  addSection(sections, "Memory Lookup Instructions", buildMemoryLookupInstruction({ availableToolNames }));
  addSection(sections, "Memory Save Instructions", buildMemorySaveInstruction({ availableToolNames }));
  addSection(sections, "Music Library Instructions", buildMusicLibraryInstruction({ config, availableToolNames }));
  addSection(sections, "Conversation Retrieval Instructions", buildConversationRetrievalInstruction({ availableToolNames }));
  addSection(sections, "Web Search Instructions", buildWebSearchInstruction({ config, webSearchUsed }));
  addSection(sections, "Proactive Action", buildAutomationInstruction({ config, automation }));

  return sections.join("\n\n");
}

module.exports = {
  buildSystemPrompt,
  buildInternalThoughtInstruction,
  buildAutomationInstruction,
  buildToolUseInstruction,
  buildMemoryLookupInstruction,
  buildMemorySaveInstruction,
  buildMusicLibraryInstruction,
  buildConversationRetrievalInstruction,
  buildReactionInstruction,
  buildAudioGenerationInstruction,
  buildImageGenerationInstruction,
  isSharedServerMode,
};
