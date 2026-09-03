const test = require('node:test');
const assert = require('node:assert/strict');

const { createModalRequestGuard } = require('../js/modal-request-core.js');

test('ignores a search result after the add modal is closed and reopened', () => {
  const guard = createModalRequestGuard();
  guard.reset();
  const staleSearch = guard.begin('titleSearch', '葬送的芙莉莲');

  guard.reset();

  assert.equal(guard.isCurrent(staleSearch), false);
});

test('AI fill cancels the pending title search for the same modal', () => {
  const guard = createModalRequestGuard();
  guard.reset();
  const pendingSearch = guard.begin('titleSearch', '葬送的芙莉莲');

  guard.cancel('titleSearch');

  assert.equal(guard.isCurrent(pendingSearch), false);
});
