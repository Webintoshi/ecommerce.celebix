import assert from "node:assert/strict";
import test from "node:test";

import { sealMerchantProviderCredential } from "@celebix/saas-data";

import { parseMerchantProviderProductionConfig } from "./production-config.ts";
import {
  createMerchantProviderRepositoryAudit,
  initializeMerchantProviderProductionRuntime,
} from "./production.ts";

const PROFILE = "40000000-0000-4000-8000-000000000005";
const STORE = "10000000-0000-4000-8000-000000000001";
const LEASE = "73000000-0000-4000-8000-000000000001";
const REFERENCE = "11111111-1111-4111-8111-111111111111";
const RANDOM_KEY = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const KEY = Buffer.alloc(32, 0x41).toString("base64url");

function config() {
  return parseMerchantProviderProductionConfig({
    CELEBIX_MERCHANT_PROVIDER_WORKER_MODE: "approved_test_validation",
    CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@db.celebix.internal:5432/celebix_saas_production",
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production",
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID: "provider.current",
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: `provider.current:${KEY}`,
    CELEBIX_MERCHANT_PROVIDER_WORKER_ID: "owner.payments.1",
  });
}

type Row = Record<string, unknown>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly responder: (text: string, values: unknown[]) => Row[];
  constructor(responder: (text: string, values: unknown[]) => Row[]) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release() {}
}

function preflightRow(overrides: Row = {}): Row {
  return {
    version_num: 160002,
    database_name: "celebix_saas_production",
    current_role: "celebix_saas_workflow",
    session_is_superuser: false,
    workflow_member: true,
    provider_keyed_preflight_exists: true,
    provider_keyed_lifecycle: true,
    ...overrides,
  };
}

test("production audit bridge forwards only repository commit-unknown kinds", async () => {
  const observed: string[] = [];
  const audit = createMerchantProviderRepositoryAudit((code) => { observed.push(code); });
  await audit({ type: "merchant_provider_finalize_commit_unknown" });
  await audit({ type: "merchant_provider_verification_commit_unknown" });
  assert.deepEqual(observed, [
    "merchant_provider_finalize_commit_unknown",
    "merchant_provider_verification_commit_unknown",
  ]);
});

test("real production composition preflights 056 and validates Iyzico through verification RPCs only", async () => {
  const selected = config();
  const plaintext = new TextEncoder().encode(JSON.stringify({ apiKey: "sandbox-api-key", secretKey: "sandbox-secret-key" }));
  const sealedCredentials = sealMerchantProviderCredential({
    plaintext,
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    credentialVersion: 1,
    keyring: selected.keyring,
  });
  plaintext.fill(0);
  const expires = new Date(NOW.getTime() + 60_000).toISOString();
  const preflight = new Client((text) => text.includes("payment_provider_keyed_lifecycle_preflight")
    ? [preflightRow()]
    : []);
  const claim = new Client((text) => text.includes("merchant_provider_profile_claim_verification") ? [{
    outcome: "claimed",
    result_payload: {
      profileId: PROFILE,
      storeId: STORE,
      providerCode: "iyzico_iframe",
      capability: "payment_processing",
      publicConfig: { environment: "test" },
      validationIdentity: { environment: "test", adapterVersion: 1 },
      sealedCredentials,
      credentialVersion: 1,
      profileVersion: 2,
      leaseId: LEASE,
      leaseOwner: "owner.payments.1",
      leaseExpiresAt: expires,
    },
  }] : []);
  const mark = new Client((text) => text.includes("merchant_provider_profile_mark_verification") ? [{
    outcome: "validated",
    result_payload: {
      id: PROFILE,
      providerCode: "iyzico_iframe",
      capability: "payment_processing",
      publicConfig: { environment: "test" },
      maskedAccountReference: "••••-key",
      status: "active",
      credentialVersion: 1,
      version: 3,
      lastValidatedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
  }] : []);
  const clients = [preflight, claim, mark];
  let closed = 0;
  let providerCalls = 0;
  let providerUrl = "";
  let providerBody: unknown;
  const uuids = [LEASE, REFERENCE, RANDOM_KEY];
  const runtime = await initializeMerchantProviderProductionRuntime(selected, Object.freeze({
    createPool() {
      return {
        async connect() {
          const client = clients.shift();
          if (!client) throw new Error("unexpected_checkout");
          return client;
        },
        async end() { closed += 1; },
      };
    },
    async fetch(request: Request) {
      providerCalls += 1;
      providerUrl = request.url;
      providerBody = JSON.parse(await request.text());
      return new Response(JSON.stringify({
        status: "success",
        conversationId: REFERENCE,
        binNumber: "41579200",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    uuid: () => uuids.shift() ?? RANDOM_KEY,
    now: () => new Date(NOW),
    audit() {},
  }));

  assert.deepEqual(await runtime.runOnce(), { kind: "profile_validated" });
  assert.equal(providerCalls, 1);
  assert.equal(providerUrl, "https://sandbox-api.iyzipay.com/payment/bin/check");
  assert.deepEqual(providerBody, {
    locale: "tr",
    binNumber: "41579200",
    conversationId: REFERENCE,
  });
  assert.equal(preflight.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_workflow"), true);
  assert.equal(mark.calls.some(({ text }) => text.includes("saas.merchant_provider_profile_mark_verification")), true);
  assert.deepEqual(claim.calls.find(({ text }) => text.includes("claim_verification"))?.values.slice(1, 5), [
    "iyzico_iframe", "payment_processing", "test", 1,
  ]);
  assert.equal(mark.calls.find(({ text }) => text.includes("mark_verification"))?.values[10], "validated");
  for (const client of [claim, mark]) {
    assert.equal(client.calls.some(({ text }) => text.includes("claim_validation")), false);
    assert.equal(client.calls.some(({ text }) => text.includes("merchant_provider_claim(")), false);
    assert.equal(client.calls.some(({ text }) => text.includes("merchant_provider_finalize")), false);
  }
  await runtime.close();
  assert.equal(closed, 1);
});

test("056 preflight failure closes the pool before any claim decryption or provider network call", async () => {
  let closed = 0;
  let calls = 0;
  const client = new Client(() => [preflightRow({ provider_keyed_lifecycle: false })]);
  await assert.rejects(() => initializeMerchantProviderProductionRuntime(config(), Object.freeze({
    createPool: () => ({ connect: async () => client, async end() { closed += 1; } }),
    async fetch() { calls += 1; throw new Error("must_not_fetch"); },
    uuid: () => REFERENCE,
    now: () => new Date(NOW),
    audit() {},
  })), /preflight_failed/);
  assert.equal(closed, 1);
  assert.equal(calls, 0);
  assert.equal(client.calls.some(({ text }) => text.includes("merchant_provider_profile_claim")), false);
});

test("production validation-only worker never falls through to either execution queue after repeated empty verification claims", async () => {
  let closed = 0;
  let providerCalls = 0;
  let checkouts = 0;
  const preflight = new Client((text) => text.includes("payment_provider_keyed_lifecycle_preflight")
    ? [preflightRow()]
    : []);
  const emptyClaims = [0, 1, 2, 3].map(() => new Client((text) =>
    text.includes("merchant_provider_profile_claim_verification")
      ? [{ outcome: "empty", result_payload: null }]
      : []));
  const clients = [preflight, ...emptyClaims];
  const runtime = await initializeMerchantProviderProductionRuntime(config(), Object.freeze({
    createPool: () => ({
      async connect() {
        checkouts += 1;
        const client = clients.shift();
        if (!client) throw new Error("execution_queue_checkout");
        return client;
      },
      async end() { closed += 1; },
    }),
    async fetch() { providerCalls += 1; throw new Error("must_not_fetch"); },
    uuid: () => LEASE,
    now: () => new Date(NOW),
    audit() {},
  }));

  assert.deepEqual(await runtime.runOnce(), { kind: "empty" });
  assert.deepEqual(await runtime.runOnce(), { kind: "empty" });
  assert.equal(checkouts, 5);
  assert.equal(providerCalls, 0);
  assert.equal(clients.length, 0);
  for (const claim of emptyClaims) {
    assert.equal(claim.calls.some(({ text }) => text.includes("claim_validation")), false);
    assert.equal(claim.calls.some(({ text }) => text.includes("merchant_provider_claim(")), false);
    assert.equal(claim.calls.some(({ text }) => text.includes("merchant_provider_finalize")), false);
  }
  await runtime.close();
  assert.equal(closed, 1);
});
