const { getLlmClient, resolveTranscriptionModel } = require('../llm/client');
const fs = require('fs');
const path = require('path');

async function transcribeAudio({
  buffer,
  contentType = 'audio/mpeg',
  filename = 'audio.mp3',
  language = 'no',
  config = {},
  logger = console,
}) {
  const client = getLlmClient(config, 'transcription');
  const model = resolveTranscriptionModel(config);

  if (!client) {
    throw new Error('[norwegian-pronunciation] STT not configured. No LLM client available.');
  }

  if (!model) {
    throw new Error('[norwegian-pronunciation] STT model not configured. Set llm.transcription.model.');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('[norwegian-pronunciation] Audio buffer is empty.');
  }

  logger.info('[norwegian-pronunciation] stt started', {
    provider: 'openai',
    model,
    bufferSize: buffer.length,
    contentType,
  });

  try {
    const file = new (require('form-data'))();
    file.append('file', buffer, filename);
    file.append('model', model);
    file.append('language', language);
    file.append('response_format', 'json');

    const response = await client.audio.transcriptions.create({
      file: buffer,
      model,
      language,
      response_format: 'json',
    });

    const confidence = response.confidence !== undefined ? Number(response.confidence) : null;
    const transcript = String(response.text || '').trim();

    logger.info('[norwegian-pronunciation] transcript completed', {
      length: transcript.length,
      confidence: confidence !== null ? confidence.toFixed(2) : 'null',
      durationMs: response.duration * 1000 || null,
    });

    return {
      transcript,
      confidence,
      language: language || 'no',
      durationMs: response.duration ? response.duration * 1000 : null,
      provider: 'openai',
      rawProviderMetaSafe: {
        model,
      },
    };
  } catch (error) {
    logger.warn('[norwegian-pronunciation] STT failed', {
      error: error.message,
      model,
    });
    throw new Error(`[norwegian-pronunciation] Transcription failed: ${error.message}`);
  }
}

module.exports = {
  transcribeAudio,
};
