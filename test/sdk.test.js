// Unit tests against the CURRENT /api/v2 contract, mocked at the fetch layer -- no real server
// involved. Injects a custom `fetch` into the Justworx constructor (client.js already supports
// this via the `fetch` option) that returns canned responses matching the real contract shapes.
//
// openapi-fetch calls the injected fetch as `fetch(request, requestInitExt)` with `request` a
// real Fetch API `Request` — not a bare (url, init) tuple — so the mock below reads method/url/
// body off that Request object.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import { Justworx, JustworxError } from '../src/index.js';

const BASE = 'https://mock.test/api/v2';
const API_KEY = 'jwx_live_test_0123456789';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function notFound(detail) {
  return json({ error: 'NOT_FOUND', detail }, 404);
}

/**
 * Minimal router over the handful of /api/v2 routes this SDK calls. Response shapes are taken
 * directly from openapi/v2.yaml's examples, not invented.
 */
async function mockFetch(request) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.replace(/^\/api\/v2/, '');
  const text = await request.text();
  const body = text ? JSON.parse(text) : undefined;

  if (method === 'GET' && path === '/me') {
    return json({
      accountId: 'acct_0001',
      authType: 'api_key',
      userId: null,
      scopes: ['devices:read', 'devices:command', 'devices:configure', 'devices:own', 'events:read'],
    });
  }

  if (method === 'GET' && path === '/devices') {
    if (!url.searchParams.get('cursor')) {
      return json({
        items: [{ serial: 'ABCD1234', name: 'Main Gate', online: true, lastSeenAt: '2026-08-13T09:41:58.000Z', access: 'owner' }],
        nextCursor: 'page2',
      });
    }
    return json({
      items: [{ serial: 'EFGH5678', name: 'Side Gate', online: false, lastSeenAt: null, access: 'owner' }],
      nextCursor: null,
    });
  }

  const deviceMatch = path.match(/^\/devices\/([^/]+)$/);
  if (method === 'GET' && deviceMatch) {
    const [, serial] = deviceMatch;
    if (serial === 'ZZZZ9999') return notFound('No such device.');
    return json({
      serial,
      name: 'Main Gate',
      online: true,
      lastSeenAt: '2026-08-13T09:41:58.000Z',
      access: 'owner',
      connection: 'cellular',
      network: { carrier: 'Vodacom', signal: -71 },
      location: null,
      ids: [{ idNumber: 10, type: 'digitalOutput', pin: 10, value: 'low', at: '2026-08-13T09:41:55.000Z' }],
      rules: [{ ruleNumber: 1, type: 'digital', enabled: true }],
      at: '2026-08-13T09:42:03.000Z',
    });
  }

  const valueMatch = path.match(/^\/devices\/([^/]+)\/ids\/(\d+)\/value$/);
  if (method === 'PUT' && valueMatch) {
    const [, serial, idNumber] = valueMatch;
    if (body.timeoutMs) {
      return json({ status: 'confirmed', serial, requestId: body.requestId ?? null, idNumber: Number(idNumber), value: body.value, at: '2026-08-13T09:42:03.000Z' });
    }
    return json({ status: 'sent', serial, requestId: body.requestId ?? null }, 202);
  }

  const timerMatch = path.match(/^\/devices\/([^/]+)\/ids\/(\d+)\/timer$/);
  if (method === 'POST' && timerMatch) {
    const [, serial, idNumber] = timerMatch;
    if (body.timeoutMs) {
      return json({
        status: 'confirmed', serial, requestId: body.requestId ?? null,
        idNumber: Number(idNumber), value: body.value, revertsInMs: body.durationMs, at: '2026-08-13T09:42:03.000Z',
      });
    }
    return json({ status: 'sent', serial, requestId: body.requestId ?? null }, 202);
  }
  if (method === 'DELETE' && timerMatch) {
    const [, serial, idNumber] = timerMatch;
    const b = body || {};
    if (b.timeoutMs) {
      return json({ status: 'confirmed', serial, requestId: b.requestId ?? null, idNumber: Number(idNumber), restoredTo: 'low', at: '2026-08-13T09:42:03.000Z' });
    }
    return json({ status: 'sent', serial, requestId: b.requestId ?? null }, 202);
  }

  const ruleMatch = path.match(/^\/devices\/([^/]+)\/rules\/(\d+)$/);
  if (method === 'PATCH' && ruleMatch) {
    const [, serial, ruleNumber] = ruleMatch;
    if (body.timeoutMs) {
      return json({ status: 'confirmed', serial, requestId: body.requestId ?? null, ruleNumber: Number(ruleNumber), enabled: body.enabled, at: '2026-08-13T09:42:03.000Z' });
    }
    return json({ status: 'sent', serial, requestId: body.requestId ?? null }, 202);
  }
  if (method === 'DELETE' && ruleMatch) {
    const [, serial, ruleNumber] = ruleMatch;
    return json({ status: 'sent', serial, ruleNumber: Number(ruleNumber), at: '2026-08-13T09:42:03.000Z' });
  }

  const rulesMatch = path.match(/^\/devices\/([^/]+)\/rules$/);
  if (method === 'GET' && rulesMatch) {
    return json({
      serial: rulesMatch[1],
      items: [{ ruleNumber: 1, type: 'digital', enabled: true }],
      at: '2026-08-13T09:42:03.000Z',
    });
  }
  if (method === 'POST' && rulesMatch) {
    const [, serial] = rulesMatch;
    return json({ status: 'sent', serial, requestId: body.requestId ?? null, ruleNumber: body.ruleNumber, type: body.type, result: 'ok', at: '2026-08-13T09:42:03.000Z' });
  }
  if (method === 'DELETE' && rulesMatch) {
    const [, serial] = rulesMatch;
    if (body?.confirm !== true) return json({ error: 'INVALID_FIELDS', detail: 'confirm: true is required' }, 400);
    return json({ status: 'sent', serial, requestId: body.requestId ?? null, cleared: 2, result: 'ok', at: '2026-08-13T09:42:03.000Z' });
  }

  const logMatch = path.match(/^\/devices\/([^/]+)\/log$/);
  if (method === 'GET' && logMatch) {
    return json({
      serial: logMatch[1],
      items: [{ at: '2026-08-13T09:41:57.000Z', kind: 'device', type: 'value_reported', category: 'state', idNumber: 10, value: 'low' }],
      nextCursor: null,
      at: '2026-08-13T09:42:03.000Z',
    });
  }

  return notFound(`no mock for ${method} ${path}`);
}

let jwx;
before(() => {
  jwx = new Justworx({ apiKey: API_KEY, baseUrl: BASE, fetch: mockFetch });
});

test('whoami', async () => {
  const me = await jwx.whoami();
  assert.equal(me.accountId, 'acct_0001');
  assert.equal(me.authType, 'api_key');
  assert.equal(me.userId, null);
  assert.equal(me.scopes.length, 5);
});

test('listDevices + devices() async iterator follows nextCursor', async () => {
  const page = await jwx.listDevices({ online: true });
  assert.equal(page.items[0].serial, 'ABCD1234');
  assert.equal(page.nextCursor, 'page2');

  const all = [];
  for await (const d of jwx.devices()) all.push(d.serial);
  assert.deepEqual(all, ['ABCD1234', 'EFGH5678']);
});

test('getDevice returns the twin; unknown serial -> JustworxError 404', async () => {
  const d = await jwx.getDevice('ABCD1234');
  assert.ok(Array.isArray(d.ids));
  assert.equal(d.ids[0].idNumber, 10);
  assert.equal(d.rules[0].ruleNumber, 1);

  await assert.rejects(
    () => jwx.getDevice('ZZZZ9999'),
    (err) => err instanceof JustworxError && err.status === 404 && err.code === 'NOT_FOUND',
  );
});

test('setIo: confirm -> 200 confirmed; omitted -> 202 sent', async () => {
  const confirmed = await jwx.setIo('ABCD1234', 10, 'high', { confirm: true });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.idNumber, 10);
  assert.equal(confirmed.value, 'high');

  const sent = await jwx.setIo('ABCD1234', 10, 'low');
  assert.equal(sent.status, 'sent');
});

test('pulseIo maps durationMs + revertState onto POST .../timer', async () => {
  const res = await jwx.pulseIo('ABCD1234', 10, 'high', 3000, { revertState: 'low', confirm: true });
  assert.equal(res.status, 'confirmed');
  assert.equal(res.revertsInMs, 3000);
});

test('cancelTimer maps onto DELETE .../timer', async () => {
  const res = await jwx.cancelTimer('ABCD1234', 10, { confirm: true });
  assert.equal(res.status, 'confirmed');
  assert.equal(res.restoredTo, 'low');
});

test('setRule maps onto PATCH .../rules/{ruleNumber}', async () => {
  const res = await jwx.setRule('ABCD1234', 1, false, { confirm: true });
  assert.equal(res.status, 'confirmed');
  assert.equal(res.ruleNumber, 1);
  assert.equal(res.enabled, false);
});

test('getDeviceLog', async () => {
  const log = await jwx.getDeviceLog('ABCD1234');
  assert.equal(log.serial, 'ABCD1234');
  assert.ok(log.items.length >= 1);
});

test('listRules maps onto GET .../rules', async () => {
  const res = await jwx.listRules('ABCD1234');
  assert.equal(res.serial, 'ABCD1234');
  assert.equal(res.items[0].ruleNumber, 1);
});

test('createRule posts the full rule body', async () => {
  const res = await jwx.createRule('ABCD1234', {
    ruleNumber: 12, type: 'digital',
    if: { id: 5, state: 'high' },
    then: { type: 'refreshId', idNumber: 14 },
  });
  assert.equal(res.status, 'sent');
  assert.equal(res.ruleNumber, 12);
  assert.equal(res.type, 'digital');
});

test('deleteRule maps onto DELETE .../rules/{ruleNumber}', async () => {
  const res = await jwx.deleteRule('ABCD1234', 12);
  assert.equal(res.status, 'sent');
  assert.equal(res.ruleNumber, 12);
});

test('clearRules refuses locally without confirm: true, never reaches the wire', async () => {
  await assert.rejects(() => jwx.clearRules('ABCD1234', {}), /confirm: true/);
});

test('clearRules with confirm: true deletes every rule', async () => {
  const res = await jwx.clearRules('ABCD1234', { confirm: true });
  assert.equal(res.status, 'sent');
  assert.equal(res.cleared, 2);
});

