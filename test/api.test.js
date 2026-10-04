// API tests: start the server on a free port and call the endpoints over HTTP.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
let server;

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, PORT: String(PORT) },
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('The server did not start');
});

after(() => server.kill());

const post = (url, body) =>
  fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('health check returns Hello World', async () => {
  const res = await fetch(BASE + '/');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), 'Hello World!');
});

test('creates an account and rejects a duplicate', async () => {
  const res = await post('/api/accounts', { user: 'alice', currency: '$', balance: 100 });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).balance, 100);
  assert.strictEqual((await post('/api/accounts', { user: 'alice', currency: '$' })).status, 409);
});

test('rejects an account without the required fields', async () => {
  assert.strictEqual((await post('/api/accounts', { user: 'bob' })).status, 400);
  assert.strictEqual((await post('/api/accounts', { user: 'bob', currency: '$', balance: 'abc' })).status, 400);
});

test('returns 404 for an unknown account', async () => {
  assert.strictEqual((await fetch(BASE + '/api/accounts/nobody')).status, 404);
});

test('adding and deleting a transaction updates the balance', async () => {
  await post('/api/accounts', { user: 'carol', currency: '$', balance: 50 });
  const res = await post('/api/accounts/carol/transactions', { date: '2026-10-05', object: 'Book', amount: -20 });
  assert.strictEqual(res.status, 201);
  const { id } = await res.json();
  assert.strictEqual((await (await fetch(BASE + '/api/accounts/carol')).json()).balance, 30);

  const del = await fetch(`${BASE}/api/accounts/carol/transactions/${id}`, { method: 'DELETE' });
  assert.strictEqual(del.status, 204);
  const account = await (await fetch(BASE + '/api/accounts/carol')).json();
  assert.strictEqual(account.transactions.length, 0);
  assert.strictEqual(account.balance, 50);
});

test('deletes an account', async () => {
  await post('/api/accounts', { user: 'dave', currency: '$' });
  assert.strictEqual((await fetch(BASE + '/api/accounts/dave', { method: 'DELETE' })).status, 204);
  assert.strictEqual((await fetch(BASE + '/api/accounts/dave')).status, 404);
});
