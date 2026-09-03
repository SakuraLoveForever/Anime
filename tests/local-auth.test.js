const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createLocalAuth, createUserStorageKey } = require('../js/local-auth-core.js');

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

function createTestAuth(storage, overrides = {}) {
  let id = 0;
  return createLocalAuth(storage, webcrypto, {
    idFactory: () => `user-${++id}`,
    now: () => '2026-09-03T00:00:00.000Z',
    ...overrides
  });
}

test('local auth registers and normalizes a username without exposing password data', async () => {
  const storage = new MemoryStorage();
  const auth = createTestAuth(storage, { idFactory: () => 'user-1' });

  const user = await auth.register(' Alice ', 'correct horse battery staple');

  assert.equal(user.id, 'user-1');
  assert.equal(user.username, 'Alice');
  assert.equal(user.normalizedUsername, 'alice');
  assert.equal(user.password, undefined);
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.passwordSalt, undefined);
  assert.deepEqual(auth.currentUser(), user);

  const usersJson = storage.getItem('anime_local_users');
  const sessionJson = storage.getItem('anime_local_session');
  assert.ok(usersJson);
  assert.ok(sessionJson);
  assert.equal(usersJson.includes('correct horse battery staple'), false);
  assert.equal(sessionJson.includes('correct horse battery staple'), false);
});

test('local auth rejects invalid and duplicate usernames', async () => {
  const storage = new MemoryStorage();
  const auth = createTestAuth(storage, { idFactory: () => 'user-1' });

  await assert.rejects(() => auth.register('A', '123456'), { code: 'INVALID_USERNAME' });
  await assert.rejects(() => auth.register('valid_user', '12345'), { code: 'WEAK_PASSWORD' });
  await auth.register('Alice', '123456');
  await assert.rejects(() => auth.register(' alice ', 'abcdef'), { code: 'DUPLICATE_USERNAME' });
});

test('local auth logs in with the right password and rejects the wrong password', async () => {
  const storage = new MemoryStorage();
  const auth = createTestAuth(storage, { idFactory: () => 'user-1' });
  await auth.register('Alice', 'correct horse battery staple');
  auth.logout();

  const user = await auth.login('ALICE', 'correct horse battery staple');
  assert.equal(user.id, 'user-1');
  assert.equal(auth.currentUser().username, 'Alice');
  auth.logout();
  assert.equal(auth.currentUser(), null);
  await assert.rejects(() => auth.login('alice', 'wrong password'), { code: 'INVALID_CREDENTIALS' });
});

test('local auth restores a saved session in a new instance', async () => {
  const storage = new MemoryStorage();
  const first = createTestAuth(storage, { idFactory: () => 'user-1' });
  await first.register('Alice', '123456');

  const second = createTestAuth(storage, { idFactory: () => 'user-2' });
  assert.equal(second.currentUser().id, 'user-1');
  assert.equal(second.hasUsers(), true);
  second.logout();
  assert.equal(second.currentUser(), null);
});

test('user storage keys isolate accounts and preserve the guest namespace', () => {
  assert.equal(createUserStorageKey('guest', 'anime_tracker_data'), 'offline_guest_anime_tracker_data');
  assert.equal(createUserStorageKey('user-1', 'anime_tracker_data'), 'offline_user-1_anime_tracker_data');
  assert.equal(createUserStorageKey('user-2', 'anime_tracker_data'), 'offline_user-2_anime_tracker_data');
  assert.notEqual(
    createUserStorageKey('user-1', 'anime_api_key'),
    createUserStorageKey('user-2', 'anime_api_key')
  );
});
