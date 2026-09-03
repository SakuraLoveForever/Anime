const test = require('node:test');
const assert = require('node:assert/strict');

const { createBackendHealthMonitor } = require('../js/backend-health-core.js');

test('automatically retries backend checks until the backend is online', async () => {
  let attempts = 0;
  const states = [];
  const monitor = createBackendHealthMonitor({
    probe: async () => ++attempts >= 3,
    retryDelays: [0, 1, 1],
    onStatus: ({ state }) => states.push(state),
  });

  assert.equal(await monitor.start(), true);
  assert.equal(attempts, 3);
  assert.deepEqual(states, ['checking', 'offline', 'checking', 'offline', 'checking', 'online']);
});
