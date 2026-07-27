import assert from "node:assert/strict";
import test from "node:test";

import { parsePaymentAdapterPacket } from "./index.ts";

function packetFixture(): Record<string, unknown> {
  return {
    providerCode: "paytr_iframe",
    familyCode: "paytr",
    modeCode: "iframe",
    adapterVersion: 1,
    implementation: "hosted",
    readiness: { test: "verification", live: "planned" },
    endpoints: {
      test: [
        "https://www.paytr.com/odeme/api/get-token",
        "https://www.paytr.com/odeme/durum-sorgu",
      ],
      live: [
        "https://www.paytr.com/odeme/api/get-token",
        "https://www.paytr.com/odeme/durum-sorgu",
      ],
    },
    publicFields: [
      { key: "merchantId", label: "Mağaza numarası", minimum: 1, maximum: 128 },
    ],
    credentialFields: [
      { key: "merchantKey", label: "Mağaza parolası", minimum: 1, maximum: 256, secret: true },
      { key: "merchantSalt", label: "Mağaza gizli anahtarı", minimum: 1, maximum: 256, secret: true },
    ],
    capabilities: {
      initialize: true,
      callback: true,
      query: true,
      threeDSecure: true,
      installments: true,
      preAuth: false,
      capture: false,
      cancel: false,
      refund: false,
      partialRefund: false,
      tokenization: false,
    },
    documentation: [
      { url: "https://dev.paytr.com/iframe-api", verifiedAt: "2026-07-27", authority: "official" },
    ],
  };
}

test("parses the exact immutable hosted PayTR adapter packet", () => {
  const packet = parsePaymentAdapterPacket(packetFixture());

  assert.equal(packet.providerCode, "paytr_iframe");
  assert.equal(Object.isFrozen(packet), true);
  assert.equal(Object.isFrozen(packet.capabilities), true);
  assert.equal(Object.isFrozen(packet.endpoints.test), true);
  assert.equal(Object.isFrozen(packet.credentialFields[0]), true);
});

test("rejects packet keys that are unknown, inherited, accessor-backed, or proxied", () => {
  const withUnknown = { ...packetFixture(), privateToken: "not-safe" };
  assert.throws(() => parsePaymentAdapterPacket(withUnknown), /payment_adapter_packet_invalid/);

  const accessorBacked = packetFixture();
  Object.defineProperty(accessorBacked, "providerCode", { enumerable: true, get: () => "paytr_iframe" });
  assert.throws(() => parsePaymentAdapterPacket(accessorBacked), /payment_adapter_packet_invalid/);

  const revoked = Proxy.revocable(packetFixture(), {});
  revoked.revoke();
  assert.throws(() => parsePaymentAdapterPacket(revoked.proxy), /payment_adapter_packet_invalid/);
});

test("rejects sparse or oversized arrays and duplicate packet values", () => {
  const sparse = packetFixture();
  const endpoints = sparse.endpoints as Record<string, unknown>;
  const testEndpoints = new Array(2);
  testEndpoints[0] = "https://www.paytr.com/odeme/api/get-token";
  endpoints.test = testEndpoints;
  assert.throws(() => parsePaymentAdapterPacket(sparse), /payment_adapter_packet_invalid/);

  const duplicateEndpoint = packetFixture();
  ((duplicateEndpoint.endpoints as Record<string, unknown>).test as string[])[1] = "https://www.paytr.com/odeme/api/get-token";
  assert.throws(() => parsePaymentAdapterPacket(duplicateEndpoint), /payment_adapter_packet_invalid/);

  const duplicateField = packetFixture();
  (duplicateField.credentialFields as unknown[]).push({ key: "merchantId", label: "Again", minimum: 1, maximum: 128, secret: true });
  assert.throws(() => parsePaymentAdapterPacket(duplicateField), /payment_adapter_packet_invalid/);

  const tooManyDocs = packetFixture();
  (tooManyDocs.documentation as unknown[]) = Array.from({ length: 17 }, (_, index) => ({ url: `https://dev.paytr.com/guide-${index}`, verifiedAt: "2026-07-27", authority: "official" }));
  assert.throws(() => parsePaymentAdapterPacket(tooManyDocs), /payment_adapter_packet_invalid/);
});

test("rejects non-canonical provider endpoints and unsafe packet text", () => {
  for (const endpoint of [
    "http://www.paytr.com/odeme/api/get-token",
    "https://merchant:password@www.paytr.com/odeme/api/get-token",
    "https://www.paytr.com:443/odeme/api/get-token",
    "https://www.paytr.com/odeme/api/get-token?credential=secret",
    "https://www.paytr.com/odeme/api/get-token#fragment",
  ]) {
    const invalid = packetFixture();
    ((invalid.endpoints as Record<string, unknown>).test as string[])[0] = endpoint;
    assert.throws(() => parsePaymentAdapterPacket(invalid), /payment_adapter_packet_invalid/);
  }

  for (const providerCode of ["PAYTR_IFRAME", "dummy_payment", "paytr\u0000iframe"]) {
    assert.throws(() => parsePaymentAdapterPacket({ ...packetFixture(), providerCode }), /payment_adapter_packet_invalid/);
  }
});

test("rejects direct-card field semantics across prefixes, suffixes, separators, and casing", () => {
  const cases = [
    ["cvv2", "CVV numeric variant"],
    ["cvc2", "CVC numeric variant"],
    ["panNumber", "PAN number"],
    ["primaryAccountNumber", "primary account number"],
    ["fullCardNumber", "full card number"],
    ["cardSecurityCode", "card security code"],
    ["cvvCode", "CVV code bypass"],
    ["cvcCode", "CVC code bypass"],
    ["cardCvv", "card CVV bypass"],
    ["cardCvc", "card CVC bypass"],
    ["merchantCvvCode", "CVV prefix and suffix"],
    ["cvcCodeSuffix", "CVC suffix"],
    ["CVV2", "upper-case CVV"],
    ["cvv_2", "snake-case CVV"],
    ["cvc-2", "kebab-case CVC"],
    ["PAN_Number", "snake-case PAN"],
    ["primary_account_number", "snake-case primary account number"],
    ["full-card-number", "kebab-case full card number"],
    ["card_security_code", "snake-case security code"],
    ["paymentExpirationDate", "expiration class"],
    ["expiry_month", "expiry class"],
    ["track1", "track one"],
    ["track2", "track two"],
    ["track3", "track three"],
    ["magneticStripe", "magnetic stripe"],
    ["magnetic_stripe", "snake-case magnetic stripe"],
    ["mag-stripe", "kebab-case magstripe"],
    ["legacyTrack3Value", "track prefix and suffix"],
    ["merchantMagStripeConfig", "magstripe prefix and suffix"],
  ];

  for (const [key, caseName] of cases) {
    const invalid = packetFixture();
    (invalid.publicFields as unknown[]) = [{ key, label: "Unsafe field", minimum: 1, maximum: 16 }];
    assert.throws(() => parsePaymentAdapterPacket(invalid), /payment_adapter_packet_invalid/, caseName);
  }
});

test("rejects canonical HTTPS endpoints outside the provider environment allowlist", () => {
  for (const endpoint of [
    "https://evil.example.test/odeme/api/get-token",
    "https://www.paytr.com/odeme/api/not-an-executable-endpoint",
  ]) {
    const invalid = packetFixture();
    ((invalid.endpoints as Record<string, unknown>).test as string[])[0] = endpoint;
    assert.throws(() => parsePaymentAdapterPacket(invalid), /payment_adapter_packet_invalid/, endpoint);
  }
});

test("rejects unsupported hosted capability combinations", () => {
  const unsupported = packetFixture();
  (unsupported.capabilities as Record<string, unknown>).partialRefund = true;
  assert.throws(() => parsePaymentAdapterPacket(unsupported), /payment_adapter_packet_invalid/);

  const captureWithoutPreAuth = packetFixture();
  (captureWithoutPreAuth.capabilities as Record<string, unknown>).capture = true;
  assert.throws(() => parsePaymentAdapterPacket(captureWithoutPreAuth), /payment_adapter_packet_invalid/);

  const preAuthWithoutCapture = packetFixture();
  (preAuthWithoutCapture.capabilities as Record<string, unknown>).preAuth = true;
  assert.throws(() => parsePaymentAdapterPacket(preAuthWithoutCapture), /payment_adapter_packet_invalid/);
});
