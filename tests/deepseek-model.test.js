const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_DEEPSEEK_MODEL,
  getDeepSeekModelOptions,
  normalizeDeepSeekModel,
  buildDeepSeekChatRequest,
} = require('../js/deepseek-model-core.js');

test('exposes the chat, Flash, Pro, and Vision model IDs, defaulting to chat', () => {
  assert.deepEqual(
    getDeepSeekModelOptions().map((model) => model.id),
    ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'],
  );
  assert.equal(DEFAULT_DEEPSEEK_MODEL, 'deepseek-chat');
  assert.equal(getDeepSeekModelOptions().find((model) => model.id.endsWith('vision-exp')).supportsVision, true);
});

test('preserves supported model IDs and maps unknown/empty to the default', () => {
  assert.equal(normalizeDeepSeekModel('deepseek-chat'), 'deepseek-chat');
  assert.equal(normalizeDeepSeekModel('deepseek-v4-pro'), 'deepseek-v4-pro');
  assert.equal(normalizeDeepSeekModel('unknown-model'), DEFAULT_DEEPSEEK_MODEL);
  assert.equal(normalizeDeepSeekModel(''), DEFAULT_DEEPSEEK_MODEL);
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
