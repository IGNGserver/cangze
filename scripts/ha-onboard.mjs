// CI 用：把一个全新的 Home Assistant 容器走完 onboarding，创建测试用 helper，并输出访问令牌。
//   node scripts/ha-onboard.mjs http://127.0.0.1:8123 >> "$GITHUB_ENV"
// 输出 CANGZE_REAL_HA_URL / CANGZE_REAL_HA_TOKEN 两行；令牌是 30 分钟的 access token，只用于这次 CI。
const base = (process.argv[2] ?? 'http://127.0.0.1:8123').replace(/\/$/, '');
const clientId = `${base}/`;

async function waitUntilUp() {
  for (let i = 0; i < 180; i++) {
    try {
      const res = await fetch(`${base}/api/onboarding`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Home Assistant did not come up within 3 minutes');
}

async function json(res, what) {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

await waitUntilUp();
const { auth_code: code } = await json(
  await fetch(`${base}/api/onboarding/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      name: 'Cangze CI',
      username: 'cangze-ci',
      password: `ci-${crypto.randomUUID()}`,
      language: 'en',
    }),
  }),
  'onboarding user',
);
const { access_token: token } = await json(
  await fetch(`${base}/auth/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId }),
  }),
  'token exchange',
);
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
await json(
  await fetch(`${base}/api/onboarding/core_config`, { method: 'POST', headers: auth, body: '{}' }),
  'core config',
);
await json(
  await fetch(`${base}/api/onboarding/analytics`, { method: 'POST', headers: auth, body: '{}' }),
  'analytics',
);

// A helper entity the integration tests can switch without any hardware.
await new Promise((resolve, reject) => {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/websocket`);
  const timer = setTimeout(() => reject(new Error('websocket setup timed out')), 30_000);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
    else if (msg.type === 'auth_ok')
      ws.send(
        JSON.stringify({ id: 1, type: 'input_boolean/create', name: 'Cangze CI', icon: 'mdi:test-tube' }),
      );
    else if (msg.type === 'auth_invalid') reject(new Error(msg.message));
    else if (msg.id === 1) {
      clearTimeout(timer);
      ws.close();
      if (msg.success) resolve();
      else reject(new Error(`input_boolean/create: ${JSON.stringify(msg.error)}`));
    }
  };
  ws.onerror = () => reject(new Error('websocket error'));
});

process.stdout.write(`CANGZE_REAL_HA_URL=${base}\nCANGZE_REAL_HA_TOKEN=${token}\n`);
