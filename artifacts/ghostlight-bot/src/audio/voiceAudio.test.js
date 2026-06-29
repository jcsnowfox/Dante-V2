const test = require('node:test');
const assert = require('node:assert/strict');
const { generateVoiceAudio } = require('./voiceAudio');

test('Kokoro Web is called only for Dante text output and returns audio', async () => {
  let body;
  const result = await generateVoiceAudio({ text: 'Dante reply', companionId: 'dante', config: { ttsProvider: 'kokoro_web', kokoroApiUrl: 'https://kokoro.test/tts', kokoroVoice: 'am_michael', kokoroFormat: 'wav' }, fetchImpl: async (_url, init) => { body = JSON.parse(init.body); return { ok: true, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => Buffer.from('audio') }; } });
  assert.equal(body.text, 'Dante reply');
  assert.equal(result.ok, true);
  assert.equal(result.contentType, 'audio/wav');
});

test('missing Kokoro URL falls back to browser SpeechSynthesis contract', async () => {
  const result = await generateVoiceAudio({ text: 'Dante reply', config: { ttsProvider: 'kokoro_web', kokoroApiUrl: '' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'missing_kokoro_api_url');
  assert.equal(result.fallback, 'browser_speech_synthesis');
});
