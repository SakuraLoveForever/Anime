const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRequest, ping } = require('../scripts/keepalive.js');

test('builds a Supabase REST keepalive request with the anon key', () => {
  const request = buildRequest('supabase', {
    SUPABASE_URL: 'https://demo.supabase.co/',
    SUPABASE_ANON_KEY: 'anon-test-key',
  });

  assert.deepEqual(request, {
    url: 'https://demo.supabase.co/rest/v1/user_settings?select=user_id&limit=1',
    options: {
      headers: {
        apikey: 'anon-test-key',
        Authorization: 'Bearer anon-test-key',
      },
    },
  });
});

test('builds a Render health request from the configured public URL', () => {
  const request = buildRequest('render', {
    RENDER_HEALTH_URL: 'https://anime.example.com/health',
  });

  assert.deepEqual(request, {
    url: 'https://anime.example.com/health',
    options: { headers: { Accept: 'application/json' } },
  });
});

test('fails a keepalive when the target responds with a non-success status', async () => {
  await assert.rejects(
    ping('render', async () => ({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }), {
      RENDER_HEALTH_URL: 'https://anime.example.com/health',
    }),
    /render keepalive failed: HTTP 503 service unavailable/
  );
});
