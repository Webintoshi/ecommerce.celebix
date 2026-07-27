import { parsePaymentAdapterPacket } from "../../validation.ts";

export const IYZICO_IFRAME_PACKET = parsePaymentAdapterPacket({
  providerCode: "iyzico_iframe",
  familyCode: "iyzico",
  modeCode: "iframe",
  adapterVersion: 1,
  implementation: "hosted",
  readiness: {
    test: "verification",
    live: "verification",
  },
  endpoints: {
    test: [
      "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom",
      "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/auth/ecom/detail",
      "https://sandbox-api.iyzipay.com/payment/bin/check",
    ],
    live: [
      "https://api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom",
      "https://api.iyzipay.com/payment/iyzipos/checkoutform/auth/ecom/detail",
      "https://api.iyzipay.com/payment/bin/check",
    ],
  },
  presentation: {
    test: {
      kind: "provider_query_token_url",
      origin: "https://sandbox-cpp.iyzipay.com",
      pathname: "/",
      tokenParameter: "token",
      languageParameter: "lang",
      language: "tr",
      token: {
        alphabet: "base64url",
        minimum: 36,
        maximum: 256,
      },
    },
    live: {
      kind: "provider_query_token_url",
      origin: "https://cpp.iyzipay.com",
      pathname: "/",
      tokenParameter: "token",
      languageParameter: "lang",
      language: "tr",
      token: {
        alphabet: "base64url",
        minimum: 36,
        maximum: 256,
      },
    },
  },
  publicFields: [],
  credentialFields: [
    {
      key: "apiKey",
      label: "API Key",
      minimum: 1,
      maximum: 256,
      secret: true,
    },
    {
      key: "secretKey",
      label: "Secret Key",
      minimum: 1,
      maximum: 256,
      secret: true,
    },
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
  ],
});
