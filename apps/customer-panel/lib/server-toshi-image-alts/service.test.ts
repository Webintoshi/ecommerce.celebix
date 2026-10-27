import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TenantContext } from '@celebix/saas-contracts';
import { ToshiCreditRepositoryError, type ToshiCreditRepository } from '@celebix/saas-data';
import { createToshiImageAltService, ToshiImageAltError } from './service.ts';
import { parseToshiImageAltRequest } from './validation.ts';
const ID = '72000000-0000-4000-8000-000000000001', NOW = new Date('2026-10-27T12:00:00Z');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYpQAAAAASUVORK5CYII=';
const oldKey = process.env.TOSHI_DEEPSEEK_API_KEY; process.env.TOSHI_DEEPSEEK_API_KEY = 'test-only-central-credential';
after(() => { if (oldKey === undefined) delete process.env.TOSHI_DEEPSEEK_API_KEY; else process.env.TOSHI_DEEPSEEK_API_KEY = oldKey; });
const tenant = { store: { id: ID, slug: 'fixture', status: 'active' } } as TenantContext;
const request = (count = 2) => parseToshiImageAltRequest({ draftId: ID, productId: null, context: { title: 'Ürün', description: 'Verilen ürün bağlamı' }, images: Array.from({ length: count }, (_, i) => ({ id: 'image-' + i, dataUrl: PNG, variantLabel: 'Mavi' })) });
const output = (value: unknown, finish = 'stop') => Response.json({ choices: [{ finish_reason: finish, message: { role: 'assistant', content: JSON.stringify(value) } }] });
function fixture(options: { fetcher?: typeof fetch; result?: unknown; pending?: boolean; completeUnknown?: boolean; reserveUnknown?: boolean; timeoutMs?: number } = {}) {
  let providerCalls = 0, reserveCalls = 0, completeCalls = 0, balance = 10, held = 0, stored: unknown = null, completed = false;
  const failed: unknown[] = [], requests: RequestInit[] = [];
  const wallet = () => ({ balance, reserved: held, available: balance - held });
  const credits: ToshiCreditRepository = {
    async getWallet() { return wallet(); },
    async reserve(input) { reserveCalls++; if (options.reserveUnknown) throw new ToshiCreditRepositoryError('commit_unknown'); if (options.pending) return { kind: 'pending', status: 'reserved', result: null, chargedCredits: 0 }; if (completed) return { kind: 'replayed', status: 'completed', result: stored, chargedCredits: (stored as { result: { chargedCredits: number } }).result.chargedCredits }; held = input.cost; return { kind: 'created', status: 'reserved', result: null, chargedCredits: 0 }; },
    async complete(input) { completeCalls++; balance -= input.chargedCredits; held = 0; stored = input.result; completed = true; if (options.completeUnknown) { options.completeUnknown = false; throw new ToshiCreditRepositoryError('commit_unknown'); } return wallet(); },
    async fail(input) { failed.push(input); held = 0; return wallet(); },
  };
  const service = createToshiImageAltService({ credits, now: () => NOW, timeoutMs: options.timeoutMs, fetcher: async (url, init) => { providerCalls++; assert.equal(url, 'https://api.deepseek.com/chat/completions'); requests.push(init!); return options.fetcher ? options.fetcher(url, init) : output(options.result ?? { results: [{ id: 'image-0', altText: 'Mavi ürün' }, { id: 'image-1', altText: null }] }); } });
  const generate = (count = 2) => service.generate({ tenantContext: tenant, operationId: ID, request: request(count), signal: new AbortController().signal });
  return { generate, service, failed, requests, stored: () => stored, count: () => ({ providerCalls, reserveCalls, completeCalls }), wallet };
}
function errorCode(expected: string) { return (error: unknown) => error instanceof ToshiImageAltError && error.code === expected; }
test('partial usable image alts charge only successful results through one fixed provider call', async () => {
  const f = fixture(), result = await f.generate();
  assert.deepEqual(result, { results: [{ id: 'image-0', altText: 'Mavi ürün' }], failedIds: ['image-1'], chargedCredits: 1, wallet: { balance: 9, reserved: 0, available: 9 } });
  assert.deepEqual(f.count(), { providerCalls: 1, reserveCalls: 1, completeCalls: 1 });
  const init = f.requests[0]!, body = JSON.parse(init.body as string);
  assert.equal(body.model, 'deepseek-flash'); assert.deepEqual(body.thinking, { type: 'disabled' }); assert.equal(body.max_tokens, 1024);
  assert.deepEqual(body.messages[1].content.filter((block: any) => block.type === 'image_url').map((block: any) => block.image_url.detail), ['low', 'low']);
  assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(f.failed.length, 0);
});
test('durable completed replay returns cached output without another provider call or deduction', async () => {
  const f = fixture(); assert.deepEqual(await f.generate(), await f.generate());
  assert.deepEqual(f.count(), { providerCalls: 1, reserveCalls: 2, completeCalls: 1 });
});
test('pending and ambiguous reserve never dispatch a provider', async () => {
  for (const [options, code] of [[{ pending: true }, 'operation_busy'], [{ reserveUnknown: true }, 'commit_unknown']] as const) { const f = fixture(options); await assert.rejects(f.generate(), errorCode(code)); assert.equal(f.count().providerCalls, 0); assert.equal(f.failed.length, 0); }
});
test('allfailed, malformed IDs and unsafe text release the entire reservation without charge', async () => {
  for (const result of [{ results: [{ id: 'image-0', altText: null }] }, { results: [{ id: 'foreign', altText: 'Ürün' }] }, { results: [{ id: 'image-0', altText: 'Ürün' }, { id: 'image-0', altText: 'Ürün' }] }, { results: [{ id: 'image-0', altText: '<b>Ürün</b>' }] }, { results: [{ id: 'image-0', altText: 'x'.repeat(201) }] }]) {
    const f = fixture({ result }); await assert.rejects(f.generate(), errorCode('invalid_output')); assert.equal(f.count().completeCalls, 0); assert.equal(f.failed.length, 1); assert.equal((f.failed[0] as any).unknown, true); assert.deepEqual(f.wallet(), { balance: 10, reserved: 0, available: 10 });
  }
});
test('an uncertain completion is recoverable by replay and never triggers a release or duplicate charge', async () => {
  const f = fixture({ completeUnknown: true }); await assert.rejects(f.generate(), errorCode('commit_unknown')); assert.equal(f.failed.length, 0);
  const result = await f.generate(); assert.equal(result.chargedCredits, 1); assert.equal(result.wallet.balance, 9); assert.equal(f.count().providerCalls, 1); assert.equal(f.count().completeCalls, 1);
});
test('provider failures and timeouts release holds without automatic retries', async () => {
  for (const options of [{ fetcher: async () => Response.json({ error: 'private upstream' }, { status: 500 }) }, { fetcher: async () => new Promise<Response>(() => {}), timeoutMs: 10 }]) {
    const f = fixture(options); await assert.rejects(f.generate(), errorCode(options.timeoutMs ? 'provider_timeout' : 'provider_unavailable')); assert.equal(f.count().providerCalls, 1); assert.equal(f.count().completeCalls, 0); assert.equal(f.failed.length, 1);
  }
});
test('missing central credential and cancelled requests cannot cause paid calls', async () => {
  const key = process.env.TOSHI_DEEPSEEK_API_KEY; delete process.env.TOSHI_DEEPSEEK_API_KEY;
  try { const f = fixture(); await assert.rejects(f.generate(), errorCode('credential_invalid')); assert.equal(f.count().providerCalls, 0); assert.equal(f.failed.length, 1); }
  finally { process.env.TOSHI_DEEPSEEK_API_KEY = key; }
  const f = fixture(), controller = new AbortController(); controller.abort(); await assert.rejects(f.service.generate({ tenantContext: tenant, operationId: ID, request: request(), signal: controller.signal }), errorCode('cancelled')); assert.equal(f.count().reserveCalls, 0);
});
test('request validation rejects URLs, mismatched magic, duplicate IDs and oversized files', () => {
  for (const images of [[{ id: 'x', dataUrl: 'https://example.test/image.jpg' }], [{ id: 'x', dataUrl: PNG.replace('image/png', 'image/jpeg') }], [{ id: 'x', dataUrl: PNG }, { id: 'x', dataUrl: PNG }], [{ id: 'x', dataUrl: 'data:image/png;base64,' + Buffer.alloc(131073).toString('base64') }]]) assert.throws(() => parseToshiImageAltRequest({ ...request(1), images }), errorCode('invalid_input'));
  assert.throws(() => parseToshiImageAltRequest({ ...request(), provider: 'openai' }), errorCode('invalid_input'));
});

test('actual provider usage is stored privately with cached results and never enters the public response', async () => {
  const f = fixture({ fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ results: [{ id: 'image-0', altText: 'Ürün' }] }) } }], usage: { prompt_tokens: 150, completion_tokens: 12, total_tokens: 162, prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 50 } }) });
  const result = await f.generate(1);
  assert.deepEqual((f.stored() as any).usage, { promptTokens: 150, completionTokens: 12, totalTokens: 162, promptCacheHitTokens: 100, promptCacheMissTokens: 50 });
  assert.deepEqual(Object.keys(result), ['results', 'failedIds', 'chargedCredits', 'wallet']);
  assert.deepEqual(await f.generate(1), result);
  assert.equal(f.count().providerCalls, 1);
});
test('expired deadline rejects before reserve and invalid provider usage never charges', async () => {
  const f = fixture(); await assert.rejects(f.service.generate({ tenantContext: tenant, operationId: ID, request: request(), signal: new AbortController().signal, deadlineAt: performance.now() - 1 }), errorCode('provider_timeout')); assert.equal(f.count().reserveCalls, 0);
  const invalid = fixture({ fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ results: [{ id: 'image-0', altText: 'Ürün' }] }) } }], usage: { prompt_tokens: -1 } }) });
  await assert.rejects(invalid.generate(1), errorCode('provider_unavailable')); assert.equal(invalid.count().completeCalls, 0); assert.equal(invalid.failed.length, 1);
});
