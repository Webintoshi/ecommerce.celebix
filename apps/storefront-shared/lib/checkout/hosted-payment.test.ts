import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  sealQuickLinkSecret,
  type PaymentAttemptRepository,
  type QuickOrderHostedPaymentAuthority,
  type QuickOrderHostedPaymentBeginInput,
  type QuickOrderHostedPaymentRepository,
} from "@celebix/saas-data";

import type {
  HostedPaymentPresentation,
  HostedPaymentRuntime,
  InitializeHostedPaymentInput,
} from "../payment-adapters/runtime.ts";
import { createQuickOrderHostedPaymentBridgeRoute } from "./hosted-payment.ts";
import { digestRedemptionCredential } from "./redemption-cookie.ts";

const HOSTNAME = "pilot.saas-staging.celebix.site";
const STORE_ID = "11111111-1111-4111-8111-111111111111";
const LINK_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const METHOD_ID = "44444444-4444-4444-8444-444444444444";
const PROFILE_ID = "55555555-5555-4555-8555-555555555555";
const OPERATION_ID = "66666666-6666-4666-8666-666666666666";
const CREDENTIAL = `q1.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const NOW = new Date("2026-07-28T12:00:00.000Z");
const TOKEN = Buffer.alloc(32, 0x7a).toString("base64url");
const keyring = Object.freeze({
  activeKeyId: "quick.current",
  keys: Object.freeze([Object.freeze({ keyId: "quick.current", key: new Uint8Array(32).fill(7) })]),
});

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function authority(identityNumber = "10000000146"): QuickOrderHostedPaymentAuthority {
  const identityAuthority = digest(identityNumber);
  return Object.freeze({
    authorityDigest: "a".repeat(64), storeId: STORE_ID, linkId: LINK_ID, redemptionSessionId: SESSION_ID,
    paymentMethodId: METHOD_ID, profileId: PROFILE_ID, providerCode: "iyzico_iframe", environment: "test",
    executionAdapterVersion: 1, executionEvidenceDigest: "b".repeat(64), credentialVersion: 3,
    orderReference: "quick-order-0001", amountMinor: 3_600, currency: "TRY",
    identityAuthority, identityKeyId: keyring.activeKeyId,
    sealedIdentity: sealQuickLinkSecret({
      plaintext: identityNumber, purpose: "buyer-identity", storeId: STORE_ID, objectId: LINK_ID,
      digest: identityAuthority, keyring,
    }),
    customerName: "Ada Lovelace", customerEmail: "ada@example.com", customerPhone: "+905551112233",
    customerAddress: "Örnek 1 İstanbul", city: "İstanbul", country: "Türkiye", postalCode: "34000",
    basket: Object.freeze([Object.freeze({
      reference: "sku-1", name: "Örnek ürün", quantity: 2, unitAmountMinor: 1_800,
      itemType: "PHYSICAL" as const,
    })]),
  });
}

function request(body = `operation_id=${OPERATION_ID}`): Request {
  return new Request(`https://${HOSTNAME}/api/quick-order/checkout`, {
    method: "POST",
    headers: {
      origin: `https://${HOSTNAME}`, "content-type": "application/x-www-form-urlencoded",
      cookie: `__Host-celebix_quick=${CREDENTIAL}`, "x-forwarded-for": "8.8.8.8",
    },
    body,
  });
}

function unusedAttempts(): PaymentAttemptRepository {
  return new Proxy(Object.create(null) as PaymentAttemptRepository, {
    get: () => async () => { throw new Error("unused payment attempt method"); },
  });
}

function runtimeWithInitialize(
  initialize: (input: InitializeHostedPaymentInput) => Promise<HostedPaymentPresentation>,
): HostedPaymentRuntime {
  return Object.freeze({
    initialize,
    async callback() { throw new Error("unused callback"); },
    async callbackByDigest() { throw new Error("unused callback"); },
    async reconcile() { throw new Error("unused reconciliation"); },
  });
}

test("legacy authority delegates the original unread request to the established checkout", async () => {
  let fallbackBody = "";
  let executionCalls = 0;
  const handler = createQuickOrderHostedPaymentBridgeRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }),
    now: () => new Date(NOW),
    fallback: async (selected) => {
      fallbackBody = await selected.text();
      return new Response("legacy", { status: 200 });
    },
    resolveRuntime: async () => ({
      hostedPayments: {
        async getAuthority() { return Object.freeze({ kind: "legacy" as const }); },
        async begin() { throw new Error("unused begin"); },
      },
      async resolveExecution() { executionCalls += 1; return null; },
    }),
  });

  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "legacy");
  assert.equal(fallbackBody, `operation_id=${OPERATION_ID}`);
  assert.equal(executionCalls, 0);
});

test("an unavailable bridge delegates the original request for migration-safe legacy rollout", async () => {
  let fallbackBody = "";
  const handler = createQuickOrderHostedPaymentBridgeRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }),
    now: () => new Date(NOW),
    resolveRuntime: async () => null,
    fallback: async (selected) => {
      fallbackBody = await selected.text();
      return new Response("legacy rollout", { status: 200 });
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "legacy rollout");
  assert.equal(fallbackBody, `operation_id=${OPERATION_ID}`);
});

test("hosted checkout sends only database authority plus operation and trusted IP to initialization", async () => {
  const selectedAuthority = authority();
  const begins: QuickOrderHostedPaymentBeginInput[] = [];
  const initializations: InitializeHostedPaymentInput[] = [];
  const hostedPayments: QuickOrderHostedPaymentRepository = {
    async getAuthority(input) {
      assert.deepEqual(input, {
        hostname: HOSTNAME, redemptionDigest: digestRedemptionCredential(CREDENTIAL), now: NOW,
      });
      return Object.freeze({ kind: "found" as const, authority: selectedAuthority });
    },
    async begin(input) {
      begins.push(input);
      return {} as Awaited<ReturnType<QuickOrderHostedPaymentRepository["begin"]>>;
    },
  };
  const handler = createQuickOrderHostedPaymentBridgeRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }),
    now: () => new Date(NOW),
    fallback: async () => { throw new Error("hosted authority must not use legacy fallback"); },
    resolveRuntime: async () => ({
      hostedPayments,
      resolveExecution: async () => ({
        attempts: unusedAttempts(), keyring,
        createRuntime: (attempts) => runtimeWithInitialize(async (input) => {
          initializations.push(input);
          await attempts.begin({
            authority: Object.freeze({ storeId: input.storeId, now: new Date(NOW) }),
            operationId: input.operationId, fingerprint: "c".repeat(64), paymentMethodId: input.paymentMethodId,
            orderReference: input.orderReference, amountMinor: input.amountMinor, currency: input.currency,
            callbackBindingDigest: "d".repeat(64),
          });
          return Object.freeze({
            kind: "iframe" as const,
            url: `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr`, token: TOKEN,
          });
        }),
      }),
    }),
  });

  const response = await handler(request());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr`);
  assert.equal(begins.length, 1);
  assert.equal(begins[0]!.hostname, HOSTNAME);
  assert.equal(begins[0]!.redemptionDigest, digestRedemptionCredential(CREDENTIAL));
  assert.equal(begins[0]!.expectedAuthorityDigest, selectedAuthority.authorityDigest);
  assert.deepEqual(begins[0]!.payment, {
    authority: { storeId: STORE_ID, now: NOW }, operationId: OPERATION_ID,
    fingerprint: "c".repeat(64), paymentMethodId: METHOD_ID, orderReference: "quick-order-0001",
    amountMinor: 3_600, currency: "TRY", callbackBindingDigest: "d".repeat(64),
  });
  assert.equal(initializations.length, 1);
  const initialized = initializations[0]!;
  assert.deepEqual({
    storeId: initialized.storeId, operationId: initialized.operationId, paymentMethodId: initialized.paymentMethodId,
    orderReference: initialized.orderReference, amountMinor: initialized.amountMinor, currency: initialized.currency,
    customer: initialized.customer, basket: initialized.basket,
  }, {
    storeId: STORE_ID, operationId: OPERATION_ID, paymentMethodId: METHOD_ID,
    orderReference: "quick-order-0001", amountMinor: 3_600, currency: "TRY",
    customer: {
      name: "Ada Lovelace", email: "ada@example.com", phone: "+905551112233", ipAddress: "8.8.8.8",
      address: "Örnek 1 İstanbul", identityNumber: "10000000146", city: "İstanbul", country: "Türkiye",
      postalCode: "34000",
    },
    basket: [{ reference: "sku-1", name: "Örnek ürün", quantity: 2, unitAmountMinor: 1_800, itemType: "PHYSICAL" }],
  });
});

test("hosted request rejects extra browser facts before execution or provider initialization", async () => {
  let executionCalls = 0;
  const handler = createQuickOrderHostedPaymentBridgeRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }),
    now: () => new Date(NOW), fallback: async () => new Response(null, { status: 500 }),
    resolveRuntime: async () => ({
      hostedPayments: {
        async getAuthority() { return Object.freeze({ kind: "found" as const, authority: authority() }); },
        async begin() { throw new Error("unused begin"); },
      },
      async resolveExecution() { executionCalls += 1; return null; },
    }),
  });

  const response = await handler(request(`operation_id=${OPERATION_ID}&amount=1`));
  assert.equal(response.status, 400);
  assert.equal(executionCalls, 0);
});

test("invalid buyer identity and non-allowlisted Iyzico presentations fail closed", async () => {
  for (const selected of [
    { identity: "11111", presentation: { kind: "processing" as const } },
    { identity: "10000000146", presentation: { kind: "redirect" as const, url: `https://evil.example/?token=${TOKEN}&lang=tr` } },
    { identity: "10000000146", presentation: { kind: "iframe" as const, url: `https://sandbox-cpp.iyzipay.com/?lang=tr&token=${TOKEN}`, token: TOKEN } },
  ]) {
    let initializeCalls = 0;
    const handler = createQuickOrderHostedPaymentBridgeRoute({
      selectAuthority: () => ({ kind: "trusted", hostname: HOSTNAME }),
      now: () => new Date(NOW), fallback: async () => new Response(null, { status: 500 }),
      resolveRuntime: async () => ({
        hostedPayments: {
          async getAuthority() { return Object.freeze({ kind: "found" as const, authority: authority(selected.identity) }); },
          async begin() { return {} as never; },
        },
        resolveExecution: async () => ({
          attempts: unusedAttempts(), keyring,
          createRuntime: () => runtimeWithInitialize(async () => {
            initializeCalls += 1;
            return Object.freeze(selected.presentation);
          }),
        }),
      }),
    });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.equal(initializeCalls, selected.identity === "11111" ? 0 : 1);
  }
});
