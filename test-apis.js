const http = require('http');
const tests = [
  { path: '/api/health', method: 'GET', body: null, name: 'Health check' },
  { path: '/api/status', method: 'GET', body: null, name: 'Status' },
  { path: '/api/browse', method: 'GET', body: null, name: 'Browse' },
  { path: '/api/connections', method: 'GET', body: null, name: 'Connections' },
  { path: '/api/programs', method: 'GET', body: null, name: 'Programs' },
  { path: '/api/runs', method: 'GET', body: null, name: 'Runs' },
  { path: '/api/agents', method: 'GET', body: null, name: 'Agents' },
  { path: '/api/agents/knowledge', method: 'GET', body: null, name: 'Knowledge' },
  { path: '/api/keys', method: 'GET', body: null, name: 'Keys' },
  { path: '/api/env-vars', method: 'GET', body: null, name: 'Env vars' },
  { path: '/api/credits/balance', method: 'GET', body: null, name: 'Credits balance' },
  { path: '/api/entitlements', method: 'GET', body: null, name: 'Entitlements' },
  { path: '/api/workspaces', method: 'GET', body: null, name: 'Workspaces' },
  { path: '/api/approvals', method: 'GET', body: null, name: 'Approvals' },
  { path: '/api/notifications', method: 'GET', body: null, name: 'Notifications' },
  { path: '/api/sidebar-data', method: 'GET', body: null, name: 'Sidebar data' },
  { path: '/api/user/tokens', method: 'GET', body: null, name: 'User tokens' },
  { path: '/api/settings/account', method: 'GET', body: null, name: 'Settings account' },
  { path: '/api/billing/checkout', method: 'POST', body: JSON.stringify({ priceId: 'test' }), name: 'Billing checkout' },
  { path: '/api/billing/portal', method: 'POST', body: JSON.stringify({}), name: 'Billing portal' },
  { path: '/api/translate', method: 'POST', body: JSON.stringify({ text: 'hello', target: 'de' }), name: 'Translate' },
  { path: '/api/triggers/event', method: 'POST', body: JSON.stringify({}), name: 'Triggers event' },
  { path: '/api/webhooks/slack', method: 'POST', body: JSON.stringify({}), name: 'Webhook slack' },
  { path: '/api/webhooks/github', method: 'POST', body: JSON.stringify({}), name: 'Webhook github' },
  { path: '/api/internal/agent-tools', method: 'GET', body: null, name: 'Internal agent-tools' },
  { path: '/api/internal/credits', method: 'GET', body: null, name: 'Internal credits' },
];
const results = [];
let done = 0;
tests.forEach(t => {
  const req = http.request({ hostname: 'localhost', port: 3000, path: t.path, method: t.method, headers: { 'Content-Type': 'application/json', 'Content-Length': t.body ? Buffer.byteLength(t.body) : 0 } }, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { results.push({ name: t.name, status: res.statusCode, body: data.substring(0, 300) }); done++; if (done === tests.length) console.log(JSON.stringify(results, null, 2)); });
  });
  req.on('error', e => { results.push({ name: t.name, status: 0, error: e.message }); done++; if (done === tests.length) console.log(JSON.stringify(results, null, 2)); });
  if (t.body) req.write(t.body);
  req.end();
});
