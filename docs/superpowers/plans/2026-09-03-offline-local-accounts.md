# 离线模式本地账号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让本地离线版在同一台电脑上支持注册、登录、退出和切换多个账号，并让每个账号的数据、设置和 API Key 互相隔离，同时保持已有 Supabase 在线模式不变。

**Architecture:** 在 Supabase 未配置时，由浏览器端新增的 LocalAuth 模块负责账号凭据和会话；密码只保存为 PBKDF2-SHA-256 派生哈希，不保存明文或 Base64 密码。index.html 通过当前本地用户 ID 为原有 localStorage 数据键加命名空间，未登录时使用 guest 空间；首次注册时可将旧 guest 数据迁移到新账号。服务端和 Supabase schema 不参与离线账号认证。

**Tech Stack:** 原生浏览器 JavaScript、Web Crypto API（PBKDF2/SHA-256）、localStorage、Node.js built-in node:test、现有 Express/Supabase 前端结构。

**Spec:** docs/superpowers/specs/2026-09-03-offline-local-accounts-design.md

## Global Constraints

- 本地账号只在当前浏览器和当前电脑有效，不承诺跨设备、跨浏览器或清除浏览器数据后恢复。
- Supabase URL 和 anon key 均存在时继续走现有在线认证；未配置时才启用本地认证。
- 不修改 server.js 的 Supabase 认证接口，不修改 supabase-schema.sql。
- 不把密码写入 localStorage、sessionStorage、cookie、URL 或“记住账号”字段；“记住账号”只保存用户名。
- 不覆盖已有账号空间或已有 guest 数据；迁移操作可重复执行且不会覆盖目标键。
- 所有新增行为必须先有自动化测试，再实现代码；完成前必须运行测试和本地启动验证。

## File Map

- js/local-auth-core.js — 与 DOM 无关的本地账号核心逻辑，提供可测试的注册、登录、会话和密码派生能力。
- js/local-auth.js — 浏览器适配层，使用当前页面的 localStorage 和 crypto 创建 window.LocalAuth。
- tests/local-auth.test.js — 使用 Node node:test 验证账号生命周期、密码校验、会话恢复、重复用户名和敏感字段保护。
- package.json — 增加 npm test 脚本。
- index.html — 接入离线认证、账号切换/退出、按用户隔离 localStorage、guest 数据迁移，以及在线/离线登录文案切换。
- README.md — 将离线账号的使用方式、限制和登录入口写进简化后的安装启动说明。

## Task 1: Add the test harness and define the local-auth contract

Files: package.json, tests/local-auth.test.js

- [x] Step 1: Write the failing tests. Add tests/local-auth.test.js with an in-memory Storage implementation and Node's Web Crypto implementation. The tests must exercise this public contract:

      const { createLocalAuth } = require('../js/local-auth-core.js');
      const auth = createLocalAuth(storage, webcrypto, {
        idFactory: () => 'user-1',
        now: () => '2026-09-03T00:00:00.000Z'
      });

      await auth.register('Alice', 'correct horse battery staple');
      await auth.login('alice', 'correct horse battery staple');
      auth.currentUser();
      auth.logout();

  Cover these assertions before creating the implementation: usernames are normalized case-insensitively; valid registration returns a user without a password/hash field; duplicate usernames reject with DUPLICATE_USERNAME; short/invalid credentials reject with INVALID_USERNAME or WEAK_PASSWORD; the right password logs in; the wrong password rejects with INVALID_CREDENTIALS; logout clears the session; a second createLocalAuth instance restores the saved session; and the stored users/session JSON contains no plaintext password.

- [x] Step 2: Add the test command. Add “test”: “node --test” to package.json without removing the existing start script or dependencies.

- [x] Step 3: Run the focused test and confirm RED. Run:

      node --test --test-name-pattern="local auth"

  It must fail because js/local-auth-core.js does not exist yet. If the test command fails for an unrelated package-install reason, fix only the test invocation/environment and preserve the existing dependency changes.

## Task 2: Implement the browser-independent local authentication core

Files: js/local-auth-core.js, tests/local-auth.test.js

- [x] Step 1: Implement the smallest passing core. Export createLocalAuth(storage, cryptoApi, options) using a CommonJS/browser-compatible wrapper so Node tests can require it and the browser adapter can access window.LocalAuthCore.

- [x] Step 2: Define storage records. Use the keys anime_local_users and anime_local_session. Store each account as { id, username, normalizedUsername, passwordSalt, passwordHash, createdAt, lastLoginAt }; store only { userId } in the session. Generate IDs with crypto.randomUUID() when available, otherwise use the injected idFactory or a cryptographically random fallback.

- [x] Step 3: Implement validation and password derivation. Trim usernames, normalize them with toLocaleLowerCase('en-US'), require 2–32 characters matching letters, numbers, _, -, ., and require passwords of at least 6 characters. Generate a 16-byte random salt and derive a 256-bit PBKDF2 key with SHA-256 and 120,000 iterations. Encode salt/hash as standard Base64 only as binary hash representation; never encode or store the original password.

- [x] Step 4: Implement lifecycle methods. Provide register, login, logout, currentUser, and hasUsers. register must reject duplicate normalized usernames and establish the new session; login must use constant-time byte comparison for the derived hash; currentUser must return the public user shape without salt/hash/password fields.

- [x] Step 5: Run the focused tests and confirm GREEN. Run:

      node --test --test-name-pattern="local auth"

  Then run the complete current test suite with npm test and keep the output as verification evidence.

## Task 3: Add the browser adapter and user-scoped storage helpers

Files: js/local-auth.js, index.html

- [x] Step 1: Write the failing integration tests/fixtures. Extend tests/local-auth.test.js with a user-scope fixture that models the storage keys used by the page and asserts that two user IDs produce distinct keys, while the guest key remains readable. The fixture must cover offline_guest_anime_tracker_data, offline_user-1_anime_tracker_data, offline_user-2_anime_tracker_data, and account-scoped settings such as anime_api_key.

- [x] Step 2: Add js/local-auth.js. Instantiate LocalAuthCore with window.localStorage and window.crypto, expose it as window.LocalAuth, and fail with a clear browser-console error if Web Crypto is unavailable. Add the script before the main inline application script and after any shared utility that it depends on.

- [x] Step 3: Centralize local data-key construction. In index.html, add helpers equivalent to localStorageKey(baseKey), readUserValue(baseKey), writeUserValue(baseKey, value), and removeUserValue(baseKey). Use offline_guest_ for an unauthenticated local session and offline_<userId>_ for a logged-in local account. Keep backend URL, cloud-mode preference, and other intentionally global configuration outside this namespace.

- [x] Step 4: Preserve existing guest data. Read the current legacy guest prefix offline_ + base key as a fallback when the new offline_guest_ key is absent. Do not delete the legacy value during this change; this makes the update safe for existing local deployments.

- [x] Step 5: Run tests and perform a static key audit. Run npm test. Search index.html for direct uses of the account-scoped keys (anime_tracker_data, folders, source list, search history, theme, compact mode, API key, provider, and API URL), and route each one through the new helper. Leave only global keys such as anime_backend_url, anime_cloud_mode, and the local-auth users/session keys as direct global storage access.

## Task 4: Connect offline registration, login, switching, logout, and migration to the UI

Files: index.html

- [x] Step 1: Add local auth state and mode branching. Track localUser separately from the existing Supabase user. Make isLoggedIn(), getAuthToken(), updateAuthUI(), and account display logic recognize either an online Supabase session or a local session. In offline mode, the login button must remain enabled instead of being disabled because Supabase is absent.

- [x] Step 2: Update the auth modal for both modes. Keep email validation for online mode. In offline mode, label the first field “用户名”, allow a username without @, show “注册/登录本地账号”, and validate the confirmation field only for registration. Preserve the current online registration/login behavior.

- [x] Step 3: Implement the local auth submit path. Call LocalAuth.register or LocalAuth.login based on the selected action. On success, update the visible account name, close the modal, load the new user's namespaced data, and refresh the source list and search history. Convert the core error codes into concise Chinese messages: duplicate username, invalid username, weak password, and wrong credentials.

- [x] Step 4: Implement account switching and logout. The switch-account action must sign out only the current local session, preserve all account data, reopen the local login modal, and allow another account to log in. Logout must clear only the active local session and reset the in-memory view to guest data; the online path continues to use Supabase sign-out and existing cloud cleanup behavior.

- [x] Step 5: Implement first-account guest migration. When a local account is registered for the first time and legacy/new guest data exists, show one confirmation prompt. If accepted, copy each non-empty guest dataset and each setting into the new user's keys only when the destination is empty; record a versioned migration marker so the same guest data is not offered repeatedly. If declined, keep guest data untouched. Never overwrite data belonging to an existing local account.

- [x] Step 6: Complete offline initialization. When Supabase configuration is missing, initialize/restore LocalAuth instead of waiting for a Supabase auth callback. Ensure a fresh page load displays guest data when logged out and the correct account data when a local session exists. refreshAfterAuthChange() must reload the active namespace rather than leaving the previous account's in-memory list visible.

- [x] Step 7: Run the page-level smoke test. Start the app with npm start, open http://localhost:3456/, and verify in one browser profile:

  1. offline login/register is enabled;
  2. registering Alice and adding a marker survives reload;
  3. registering/logging in Bob does not show Alice's marker;
  4. switching back to Alice restores Alice's marker;
  5. logout returns to guest state; and
  6. browser storage contains only password salts/hashes, never the entered password.

## Task 5: Simplify the user-facing documentation

Files: README.md

- [x] Step 1: Add the offline account path to the simple setup section. Explain that the recommended path is to run start.bat, then open http://localhost:3456/; no separate frontend build or Supabase project is required for offline use.

- [x] Step 2: Document local account usage and limits. State that users can register multiple accounts on the same computer/browser, switch accounts from the account menu, and that each account has isolated data and settings. Clearly state that these accounts are browser-local and are not cloud accounts; clearing browser storage, changing browser, or moving to another computer will not carry them over.

- [x] Step 3: Document the two auth modes and troubleshooting. Explain that configured Supabase uses online email accounts, while missing Supabase configuration uses local usernames. Keep the existing npm mirror/EALLOWREMOTE, port 3456, and ERR_CONNECTION_REFUSED troubleshooting concise and aligned with start.bat.

- [x] Step 4: Check documentation commands. Verify every command in the README matches the current package.json, start.bat, and server port, and that the new local-account explanation does not claim cross-device security or synchronization.

## Task 6: Final verification and handoff

Files: js/local-auth-core.js, js/local-auth.js, tests/local-auth.test.js, index.html, README.md, package.json

- [x] Step 1: Run automated verification. Execute:

      npm test
      node --check server.js

- [x] Step 2: Run the clean-start verification. In a temporary copy of the project, remove only its node_modules directory, run start.bat, wait for GET http://localhost:3456/health to return 200, and stop that temporary server after the check. Do not remove any user project directory or current working-tree data.

- [x] Step 3: Inspect the final diff. Run git diff --check and review git diff --stat plus the changed files. Confirm that no password, test fixture secret, or machine-specific path is committed.

- [x] Step 4: Report verification evidence. Summarize the implemented local-account behavior, the exact test/start commands run, the browser-local limitation, and any pre-existing unrelated working-tree changes separately from this feature.
