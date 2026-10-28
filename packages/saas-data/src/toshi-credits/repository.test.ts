import assert from 'node:assert/strict';
import test from 'node:test';
import { parseToshiCreditWallet, TOSHI_CREDIT_OFFERS, TOSHI_CREDIT_PRICES, type TenantContext } from '@celebix/saas-contracts';
import { PostgresToshiCreditRepository } from './repository.ts';
import { ToshiCreditRepositoryError } from './errors.ts';
const ID = '33333333-3333-4333-8333-333333333333', ACTOR = '44444444-4444-4444-8444-444444444444', MEMBER = '55555555-5555-4555-8555-555555555555', PLAN = '66666666-6666-4666-8666-666666666666', OP = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-10-27T12:00:00.000Z'), FP = 'a'.repeat(64), WALLET = { balance: 10, reserved: 7, available: 3 };
const tenant = (): TenantContext => ({ schemaVersion: 1, requestId: 'request', principal: { id: ACTOR, issuer: 'https://identity.example.test/oidc', subject: 'merchant' }, store: { id: ID, slug: 'store', status: 'active' }, membership: { id: MEMBER, role: 'store_owner', status: 'active' }, entitlements: { schemaVersion: 1, planId: PLAN, planCode: 'starter', version: 2, status: 'active', features: ['catalog'], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: '2026-01-01T00:00:00.000Z' }, locale: 'tr-TR' } as TenantContext);
class Client {
  readonly calls: { text: string; values: unknown[] }[] = []; readonly releases: unknown[] = [];
  constructor(private readonly respond: (text: string, values: unknown[]) => Record<string, unknown>[]) {}
  async query(text: string, values: unknown[] = []) { this.calls.push({ text, values }); const rows = this.respond(text, values); return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] }; }
  release(value?: unknown) { this.releases.push(value); }
}
function setup(outcome: string, result: unknown, loseCommit = false) {
  const audits: string[] = [], client = new Client(text => { if (loseCommit && text === 'COMMIT') throw Error('private transport'); return text.includes('toshi_credit_command') ? [{ outcome, result_payload: result }] : []; });
  let connections = 0;
  const repository = new PostgresToshiCreditRepository({ pool: { async connect() { connections++; return client; } }, role: 'celebix_saas_app', timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 }, audit(event) { audits.push(event.type); } });
  return { repository, client, audits, connections: () => connections };
}
const authority = () => ({ tenantContext: tenant(), now: NOW });
const reserve = () => ({ ...authority(), operationId: OP, fingerprint: FP, cost: 7 });
function code(expected: string) { return (error: unknown) => error instanceof ToshiCreditRepositoryError && error.code === expected; }
test('fixed public credit offers and wallet invariants never allow negative available balance', () => {
  assert.deepEqual(TOSHI_CREDIT_PRICES, { description: 7, seoTitle: 1, seoDescription: 2, imageAlt: 1 });
  assert.deepEqual(TOSHI_CREDIT_OFFERS.map(o => [o.id, o.credits, o.netCents]), [['toshi-500', 500, 24900], ['toshi-2500', 2500, 99900], ['toshi-10000', 10000, 299900], ['toshi-50000', 50000, 1249900]]);
  assert.deepEqual(parseToshiCreditWallet(WALLET), WALLET);
  for (const value of [{ ...WALLET, available: -1 }, { ...WALLET, reserved: 11 }, { ...WALLET, balance: 1.5 }, { ...WALLET, secret: true }]) assert.throws(() => parseToshiCreditWallet(value));
});
test('reserve passes only trusted actor authority with exact operation fingerprint and cost', async () => {
  const value = { kind: 'created', status: 'reserved', result: null, chargedCredits: 0 }, s = setup('created', value);
  assert.deepEqual(await s.repository.reserve(reserve()), value);
  const call = s.client.calls.find(c => c.text.includes('toshi_credit_command'))!;
  assert.deepEqual(call.values.slice(0, 8), [ID, ACTOR, MEMBER, PLAN, 'starter', 2, NOW, 'reserve']);
  assert.deepEqual(JSON.parse(call.values[8] as string), { operationId: OP, fingerprint: FP, cost: 7 });
  assert.equal(s.client.calls[0]?.text, 'BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.equal(s.client.calls.at(-1)?.text, 'COMMIT');
});
test('pending reservations and terminal replay return explicit non-dispatch outcomes', async () => {
  for (const [kind, status, result, chargedCredits] of [['pending', 'reserved', null, 0], ['replayed', 'completed', { title: 'Stored result' }, 1], ['replayed', 'unknown', null, 0], ['replayed', 'failed', null, 0]] as const) {
    const value = { kind, status, result, chargedCredits }, s = setup(kind, value);
    assert.deepEqual(await s.repository.reserve(reserve()), value);
    assert.equal(s.client.calls.filter(c => c.text.includes('toshi_credit_command')).length, 1);
  }
});
test('partial usable results complete with their actual charge and fail releases through one command', async () => {
  const s = setup('completed', { balance: 9, reserved: 0, available: 9 });
  assert.deepEqual(await s.repository.complete({ ...authority(), operationId: OP, fingerprint: FP, result: { seoTitle: 'Product', description: null }, chargedCredits: 1 }), { balance: 9, reserved: 0, available: 9 });
  const payload = JSON.parse(s.client.calls.find(c => c.text.includes('toshi_credit_command'))!.values[8] as string);
  assert.equal(payload.chargedCredits, 1);
  const f = setup('unknown', { balance: 10, reserved: 0, available: 10 });
  assert.deepEqual(await f.repository.fail({ ...authority(), operationId: OP, fingerprint: FP, safeCode: 'provider_timeout', unknown: true }), { balance: 10, reserved: 0, available: 10 });
});
test('native denials preserve expiry maintenance and never retry', async () => {
  for (const outcome of ['insufficient_credits', 'operation_mismatch', 'operation_not_found', 'membership_denied']) {
    const s = setup(outcome, null); await assert.rejects(s.repository.reserve(reserve()), code(outcome));
    assert.equal(s.client.calls.at(-1)?.text, 'COMMIT');
    assert.equal(s.client.calls.filter(c => c.text.includes('toshi_credit_command')).length, 1);
  }
});
test('ambiguous reserve commit never authorizes a dispatch and emits a bounded audit', async () => {
  const s = setup('created', { kind: 'created', status: 'reserved', result: null, chargedCredits: 0 }, true);
  await assert.rejects(s.repository.reserve(reserve()), code('commit_unknown'));
  assert.deepEqual(s.client.releases, [true]); assert.deepEqual(s.audits, ['toshi_credit_commit_unknown']);
  assert.equal(s.client.calls.filter(c => c.text.includes('toshi_credit_command')).length, 1);
});
test('cost, forged authority fields, unsafe JSON and unbounded outputs fail before checkout', async () => {
  const s = setup('wallet', WALLET);
  for (const cost of [0, -1, 1001, 1.1]) await assert.rejects(s.repository.reserve({ ...reserve(), cost }), code('invalid_input'));
  await assert.rejects(s.repository.reserve({ ...reserve(), storeId: OP } as never), code('invalid_input'));
  await assert.rejects(s.repository.reserve({ ...reserve(), fingerprint: 'sha256:' + FP }), code('invalid_input'));
  let getterRan = false;
  const getter = Object.defineProperty({}, 'text', { enumerable: true, get() { getterRan = true; return 'bad'; } });
  for (const result of [getter, { text: 'x'.repeat(262144) }, { text: undefined }, { text: Number.NaN }, new Date(), null]) await assert.rejects(s.repository.complete({ ...authority(), operationId: OP, fingerprint: FP, result, chargedCredits: 1 }), code('invalid_input'));
  assert.equal(getterRan, false); assert.equal(s.connections(), 0);
});

test('malformed native results roll back without accepting a wallet', async () => {
  const s = setup('wallet', { balance: 5, reserved: 6, available: -1 });
  await assert.rejects(s.repository.getWallet(authority()), code('unavailable'));
  assert.equal(s.client.calls.at(-1)?.text, 'ROLLBACK');
});

test('late completion commits native expired-hold release before returning operation_failed', async () => {
  const s = setup('operation_failed', null);
  await assert.rejects(s.repository.complete({ ...authority(), operationId: OP, fingerprint: FP, result: { title: 'Late result' }, chargedCredits: 1 }), code('operation_failed'));
  assert.equal(s.client.calls.at(-1)?.text, 'COMMIT');
  assert.equal(s.client.calls.some(call => call.text === 'ROLLBACK'), false);
});
