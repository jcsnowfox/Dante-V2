const { createImageGenerationService } = require("../images/generateImage");
const { createGeneratedImageAnalysisService } = require("../images/analyzeImage");
const { hasBucketConfig, hasLocalStorageConfig, hasStorageConfig } = require("../images/bucketStorage");
const { createAudioGenerationService, resolveTtsProvider } = require("../audio/generateAudio");
const { saveRequestedMemory } = require("../memory/saveRequest");
const {
  createGiphySearchTool,
  createImageGenerationTool,
  createAudioGenerationTool,
  createAddReactionTool,
  shouldAllowAdditionalChatImageCall,
} = require("./mediaTools");
const {
  canAccessRetrievalSource,
  createMemoryLookupTool,
  createMemorySaveTool,
  createConversationRetrievalTool,
} = require("./memoryTools");
const {
  createMusicLibrarySearchTool,
  createSpotifyCurrentTrackTool,
  createCuratedSpotifyPlaylistTool,
  createSpotifyPlaylistEditTool,
  createMusicPlaylistSearchTool,
  createSpotifyPlaybackTool,
  createMusicPreferenceTool,
  normalizeMusicTrackCandidate,
} = require("./musicTools");

function createToolRegistry({
  config,
  logger,
  fetchImpl = globalThis.fetch,
  generatedImages = null,
  generatedAudio = null,
  imageStylePresets = null,
  imageAppearancePresets = null,
  conversations = null,
  channelModes = null,
  memory = null,
  memoryStore = null,
  generatedMemories = null,
  memorySaveRequestFn = saveRequestedMemory,
  musicLibrary = null,
  spotify = null,
} = {}) {
  const imageGeneration = createImageGenerationService({
    config,
    logger,
    generatedImages,
    fetchImpl,
  });
  const imageAnalysis = createGeneratedImageAnalysisService({
    config,
    logger,
  });
  const audioGeneration = createAudioGenerationService({
    config,
    logger,
    generatedAudio,
    fetchImpl,
  });
  const spotifyToolsEnabled = config?.spotify?.enabled !== false;
  const registeredTools = [
    // Context and lookup tools first so models see grounding options before action tools.
    createMemoryLookupTool({ config, memory, logger }),
    createConversationRetrievalTool({ config, conversations, channelModes, logger }),
    spotifyToolsEnabled ? createMusicLibrarySearchTool({ config, musicLibrary, logger }) : null,
    spotifyToolsEnabled ? createSpotifyCurrentTrackTool({ config, spotify, musicLibrary, logger }) : null,
    spotifyToolsEnabled ? createMusicPlaylistSearchTool({ config, musicLibrary, logger }) : null,
    createMemorySaveTool({ config, memory, memoryStore, generatedMemories, logger, saveRequestedMemoryFn: memorySaveRequestFn }),
    createImageGenerationTool({
      config,
      logger,
      imageGeneration,
      imageAnalysis,
      generatedImages,
      imageStylePresets,
      imageAppearancePresets,
    }),
    createAudioGenerationTool({
      config,
      logger,
      audioGeneration,
      generatedAudio,
    }),
    spotifyToolsEnabled ? createCuratedSpotifyPlaylistTool({ config, musicLibrary, spotify, imageGeneration, logger }) : null,
    spotifyToolsEnabled ? createSpotifyPlaylistEditTool({ config, musicLibrary, spotify, logger }) : null,
    spotifyToolsEnabled ? createSpotifyPlaybackTool({ config, spotify, logger }) : null,
    spotifyToolsEnabled ? createMusicPreferenceTool({ config, musicLibrary, spotify, logger }) : null,
    createGiphySearchTool({ config, logger, fetchImpl }),
    createAddReactionTool({ config, logger }),
  ].filter(Boolean);

  if (!registeredTools.some((tool) => tool.name === "generate_image")) {
    logger.warn(
      "[tools] generate_image tool is NOT registered; the bot cannot create images. Check the gates below (all must be true).",
      {
        canGenerate: Boolean(imageGeneration?.canGenerate?.()),
        imageGenerationEnabled: Boolean(config.imageGeneration?.enabled),
        getimgKeyConfigured: Boolean(String(config.getimg?.apiKey || "").trim()),
        hasStorageConfig: hasBucketConfig(config) || hasLocalStorageConfig(config),
        hasBucketConfig: hasBucketConfig(config),
        hasLocalStorageConfig: hasLocalStorageConfig(config),
        hasModel: Boolean(String(config.imageGeneration?.model || "").trim()),
        generatedImagesPersistence: Boolean(generatedImages?.persistenceEnabled),
        imageStylePresetsPersistence: Boolean(imageStylePresets?.persistenceEnabled),
        imageAppearancePresetsPersistence: Boolean(imageAppearancePresets?.persistenceEnabled),
      },
    );
  } else {
    logger.info("[tools] generate_image tool registered", {
      model: String(config.imageGeneration?.model || "").trim(),
    });
  }

  const selectedAudioProvider = String(config.audio?.ttsProvider || "elevenlabs").trim().toLowerCase();
  const fishKeyConfigured = Boolean(String(config.fishAudio?.apiKey || "").trim());
  const fishVoiceConfigured = Boolean(String(config.audio?.fishVoiceId || config.fishAudio?.voiceId || "").trim());
  logger.info?.(`[audio] provider selected provider="${selectedAudioProvider}"`);
  logger.info?.("[audio] fish config", {
    keyConfigured: fishKeyConfigured,
    voiceConfigured: fishVoiceConfigured,
  });
  logger.info?.(`[tools] generate_audio provider check selectedProvider="${selectedAudioProvider}" canGenerate=${Boolean(audioGeneration?.canGenerate?.())}`);

  if (!registeredTools.some((tool) => tool.name === "generate_audio")) {
    logger.warn(
      "[tools] generate_audio tool is NOT registered; the bot cannot create voice notes/audio. Check the gates below (all must be true).",
      {
        canGenerate: Boolean(audioGeneration?.canGenerate?.()),
        ttsEnabled: Boolean(config.audio?.ttsEnabled),
        selectedProvider: selectedAudioProvider,
        elevenlabsKeyConfigured: Boolean(String(config.elevenlabs?.apiKey || "").trim()),
        elevenlabsVoiceIdConfigured: Boolean(String(config.audio?.elevenlabsVoiceId || "").trim()),
        fishKeyConfigured,
        fishVoiceConfigured,
        hasStorageConfig: hasStorageConfig(config),
        hasBucketConfig: hasBucketConfig(config),
        hasLocalStorageConfig: hasLocalStorageConfig(config),
      },
    );
  } else {
    const registeredModel = selectedAudioProvider === "fish_audio"
      ? String(config.audio?.fishModelId || config.fishAudio?.modelId || "fish-speech").trim()
      : String(config.audio?.generatedAudioModel || "eleven_multilingual_v2").trim();
    logger.info("[tools] generate_audio tool registered", {
      provider: selectedAudioProvider,
      model: registeredModel,
    });
  }

  const toolMap = new Map(registeredTools.map((tool) => [tool.name, tool]));

  return {
    list(context = {}) {
      const allowedToolNames = Array.isArray(context.allowedToolNames)
        ? new Set(context.allowedToolNames.map((item) => String(item || "").trim()).filter(Boolean))
        : null;

      return registeredTools
        .filter((tool) => typeof tool.isAvailable !== "function" || tool.isAvailable(context))
        .filter((tool) => !allowedToolNames || allowedToolNames.has(tool.name))
        .map((tool) => tool.definition);
    },
    has(name) {
      return toolMap.has(String(name || "").trim());
    },
    async execute(name, args, context = {}) {
      const tool = toolMap.get(String(name || "").trim());

      if (!tool) {
        throw new Error(`Unknown tool "${name}".`);
      }

      const allowedToolNames = Array.isArray(context.allowedToolNames)
        ? new Set(context.allowedToolNames.map((item) => String(item || "").trim()).filter(Boolean))
        : null;

      if (allowedToolNames && !allowedToolNames.has(tool.name)) {
        throw new Error(`Tool "${name}" is not enabled in this context.`);
      }

      if (typeof tool.isAvailable === "function" && !tool.isAvailable(context)) {
        throw new Error(`Tool "${name}" is not available in this context.`);
      }

      return tool.execute(args, context);
    },
  };
}
module.exports = {
  createToolRegistry,
  canAccessRetrievalSource,
  createMemoryLookupTool,
  createMemorySaveTool,
  createMusicLibrarySearchTool,
  createCuratedSpotifyPlaylistTool,
  createSpotifyPlaylistEditTool,
  createMusicPlaylistSearchTool,
  createSpotifyPlaybackTool,
  createMusicPreferenceTool,
  normalizeMusicTrackCandidate,
  shouldAllowAdditionalChatImageCall,
};
