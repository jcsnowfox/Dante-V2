const https = require('https');
const { transcribeAudio } = require('../../norwegian/norwegianSttService');
const { calculateStringDistance, assignGrade, createFeedbackMessage } = require('../../norwegian/norwegianFeedbackService');

const MAX_AUDIO_MB = 15;
const MIN_CONFIDENCE_THRESHOLD = 0.65;
const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
];

async function downloadAudio(url, maxMB = MAX_AUDIO_MB) {
  return new Promise((resolve, reject) => {
    const maxBytes = maxMB * 1024 * 1024;
    let buffer = Buffer.alloc(0);

    const handleResponse = (response) => {
      const contentLength = parseInt(response.headers['content-length'], 10);

      if (contentLength && contentLength > maxBytes) {
        reject(new Error(`Audio file too large: ${(contentLength / 1024 / 1024).toFixed(1)}MB (max ${maxMB}MB)`));
        response.destroy();
        return;
      }

      response.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        if (buffer.length > maxBytes) {
          reject(new Error(`Audio file too large: exceeds ${maxMB}MB`));
          response.destroy();
        }
      });

      response.on('end', () => {
        if (buffer.length === 0) {
          reject(new Error('Audio file is empty'));
        } else {
          resolve(buffer);
        }
      });

      response.on('error', reject);
    };

    const urlObj = new URL(url);
    const client = url.startsWith('https') ? https : require('http');

    client.get(url, handleResponse).on('error', reject);
  });
}

async function processPronunciationAudio({
  message,
  attachment,
  config,
  logger,
  store,
  appContext,
}) {
  const userScope = appContext?.config?.memory?.userScope || 'user';

  if (!attachment || !attachment.url) {
    logger.warn('[norwegian-pronunciation] No attachment URL', { userScope });
    return null;
  }

  if (!SUPPORTED_AUDIO_TYPES.includes(attachment.contentType)) {
    await message.reply({
      content: `❌ Unsupported audio format: ${attachment.contentType}\n\nSupported: MP3, WAV, WebM, OGG, MP4, M4A`,
      flags: 'Ephemeral',
    });
    return null;
  }

  try {
    const session = await store.getPronunciationSession(userScope);

    if (!session || !session.active) {
      await message.reply({
        content: '❌ No active pronunciation session. Start with `/norwegian pronounce [phrase]`',
        flags: 'Ephemeral',
      });
      return null;
    }

    const targetPhrase = session.target_phrase;

    logger.info('[norwegian-pronunciation] audio received', {
      userScope,
      bytes: attachment.size,
      contentType: attachment.contentType,
    });

    await message.channel.sendTyping();

    const audioData = await downloadAudio(attachment.url);

    // validate audio data was downloaded successfully
    if (!audioData || audioData.length === 0) {
      await message.reply({
        content: '❌ Failed to download audio. Please try again.',
        flags: 'Ephemeral',
      });
      return null;
    }

    const sttResult = await transcribeAudio({
      buffer: audioData,
      contentType: attachment.contentType,
      filename: attachment.name || 'audio.mp3',
      language: 'no',
      config,
      logger,
    });

    const transcript = sttResult.transcript || '';
    const confidence = sttResult.confidence;

    logger.info('[norwegian-pronunciation] transcript completed', {
      userScope,
      length: transcript.length,
      confidence: confidence !== null ? confidence.toFixed(2) : 'null',
    });

    const match = calculateStringDistance(
      String(targetPhrase || '').toLowerCase().trim(),
      String(transcript || '').toLowerCase().trim()
    );

    const { grade, score, reason } = assignGrade(match, confidence, transcript);

    const sourceStatus = confidence !== null && confidence < MIN_CONFIDENCE_THRESHOLD ? 'low_confidence' : 'stt_based_practice';

    const feedbackMessage = createFeedbackMessage({
      targetPhrase,
      transcript,
      grade,
      score: (grade === 'A' || grade === 'B') ? Math.round(score) : null,
      sourceStatus,
      confidence,
      attemptNumber: session.attempt_count + 1,
    });

    const ttsExampleProvider = config.audio?.ttsProvider || 'elevenlabs';
    logger.info('[norwegian-pronunciation] example audio generation skipped', {
      provider: ttsExampleProvider,
      note: 'TTS integration deferred to Phase 4 refinement',
    });

    try {
      await store.savePronunciationAttempt({
        userScope,
        targetPhrase,
        transcriptText: transcript,
        sttConfidence: confidence,
        score: (grade === 'A' || grade === 'B') ? Math.round(score) : null,
        grade,
        feedback: feedbackMessage,
        correctionFocus: reason,
        attemptNumber: session.attempt_count + 1,
        sourceStatus,
        ttsExampleProvider,
        sourceChannel: message.channelId,
        sourceMessageId: message.id,
      });

      logger.info('[norwegian-pronunciation] attempt saved', {
        userScope,
        grade,
        sourceStatus,
      });

      if ((grade === 'C' || grade === 'D' || grade === 'Retry') && store.saveReviewItem) {
        try {
          await store.saveReviewItem({
            userScope,
            itemType: 'pronunciation_practice',
            content: `Repeat: ${targetPhrase}`,
            sourceStatus: 'stt_based_practice',
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });

          logger.info('[norwegian-pronunciation] review item created', { userScope, grade });
        } catch (error) {
          logger.warn('[norwegian-pronunciation] Failed to create review item', { error: error.message });
        }
      }

      await store.updatePronunciationSession(userScope, {
        attemptCount: session.attempt_count + 1,
      });
    } catch (error) {
      logger.warn('[norwegian-pronunciation] Failed to save attempt', {
        error: error.message,
      });
    }

    await message.reply({
      content: feedbackMessage,
    });

    return {
      success: true,
      grade,
      transcript,
      confidence,
    };
  } catch (error) {
    logger.error('[norwegian-pronunciation] Error processing audio', {
      userScope,
      error: error.message,
    });

    await message.reply({
      content: `❌ ${error.message || 'Failed to process audio. Try again.'}`,
      flags: 'Ephemeral',
    });

    return null;
  }
}

module.exports = {
  processPronunciationAudio,
  SUPPORTED_AUDIO_TYPES,
};
