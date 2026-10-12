import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { AdminLoginInvalidationInput, AdminLoginSecurityResult } from '../../../../packages/saas-contracts/src/admin-login-security/types.ts';
import { createAdminLoginInvalidationWebhookHandler } from './webhook.ts';

const issuer = 'https://identity.example.test/oidc';
const signingSecret = 'local-only-logto-webhook-signing-key-123456';
const now = new Date('2026-10-12T10:00:00.000Z');
const subject = 'cuid1234stablemerchant';
const base = { hookId: 'hook1', event: 'PostResetPassword', createdAt: now.toISOString(), interactionEvent: 'ForgotPassword', userId: subject, user: { id: subject, primaryEmail: 'private@example.test', primaryPhone: 'private-phone' } };

// Contract checked against official request/secure-webhooks docs and installed
// Logto core libraries/hook/{index,utils}.ts + utils/sign.ts (read only).
// sendWebhook sends { ...payload, hookId } before generating its audit log ID;
// neither event ID nor issuer is delivered. ky retries reuse exact signed bytes.
// core routes/admin-user/basics.ts sends deleted user in data, while current
// docs describe data:null. Both select the same affected user, never hookId.

function request(payload: unknown = base, options: { raw?: string; signature?: string; headers?: Record<string, string> } = {}) {
  const raw = options.raw ?? JSON.stringify(payload);
  return new Request('https://owner.example.test/api/webhooks/logto/admin-login-security', { method: 'POST', headers: { 'content-type': 'application/json', 'logto-signature-sha-256': options.signature ?? createHmac('sha256', signingSecret).update(raw).digest('hex'), ...options.headers }, body: raw });
}
function fixture(outcome = 'invalidated') {
  const calls: AdminLoginInvalidationInput[] = [];
  const handler = createAdminLoginInvalidationWebhookHandler({ issuer, signingSecret, clock: () => now, invalidate: async input => { calls.push(input); return { outcome, authority: null }; } });
  return { handler, calls };
}

test('a real raw-body HMAC authorizes password reset and repeated delivery uses the same native event key', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].issuer, issuer);
  assert.equal(calls[0].subject, subject);
  assert.equal(calls[0].reason, 'password_reset');
  assert.match(calls[0].eventId, /^logto:[a-f0-9]{64}$/u);
  assert.notEqual(calls[0].eventId, subject);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['eventId', 'issuer', 'reason', 'subject']);
});

test('signature failure and body tampering never reach native invalidation', async () => {
  const { handler, calls } = fixture();
  const signed = createHmac('sha256', signingSecret).update(JSON.stringify(base)).digest('hex');
  for (const candidate of [request(base, { signature: '' }), request(base, { signature: 'a'.repeat(64) }), request(base, { signature: `sha256=${signed}` }), request(base, { signature: `${signed}, ${signed}` }), request(base, { raw: `${JSON.stringify(base)} `, signature: signed })]) {
    assert.equal((await handler(candidate)).status, 401);
  }
  assert.equal(calls.length, 0);
});

test('signed stale or future deliveries and issuer mismatch are rejected', async () => {
  const { handler, calls } = fixture();
  for (const createdAt of ['2026-10-05T09:59:59.999Z', '2026-10-12T10:05:00.001Z']) assert.equal((await handler(request({ ...base, createdAt }))).status, 401);
  assert.equal((await handler(request({ ...base, issuer: 'https://attacker.example.test' }))).status, 401);
  assert.equal(calls.length, 0);
});

test('past seven-day boundary accepts a committed retry while older signed deliveries expire', async () => {
  const calls: AdminLoginInvalidationInput[] = [];
  let receivedAt = now;
  const handler = createAdminLoginInvalidationWebhookHandler({ issuer, signingSecret, clock: () => receivedAt, invalidate: async input => { calls.push(input); return { outcome: 'operation_replayed', authority: null }; } });
  assert.equal((await handler(request())).status, 200);
  receivedAt = new Date('2026-10-19T10:00:00.000Z');
  assert.equal((await handler(request())).status, 200);
  receivedAt = new Date('2026-10-19T10:00:00.001Z');
  assert.equal((await handler(request())).status, 401);
  assert.equal(calls.length, 2);
  // Stock Logto retries reuse the signed timestamp. Seven days of delayed
  // deliveries remain usable; beyond that, explicit reconciliation is required.
});

test('an unchanged signed retry after six hours resolves an uncertain commit through the same native event ID', async () => {
  let receivedAt = now;
  const calls: AdminLoginInvalidationInput[] = [];
  const applied = new Set<string>();
  const handler = createAdminLoginInvalidationWebhookHandler({ issuer, signingSecret, clock: () => receivedAt, invalidate: async input => {
    calls.push(input);
    if (applied.has(input.eventId)) return { outcome: 'operation_replayed', authority: null };
    applied.add(input.eventId);
    throw new Error('admin_login_security_commit_unknown');
  } });
  assert.equal((await handler(request())).status, 503);
  receivedAt = new Date('2026-10-12T16:00:00.000Z');
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(applied.size, 1);
});

test('invalid calendar dates are malformed', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ ...base, createdAt: '2026-02-30T10:00:00.000Z' }))).status, 400);
  assert.equal(calls.length, 0);
});

test('clock failures return retryable 503', async () => {
  const brokenClock = createAdminLoginInvalidationWebhookHandler({ issuer, signingSecret, clock: () => { throw new Error('private-clock-error'); }, invalidate: async () => { assert.fail('clock failure must not invalidate'); } });
  assert.equal((await brokenClock(request())).status, 503);
});

test('UUID and maximum length opaque subjects are accepted without treating them as event IDs', async () => {
  for (const selected of ['12345678-1234-4123-8123-123456789abc', 'c'.repeat(512)]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request({ ...base, userId: selected, user: { id: selected } }))).status, 200);
    assert.equal(calls[0].subject, selected);
    assert.notEqual(calls[0].eventId, selected);
  }
});

test('User mutations select actual data.id or deleted params.userId and map native reasons', async () => {
  for (const [event, reason] of [['User.Data.Updated', 'identity_reset'], ['User.SuspensionStatus.Updated', 'suspension'], ['User.Deleted', 'deletion']] as const) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request({ hookId: 'hook1', event, createdAt: now.toISOString(), data: { id: subject }, params: { userId: subject }, path: `/users/${subject}` }))).status, 200);
    assert.equal(calls[0].subject, subject);
    assert.equal(calls[0].reason, reason);
  }
  const deleted = fixture();
  assert.equal((await deleted.handler(request({ hookId: 'hook1', event: 'User.Deleted', createdAt: now.toISOString(), data: null, params: { userId: subject } }))).status, 200);
  assert.equal(deleted.calls[0].subject, subject);
});

test('signed unrelated events are acknowledged without invalidation', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ hookId: 'hook1', event: 'Role.Data.Updated', createdAt: now.toISOString(), data: { id: 'role1' } }))).status, 200);
  assert.equal(calls.length, 0);
});

test('malformed payloads, absent subjects and contradictory subject context fail without invalidation', async () => {
  const { handler, calls } = fixture();
  const candidates = [null, [], {}, { ...base, createdAt: 'not-a-date' }, { ...base, userId: undefined, user: undefined }, { ...base, userId: 'x'.repeat(513) }, { ...base, user: { id: 'other-user' } }, { ...base, interactionEvent: 'SignIn' }, { ...base, params: { userId: 'other-user' } }, { ...base, path: '/users/other-user/password' }, { ...base, event: 'User.Data.Updated', userId: subject, user: { id: subject }, data: { id: 'other-user' } }];
  for (const payload of candidates) assert.equal((await handler(request(payload))).status, 400);
  assert.equal((await handler(request(base, { raw: '{' }))).status, 400);
  assert.equal(calls.length, 0);
});

test('only JSON POST is accepted and body bytes are capped before signature parsing', async () => {
  const { handler, calls } = fixture();
  const get = await handler(new Request('https://owner.example.test/webhook'));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal((await handler(request(base, { headers: { 'content-type': 'text/plain' } }))).status, 400);
  assert.equal((await handler(request(base, { raw: 'x'.repeat(65_537) }))).status, 413);
  assert.equal((await handler(request(base, { raw: 'ü'.repeat(32_769) }))).status, 413);
  assert.equal((await handler(request(base, { headers: { 'content-length': '65537' } }))).status, 413);
  assert.equal((await handler(request(base, { headers: { 'content-length': 'invalid' } }))).status, 400);
  assert.equal((await handler(request(base, { headers: { 'content-type': 'application/json; charset=utf-8' } }))).status, 200);
  assert.equal(calls.length, 1);
});

test('the exact byte limit is accepted while a stream exceeding a forged length is capped', async () => {
  const { handler, calls } = fixture();
  const empty = JSON.stringify({ ...base, padding: '' });
  const raw = JSON.stringify({ ...base, padding: 'a'.repeat(65_536 - Buffer.byteLength(empty)) });
  assert.equal(Buffer.byteLength(raw), 65_536);
  assert.equal((await handler(request(base, { raw }))).status, 200);
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(32_768)); controller.enqueue(new Uint8Array(32_769)); }, cancel() { canceled = true; } });
  const streamed = new Request('https://owner.example.test/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1' }, body: stream, duplex: 'half' } as RequestInit);
  assert.equal((await handler(streamed)).status, 413);
  assert.equal(canceled, true);
  assert.equal(calls.length, 1);
});

test('a signed invalid UTF-8 body cannot be changed by decoding replacement characters', async () => {
  const bytes = Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]);
  const { handler, calls } = fixture();
  const candidate = new Request('https://owner.example.test/webhook', { method: 'POST', body: bytes, headers: { 'content-type': 'application/json', 'logto-signature-sha-256': createHmac('sha256', signingSecret).update(bytes).digest('hex') } });
  assert.equal((await handler(candidate)).status, 400);
  assert.equal(calls.length, 0);
});

test('native replay and non-admin subject safely ack, uncertain commits retry with 503 and expose no private data', async () => {
  for (const [outcome, status] of [['operation_replayed', 200], ['not_found', 200], ['operation_mismatch', 400], ['invalid_input', 400], ['unknown', 503]] as const) assert.equal((await fixture(outcome).handler(request())).status, status);
  const handler = createAdminLoginInvalidationWebhookHandler({ issuer, signingSecret: new TextEncoder().encode(signingSecret), clock: () => now, invalidate: async (): Promise<AdminLoginSecurityResult> => { throw new Error(`admin_login_security_commit_unknown:${signingSecret}:private@example.test`); } });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
