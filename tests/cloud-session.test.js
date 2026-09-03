const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldReloadCloudData,
  isStaleCloudResponse,
} = require('../js/cloud-session-core.js');

test('reloads cloud data when the logged-in account changes', () => {
  assert.equal(shouldReloadCloudData('user-b', 'user-a', 'user-a'), true);
  assert.equal(shouldReloadCloudData('user-a', 'user-a', 'user-a'), false);
});

test('ignores cloud data that belongs to a previous account', () => {
  assert.equal(isStaleCloudResponse('user-a', 'user-b'), true);
  assert.equal(isStaleCloudResponse('user-b', 'user-b'), false);
});
