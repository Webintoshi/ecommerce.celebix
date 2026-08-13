import assert from "node:assert/strict";
import test from "node:test";

import {
  PostgresQuickOrderHostedPaymentRepository,
  QuickOrderHostedPaymentRepositoryError,
} from "./hosted-payment-repository.ts";

const STORE = "10000000-0000-4000-8000-000000000058";
const LINK = "20000000-0000-4000-8000-000000000058";
const SESSION = "30000000-0000-4000-8000-000000000058";
const METHOD = "40000000-0000-4000-8000-000000000058";
const PROFILE = "50000000-0000-4000-8000-000000000058";
const ATTEMPT = "60000000-0000-4000-8000-000000000058";
const NOW = new Date("2026-07-28T12:00:00.000Z");
const DIGEST = "a".repeat(64);
const CALLBACK = "b".repeat(64);
const EVIDENCE = `sha256:${"c".repeat(64)}`;

const envelope = () => ({
  algorithm: "A256GCM" as const,
  ciphertext: "AQ",
  iv: "AAAAAAAAAAAAAAAA",
  keyId: "identity.current",
  tag: "AAAAAAAAAAAAAAAAAAAAAA",
  version: 1 as const,
});

const authorityPayload = () => ({
  authorityDigest: DIGEST,
  storeId: STORE,
  linkId: LINK,
  redemptionSessionId: SESSION,
  paymentMethodId: METHOD,
  profileId: PROFILE,
  providerCode: "iyzico_iframe",
  environment: "test",
  executionAdapterVersion: 1,
  executionEvidenceDigest: EVIDENCE,
  credentialVersion: 2,
  orderReference: `qo:${LINK}`,
  amountMinor: 12_500,
  currency: "TRY",
  identityAuthority: "d".repeat(64),
  identityKeyId: "identity.current",
  sealedIdentity: envelope(),
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "+905551112233",
  customerAddress: "Ada Lovelace +905551112233 Test 1 Istanbul 34710 TR",
  city: "Istanbul",
  country: "TR",
  postalCode: "34710",
  basket: [{ reference: LINK, name: "Hosted", quantity: 1, unitAmountMinor: 12_500, itemType: "PHYSICAL" }],
});

const beginPayload = () => ({
  attemptId: ATTEMPT,
  storeId: STORE,
  paymentMethodId: METHOD,
  profileId: PROFILE,
  providerCode: "iyzico_iframe",
  environment: "test",
  executionAdapterVersion: 1,
  executionEvidenceDigest: EVIDENCE,
  credentialVersion: 2,
  amountMinor: 12_500,
  currency: "TRY",
  publicConfig: { environment: "test" },
  methodConfig: { environment: "test", locale: "tr", threeDSecure: "provider_managed", installmentMode: "all", maxInstallment: 0 },
  sealedCredentials: { ...envelope(), keyId: "provider.current" },
});

type Row = Record<string, unknown>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly answer: (text: string) => readonly Row[] | Error;
  constructor(answer: (text: string) => readonly Row[] | Error) { this.answer = answer; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const selected = this.answer(text);
    if (selected instanceof Error) throw selected;
    return { rows: [...selected], rowCount: selected.length, command: "SELECT", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool {
  private cursor = 0;
  readonly clients: Client[];
  constructor(clients: Client[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.cursor++];
    if (!client) throw new Error("pool exhausted");
    return client;
  }
}
const options = (pool: Pool, audits: string[] = []) => ({
  pool,
  role: "celebix_saas_workflow" as const,
  timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  audit: (event: Readonly<{ type: string }>) => { audits.push(event.type); },
});
const db = (functionName: string, outcome: string, payload: unknown) => new Client((text) =>
  text.includes(`saas.${functionName}`) ? [{ outcome, result_payload: payload }] : []);
const call = (client: Client, name: string) => {
  const selected = client.calls.find(({ text }) => text.includes(`saas.${name}`));
  assert.ok(selected);
  return selected;
};

test("authority is a strict DB-derived Iyzico checkout projection", async () => {
  const client = db("quick_order_hosted_payment_authority", "found", authorityPayload());
  const repository = new PostgresQuickOrderHostedPaymentRepository(options(new Pool([client])));
  const selected = await repository.getAuthority({ hostname: "shop.example.com", redemptionDigest: DIGEST, now: NOW });
  assert.equal(selected.kind, "found");
  if (selected.kind !== "found") assert.fail("missing authority");
  assert.deepEqual(call(client, "quick_order_hosted_payment_authority").values, ["shop.example.com", DIGEST, NOW]);
  assert.equal(selected.authority.providerCode, "iyzico_iframe");
  assert.equal(selected.authority.amountMinor, 12_500);
  assert.equal(Object.isFrozen(selected.authority.basket), true);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("authority preserves a legacy dispatch without exposing hosted facts", async () => {
  const client = db("quick_order_hosted_payment_authority", "legacy", null);
  const repository = new PostgresQuickOrderHostedPaymentRepository(options(new Pool([client])));
  assert.deepEqual(await repository.getAuthority({ hostname: "shop.example.com", redemptionDigest: DIGEST, now: NOW }), { kind: "legacy" });
});

test("begin calls only the host-bound specialized function and recovers exact commit ambiguity", async () => {
  const first = new Client((text) => {
    if (text.includes("saas.quick_order_hosted_payment_begin")) return [{ outcome: "created", result_payload: beginPayload() }];
    if (text === "COMMIT") return new Error("socket lost");
    return [];
  });
  const recovery = db("quick_order_hosted_payment_begin", "operation_replayed", beginPayload());
  const audits: string[] = [];
  const repository = new PostgresQuickOrderHostedPaymentRepository(options(new Pool([first, recovery]), audits));
  const result = await repository.begin({
    hostname: "shop.example.com",
    redemptionDigest: DIGEST,
    expectedAuthorityDigest: DIGEST,
    payment: {
      authority: { storeId: STORE, now: NOW }, operationId: ATTEMPT, fingerprint: DIGEST,
      paymentMethodId: METHOD, orderReference: `qo:${LINK}`, amountMinor: 12_500,
      currency: "TRY", callbackBindingDigest: CALLBACK,
    },
  });
  assert.equal(result.outcome, "replayed");
  assert.deepEqual(call(first, "quick_order_hosted_payment_begin").values, [
    "shop.example.com", DIGEST, ATTEMPT, DIGEST, CALLBACK, DIGEST, NOW,
  ]);
  assert.deepEqual(audits, ["quick_order_hosted_payment_commit_unknown"]);
});

test("durable cross-authority and stock failures are typed before provider I/O", async () => {
  for (const outcome of ["durable_authority_invalid", "attempt_in_progress", "stock_unavailable"] as const) {
    const client = db("quick_order_hosted_payment_begin", outcome, null);
    const repository = new PostgresQuickOrderHostedPaymentRepository(options(new Pool([client])));
    await assert.rejects(repository.begin({
      hostname: "shop.example.com", redemptionDigest: DIGEST, expectedAuthorityDigest: DIGEST,
      payment: { authority: { storeId: STORE, now: NOW }, operationId: ATTEMPT, fingerprint: DIGEST,
        paymentMethodId: METHOD, orderReference: `qo:${LINK}`, amountMinor: 12_500,
        currency: "TRY", callbackBindingDigest: CALLBACK },
    }), (error: unknown) => error instanceof QuickOrderHostedPaymentRepositoryError && error.code === outcome);
  }
});
