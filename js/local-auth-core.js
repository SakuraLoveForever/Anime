(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LocalAuthCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const USERS_KEY = 'anime_local_users';
  const SESSION_KEY = 'anime_local_session';
  const USER_PREFIX = 'offline_';
  const GUEST_ID = 'guest';
  const PBKDF2_ITERATIONS = 120000;

  function createAuthError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function parseJson(storage, key, fallback) {
    try {
      const value = storage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJson(storage, key, value) {
    storage.setItem(key, JSON.stringify(value));
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(value, 'base64'));
    }
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function normalizeUsername(username) {
    return String(username == null ? '' : username).trim().toLocaleLowerCase('en-US');
  }

  function validateUsername(username) {
    const trimmed = String(username == null ? '' : username).trim();
    const normalized = normalizeUsername(trimmed);
    if (!/^[\p{L}\p{N}_.-]{2,32}$/u.test(trimmed)) {
      throw createAuthError('INVALID_USERNAME', '用户名需要为 2-32 个字母、数字、下划线、短横线或点');
    }
    return { username: trimmed, normalizedUsername: normalized };
  }

  function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 6) {
      throw createAuthError('WEAK_PASSWORD', '密码至少需要 6 位');
    }
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      normalizedUsername: user.normalizedUsername,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  function constantTimeEqual(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left[index] ^ right[index];
    }
    return difference === 0;
  }

  function createLocalAuth(storage, cryptoApi, options) {
    const settings = options || {};
    const cryptoImpl = cryptoApi || (typeof crypto !== 'undefined' ? crypto : null);
    if (!storage || !cryptoImpl || !cryptoImpl.subtle || typeof cryptoImpl.getRandomValues !== 'function') {
      throw new Error('当前浏览器不支持 Web Crypto，无法启用本地账号');
    }

    const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    if (!textEncoder) {
      throw new Error('当前环境缺少 TextEncoder，无法启用本地账号');
    }

    const now = typeof settings.now === 'function' ? settings.now : () => new Date().toISOString();
    const idFactory = typeof settings.idFactory === 'function'
      ? settings.idFactory
      : () => {
        if (typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID();
        const random = new Uint8Array(12);
        cryptoImpl.getRandomValues(random);
        return `user-${bytesToBase64(random).replace(/[^a-zA-Z0-9]/g, '')}`;
      };

    function loadUsers() {
      const users = parseJson(storage, USERS_KEY, []);
      return Array.isArray(users) ? users : [];
    }

    function saveUsers(users) {
      saveJson(storage, USERS_KEY, users);
    }

    function sessionUser(users) {
      const session = parseJson(storage, SESSION_KEY, null);
      if (!session || !session.userId) return null;
      return users.find((user) => user.id === session.userId) || null;
    }

    async function derivePassword(password, salt) {
      const keyMaterial = await cryptoImpl.subtle.importKey(
        'raw',
        textEncoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );
      const bits = await cryptoImpl.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations: PBKDF2_ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );
      return new Uint8Array(bits);
    }

    function createSalt() {
      const salt = new Uint8Array(16);
      cryptoImpl.getRandomValues(salt);
      return salt;
    }

    function setSession(userId) {
      saveJson(storage, SESSION_KEY, { userId });
    }

    async function register(username, password) {
      const identity = validateUsername(username);
      validatePassword(password);
      const users = loadUsers();
      if (users.some((user) => user.normalizedUsername === identity.normalizedUsername)) {
        throw createAuthError('DUPLICATE_USERNAME', '用户名已存在');
      }

      const salt = createSalt();
      const passwordHash = await derivePassword(password, salt);
      const timestamp = now();
      const user = {
        id: String(idFactory()),
        username: identity.username,
        normalizedUsername: identity.normalizedUsername,
        passwordSalt: bytesToBase64(salt),
        passwordHash: bytesToBase64(passwordHash),
        createdAt: timestamp,
        lastLoginAt: timestamp
      };
      users.push(user);
      saveUsers(users);
      setSession(user.id);
      return publicUser(user);
    }

    async function login(username, password) {
      const normalizedUsername = normalizeUsername(username);
      const users = loadUsers();
      const user = users.find((candidate) => candidate.normalizedUsername === normalizedUsername);
      if (!user || typeof password !== 'string') {
        throw createAuthError('INVALID_CREDENTIALS', '用户名或密码错误');
      }

      let passwordHash;
      try {
        passwordHash = await derivePassword(password, base64ToBytes(user.passwordSalt));
      } catch (error) {
        throw createAuthError('INVALID_CREDENTIALS', '用户名或密码错误');
      }
      if (!constantTimeEqual(passwordHash, base64ToBytes(user.passwordHash))) {
        throw createAuthError('INVALID_CREDENTIALS', '用户名或密码错误');
      }

      user.lastLoginAt = now();
      saveUsers(users);
      setSession(user.id);
      return publicUser(user);
    }

    function logout() {
      storage.removeItem(SESSION_KEY);
    }

    function currentUser() {
      return publicUser(sessionUser(loadUsers()));
    }

    function hasUsers() {
      return loadUsers().length > 0;
    }

    return { register, login, logout, currentUser, hasUsers };
  }

  function createUserStorageKey(userId, baseKey) {
    const safeUserId = String(userId || GUEST_ID);
    return `${USER_PREFIX}${safeUserId}_${String(baseKey)}`;
  }

  return {
    USERS_KEY,
    SESSION_KEY,
    PBKDF2_ITERATIONS,
    createLocalAuth,
    createUserStorageKey,
    normalizeUsername
  };
});
