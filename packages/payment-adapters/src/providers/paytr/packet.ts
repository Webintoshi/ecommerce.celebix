import { parsePaymentAdapterPacket } from "../../validation.ts";

export const PAYTR_IFRAME_PACKET = parsePaymentAdapterPacket({
  providerCode: "paytr_iframe",
  familyCode: "paytr",
  modeCode: "iframe",
  adapterVersion: 1,
  implementation: "hosted",
  readiness: {
    test: "verification",
    live: "verification",
  },
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
  presentation: {
    test: {
      kind: "provider_token_url",
      urlPrefix: "https://www.paytr.com/odeme/guvenli/",
      token: {
        alphabet: "base64url",
        minimum: 32,
        maximum: 256,
      },
    },
    live: {
      kind: "provider_token_url",
      urlPrefix: "https://www.paytr.com/odeme/guvenli/",
      token: {
        alphabet: "base64url",
        minimum: 32,
        maximum: 256,
      },
    },
  },
  publicFields: [
    {
      key: "merchantId",
      label: "Mağaza numarası",
      minimum: 1,
      maximum: 128,
    },
  ],
  credentialFields: [
    {
      key: "merchantKey",
      label: "Mağaza parolası",
      minimum: 1,
      maximum: 256,
      secret: true,
    },
    {
      key: "merchantSalt",
      label: "Mağaza gizli anahtarı",
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
      url: "https://dev.paytr.com/iframe-api",
      verifiedAt: "2026-07-27",
      authority: "official",
    },
  ],
});
