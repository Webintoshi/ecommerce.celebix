import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminLoginInvalidationInput } from '../../../../packages/saas-contracts/src/admin-login-security/types.ts';
import { createAdminLoginSupportResetHandler } from './support-reset.ts';

const issuer = 'https://identity.example.test/oidc';
const allowedOrigin = 'https://owner.example.test';
const operatorId = '70000000-0000-4000-8000-000000000001';
const operationId = '80000000-0000-4000-8000-000000000001';
const subject = 'merchant-stable-subject';
const reason = 'Customer lost access to their verified device.';
const body = { subject, reason };
function request(payload: unknown = body, headers: Record<string, string> = {}) {
  return new Request(`${allowedOrigin}/api/platform/admin-login-security/support-reset`, { method: 'POST', headers: { origin: allowedOrigin, 'content-type': 'application/json', 'idempotency-key': operationId, ...headers }, body: JSON.stringify(payload) });
}
function fixture(options: { operator?: unknown; authThrows?: boolean; outcome?: string; commitThrows?: boolean } = {}) {
  const calls: AdminLoginInvalidationInput[] = [];
  let operatorCalls = 0;
  const handler = createAdminLoginSupportResetHandler({ issuer, allowedOrigin, requireOperator: async () => {
    operatorCalls++;
    if (options.authThrows) throw new Error('private@example.test:private-auth-token');
    return (options.operator ?? { operatorId, totpVerified: true }) as { operatorId: string; totpVerified: true };
  }, invalidate: async input => { calls.push(input); if (options.commitThrows) throw new Error('admin_login_security_commit_unknown:private-phone'); return { outcome: options.outcome ?? 'invalidated', authority: null }; } });
  return { handler, calls, operatorCalls: () => operatorCalls };
}

test('authorized platform TOTP operator submits a fixed-issuer reason-recorded idempotent support reset', async () => {
  const f = fixture();
  assert.equal((await f.handler(request({ subject, reason: `  ${reason}  ` }))).status, 200);
  assert.equal((await f.handler(request({ subject, reason }))).status, 200);
  assert.deepEqual(f.calls, [{ issuer, subject, eventId: 'support:80000000-0000-4000-8000-000000000001', reason: 'support_reset', operatorId, supportReason: reason }, { issuer, subject, eventId: 'support:80000000-0000-4000-8000-000000000001', reason: 'support_reset', operatorId, supportReason: reason }]);
});

test('denied, merchant, AAL1 and malformed operator assurance cannot mutate', async () => {
  for (const operator of [{ operatorId, totpVerified: false }, { operatorId, totpVerified: 'true' }, { operatorId }, { operatorId: 'merchant', totpVerified: true }, []]) {
    const f = fixture({ operator });
    const response = await f.handler(request({ ...body, totpVerified: true }));
    assert.equal(response.status, 401);
    assert.equal(f.calls.length, 0);
    assert.equal(await response.text(), '');
  }
  const denied = fixture({ authThrows: true });
  assert.equal((await denied.handler(request())).status, 401);
  assert.equal(denied.calls.length, 0);
});

test('non-POST, absent or cross-origin requests are rejected before operator resolution', async () => {
  const f = fixture();
  const get = await f.handler(new Request(`${allowedOrigin}/reset`));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  for (const origin of ['', 'null', 'https://attacker.example.test', `${allowedOrigin}/`, `${allowedOrigin}, https://attacker.example.test`]) assert.equal((await f.handler(request(body, { origin }))).status, 403);
  const wrongAuthority = new Request('https://attacker.example.test/reset', { method: 'POST', headers: { origin: allowedOrigin }, body: JSON.stringify(body) });
  assert.equal((await f.handler(wrongAuthority)).status, 403);
  assert.equal(f.operatorCalls(), 0);
  assert.equal(f.calls.length, 0);
});

test('UUID idempotency key is required and body cannot choose issuer, operator or native reset reason', async () => {
  const f = fixture();
  for (const key of ['', 'unsafe-key', `${operationId}, ${operationId}`, '00000000-0000-0000-0000-000000000000']) assert.equal((await f.handler(request(body, { 'idempotency-key': key }))).status, 400);
  for (const payload of [null, [], {}, { ...body, issuer: 'https://attacker.example.test' }, { ...body, operatorId }, { ...body, eventId: 'browser-event' }, { ...body, totpVerified: true }]) assert.equal((await f.handler(request(payload))).status, 400);
  assert.equal(f.calls.length, 0);
});

test('subject and trimmed support reason have strict bounds', async () => {
  const f = fixture();
  for (const payload of [{ subject: '', reason }, { subject: 'x'.repeat(513), reason }, { subject: `${subject}\n`, reason }, { subject, reason: ' '.repeat(30) }, { subject, reason: 'x'.repeat(19) }, { subject, reason: 'x'.repeat(501) }, { subject, reason: `${reason}\u0000` }, { subject, reason: 20 }]) assert.equal((await f.handler(request(payload))).status, 400);
  for (const selected of ['x'.repeat(20), 'x'.repeat(500)]) assert.equal((await f.handler(request({ subject, reason: selected }))).status, 200);
  assert.equal(f.calls.length, 2);
});

test('JSON bytes are bounded to 4 KiB even with a forged content length', async () => {
  const f = fixture();
  assert.equal((await f.handler(request(body, { 'content-type': 'text/plain' }))).status, 400);
  assert.equal((await f.handler(request(body, { 'content-length': '4097' }))).status, 413);
  assert.equal((await f.handler(request(body, { 'content-length': 'bad' }))).status, 400);
  const oversized = request({ subject, reason: 'ü'.repeat(4096) }, { 'content-length': '1' });
  assert.equal((await f.handler(oversized)).status, 413);
  const malformed = new Request(`${allowedOrigin}/reset`, { method: 'POST', headers: { origin: allowedOrigin, 'content-type': 'application/json', 'idempotency-key': operationId }, body: '{' });
  assert.equal((await f.handler(malformed)).status, 400);
  assert.equal(f.calls.length, 0);
});

test('native retry, mismatch and unknown commits have safe outcomes without private response data', async () => {
  for (const [outcome, status] of [['operation_replayed', 200], ['operation_mismatch', 409], ['invalid_input', 400], ['not_found', 404], ['unexpected', 503]] as const) {
    const response = await fixture({ outcome }).handler(request());
    assert.equal(response.status, status);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await fixture({ commitThrows: true }).handler(request());
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '');
});
