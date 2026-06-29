const test = require('node:test');
const assert = require('node:assert/strict');
const { renderCallPage } = require('./callRoutes');

test('/call/:companionId page contains mobile call controls and browser STT fallback', () => {
  const html = renderCallPage({ companionId: 'dante' });
  assert.match(html, /Start call/);
  assert.match(html, /Hands-free mode/);
  assert.match(html, /Push-to-talk mode/);
  assert.match(html, /SpeechRecognition/);
  assert.match(html, /Hands-free speech recognition is not available/);
  assert.match(html, /kokoro_web/);
});
