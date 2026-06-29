const test = require('node:test');
const assert = require('node:assert/strict');
const { getCachedOpenRouterModelToolSupport, clearModelCapabilitiesCache, rememberOpenRouterModelToolSupport } = require('./modelValidation');

test('l3.1-euryale is a known no-tools model', () => {
  clearModelCapabilitiesCache();
  const support = getCachedOpenRouterModelToolSupport({ config: { llm: { provider: 'openrouter' } }, model: 'sao10k/l3.1-euryale-70b' });
  assert.equal(support.checked, true);
  assert.equal(support.supportsTools, false);
});

test('rocinante can be remembered as no-tools when OpenRouter reports no function calling', () => {
  clearModelCapabilitiesCache();
  rememberOpenRouterModelToolSupport({ config: { llm: { provider: 'openrouter' } }, model: 'thedrummer/rocinante-12b', supportsTools: false });
  const support = getCachedOpenRouterModelToolSupport({ config: { llm: { provider: 'openrouter' } }, model: 'thedrummer/rocinante-12b' });
  assert.equal(support.checked, true);
  assert.equal(support.supportsTools, false);
});
