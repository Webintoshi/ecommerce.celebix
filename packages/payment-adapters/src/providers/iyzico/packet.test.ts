import assert from "node:assert/strict";
import test from "node:test";

import { parsePaymentAdapterPacket } from "../../validation.ts";
import { IYZICO_IFRAME_PACKET } from "./packet.ts";

const TEST_ENDPOINTS = Object.freeze([
  "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom",
  "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/auth/ecom/detail",
  "https://sandbox-api.iyzipay.com/payment/bin/check",
]);
const LIVE_ENDPOINTS = Object.freeze([
  "https://api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom",
  "https://api.iyzipay.com/payment/iyzipos/checkoutform/auth/ecom/detail",
  "https://api.iyzipay.com/payment/bin/check",
]);

function mutablePacket(): Record<string, unknown> {
  return structuredClone(IYZICO_IFRAME_PACKET) as unknown as Record<string, unknown>;
}

test("exports the exact verification-only iyzico Checkout Form packet", () => {
  assert.equal(Object.isFrozen(IYZICO_IFRAME_PACKET), true);
  assert.equal(IYZICO_IFRAME_PACKET.providerCode, "iyzico_iframe");
  assert.equal(IYZICO_IFRAME_PACKET.familyCode, "iyzico");
  assert.equal(IYZICO_IFRAME_PACKET.modeCode, "iframe");
  assert.deepEqual(IYZICO_IFRAME_PACKET.readiness, {
    test: "verification",
    live: "verification",
  });
  assert.deepEqual(IYZICO_IFRAME_PACKET.endpoints.test, TEST_ENDPOINTS);
  assert.deepEqual(IYZICO_IFRAME_PACKET.endpoints.live, LIVE_ENDPOINTS);
  assert.deepEqual(IYZICO_IFRAME_PACKET.presentation, {
    test: {
      kind: "provider_query_token_url",
      origin: "https://sandbox-cpp.iyzipay.com",
      pathname: "/",
      tokenParameter: "token",
      languageParameter: "lang",
      language: "tr",
      token: { alphabet: "base64url", minimum: 36, maximum: 256 },
    },
    live: {
      kind: "provider_query_token_url",
      origin: "https://cpp.iyzipay.com",
      pathname: "/",
      tokenParameter: "token",
      languageParameter: "lang",
      language: "tr",
      token: { alphabet: "base64url", minimum: 36, maximum: 256 },
    },
  });
});

test("defines only the exact iyzico API key and secret credential fields", () => {
  assert.deepEqual(IYZICO_IFRAME_PACKET.publicFields, []);
  assert.deepEqual(IYZICO_IFRAME_PACKET.credentialFields, [
    { key: "apiKey", label: "API Key", minimum: 1, maximum: 256, secret: true },
    { key: "secretKey", label: "Secret Key", minimum: 1, maximum: 256, secret: true },
  ]);
  for (const field of IYZICO_IFRAME_PACKET.credentialFields) {
    assert.doesNotMatch(field.key, /card|pan|cvv|cvc|expiry|expiration|track/i);
  }
});

test("rejects endpoint and query-presentation authority outside the exact iyzico allowlist", () => {
  const endpointCases = [
    "https://api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom",
    "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom?next=1",
    "https://evil.example.test/payment/iyzipos/checkoutform/initialize/auth/ecom",
  ];
  for (const endpoint of endpointCases) {
    const invalid = mutablePacket();
    ((invalid.endpoints as Record<string, unknown>).test as string[])[0] = endpoint;
    assert.throws(() => parsePaymentAdapterPacket(invalid), /payment_adapter_packet_invalid/, endpoint);
  }

  const mutations = [
    (rule: Record<string, unknown>) => { rule.origin = "https://user:pass@sandbox-cpp.iyzipay.com"; },
    (rule: Record<string, unknown>) => { rule.origin = "https://sandbox-cpp.iyzipay.com:443"; },
    (rule: Record<string, unknown>) => { rule.origin = "https://sandbox-cpp.iyzipay.com/checkout"; },
    (rule: Record<string, unknown>) => { rule.origin = "https://sandbox-cpp.iyzipay.com#fragment"; },
    (rule: Record<string, unknown>) => { rule.origin = "https://evil.example.test"; },
    (rule: Record<string, unknown>) => { rule.pathname = "/checkout"; },
    (rule: Record<string, unknown>) => { rule.tokenParameter = "lang"; rule.languageParameter = "token"; },
    (rule: Record<string, unknown>) => { rule.tokenParameter = "token&token"; },
    (rule: Record<string, unknown>) => { rule.languageParameter = "lang&extra"; },
    (rule: Record<string, unknown>) => { rule.language = "en"; },
    (rule: Record<string, unknown>) => { rule.extraParameter = "unsafe"; },
  ];
  for (const mutate of mutations) {
    const invalid = mutablePacket();
    const rule = (invalid.presentation as Record<string, Record<string, unknown>>).test;
    mutate(rule);
    assert.throws(() => parsePaymentAdapterPacket(invalid), /payment_adapter_packet_invalid/);
  }
});

test("records only official protocol documentation verified on 2026-07-27", () => {
  assert.deepEqual(IYZICO_IFRAME_PACKET.documentation, [
    {
      url: "https://docs.iyzico.com/on-hazirliklar/api-reference/odeme-metotlari/iyzico-odeme-formu-cf",
      verifiedAt: "2026-07-27",
      authority: "official",
    },
    {
      url: "https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth",
      verifiedAt: "2026-07-27",
      authority: "official",
    },
    {
      url: "https://docs.iyzico.com/en/advanced/response-signature-validation",
      verifiedAt: "2026-07-27",
      authority: "official",
    },
  ]);
});
