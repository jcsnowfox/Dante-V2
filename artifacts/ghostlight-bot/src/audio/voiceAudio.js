async function generateVoiceAudio({ text, companionId = '', voice = '', config = {}, fetchImpl = globalThis.fetch, logger = console } = {}) {
  const provider = String(config.ttsProvider || process.env.TTS_PROVIDER || 'kokoro_web').trim();
  if (provider !== 'kokoro_web') return { ok: false, provider, fallback: 'browser_speech_synthesis', error: 'unsupported_tts_provider' };
  const apiUrl = String(config.kokoroApiUrl || process.env.KOKORO_API_URL || '').trim();
  const selectedVoice = String(voice || config.kokoroVoice || process.env.KOKORO_VOICE || '').trim();
  const format = String(config.kokoroFormat || process.env.KOKORO_FORMAT || 'wav').trim();
  if (!apiUrl) return { ok: false, provider, fallback: 'browser_speech_synthesis', error: 'missing_kokoro_api_url' };
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: `audio/${format},application/octet-stream` },
    body: JSON.stringify({ text: String(text || ''), voice: selectedVoice, format, companionId }),
  });
  if (!response.ok) {
    const error = `kokoro_http_${response.status}`;
    logger?.warn?.('[tts] Kokoro Web API failed', { error, companionId });
    return { ok: false, provider, fallback: 'browser_speech_synthesis', error };
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || `audio/${format}`;
  const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
  return { ok: true, provider, contentType, audioBase64, voice: selectedVoice, format };
}
module.exports = { generateVoiceAudio };
