'use strict';

function requiredEnv(env, name) {
  const value = env[name] && String(env[name]).trim();
  if (!value) throw new Error(`missing required environment variable: ${name}`);
  return value;
}

function buildRequest(target, env) {
  env = env || process.env;

  if (target === 'supabase') {
    const baseUrl = requiredEnv(env, 'SUPABASE_URL').replace(/\/+$/, '');
    const anonKey = requiredEnv(env, 'SUPABASE_ANON_KEY');
    return {
      url: `${baseUrl}/rest/v1/user_settings?select=user_id&limit=1`,
      options: {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
    };
  }

  if (target === 'render') {
    return {
      url: requiredEnv(env, 'RENDER_HEALTH_URL'),
      options: { headers: { Accept: 'application/json' } },
    };
  }

  throw new Error(`unknown keepalive target: ${target}`);
}

async function ping(target, fetchImpl, env) {
  fetchImpl = fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('global fetch is unavailable');

  const request = buildRequest(target, env);
  const response = await fetchImpl(request.url, request.options);
  if (!response || !response.ok) {
    let detail = '';
    if (response && typeof response.text === 'function') {
      detail = (await response.text()).trim().replace(/\s+/g, ' ').slice(0, 200);
    }
    throw new Error(`${target} keepalive failed: HTTP ${response ? response.status : 'unknown'}${detail ? ` ${detail}` : ''}`);
  }
  return { target, status: response.status };
}

if (require.main === module) {
  const target = process.argv[2];
  ping(target)
    .then((result) => console.log(`[keepalive] ${result.target} responded with HTTP ${result.status}`))
    .catch((error) => {
      console.error(`[keepalive] ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { buildRequest, ping };
