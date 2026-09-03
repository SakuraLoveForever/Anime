const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_DEEPSEEK_MODEL,
  getDeepSeekModelOptions,
  normalizeDeepSeekModel,
  buildDeepSeekChatRequest,
} = require('../js/deepseek-model-core.js');

test('exposes the current official DeepSeek Flash, Pro, and Vision model IDs', () => {
  assert.deepEqual(
    getDeepSeekModelOptions().map((model) => model.id),
    ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'],
  );
  assert.equal(getDeepSeekModelOptions().find((model) => model.id.endsWith('vision-exp')).supportsVision, true);
});

test('normalizes unsupported and legacy model settings to the default model', () => {
  assert.equal(normalizeDeepSeekModel('deepseek-v4-pro'), 'deepseek-v4-pro');
  assert.equal(normalizeDeepSeekModel('deepseek-chat'), DEFAULT_DEEPSEEK_MODEL);
  assert.equal(normalizeDeepSeekModel('unknown-model'), DEFAULT_DEEPSEEK_MODEL);
});

test('builds an OpenAI-compatible request with the selected DeepSeek model', () => {
  const request = buildDeepSeekChatRequest({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0.3,
    maxTokens: 2000,
  });

  assert.deepEqual(request, {
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0.3,
    max_tokens: 2000,
  });
});
