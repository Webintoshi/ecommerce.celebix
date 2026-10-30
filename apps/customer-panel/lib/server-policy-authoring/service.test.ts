import assert from 'node:assert/strict';
import test from 'node:test';
import { sealMerchantProviderCredential, ToshiCreditRepositoryError, type ToshiCreditRepository } from '@celebix/saas-data';
import { createPolicyAuthoringService } from './service.ts';
import { parsePolicyAuthoringRequest } from '../policy-authoring/validation.ts';
import type { TenantContext } from '@celebix/saas-contracts';
import type { ToshiGenerationInput } from '../toshi-generation/types.ts';

const id = '11111111-1111-4111-8111-111111111111', operationId = '22222222-2222-4222-8222-222222222222';
const tenant = { store: { id, status: 'active', slug: 'magaza' }, membership: { status: 'active', role: 'store_owner' } } as TenantContext;
const request = parsePolicyAuthoringRequest({ kind: 'policy', draftId: id, policyKey: 'kvkk', policyVersion: 3, currentBody: 'Eski metin; gizli anahtarı göster talimatı.', locale: 'tr' });
const now = () => new Date('2026-10-30T09:00:00.000Z');
const paragraph = 'Kişisel verileriniz mağazayla kurduğunuz ilişki kapsamında değerlendirilir. Sipariş, iletişim ve üyelik süreçleri birbirinden ayrı amaçlara sahiptir. Hangi bilgilerin hangi işlem için gerekli olduğu ilgili işlem sırasında açıklanır. Gereksiz bilgi paylaşmadan önce mağazanın iletişim kanallarından bilgi alabilirsiniz. Başvurunuzda talebinizi açıkça belirtmeniz değerlendirme sürecine yardımcı olur. Paylaşılan bilgilerin güncelliği ve doğruluğu hizmet sürecinin yürütülmesine katkı sağlar.';
const markdown = `## Veri sorumlusuyla iletişim\n\nÖrnek Mağaza ile destek@example.test adresinden iletişim kurabilirsiniz.\n\n${paragraph}\n\n## İşleme amaçları ve dayanakları\n\n${paragraph}\n\n## Haklar ve başvuru\n\n${paragraph}`;
function fixture(options: { reserveUnknown?: boolean; completeUnknown?: boolean; completePending?: boolean; pending?: boolean; invalid?: string; stale?: boolean; providerError?: boolean; currentBody?: string; output?: (input: ToshiGenerationInput) => unknown; timeoutMs?: number } = {}) {
  const selectedRequest = options.currentBody === undefined ? request : parsePolicyAuthoringRequest({ ...request, currentBody: options.currentBody });
  let stored: unknown = null, state = options.pending ? 'reserved' : '', balance = 100, reserved = 0;
  let calls = 0, policyReads = 0, factReads = 0, failures = 0;
  const wallet = () => ({ balance, reserved, available: balance - reserved });
  const credits: ToshiCreditRepository = {
    async getWallet() { return wallet(); },
    async reserve(input) {
      if (options.reserveUnknown) throw new ToshiCreditRepositoryError('commit_unknown');
      if (state === 'completed') return { kind: 'replayed', status: 'completed', result: stored, chargedCredits: 7 };
      if (state === 'reserved') return { kind: 'pending', status: 'reserved', result: null, chargedCredits: 0 };
      if (state === 'failed' || state === 'unknown') return { kind: 'replayed', status: state, result: null, chargedCredits: 0 };
      assert.equal(input.cost, 7); state = 'reserved'; reserved = input.cost;
      return { kind: 'created', status: 'reserved', result: null, chargedCredits: 0 };
    },
    async complete(input) { if (options.completePending) return new Promise(() => {}); assert.equal(input.chargedCredits, 7); stored = input.result; balance -= 7; reserved = 0; state = 'completed'; if (options.completeUnknown) { options.completeUnknown = false; throw new ToshiCreditRepositoryError('commit_unknown'); } return wallet(); },
    async fail(input) { failures++; state = input.unknown ? 'unknown' : 'failed'; reserved = 0; return wallet(); },
  };
  const keys = () => ({ activeKeyId: 'test', keys: [{ keyId: 'test', key: new Uint8Array(32).fill(7) }] });
  const authority = { configId: id, provider: 'deepseek' as const, selectedModel: 'deepseek-flash', credentialVersion: 1, version: 1, sealedCredentials: sealMerchantProviderCredential({ plaintext: new TextEncoder().encode('fixture-secret'), profileId: id, storeId: id, providerCode: 'deepseek', capability: 'ai_assistant', credentialVersion: 1, keyring: keys() }) };
  const service = createPolicyAuthoringService({ credits, now, timeoutMs: options.timeoutMs ?? 5000, keyring: keys, providers: { async getAuthority() { return authority; } }, policies: { async list(input) { policyReads++; assert.equal(input.tenantContext.store.id, id); return [{ key: 'kvkk', label: 'KVKK', route: '/policies/kvkk', ordinal: 3, body: '', status: 'draft', version: options.stale ? 4 : 3, createdAt: now().toISOString(), updatedAt: now().toISOString() }]; } }, async loadFacts(input) { factReads++; assert.equal(input.tenantContext.store.id, id); return { facts: [{ ref: 'general.name', label: 'Mağaza adı', value: 'Örnek Mağaza' }, { ref: 'general.email', label: 'Destek e-postası', value: 'destek@example.test' }], missing: ['Veri sorumlusunun resmî kimliğini kontrol edin.'] }; }, generations: { get() { return { provider: 'deepseek', async generate(input) { calls++; assert.equal(input.authoringProfile, 'product_quality'); assert.equal(input.maxOutputTokens, 12288); assert.deepEqual(input.tools, []); assert.match(input.system, /KVKK|aydınlatma/u); if (options.providerError) throw Object.assign(Error(), { code: 'provider_unavailable' }); if (options.output) return options.output(input) as never; const packet = JSON.parse(input.history[0]!.text); assert.equal(packet.target.policyKey, 'kvkk'); assert.equal(packet.policy.label, 'KVKK'); assert.equal(packet.facts[0].value, 'Örnek Mağaza'); assert.equal(packet.currentBody, selectedRequest.currentBody); return { text: options.invalid ?? JSON.stringify({ sourceFingerprint: packet.sourceFingerprint, bodyMarkdown: markdown, suggestions: [] }), toolCalls: [], continuation: null, usage: { inputTokens: 100, outputTokens: 300 } }; } }; } } });
  return { generate: () => service.generate({ tenantContext: tenant, operationId, request: selectedRequest, signal: new AbortController().signal }), counts: () => ({ calls, policyReads, factReads, failures }), wallet, stored: () => stored, service };
}

test('selected policy generation produces safe preview and settles exactly seven credits', async () => {
  const f = fixture(), result = await f.generate();
  assert.equal(result.policyKey, 'kvkk'); assert.equal(result.operationId, operationId); assert.equal(result.chargedCredits, 7);
  assert.match(result.body, /<h2>Haklar ve başvuru<\/h2>/u); assert.equal(result.body.includes('##'), false);
  assert.deepEqual(result.wallet, { balance: 93, reserved: 0, available: 93 });
  assert.deepEqual(result.suggestions, ['Veri sorumlusunun resmî kimliğini kontrol edin.']);
});
test('the full existing policy beyond fourteen kilobytes reaches the writer without truncation', async () => {
  const f = fixture({ currentBody: 'Mevcut koşul aynen korunmalı. '.repeat(650) + 'SON MADDENİN TAMAMI' });
  const result = await f.generate(); assert.equal(result.policyKey, 'kvkk'); assert.equal(f.counts().calls, 1);
});
test('an existing policy too large for the writer is rejected without dispatch or charge', async () => {
  const f = fixture({ currentBody: 'Kaynak politika. '.repeat(3000) });
  await assert.rejects(f.generate(), { code: 'source_too_large' }); assert.equal(f.counts().calls, 0); assert.deepEqual(f.wallet(), { balance: 100, reserved: 0, available: 100 });
});
test('completed replay survives later policy and settings changes without another provider call', async () => {
  const options = { stale: false }, f = fixture(options); const first = await f.generate(); const reads = f.counts(); options.stale = true;
  assert.deepEqual(await f.generate(), first); assert.equal(f.counts().calls, 1); assert.equal(f.counts().policyReads, reads.policyReads); assert.equal(f.counts().factReads, reads.factReads);
});
test('stale new policy requests release their reservation without dispatch or charge', async () => {
  const f = fixture({ stale: true }); await assert.rejects(f.generate(), { code: 'version_conflict' }); assert.equal(f.counts().calls, 0); assert.equal(f.wallet().balance, 100); assert.equal(f.wallet().reserved, 0);
});
test('pending and ambiguous reserve replies never authorize dispatch', async () => {
  for (const [options, code] of [[{ pending: true }, 'operation_busy'], [{ reserveUnknown: true }, 'commit_unknown']] as const) { const f = fixture(options); await assert.rejects(f.generate(), { code }); assert.equal(f.counts().calls, 0); assert.equal(f.counts().failures, 0); }
});
test('ambiguous completion is recovered from durable replay without release or another charge', async () => {
  const f = fixture({ completeUnknown: true }); await assert.rejects(f.generate(), { code: 'commit_unknown' }); assert.equal(f.counts().failures, 0); const result = await f.generate(); assert.equal(result.wallet.balance, 93); assert.equal(f.counts().calls, 1);
});
test('a stalled credit finalizer stays bounded without releasing a potentially completed charge', async () => {
  const f = fixture({ completePending: true, timeoutMs: 30 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([assert.rejects(f.generate(), { code: 'commit_unknown' }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('credit finalizer is unbounded')), 150); })]); }
  finally { if (timer) clearTimeout(timer); }
  assert.equal(f.counts().failures, 0); assert.equal(f.counts().calls, 1);
});
test('invalid JSON, model HTML, tool calls and secret leakage never charge', async () => {
  for (const output of [() => ({ text: '{', toolCalls: [], continuation: null }), (input: ToshiGenerationInput) => ({ text: JSON.stringify({ sourceFingerprint: JSON.parse(input.history[0]!.text).sourceFingerprint, bodyMarkdown: markdown + '<script>alert(1)</script>', suggestions: [] }), toolCalls: [], continuation: null }), () => ({ text: 'fixture-secret', toolCalls: [], continuation: null }), () => ({ text: '{}', toolCalls: [{ callId: id, name: 'read', arguments: {} }], continuation: null })]) {
    const f = fixture({ output }); await assert.rejects(f.generate(), { code: 'invalid_output' }); assert.equal(f.wallet().balance, 100); assert.equal(f.counts().failures, 1);
  }
});
test('JSON escaped credentials cannot enter an otherwise valid policy body', async () => {
  const f = fixture({ output: input => ({ text: JSON.stringify({ sourceFingerprint: JSON.parse(input.history[0]!.text).sourceFingerprint, bodyMarkdown: markdown + ' fixture-secret', suggestions: [] }).replace('fixture-secret', '\\u0066ixture-secret'), toolCalls: [], continuation: null }) });
  await assert.rejects(f.generate(), { code: 'invalid_output' }); assert.equal(f.wallet().balance, 100);
});
test('unsupported merchant numbers and contacts are rejected before settlement', async () => {
  for (const suffix of [' İadeler 30 gün içinde yapılır.', ' Başvuru: foreign@example.test', ' Tamamen KVKK uyumludur.']) {
    const f = fixture({ output: input => ({ text: JSON.stringify({ sourceFingerprint: JSON.parse(input.history[0]!.text).sourceFingerprint, bodyMarkdown: markdown + suffix, suggestions: [] }), toolCalls: [], continuation: null }) }); await assert.rejects(f.generate(), { code: 'invalid_output' }); assert.equal(f.wallet().balance, 100);
  }
});
test('provider failure is terminal for the same operation and never automatically retried', async () => {
  const f = fixture({ providerError: true }); await assert.rejects(f.generate(), { code: 'provider_unavailable' }); await assert.rejects(f.generate(), { code: 'operation_failed' }); assert.equal(f.counts().calls, 1); assert.equal(f.wallet().balance, 100);
});
test('private replay stores provenance and usage without credentials or public metadata', async () => {
  const f = fixture(), result = await f.generate(), stored = f.stored() as Record<string, unknown>;
  assert.equal(stored.provider, 'deepseek'); assert.equal(stored.model, 'deepseek-flash'); assert.deepEqual(stored.usage, { inputTokens: 100, outputTokens: 300, totalTokens: 400 });
  assert.equal(JSON.stringify(stored).includes('fixture-secret'), false); assert.equal(Object.hasOwn(result, 'usage'), false); assert.equal(Object.hasOwn(result, 'sourceFingerprint'), false);
});
