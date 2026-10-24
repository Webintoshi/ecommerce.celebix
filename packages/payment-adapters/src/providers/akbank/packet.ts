import { AKBANK_HOSTED_FORM_FIELD_NAMES } from "../../contracts.ts";
import { parsePaymentAdapterPacket } from "../../validation.ts";

export { AKBANK_HOSTED_FORM_FIELD_NAMES as AKBANK_HOSTED_FIELD_NAMES } from "../../contracts.ts";

export const AKBANK_JSON_PACKET = parsePaymentAdapterPacket({
  providerCode: "akbank_json",
  familyCode: "akbank",
  modeCode: "json",
  adapterVersion: 1,
  implementation: "hosted",
  callbackResponse: "customer_return",
  readiness: { test: "verification", live: "verification" },
  endpoints: {
    test: ["https://apipre.akbank.com/api/v1/payment/virtualpos/transaction/process"],
    live: ["https://api.akbank.com/api/v1/payment/virtualpos/transaction/process"],
  },
  presentation: {
    test: { kind: "provider_form_post", url: "https://virtualpospaymentgatewaypre.akbank.com/payhosting", fieldNames: AKBANK_HOSTED_FORM_FIELD_NAMES },
    live: { kind: "provider_form_post", url: "https://virtualpospaymentgateway.akbank.com/payhosting", fieldNames: AKBANK_HOSTED_FORM_FIELD_NAMES },
  },
  publicFields: [],
  credentialFields: [
    { key: "merchantSafeId", label: "Merchant Safe ID", minimum: 32, maximum: 32, secret: true },
    { key: "terminalSafeId", label: "Terminal Safe ID", minimum: 32, maximum: 32, secret: true },
    { key: "secretKey", label: "Secret Key", minimum: 1, maximum: 256, secret: true },
  ],
  capabilities: {
    initialize: true, callback: true, query: true, threeDSecure: true, installments: false,
    preAuth: false, capture: false, cancel: false, refund: false, partialRefund: false, tokenization: false,
  },
  documentation: [{ url: "https://sanalpos.akbank.com/profile/help-documents", verifiedAt: "2026-10-25", authority: "official" }],
});
