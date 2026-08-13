import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { types as nodeTypes } from "node:util";

import { parseProviderPaymentMethodConfig } from "@celebix/saas-contracts";

import type {
  HostedPaymentAdapter,
  HostedPaymentCallbackInput,
  HostedPaymentInitializeInput,
  HostedPaymentQueryInput,
} from "../../contracts.ts";
import type {
  ProviderTransport,
  ProviderTransportResult,
} from "../../transport.ts";
import {
  createPaytrIframeStatusToken,
  createPaytrIframeToken,
  encodePaytrBasket,
  parsePaytrBasket,
  parsePaytrBoundedString,
  parsePaytrEmail,
  parsePaytrIframeCredential,
  parsePaytrInstallment,
  parsePaytrMerchantOid,
  parsePaytrPositiveInteger,
  parsePaytrReturnUrl,
  parsePaytrUserIp,
  verifyPaytrIframeCallbackHash,
  wipePaytrCredential,
  type PaytrIframeCredential,
} from "./config.ts";
import { PAYTR_IFRAME_PACKET } from "./packet.ts";

export { PAYTR_IFRAME_PACKET } from "./packet.ts";
export { createPaytrIframeCallbackHash } from "./config.ts";
export type { PaytrIframeCredential } from "./config.ts";

const GET_TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";
const STATUS_URL = "https://www.paytr.com/odeme/durum-sorgu";
const PAYTR_PRESENTATION = PAYTR_IFRAME_PACKET.presentation.test;
const BINDING = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ORDER_REFERENCE = /^[A-Za-z0-9._:-]{1,128}$/;
const MAJOR_AMOUNT = /^(?:0|[1-9][0-9]{0,11})[.,][0-9]{1,2}$/;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const CONTENT_TYPE = Object.freeze({
  "content-type": "application/x-www-form-urlencoded",
});
const UNKNOWN_INITIALIZATION_CODE = "provider_outcome_unknown" as const;
const INVALID_QUERY = Object.freeze({
  kind: "rejected" as const,
  code: "invalid_request",
});
const INITIALIZATION_KEYS = Object.freeze([
  "credential",
  "email",
  "environment",
  "failureUrl",
  "maxInstallment",
  "merchantOid",
  "noInstallment",
  "paymentAmount",
  "signal",
  "successUrl",
  "userAddress",
  "userBasket",
  "userIp",
  "userName",
  "userPhone",
]);
const QUERY_KEYS = Object.freeze([
  "credential",
  "environment",
  "merchantOid",
  "signal",
]);
const CALLBACK_KEYS = Object.freeze([
  "credential",
  "expectedPaymentAmount",
  "form",
]);
const CALLBACK_OPTIONAL_KEYS = Object.freeze(["requirePaymentContext"]);
const HOSTED_INITIALIZATION_KEYS = Object.freeze([
  "amountMinor",
  "attemptId",
  "basket",
  "callbackUrl",
  "credential",
  "currency",
  "customer",
  "environment",
  "failureUrl",
  "orderReference",
  "preferences",
  "signal",
  "successUrl",
]);
const HOSTED_QUERY_KEYS = Object.freeze([
  "amountMinor",
  "attemptId",
  "credential",
  "currency",
  "environment",
  "orderReference",
  "providerReference",
  "signal",
]);
const VALIDATION_KEYS = Object.freeze([
  "credential",
  "environment",
  "failureUrl",
  "signal",
  "successUrl",
  "userIp",
  "validationReference",
]);

function publicValidationIp(value: unknown): string {
  const selected = parsePaytrUserIp(value);
  if (isIP(selected) !== 4) invalid();
  const octets = selected.split(".").map(Number);
  const [first, second, third] = octets;
  if (
    first === undefined || second === undefined || third === undefined ||
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113)
  ) invalid();
  return selected;
}

function validationReturnUrls(successValue: unknown, failureValue: unknown): Readonly<{ successUrl: string; failureUrl: string }> {
  const successUrl = parsePaytrReturnUrl(successValue);
  const failureUrl = parsePaytrReturnUrl(failureValue);
  const success = new URL(successUrl);
  const failure = new URL(failureUrl);
  const successHost = success.hostname.replace(/^\[|\]$/g, "");
  const failureHost = failure.hostname.replace(/^\[|\]$/g, "");
  if (
    success.search !== "?durum=basarili" || failure.search !== "?durum=basarisiz" ||
    success.origin !== failure.origin || success.hostname.endsWith(".invalid") ||
    success.hostname === "localhost" || !success.hostname.includes(".") ||
    isIP(successHost) !== 0 || isIP(failureHost) !== 0
  ) invalid();
  return Object.freeze({ successUrl, failureUrl });
}
const CUSTOMER_KEYS = Object.freeze([
  "address",
  "email",
  "ipAddress",
  "name",
  "phone",
]);
const BASKET_ITEM_KEYS = Object.freeze([
  "name",
  "quantity",
  "reference",
  "unitAmountMinor",
]);

export type PaytrIframeInitializationResult =
  | Readonly<{ status: "success"; token: string }>
  | Readonly<{ status: "rejected" }>
  | Readonly<{ status: "unknown" }>;

export type PaytrIframeCallback =
  | Readonly<{
      status: "success";
      merchantOid: string;
      totalAmount: number;
      paymentAmount: number;
      paymentType: "card" | "eft";
      currency: "TRY";
      testMode: 1;
    }>
  | Readonly<{
      status: "failed";
      merchantOid: string;
      totalAmount: number;
      paymentType: "card" | "eft";
      failedReasonCode: string;
      failedReasonMessageDigest: string;
      testMode: 1;
    }>;

export type PaytrIframeStatusResult =
  | Readonly<{
      status: "success";
      paymentAmount: number;
      totalAmount: number;
      currency: "TRY";
      testMode: 1;
    }>
  | Readonly<{ status: "unknown" }>;

export type PaytrIframeCredentialValidationResult =
  | Readonly<{ kind: "validated" }>
  | Readonly<{
      kind: "rejected";
      outcomeCode: "provider_rejected" | "validation_unavailable" | "invalid_validation_request";
    }>;

function invalid(message = "paytr_invalid"): never {
  throw new TypeError(message);
}

function wipe(value: unknown): void {
  try {
    if (value instanceof Uint8Array && !nodeTypes.isProxy(value)) {
      Reflect.apply(UINT8_ARRAY_FILL, value, [0]);
    }
  } catch {
    // Cleanup cannot replace a stable result.
  }
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of [...required, ...optional]) {
    const descriptor = descriptors[key];
    if (!descriptor) continue;
    if (!descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return Object.freeze(selected);
}

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < minimum ||
    value.length > maximum
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const selected: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected.push(descriptor.value);
  }
  return selected;
}

function providerToken(value: unknown): value is string {
  return PAYTR_PRESENTATION.kind === "provider_token_url"
    && PAYTR_PRESENTATION.token.alphabet === "base64url"
    && typeof value === "string"
    && value.length >= PAYTR_PRESENTATION.token.minimum
    && value.length <= PAYTR_PRESENTATION.token.maximum
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function transportRequest(transport: ProviderTransport): ProviderTransport["request"] {
  if (
    typeof transport !== "object" ||
    transport === null ||
    nodeTypes.isProxy(transport)
  ) invalid("paytr_transport_invalid");
  const descriptor = Object.getOwnPropertyDescriptor(transport, "request");
  if (
    !descriptor ||
    !descriptor.enumerable ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "function" ||
    nodeTypes.isProxy(descriptor.value)
  ) invalid("paytr_transport_invalid");
  return descriptor.value as ProviderTransport["request"];
}

function responseJson(result: ProviderTransportResult): unknown {
  if (
    result.kind !== "response" ||
    result.status !== 200 ||
    (
      result.contentType !== "application/json" &&
      result.contentType !== "application/json; charset=utf-8"
    ) ||
    !(result.body instanceof Uint8Array) ||
    nodeTypes.isProxy(result.body)
  ) invalid();
  const text = new TextDecoder("utf-8", { fatal: true }).decode(result.body);
  const encoded = Buffer.from(text, "utf8");
  try {
    if (!encoded.equals(result.body)) invalid();
    return JSON.parse(text) as unknown;
  } finally {
    encoded.fill(0);
  }
}

function unknownInitialization(): PaytrIframeInitializationResult {
  return Object.freeze({ status: "unknown" as const });
}

function unknownStatus(): PaytrIframeStatusResult {
  return Object.freeze({ status: "unknown" as const });
}

export async function initializePaytrIframeWithTransport(
  transport: ProviderTransport,
  input: Readonly<{
    environment: "test" | "live";
    credential: PaytrIframeCredential;
    userIp: string;
    merchantOid: string;
    email: string;
    paymentAmount: number;
    userBasket: string;
    userName: string;
    userAddress: string;
    userPhone: string;
    successUrl: string;
    failureUrl: string;
    noInstallment: 0 | 1;
    maxInstallment: number;
    signal: AbortSignal;
  }>,
): Promise<PaytrIframeInitializationResult> {
  let credential: PaytrIframeCredential | undefined;
  let requestBody: Uint8Array | undefined;
  let responseBody: Uint8Array | undefined;
  try {
    const selected = exactRecord(input, INITIALIZATION_KEYS);
    if (selected.environment !== "test") invalid();
    credential = parsePaytrIframeCredential(selected.credential);
    const userIp = parsePaytrUserIp(selected.userIp);
    const merchantOid = parsePaytrMerchantOid(selected.merchantOid);
    const email = parsePaytrEmail(selected.email);
    const paymentAmount = parsePaytrPositiveInteger(selected.paymentAmount);
    const userBasket = parsePaytrBasket(selected.userBasket);
    if (selected.noInstallment !== 0 && selected.noInstallment !== 1) invalid();
    const maxInstallment = parsePaytrInstallment(selected.maxInstallment);
    const userName = parsePaytrBoundedString(selected.userName, 1, 60);
    const userAddress = parsePaytrBoundedString(selected.userAddress, 1, 400);
    const userPhone = parsePaytrBoundedString(selected.userPhone, 1, 20);
    const successUrl = parsePaytrReturnUrl(selected.successUrl);
    const failureUrl = parsePaytrReturnUrl(selected.failureUrl);
    if (!(selected.signal instanceof AbortSignal)) invalid();
    const params = new URLSearchParams();
    params.append("merchant_id", credential.merchantId);
    params.append("user_ip", userIp);
    params.append("merchant_oid", merchantOid);
    params.append("email", email);
    params.append("payment_amount", String(paymentAmount));
    params.append("paytr_token", createPaytrIframeToken({
      credential,
      userIp,
      merchantOid,
      email,
      paymentAmount,
      userBasket,
      noInstallment: selected.noInstallment,
      maxInstallment,
      currency: "TL",
      testMode: 1,
    }));
    params.append("user_basket", userBasket);
    params.append("debug_on", "0");
    params.append("no_installment", String(selected.noInstallment));
    params.append("max_installment", String(maxInstallment));
    params.append("user_name", userName);
    params.append("user_address", userAddress);
    params.append("user_phone", userPhone);
    params.append("merchant_ok_url", successUrl);
    params.append("merchant_fail_url", failureUrl);
    params.append("timeout_limit", "30");
    params.append("currency", "TL");
    params.append("test_mode", "1");
    requestBody = new TextEncoder().encode(params.toString());
    const result = await transportRequest(transport)({
      packet: PAYTR_IFRAME_PACKET,
      environment: "test",
      url: GET_TOKEN_URL,
      method: "POST",
      headers: CONTENT_TYPE,
      body: requestBody,
      signal: selected.signal,
    });
    if (result.kind === "unknown") return unknownInitialization();
    responseBody = result.body;
    const parsed = exactRecord(responseJson(result), ["status"], ["token", "reason"]);
    if (parsed.status === "success") {
      if (
        Object.keys(parsed).length !== 2 ||
        !providerToken(parsed.token)
      ) invalid();
      return Object.freeze({ status: "success" as const, token: parsed.token });
    }
    if (parsed.status === "failed") {
      if (Object.keys(parsed).length !== 2) invalid();
      parsePaytrBoundedString(parsed.reason, 1, 512);
      return Object.freeze({ status: "rejected" as const });
    }
    return unknownInitialization();
  } catch {
    return unknownInitialization();
  } finally {
    wipe(requestBody);
    wipe(responseBody);
    if (credential !== undefined) wipePaytrCredential(credential);
  }
}

export async function validatePaytrIframeCredentialWithTransport(
  transport: ProviderTransport,
  input: Readonly<{
    environment: "test" | "live";
    credential: PaytrIframeCredential;
    validationReference: string;
    userIp: string;
    successUrl: string;
    failureUrl: string;
    signal: AbortSignal;
  }>,
): Promise<PaytrIframeCredentialValidationResult> {
  let selectedCredential: PaytrIframeCredential | undefined;
  try {
    const selected = exactRecord(input, VALIDATION_KEYS);
    if (
      selected.environment !== "test" ||
      typeof selected.validationReference !== "string" ||
      !UUID.test(selected.validationReference) ||
      !(selected.signal instanceof AbortSignal) || selected.signal.aborted
    ) invalid();
    selectedCredential = parsePaytrIframeCredential(selected.credential);
    const userIp = publicValidationIp(selected.userIp);
    const returnUrls = validationReturnUrls(selected.successUrl, selected.failureUrl);
    const validationReference = `CV${selected.validationReference.replaceAll("-", "")}`;
    // PayTR's official TEST contract proves the merchant credentials at get-token;
    // no iframe is rendered and no card, callback, capture, or charge is performed.
    const providerResult = await initializePaytrIframeWithTransport(transport, Object.freeze({
      environment: "test",
      credential: selectedCredential,
      userIp,
      merchantOid: validationReference,
      email: "payments@celebix.co",
      paymentAmount: 1,
      userBasket: encodePaytrBasket(Object.freeze([Object.freeze({
        name: "Celebix credential validation",
        quantity: 1,
        unitAmountMinor: 1,
      })])),
      userName: "Celebix Validation",
      userAddress: "Credential validation only",
      userPhone: "+905555555555",
      successUrl: returnUrls.successUrl,
      failureUrl: returnUrls.failureUrl,
      noInstallment: 1,
      maxInstallment: 0,
      signal: selected.signal,
    }));
    if (providerResult.status === "success") return Object.freeze({ kind: "validated" as const });
    return providerResult.status === "rejected"
      ? Object.freeze({ kind: "rejected" as const, outcomeCode: "provider_rejected" as const })
      : Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
  } catch {
    return Object.freeze({ kind: "rejected" as const, outcomeCode: "invalid_validation_request" as const });
  } finally {
    if (selectedCredential !== undefined) wipePaytrCredential(selectedCredential);
  }
}

export function authenticatePaytrIframeCallback(input: Readonly<{
  credential: PaytrIframeCredential;
  form: string;
  expectedPaymentAmount: number;
  requirePaymentContext?: true;
}>): PaytrIframeCallback | null {
  try {
    const selected = exactRecord(input, CALLBACK_KEYS, CALLBACK_OPTIONAL_KEYS);
    if (
      selected.requirePaymentContext !== undefined &&
      selected.requirePaymentContext !== true
    ) return null;
    const expectedPaymentAmount = parsePaytrPositiveInteger(selected.expectedPaymentAmount);
    if (
      typeof selected.form !== "string" ||
      selected.form.length < 1 ||
      selected.form.length > 2_048
    ) return null;
    const params = new URLSearchParams(selected.form);
    const entries = [...params.entries()];
    if (
      new URLSearchParams(entries).toString() !== selected.form ||
      new Set(entries.map(([key]) => key)).size !== entries.length
    ) return null;
    const status = params.get("status");
    if (status !== "success" && status !== "failed") return null;
    const successFields = [
      "merchant_oid",
      "status",
      "total_amount",
      "hash",
      "payment_type",
      "test_mode",
    ];
    const hasPaymentAmount = params.has("payment_amount");
    const hasCurrency = params.has("currency");
    if (hasPaymentAmount !== hasCurrency) return null;
    const hasPaymentContext = hasPaymentAmount && hasCurrency;
    const fields = status === "success"
      ? hasPaymentContext
        ? [...successFields, "payment_amount", "currency"]
        : successFields
      : [...successFields, "failed_reason_code", "failed_reason_msg"];
    if (
      entries.length !== fields.length ||
      fields.some((field) => !params.has(field)) ||
      entries.some(([field]) => !fields.includes(field))
    ) return null;
    const merchantOid = params.get("merchant_oid");
    const rawTotalAmount = params.get("total_amount");
    const providedHash = params.get("hash");
    const paymentType = params.get("payment_type");
    if (
      merchantOid === null ||
      rawTotalAmount === null ||
      providedHash === null ||
      (paymentType !== "card" && paymentType !== "eft") ||
      params.get("test_mode") !== "1" ||
      !/^[1-9][0-9]{0,15}$/.test(rawTotalAmount)
    ) return null;
    const totalAmount = Number(rawTotalAmount);
    if (
      !Number.isSafeInteger(totalAmount) ||
      !verifyPaytrIframeCallbackHash({
        credential: selected.credential as PaytrIframeCredential,
        merchantOid,
        status,
        totalAmount: rawTotalAmount,
        providedHash,
      })
    ) return null;
    if (status === "success") {
      if (selected.requirePaymentContext === true && !hasPaymentContext) return null;
      if (hasPaymentContext) {
        const rawPaymentAmount = params.get("payment_amount");
        if (
          rawPaymentAmount !== String(expectedPaymentAmount) ||
          params.get("currency") !== "TL"
        ) return null;
      }
      if (totalAmount < expectedPaymentAmount) return null;
      return Object.freeze({
        status,
        merchantOid: parsePaytrMerchantOid(merchantOid),
        totalAmount,
        paymentAmount: expectedPaymentAmount,
        paymentType,
        currency: "TRY" as const,
        testMode: 1 as const,
      });
    }
    const failedReasonCode = params.get("failed_reason_code");
    const failedReasonMessage = params.get("failed_reason_msg");
    if (failedReasonCode === null || failedReasonMessage === null) return null;
    parsePaytrBoundedString(failedReasonCode, 1, 64);
    parsePaytrBoundedString(failedReasonMessage, 1, 512);
    return Object.freeze({
      status,
      merchantOid: parsePaytrMerchantOid(merchantOid),
      totalAmount,
      paymentType,
      testMode: 1 as const,
      failedReasonCode,
      failedReasonMessageDigest: createHash("sha256")
        .update(failedReasonMessage, "utf8")
        .digest("hex"),
    });
  } catch {
    return null;
  }
}

function parseMajorAmount(value: unknown): number {
  if (typeof value !== "string" || !MAJOR_AMOUNT.test(value)) invalid();
  const [whole, fraction] = value.replace(",", ".").split(".") as [string, string];
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
  return Number(minor);
}

function parseDateTime(value: unknown): string {
  const selected = parsePaytrBoundedString(value, 10, 19);
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(selected)) invalid();
  return selected;
}

function optionalStatusMetadata(parsed: Readonly<Record<string, unknown>>): void {
  if (parsed.net_tutar !== undefined) parseMajorAmount(parsed.net_tutar);
  if (parsed.kesinti_tutari !== undefined) parseMajorAmount(parsed.kesinti_tutari);
  if (
    parsed.taksit !== undefined &&
    (typeof parsed.taksit !== "string" || !/^(?:0|[2-9]|1[0-2])$/.test(parsed.taksit))
  ) invalid();
  if (parsed.kart_marka !== undefined) parsePaytrBoundedString(parsed.kart_marka, 1, 32);
  if (
    parsed.masked_pan !== undefined &&
    (
      typeof parsed.masked_pan !== "string" ||
      !/^[A-Za-z0-9*]{6,32}$/.test(parsed.masked_pan)
    )
  ) invalid();
  if (
    parsed.auth_code !== undefined &&
    (typeof parsed.auth_code !== "string" || !/^[A-Za-z0-9]{1,32}$/.test(parsed.auth_code))
  ) invalid();
  if (
    parsed.auth_date !== undefined &&
    (
      typeof parsed.auth_date !== "string" ||
      !/^\d{2}[.]\d{2}[.]\d{4} \d{2}:\d{2}:\d{2}$/.test(parsed.auth_date)
    )
  ) invalid();
  if (
    parsed.odeme_tipi !== undefined &&
    parsed.odeme_tipi !== "KART" &&
    parsed.odeme_tipi !== "EFT"
  ) invalid();
  if (parsed.returns === undefined) return;
  if (
    !Array.isArray(parsed.returns) ||
    nodeTypes.isProxy(parsed.returns) ||
    parsed.returns.length > 100 ||
    Object.getPrototypeOf(parsed.returns) !== Array.prototype
  ) invalid();
  const fields = [
    "return_amount",
    "return_date",
    "return_type",
    "date_completed",
    "return_auth_code",
    "return_ref_num",
    "reference_no",
    "return_source",
  ];
  for (const entry of parsed.returns) {
    const selected = exactRecord(entry, [], fields);
    if (Object.keys(selected).length < 1) invalid();
    if (selected.return_amount !== undefined) parseMajorAmount(selected.return_amount);
    for (const field of fields.slice(1)) {
      const value = selected[field];
      if (
        value !== undefined &&
        (typeof value !== "string" || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value))
      ) invalid();
    }
  }
}

export async function queryPaytrIframeWithTransport(
  transport: ProviderTransport,
  input: Readonly<{
    environment: "test" | "live";
    credential: PaytrIframeCredential;
    merchantOid: string;
    signal: AbortSignal;
  }>,
): Promise<PaytrIframeStatusResult> {
  let credential: PaytrIframeCredential | undefined;
  let requestBody: Uint8Array | undefined;
  let responseBody: Uint8Array | undefined;
  try {
    const selected = exactRecord(input, QUERY_KEYS);
    if (selected.environment !== "test") invalid();
    credential = parsePaytrIframeCredential(selected.credential);
    const merchantOid = parsePaytrMerchantOid(selected.merchantOid);
    if (!(selected.signal instanceof AbortSignal)) invalid();
    const params = new URLSearchParams();
    params.append("merchant_id", credential.merchantId);
    params.append("merchant_oid", merchantOid);
    params.append("paytr_token", createPaytrIframeStatusToken(credential, merchantOid));
    requestBody = new TextEncoder().encode(params.toString());
    const result = await transportRequest(transport)({
      packet: PAYTR_IFRAME_PACKET,
      environment: "test",
      url: STATUS_URL,
      method: "POST",
      headers: CONTENT_TYPE,
      body: requestBody,
      signal: selected.signal,
    });
    if (result.kind === "unknown") return unknownStatus();
    responseBody = result.body;
    const raw = responseJson(result);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) invalid();
    const candidate = raw as Record<string, unknown>;
    if (candidate.status === "error") {
      const error = exactRecord(raw, ["status", "err_no", "err_msg"]);
      if (
        typeof error.err_no !== "string" ||
        !/^[0-9]{1,16}$/.test(error.err_no)
      ) invalid();
      parsePaytrBoundedString(error.err_msg, 1, 512);
      return unknownStatus();
    }
    const parsed = exactRecord(
      raw,
      [
        "status",
        "payment_amount",
        "payment_total",
        "payment_date",
        "currency",
        "test_mode",
      ],
      [
        "net_tutar",
        "kesinti_tutari",
        "taksit",
        "kart_marka",
        "masked_pan",
        "auth_code",
        "auth_date",
        "odeme_tipi",
        "returns",
      ],
    );
    if (
      parsed.status !== "success" ||
      (parsed.currency !== "TL" && parsed.currency !== "TRY") ||
      parsed.test_mode !== "1"
    ) invalid();
    parseDateTime(parsed.payment_date);
    optionalStatusMetadata(parsed);
    const paymentAmount = parseMajorAmount(parsed.payment_amount);
    const totalAmount = parseMajorAmount(parsed.payment_total);
    if (paymentAmount < 1 || totalAmount < paymentAmount) invalid();
    return Object.freeze({
      status: "success" as const,
      paymentAmount,
      totalAmount,
      currency: "TRY" as const,
      testMode: 1 as const,
    });
  } catch {
    return unknownStatus();
  } finally {
    wipe(requestBody);
    wipe(responseBody);
    if (credential !== undefined) wipePaytrCredential(credential);
  }
}

function callbackBindingDigest(value: unknown): string {
  const raw = parsePaytrBoundedString(value, 1, 2_048);
  const parsed = new URL(raw);
  const segments = parsed.pathname.split("/");
  const binding = segments.length === 6 ? segments[5] : undefined;
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname !== parsed.hostname.toLowerCase() ||
    segments[1] !== "api" ||
    segments[2] !== "payments" ||
    segments[3] !== "paytr_iframe" ||
    segments[4] !== "callback" ||
    typeof binding !== "string" ||
    !BINDING.test(binding) ||
    parsed.toString() !== raw
  ) invalid();
  const bytes = Buffer.from(binding, "base64url");
  try {
    if (bytes.byteLength !== 32 || bytes.toString("base64url") !== binding) invalid();
    return createHash("sha256").update(bytes).digest("hex");
  } finally {
    bytes.fill(0);
  }
}

export function createPaytrIframePresentationUrl(token: unknown): string {
  if (!providerToken(token) || PAYTR_PRESENTATION.kind !== "provider_token_url") invalid();
  return `${PAYTR_PRESENTATION.urlPrefix}${token}`;
}

function validBasketTotal(
  basket: HostedPaymentInitializeInput<PaytrIframeCredential>["basket"],
  amountMinor: number,
): boolean {
  try {
    let total = 0n;
    for (const item of basket) {
      total += BigInt(item.quantity) * BigInt(item.unitAmountMinor);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) return false;
    }
    return total === BigInt(amountMinor);
  } catch {
    return false;
  }
}

export function createPaytrIframeAdapter(
  transport: ProviderTransport,
): HostedPaymentAdapter<PaytrIframeCredential> {
  transportRequest(transport);
  const parseCredential = Object.freeze((value: unknown) =>
    parsePaytrIframeCredential(value));
  const maskAccount = Object.freeze((value: PaytrIframeCredential): string => {
    const credential = parsePaytrIframeCredential(value);
    try {
      const suffix = credential.merchantId.slice(-4);
      return `paytr…${suffix}`;
    } finally {
      wipePaytrCredential(credential);
    }
  });
  const initialize = Object.freeze(async (
    input: HostedPaymentInitializeInput<PaytrIframeCredential>,
  ) => {
    let selectedCredential: PaytrIframeCredential | undefined;
    try {
      const selected = exactRecord(input, HOSTED_INITIALIZATION_KEYS);
      if (selected.environment === "live") {
        return Object.freeze({ kind: "rejected" as const, code: "environment_not_ready" });
      }
      if (selected.environment !== "test") invalid();
      const preferences = parseProviderPaymentMethodConfig("paytr_iframe", selected.preferences);
      if (preferences.environment !== selected.environment) invalid();
      selectedCredential = parsePaytrIframeCredential(selected.credential);
      if (typeof selected.attemptId !== "string" || !UUID.test(selected.attemptId)) invalid();
      if (
        typeof selected.orderReference !== "string" ||
        !ORDER_REFERENCE.test(selected.orderReference)
      ) invalid();
      const merchantOid = callbackBindingDigest(selected.callbackUrl);
      const amountMinor = parsePaytrPositiveInteger(selected.amountMinor);
      if (selected.currency !== "TRY") invalid();
      const customer = exactRecord(selected.customer, CUSTOMER_KEYS);
      const userIp = parsePaytrUserIp(customer.ipAddress);
      const email = parsePaytrEmail(customer.email);
      const userName = parsePaytrBoundedString(customer.name, 1, 60);
      const userAddress = parsePaytrBoundedString(customer.address, 1, 400);
      const userPhone = parsePaytrBoundedString(customer.phone, 1, 20);
      const successUrl = parsePaytrReturnUrl(selected.successUrl);
      const failureUrl = parsePaytrReturnUrl(selected.failureUrl);
      if (!(selected.signal instanceof AbortSignal) || selected.signal.aborted) invalid();
      const basket = denseArray(selected.basket, 1, 100).map((value) => {
        const item = exactRecord(value, BASKET_ITEM_KEYS);
        return Object.freeze({
          reference: parsePaytrBoundedString(item.reference, 1, 128),
          name: parsePaytrBoundedString(item.name, 1, 200),
          quantity: parsePaytrPositiveInteger(item.quantity),
          unitAmountMinor: parsePaytrPositiveInteger(item.unitAmountMinor),
        });
      });
      if (
        !validBasketTotal(basket, amountMinor)
      ) invalid();
      const result = await initializePaytrIframeWithTransport(transport, {
        environment: "test",
        credential: selectedCredential,
        userIp,
        merchantOid,
        email,
        paymentAmount: amountMinor,
        userBasket: encodePaytrBasket(basket),
        userName,
        userAddress,
        userPhone,
        successUrl,
        failureUrl,
        noInstallment: preferences.installmentMode === "single_payment" ? 1 : 0,
        maxInstallment: preferences.installmentMode === "limited"
          ? preferences.maxInstallment
          : 0,
        signal: selected.signal,
      });
      if (result.status === "success") {
        return Object.freeze({
          kind: "iframe" as const,
          url: createPaytrIframePresentationUrl(result.token),
          token: result.token,
          providerReference: merchantOid,
        });
      }
      if (result.status === "rejected") {
        return Object.freeze({ kind: "rejected" as const, code: "provider_rejected" });
      }
      return Object.freeze({
        kind: "unknown" as const,
        code: UNKNOWN_INITIALIZATION_CODE,
        providerReference: merchantOid,
      });
    } catch {
      return Object.freeze({ kind: "rejected" as const, code: "invalid_request" });
    } finally {
      if (selectedCredential !== undefined) wipePaytrCredential(selectedCredential);
    }
  });
  const verifyCallback = Object.freeze(async (
    input: HostedPaymentCallbackInput<PaytrIframeCredential>,
  ) => {
    try {
      if (
        input.environment !== "test" ||
        input.method !== "POST" ||
        input.headers["content-type"] !== "application/x-www-form-urlencoded" ||
        input.expected.currency !== "TRY"
      ) invalid("paytr_callback_invalid");
      const form = new TextDecoder("utf-8", { fatal: true }).decode(input.body);
      const encoded = Buffer.from(form, "utf8");
      try {
        if (!encoded.equals(input.body)) invalid("paytr_callback_invalid");
      } finally {
        encoded.fill(0);
      }
      const callback = authenticatePaytrIframeCallback({
        credential: input.credential,
        form,
        expectedPaymentAmount: input.expected.amountMinor,
        requirePaymentContext: true,
      });
      if (callback === null || !DIGEST.test(callback.merchantOid)) {
        invalid("paytr_callback_invalid");
      }
      return Object.freeze({
        eventKey: `${parsePaytrBoundedString(input.expected.orderReference, 1, 128)}:${callback.status}`,
        status: callback.status === "success" ? "succeeded" as const : "failed" as const,
        providerReference: callback.merchantOid,
        paidAmountMinor: input.expected.amountMinor,
        currency: "TRY",
        safeCode: callback.status === "success" ? "success" : "failed",
      });
    } catch {
      return invalid("paytr_callback_invalid");
    }
  });
  const query = Object.freeze(async (
    input: HostedPaymentQueryInput<PaytrIframeCredential>,
  ) => {
    let credential: PaytrIframeCredential | undefined;
    try {
      const selected = exactRecord(input, HOSTED_QUERY_KEYS);
      if (selected.environment !== "test" || selected.currency !== "TRY") invalid();
      credential = parsePaytrIframeCredential(selected.credential);
      if (typeof selected.attemptId !== "string" || !UUID.test(selected.attemptId)) invalid();
      if (
        typeof selected.orderReference !== "string" ||
        !ORDER_REFERENCE.test(selected.orderReference)
      ) invalid();
      const providerReference = selected.providerReference;
      if (typeof providerReference !== "string" || !DIGEST.test(providerReference)) invalid();
      const amountMinor = parsePaytrPositiveInteger(selected.amountMinor);
      if (!(selected.signal instanceof AbortSignal) || selected.signal.aborted) invalid();
      const result = await queryPaytrIframeWithTransport(transport, {
        environment: "test",
        credential,
        merchantOid: providerReference,
        signal: selected.signal,
      });
      if (
        result.status !== "success" ||
        result.paymentAmount !== amountMinor ||
        result.currency !== "TRY"
      ) {
        return Object.freeze({
          kind: "unknown" as const,
          providerReference,
        });
      }
      return Object.freeze({
        kind: "succeeded" as const,
        providerReference,
        paidAmountMinor: result.paymentAmount,
        currency: "TRY",
      });
    } catch {
      return INVALID_QUERY;
    } finally {
      if (credential !== undefined) wipePaytrCredential(credential);
    }
  });
  return Object.freeze({
    packet: PAYTR_IFRAME_PACKET,
    parseCredential,
    maskAccount,
    initialize,
    verifyCallback,
    query,
  });
}
