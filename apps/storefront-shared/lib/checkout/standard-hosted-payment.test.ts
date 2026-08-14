import assert from "node:assert/strict";
import test from "node:test";

import type {
  HostedCheckoutBeginResult,
  PaymentAttemptRepository,
  StorefrontHostedCheckoutRepository,
} from "@celebix/saas-data";

import { createStorefrontCredential, parseStorefrontCommerceCredentialKeyring } from "../cart/credential.ts";
import type { HostedCheckoutStartRequest } from "../cart/types.ts";
import type { HostedPaymentPresentation } from "../payment-adapters/runtime.ts";
import { createStandardHostedCheckoutRuntime, StandardHostedCheckoutRuntimeError } from "./standard-hosted-payment.ts";

const HOST = "shop.example.test";
const STORE = "10000000-0000-4000-8000-000000000001";
const SOURCE = "11000000-0000-4000-8000-000000000001";
const METHOD = "20000000-0000-4000-8000-000000000001";
const PROFILE = "21000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const ATTEMPT = "31000000-0000-4000-8000-000000000001";
const AUTHORITY_DIGEST = "a".repeat(64);
const EVIDENCE = `sha256:${"b".repeat(64)}`;
const NOW = new Date("2026-08-06T12:00:00.000Z");
const KEY = Buffer.alloc(32, 17).toString("base64url");
const RETIRED_KEY = Buffer.alloc(32, 19).toString("base64url");
const commerceKeyring = parseStorefrontCommerceCredentialKeyring({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging",
  CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "current_01",
  CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current_01", key: KEY }, { keyId: "previous_01", key: RETIRED_KEY }]),
});
const presentationKeyring = Object.freeze({
  activeKeyId: "presentation_01",
  keys: Object.freeze([Object.freeze({ keyId: "presentation_01", key: new Uint8Array(Buffer.alloc(32, 29)) })]),
});
const cart = createStorefrontCredential("cart", commerceKeyring, (size) => new Uint8Array(size).fill(5));
const request: HostedCheckoutStartRequest = Object.freeze({
  kind: "hosted_start",
  operationId: OPERATION,
  cartVersion: 4,
  intentKind: "cart",
  contact: Object.freeze({ name: "Güzide Elif", email: "guzide@example.test", phone: "+905551112233" }),
  shippingAddress: Object.freeze({ addressLine1: "Bağdat Caddesi 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710" }),
  shippingMethod: "standard",
  paymentMethodId: METHOD,
  identityNumber: "10000000146",
});
const authority = Object.freeze({
  authorityDigest: AUTHORITY_DIGEST,
  storeId: STORE,
  sourceKind: "cart" as const,
  sourceId: SOURCE,
  sourceVersion: 4,
  paymentMethodId: METHOD,
  methodVersion: 1,
  profileId: PROFILE,
  profileVersion: 1,
  providerCode: "iyzico_iframe" as const,
  environment: "test" as const,
  credentialVersion: 1,
  executionAdapterVersion: 1,
  executionEvidenceDigest: EVIDENCE,
  orderReference: "SF-20260806-0001",
  currency: "TRY" as const,
  subtotalMinor: 10_000,
  shippingMinor: 0,
  discountMinor: 0,
  totalMinor: 10_000,
  delivery: Object.freeze({
    contact: Object.freeze({ firstName: "Güzide", lastName: "Elif", email: "guzide@example.test", phone: "+905551112233" }),
    shippingAddress: Object.freeze({ line1: "Bağdat Caddesi 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710", country: "TR" as const }),
  }),
  items: Object.freeze([]),
  presentation: "iframe" as const,
  requiredCustomerFields: Object.freeze(["identity_number" as const]),
  customerName: "Güzide Elif",
  customerEmail: "guzide@example.test",
  customerPhone: "+905551112233",
  customerAddress: "Bağdat Caddesi 1",
  city: "İstanbul",
  country: "TR" as const,
  postalCode: "34710",
  basket: Object.freeze([Object.freeze({ reference: "sku-1", name: "Kolye", quantity: 1, unitAmountMinor: 10_000, itemType: "PHYSICAL" as const })]),
});

function baseAttempts(): PaymentAttemptRepository {
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  return {
    begin: unused,
    markInitialized: unused,
    markUnknown: unused,
    getCallbackAuthority: unused,
    getReconciliationAuthority: unused,
    settleCallback: unused,
    applyHostedCallback: unused,
    claimReconciliation: unused,
    finalizeReconciliation: unused,
  };
}

function fixture(
  selectedPresentation: HostedPaymentPresentation,
  outcome: "created" | "replayed" = "created",
  execution: "ready" | "missing" = "ready",
) {
  let beginInput: Parameters<StorefrontHostedCheckoutRepository["begin"]>[0] | undefined;
  let savedInput: Parameters<StorefrontHostedCheckoutRepository["savePresentation"]>[0] | undefined;
  let stored: Parameters<StorefrontHostedCheckoutRepository["savePresentation"]>[0] | undefined;
  const begun: HostedCheckoutBeginResult = Object.freeze({
    outcome, attemptId: ATTEMPT, storeId: STORE, paymentMethodId: METHOD, profileId: PROFILE,
    providerCode: "iyzico_iframe", environment: "test", credentialVersion: 1,
    executionAdapterVersion: 1, executionEvidenceDigest: EVIDENCE, amountMinor: 10_000, currency: "TRY",
    methodConfig: Object.freeze({
      environment: "test" as const,
      locale: "tr" as const,
      threeDSecure: "provider_managed" as const,
      installmentMode: "all" as const,
      maxInstallment: 0 as const,
    }),
    publicConfig: Object.freeze({}),
    paymentSessionKeyId: outcome === "replayed" ? "previous_01" : "current_01",
    receiptKeyId: outcome === "replayed" ? "previous_01" : "current_01",
    customerKeyId: outcome === "replayed" ? "previous_01" : "current_01",
    sealedCredentials: Object.freeze({ algorithm: "A256GCM", ciphertext: "YQ", iv: Buffer.alloc(12).toString("base64url"), keyId: "provider_01", tag: Buffer.alloc(16).toString("base64url"), version: 1 }),
  });
  const repository: StorefrontHostedCheckoutRepository = {
    authority: async () => authority,
    begin: async (input) => { beginInput = input; return begun; },
    savePresentation: async (input) => {
      savedInput = input; stored = input;
      return Object.freeze({ sessionId: input.candidates[0]?.digest.slice(0, 8).padEnd(8, "0") + "-0000-4000-8000-000000000001", status: "provider_ready", version: 2, providerCode: "iyzico_iframe", presentationExpiresAt: input.presentationExpiresAt.toISOString() });
    },
    presentation: async () => {
      if (!stored) throw new Error("not_ready");
      return Object.freeze({ sessionId: beginInput!.sessionId, status: "provider_ready", version: 2, providerCode: "iyzico_iframe", presentationExpiresAt: stored.presentationExpiresAt.toISOString(), presentationKeyId: stored.presentationKeyId, presentationDigest: stored.presentationDigest, sealedPresentation: stored.sealedPresentation });
    },
    status: async () => Object.freeze({ sessionId: beginInput?.sessionId ?? ATTEMPT, status: "processing", safeCode: "provider_pending", version: 2, paymentSessionExpiresAt: new Date(NOW.getTime() + 900_000).toISOString() }),
  };
  const runtime = createStandardHostedCheckoutRuntime({
    repository,
    commerceKeyring,
    presentationKeyring,
    now: () => new Date(NOW),
    randomUuid: (() => { let index = 0; return () => `${String(++index).padStart(8, "0")}-0000-4000-8000-000000000001`; })(),
    resolveExecution: async () => execution === "missing" ? null : Object.freeze({
      attempts: baseAttempts(),
      createRuntime: (attempts) => Object.freeze({
        initialize: async (input) => {
          const selected = await attempts.begin({
            authority: { storeId: input.storeId, now: new Date(NOW) }, operationId: input.operationId,
            fingerprint: "c".repeat(64), paymentMethodId: input.paymentMethodId,
            orderReference: input.orderReference, amountMinor: input.amountMinor, currency: input.currency,
            callbackBindingDigest: "d".repeat(64),
          });
          return selected.outcome === "replayed" ? Object.freeze({ kind: "processing" as const }) : selectedPresentation;
        },
        callback: async () => ({ kind: "rejected" as const }),
        callbackByDigest: async () => ({ kind: "not_found" as const }),
        reconcile: async () => ({ kind: "rejected" as const }),
      }),
    }),
  });
  return { runtime, getBegin: () => beginInput, getSaved: () => savedInput };
}

const headers = new Headers({ host: HOST, "x-forwarded-for": "8.8.8.8" });
const cookie = `__Host-celebix_cart=${cart.value}`;

test("hosted start obtains durable authority, requires iyzico identity and scopes payment begin", async () => {
  const selected = fixture({ kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" });
  await assert.rejects(selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request: { ...request, identityNumber: undefined } }), /invalid_input/u);
  const result = await selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request });
  assert.equal(result.destination, "/checkout/payment");
  assert.equal(result.setCookies.length, 3);
  assert.equal(selected.getBegin()?.expectedAuthorityDigest, AUTHORITY_DIGEST);
  assert.equal(selected.getBegin()?.fingerprint, "c".repeat(64));
  assert.equal(selected.getBegin()?.callbackBindingDigest, "d".repeat(64));
  assert.equal(selected.getBegin()?.delivery.contact.email, request.contact.email);
});

test("hosted start seals iframe or redirect presentation and never returns provider material", async () => {
  for (const presentation of [
    { kind: "iframe" as const, url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    { kind: "redirect" as const, url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr" },
  ]) {
    const selected = fixture(presentation);
    const result = await selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request });
    assert.equal(JSON.stringify(result).includes("iyzipay"), false);
    assert.equal(JSON.stringify(result).includes("abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(selected.getSaved()?.sealedPresentation.ciphertext.length! > 10, true);
    const opened = await selected.runtime.presentation({ hostname: HOST, cookieHeader: result.setCookies[0]! });
    assert.deepEqual(opened, presentation);
  }
});

test("provider processing and replay return the fixed destination without persisting presentation", async () => {
  for (const outcome of ["created", "replayed"] as const) {
    const selected = fixture({ kind: "processing" }, outcome);
    const result = await selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request });
    assert.deepEqual({ destination: result.destination, state: result.state }, { destination: "/checkout/payment", state: "processing" });
    assert.equal(selected.getSaved(), undefined);
    if (outcome === "replayed") assert.match(result.setCookies.join(";"), /h1[.]previous_01/u);
  }
});

test("provider rejection fails closed and emits no browser credential", async () => {
  const selected = fixture({ kind: "rejected" });
  await assert.rejects(
    selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request }),
    (error: unknown) => error instanceof StandardHostedCheckoutRuntimeError && error.code === "payment_unavailable",
  );
  assert.equal(selected.getSaved(), undefined);
});

test("missing executable hosted payment authority fails as payment unavailable before provider begin", async () => {
  const selected = fixture({ kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" }, "created", "missing");
  await assert.rejects(
    selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request }),
    (error: unknown) => error instanceof StandardHostedCheckoutRuntimeError && error.code === "payment_unavailable",
  );
  assert.equal(selected.getBegin(), undefined);
  assert.equal(selected.getSaved(), undefined);
});
