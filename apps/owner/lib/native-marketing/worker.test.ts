import assert from "node:assert/strict";
import test from "node:test";
import { NativeMarketingError, type NativeMarketingClaim, type NativeMarketingClaimBatch, type NativeMarketingWorkflowRepository, type SealNativeMarketingInput, type NativeMarketingLeaseInput, type NativeMarketingSendResult } from "@celebix/saas-data";
import { NATIVE_MARKETING_TEMPLATE_DEFAULTS } from "@celebix/saas-data/native-marketing-templates";
import { createNativeMarketingWorker, type NativeMarketingWorkerOptions } from "./worker.ts";
import { openNativeMarketingRequest, sealNativeMarketingRequest, type NativeMarketingProviderRequest } from "./seal.ts";
const STORE = "11111111-1111-4111-8111-111111111111", DELIVERY = "22222222-2222-4222-8222-222222222222", LEASE = "33333333-3333-4333-8333-333333333333", NOW = new Date("2026-10-18T10:00:00.000Z");
const keyring = { activeKeyId: "marketing_01", keys: { marketing_01: Buffer.alloc(32, 8) } };
function unsealed(): NativeMarketingClaim { return { kind: "unsealed", deliveryId: DELIVERY, storeId: STORE, attemptCount: 1, idempotencyKey: `native-marketing/v1/${DELIVERY}`, projection: { recipient: "customer@example.test", recipientName: "Ada", senderLabel: "Güzide", storeName: "Güzide", primaryColor: "#443322", storefrontOrigin: "https://shop.example.test", supportUrl: "https://shop.example.test/contact", template: NATIVE_MARKETING_TEMPLATE_DEFAULTS[0]!, recoveryNeeded: true, isTest: false, items: [] } }; }
class Repository implements NativeMarketingWorkflowRepository {
  readonly calls: string[] = []; readonly sealed: SealNativeMarketingInput[] = []; readonly finished: NativeMarketingSendResult[] = [];
  eligible = true; constructor(readonly items: readonly NativeMarketingClaim[]) {}
  async claim(): Promise<NativeMarketingClaimBatch> { this.calls.push("claim"); return this.items.length ? { kind: "claimed", leaseId: LEASE, items: this.items } : { kind: "empty" }; }
  async authorize(_input: NativeMarketingLeaseInput) { this.calls.push("authorize"); return this.eligible; }
  async seal(input: SealNativeMarketingInput) { this.calls.push("seal"); this.sealed.push(input); }
  async finish(input: NativeMarketingLeaseInput & { result: NativeMarketingSendResult }) { this.calls.push("finish"); this.finished.push(input.result); }
  async recordProviderEvent() { return "recorded" as const; } async unsubscribe() {}
}
function options(repository: Repository, send: NativeMarketingWorkerOptions["send"]): NativeMarketingWorkerOptions {
  let tokenIndex = 0;
  return { repository, keyring, deliveryMode: "live", senderEmail: "noreply@marketing.celebix.co", publicOrigin: "https://owner.saas-staging.celebix.net", postalAddress: "İstanbul, Türkiye", storeIds: [STORE], workerId: "marketing-1", now: () => NOW, token: () => (++tokenIndex === 1 ? "u" : "r").repeat(43), send };
}
test("first attempt persists encrypted immutable request and token digests before fresh dispatch authorization", async () => {
  const repository = new Repository([unsealed()]); let sent: NativeMarketingProviderRequest | undefined;
  const worker = createNativeMarketingWorker(options(repository, async (request, key) => { repository.calls.push("send"); sent = request; assert.equal(key, `native-marketing/v1/${DELIVERY}`); return { kind: "accepted", providerMessageId: DELIVERY }; }));
  assert.equal(await worker.runOnce(), "processed");
  assert.deepEqual(repository.calls, ["claim", "seal", "authorize", "send", "finish"]);
  const sealed = repository.sealed[0]!;
  assert.equal(sealed.unsubscribeTokenDigest.length, 64); assert.equal(sealed.recoveryTokenDigest?.length, 64);
  assert.equal(sealed.sealedRequest.includes(Buffer.from("customer@example.test")), false);
  assert.deepEqual(openNativeMarketingRequest({ version: "nm1", keyId: sealed.sealKeyId, bytes: sealed.sealedRequest, digest: sealed.requestDigest }, keyring, { storeId: STORE, deliveryId: DELIVERY }), sent);
  assert.ok(sent!.html.includes("/cart/recover#token=")); assert.equal(Object.hasOwn(sent!, "replyTo"), false);
});
test("unsubscribe/purchase invalidation immediately before first attempt prevents network send", async () => {
  const repository = new Repository([unsealed()]); repository.eligible = false; let sends = 0;
  await createNativeMarketingWorker(options(repository, async () => { sends++; return { kind: "accepted", providerMessageId: DELIVERY }; })).runOnce();
  assert.equal(sends, 0); assert.equal(repository.calls.includes("authorize"), true);
});
test("sealed retries reuse identical recipient/content/key yet reauthorize with fresh time", async () => {
  const first = new Repository([unsealed()]); let frozen!: NativeMarketingProviderRequest;
  await createNativeMarketingWorker(options(first, async request => { frozen = request; return { kind: "retryable", code: "provider_unavailable" }; })).runOnce();
  const seal = first.sealed[0]!;
  const retryClaim: NativeMarketingClaim = { kind: "sealed", storeId: STORE, deliveryId: DELIVERY, attemptCount: 2, idempotencyKey: `native-marketing/v1/${DELIVERY}`, firstAttemptAt: seal.firstAttemptAt.toISOString(), idempotencyExpiresAt: seal.idempotencyExpiresAt.toISOString(), sealKeyId: seal.sealKeyId, requestDigest: seal.requestDigest, sealedRequest: seal.sealedRequest.toString("base64") };
  const retry = new Repository([retryClaim]); retry.eligible = false;
  const changed = options(retry, async () => { throw new Error("must not send after unsubscribe"); });
  assert.equal(await createNativeMarketingWorker({ ...changed, senderEmail: "noreply@rotated.example.test", token: () => { throw Error("must not regenerate"); } }).runOnce(), "processed");
  assert.deepEqual(retry.calls, ["claim", "authorize"]);
  retry.eligible = true; let actual!: NativeMarketingProviderRequest;
  await createNativeMarketingWorker(options(retry, async request => { actual = request; return { kind: "accepted", providerMessageId: DELIVERY }; })).runOnce();
  assert.deepEqual(actual, frozen); assert.equal(retry.sealed.length, 0);
  const testRuntime = new Repository([retryClaim]); let testSends = 0;
  await createNativeMarketingWorker({ ...options(testRuntime, async () => { testSends++; return { kind: "accepted", providerMessageId: DELIVERY }; }), deliveryMode: "test", testRecipient: "qa@example.test" }).runOnce();
  assert.equal(testSends, 0); assert.equal(testRuntime.calls.includes("authorize"), false);
});
test("expired idempotency and exhausted retries become terminal without unsafe re-send", async () => {
  const first = new Repository([unsealed()]);
  await createNativeMarketingWorker(options(first, async () => ({ kind: "retryable", code: "provider_unavailable" }))).runOnce();
  const seal = first.sealed[0]!;
  const base = { kind: "sealed" as const, storeId: STORE, deliveryId: DELIVERY, attemptCount: 2, idempotencyKey: `native-marketing/v1/${DELIVERY}`, firstAttemptAt: seal.firstAttemptAt.toISOString(), idempotencyExpiresAt: NOW.toISOString(), sealKeyId: seal.sealKeyId, requestDigest: seal.requestDigest, sealedRequest: seal.sealedRequest.toString("base64") };
  const expired = new Repository([base]); let sends = 0;
  await createNativeMarketingWorker(options(expired, async () => { sends++; return { kind: "accepted", providerMessageId: DELIVERY }; })).runOnce();
  assert.equal(sends, 0); assert.equal(expired.finished[0]?.kind, "uncertain");
  const eighth = new Repository([{ ...unsealed(), attemptCount: 8 }]);
  await createNativeMarketingWorker(options(eighth, async () => ({ kind: "retryable", code: "provider_unavailable" }))).runOnce();
  assert.equal(eighth.finished[0]?.kind, "uncertain");
});
test("overlapping ticks do not duplicate claims and test mode never targets a customer", async () => {
  const base = unsealed(); assert.equal(base.kind, "unsealed");
  const repository = new Repository([{ ...base, projection: { ...base.projection, recipient: "qa@example.test", isTest: true } }]); let complete!: () => void; let recipient = "";
  const worker = createNativeMarketingWorker({ ...options(repository, async request => { recipient = request.to; await new Promise<void>(resolve => { complete = resolve; }); return { kind: "accepted", providerMessageId: DELIVERY }; }), deliveryMode: "test", testRecipient: "qa@example.test" });
  const first = worker.runOnce();
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  assert.equal(await worker.runOnce(), "empty"); complete(); await first;
  assert.equal(recipient, "qa@example.test"); assert.equal(repository.calls.filter(value => value === "claim").length, 1);
});
test("test mode cannot seal or dispatch a real recipient or a differently addressed test capability", async () => {
  const base = unsealed(); assert.equal(base.kind, "unsealed");
  for (const claim of [base, { ...base, projection: { ...base.projection, isTest: true } }]) {
    const repository = new Repository([claim]); let sends = 0;
    const worker = createNativeMarketingWorker({ ...options(repository, async () => { sends++; return { kind: "accepted", providerMessageId: DELIVERY }; }), deliveryMode: "test", testRecipient: "qa@example.test" });
    await worker.runOnce(); assert.equal(sends, 0); assert.equal(repository.sealed.length, 0);
  }
});
test("slow preparation or authorization cannot dispatch a request near lease expiry", async () => {
  for (const advanceAfterAuthorization of [false, true]) {
    const repository = new Repository([unsealed()]); let reads = 0, sends = 0;
    const worker = createNativeMarketingWorker({ ...options(repository, async () => { sends++; return { kind: "accepted", providerMessageId: DELIVERY }; }), now: () => new Date(NOW.getTime() + (++reads >= (advanceAfterAuthorization ? 4 : 3) ? 80_000 : 0)) });
    await worker.runOnce(); assert.equal(sends, 0);
    assert.equal(repository.calls.includes("authorize"), advanceAfterAuthorization);
  }
});
test("authorization delay cannot push an idempotent retry beyond the provider window", async () => {
  const initial = new Repository([unsealed()]);
  await createNativeMarketingWorker(options(initial, async () => ({ kind: "retryable", code: "provider_unavailable" }))).runOnce();
  const sealed = initial.sealed[0]!, expires = new Date(NOW.getTime() + 10_000);
  const repository = new Repository([{ kind: "sealed", deliveryId: DELIVERY, storeId: STORE, attemptCount: 2, idempotencyKey: `native-marketing/v1/${DELIVERY}`, sealKeyId: sealed.sealKeyId, sealedRequest: sealed.sealedRequest.toString("base64"), requestDigest: sealed.requestDigest, firstAttemptAt: new Date(expires.getTime() - 86_400_000).toISOString(), idempotencyExpiresAt: expires.toISOString() }]);
  let reads = 0, sends = 0;
  await createNativeMarketingWorker({ ...options(repository, async () => { sends++; return { kind: "accepted", providerMessageId: DELIVERY }; }), now: () => new Date(NOW.getTime() + (++reads >= 4 ? 6_000 : 0)) }).runOnce();
  assert.equal(sends, 0); assert.equal(repository.finished[0]?.kind, "uncertain");
});
test("daily quota rejection defers until the next UTC day without rapid repeated attempts", async () => {
  const repository = new Repository([unsealed()]);
  await createNativeMarketingWorker(options(repository, async () => ({ kind: "retryable", code: "provider_daily_quota_exceeded" }))).runOnce();
  const result = repository.finished[0]!;
  assert.equal(result.kind, "retryable");
  assert.equal(result.nextAttemptAt?.toISOString(), "2026-10-19T00:01:00.000Z");
});
test("a daily quota rejection that cannot fit the original window preserves the global pause signal", async () => {
  const initial = new Repository([unsealed()]);
  await createNativeMarketingWorker(options(initial, async () => ({ kind: "retryable", code: "provider_unavailable" }))).runOnce();
  const sealed = initial.sealed[0]!, expires = new Date(NOW.getTime() + 3_600_000);
  const repository = new Repository([{ kind: "sealed", deliveryId: DELIVERY, storeId: STORE, attemptCount: 2, idempotencyKey: `native-marketing/v1/${DELIVERY}`, sealKeyId: sealed.sealKeyId, sealedRequest: sealed.sealedRequest.toString("base64"), requestDigest: sealed.requestDigest, firstAttemptAt: new Date(expires.getTime() - 86_400_000).toISOString(), idempotencyExpiresAt: expires.toISOString() }]);
  await createNativeMarketingWorker(options(repository, async () => ({ kind: "retryable", code: "provider_daily_quota_exceeded" }))).runOnce();
  assert.deepEqual(repository.finished[0], { kind: "permanent", code: "provider_daily_quota_exceeded" });
});
test("a committed budget deferral before sealing stays queued without a terminal failure", async () => {
  class DeferredRepository extends Repository { async seal() { this.calls.push("seal_deferred"); throw new NativeMarketingError("delivery_deferred"); } }
  const repository = new DeferredRepository([unsealed()]); let sends = 0;
  assert.equal(await createNativeMarketingWorker(options(repository, async () => { sends++; return { kind: "accepted", providerMessageId: DELIVERY }; })).runOnce(), "processed");
  assert.equal(sends, 0); assert.equal(repository.finished.length, 0); assert.deepEqual(repository.calls, ["claim", "seal_deferred"]);
});
test('real V2 rendering seals before authorization and dispatches the identical responsive request on retry', async () => {
  const base = unsealed(); assert.equal(base.kind, 'unsealed');
  const claim: NativeMarketingClaim = { ...base, projection: { ...base.projection, recipient: 'qa@example.test', isTest: true, recoveryNeeded: false,
    template: { id: 'new_products', version: 1, subject: 'Blok testi', heading: 'Başlık', body: 'Gövde', buttonLabel: 'Keşfet', buttonPath: '/products', schemaVersion: 2, blocks: [
      { id: '44444444-4444-4444-8444-444444444444', type: 'products', productIds: [STORE], columns: 2 },
      { id: '55555555-5555-4555-8555-555555555555', type: 'button', label: 'Keşfet', path: '/products', color: '#292524', align: 'center' },
    ] }, items: [{ productId: STORE, productName: 'Kanonik ürün', url: 'https://shop.example.test/products/urun', quantity: 1, unitPriceCents: 12500, currency: 'TRY' }],
  } };
  const repository = new Repository([claim]); let sent!: NativeMarketingProviderRequest;
  const workerOptions = { ...options(repository, async (value, key) => { repository.calls.push('send'); sent = value; assert.equal(key, `native-marketing/v1/${DELIVERY}`); return { kind: 'retryable' as const, code: 'provider_unavailable' }; }), deliveryMode: 'test' as const, testRecipient: 'qa@example.test' };
  assert.equal(await createNativeMarketingWorker(workerOptions).runOnce(), 'processed');
  assert.deepEqual(repository.calls, ['claim', 'seal', 'authorize', 'send', 'finish']);
  assert.match(sent.html, /<style>@media only screen/u); assert.match(sent.html, /class="email-stack"/u); assert.match(sent.html, /Kanonik ürün/u);
  assert.equal(sent.to, 'qa@example.test'); assert.equal(sent.subject, '[TEST] Blok testi');
  const sealed = repository.sealed[0]!;
  assert.equal(sealed.recoveryTokenDigest, undefined);
  assert.deepEqual(openNativeMarketingRequest({ version: 'nm1', keyId: sealed.sealKeyId, bytes: sealed.sealedRequest, digest: sealed.requestDigest }, keyring, { storeId: STORE, deliveryId: DELIVERY }), sent);
  const retry = new Repository([{ kind: 'sealed', storeId: STORE, deliveryId: DELIVERY, attemptCount: 2, idempotencyKey: `native-marketing/v1/${DELIVERY}`, firstAttemptAt: sealed.firstAttemptAt.toISOString(), idempotencyExpiresAt: sealed.idempotencyExpiresAt.toISOString(), sealKeyId: sealed.sealKeyId, requestDigest: sealed.requestDigest, sealedRequest: sealed.sealedRequest.toString('base64') }]);
  let retried!: NativeMarketingProviderRequest;
  await createNativeMarketingWorker({ ...options(retry, async value => { retry.calls.push('send'); retried = value; return { kind: 'accepted', providerMessageId: DELIVERY }; }), deliveryMode: 'test', testRecipient: 'qa@example.test', token: () => { throw Error('retry must reuse frozen bytes'); } }).runOnce();
  assert.deepEqual(retry.calls, ['claim', 'authorize', 'send', 'finish']); assert.deepEqual(retried, sent); assert.equal(retry.sealed.length, 0);
});
