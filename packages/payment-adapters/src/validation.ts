import { types as utilTypes } from "node:util";

import {
  PAYMENT_PROVIDER_READINESS,
  type PaymentProviderReadiness,
} from "@celebix/saas-contracts";

import type {
  PaymentAdapterCapabilities,
  PaymentAdapterCredentialField,
  PaymentAdapterField,
  PaymentAdapterPacket,
} from "./contracts.ts";

const ENCODER = new TextEncoder();
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const FIELD_KEY = /^[a-z][A-Za-z0-9]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_INPUT_FIELD_KEYS = new Set([
  "cardcode", "cardexpiration", "cardexpirationdate", "cardholder", "cardholdername", "cardnumber",
  "cardpan", "cardsecuritycode", "cardverificationcode", "cardverificationvalue", "cvc", "cvc2",
  "cvv", "cvv2", "expirationdate", "expdate", "expmonth", "expyear", "expiry", "expirydate",
  "fullcardnumber", "magneticstripe", "pan", "pannumber", "primaryaccountnumber", "securitycode",
  "track1", "track2",
]);
const EXECUTABLE_ENDPOINTS = Object.freeze({
  paytr_iframe: Object.freeze({
    test: Object.freeze([
      "https://www.paytr.com/odeme/api/get-token",
      "https://www.paytr.com/odeme/durum-sorgu",
    ]),
    live: Object.freeze([
      "https://www.paytr.com/odeme/api/get-token",
      "https://www.paytr.com/odeme/durum-sorgu",
    ]),
  }),
});

const PACKET_KEYS = Object.freeze([
  "adapterVersion", "capabilities", "credentialFields", "documentation", "endpoints",
  "familyCode", "implementation", "modeCode", "providerCode", "publicFields", "readiness",
]);
const READINESS_KEYS = Object.freeze(["live", "test"]);
const ENDPOINT_KEYS = Object.freeze(["live", "test"]);
const FIELD_KEYS = Object.freeze(["key", "label", "maximum", "minimum"]);
const CREDENTIAL_FIELD_KEYS = Object.freeze(["key", "label", "maximum", "minimum", "secret"]);
const CAPABILITY_KEYS = Object.freeze([
  "callback", "cancel", "capture", "initialize", "installments", "partialRefund", "preAuth",
  "query", "refund", "threeDSecure", "tokenization",
]);
const DOCUMENTATION_KEYS = Object.freeze(["authority", "url", "verifiedAt"]);

function invalid(): never {
  throw new TypeError("payment_adapter_packet_invalid");
}

function safely<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof TypeError && error.message === "payment_adapter_packet_invalid") throw error;
    return invalid();
  }
}

function dataObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();

  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();

  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" ||
    ENCODER.encode(value).byteLength < minimum ||
    ENCODER.encode(value).byteLength > maximum ||
    CONTROL.test(value) ||
    EDGE.test(value) ||
    SURROGATE.test(value)
  ) invalid();
  return value;
}

function code(value: unknown): string {
  const parsed = text(value, 1, 64);
  if (!CODE.test(parsed) || parsed === "dummy_payment") invalid();
  return parsed;
}

function fieldKey(value: unknown): string {
  const parsed = text(value, 1, 64);
  const semanticKey = parsed.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  if (!FIELD_KEY.test(parsed) || CARD_INPUT_FIELD_KEYS.has(semanticKey)) invalid();
  return parsed;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function canonicalHttpsUrl(value: unknown): string {
  const raw = text(value, 1, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return invalid();
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.toString() !== raw
  ) invalid();
  return parsed.toString();
}

function readiness(value: unknown): PaymentAdapterPacket["readiness"] {
  const parsed = dataObject(value, READINESS_KEYS);
  const test = parsed.test as PaymentProviderReadiness;
  const live = parsed.live as PaymentProviderReadiness;
  if (!PAYMENT_PROVIDER_READINESS.includes(test) || !PAYMENT_PROVIDER_READINESS.includes(live)) invalid();
  return Object.freeze({ test, live });
}

function endpoints(value: unknown, providerCode: string): PaymentAdapterPacket["endpoints"] {
  const parsed = dataObject(value, ENDPOINT_KEYS);
  const test = denseArray(parsed.test, 1, 16).map(canonicalHttpsUrl);
  const live = denseArray(parsed.live, 1, 16).map(canonicalHttpsUrl);
  if (new Set(test).size !== test.length || new Set(live).size !== live.length) invalid();
  const allowed = EXECUTABLE_ENDPOINTS[providerCode as keyof typeof EXECUTABLE_ENDPOINTS];
  if (!allowed || test.length !== allowed.test.length || live.length !== allowed.live.length) invalid();
  if (test.some((endpoint, index) => endpoint !== allowed.test[index]) || live.some((endpoint, index) => endpoint !== allowed.live[index])) invalid();
  return Object.freeze({ test: Object.freeze(test), live: Object.freeze(live) });
}

function parseField(value: unknown): PaymentAdapterField {
  const parsed = dataObject(value, FIELD_KEYS);
  const minimum = boundedInteger(parsed.minimum, 1, 256);
  const maximum = boundedInteger(parsed.maximum, minimum, 256);
  return Object.freeze({ key: fieldKey(parsed.key), label: text(parsed.label, 1, 120), minimum, maximum });
}

function parseCredentialField(value: unknown): PaymentAdapterCredentialField {
  const parsed = dataObject(value, CREDENTIAL_FIELD_KEYS);
  if (parsed.secret !== true) invalid();
  const minimum = boundedInteger(parsed.minimum, 1, 256);
  const maximum = boundedInteger(parsed.maximum, minimum, 256);
  return Object.freeze({ key: fieldKey(parsed.key), label: text(parsed.label, 1, 120), minimum, maximum, secret: true });
}

function fields(value: unknown, credential: boolean): readonly PaymentAdapterField[] | readonly PaymentAdapterCredentialField[] {
  const parsed = denseArray(value, 0, 16).map(credential ? parseCredentialField : parseField);
  if (new Set(parsed.map((field) => field.key)).size !== parsed.length) invalid();
  return Object.freeze(parsed);
}

function capabilities(value: unknown): PaymentAdapterCapabilities {
  const parsed = dataObject(value, CAPABILITY_KEYS);
  for (const key of CAPABILITY_KEYS) if (typeof parsed[key] !== "boolean") invalid();
  const result = Object.freeze({
    initialize: parsed.initialize as boolean,
    callback: parsed.callback as boolean,
    query: parsed.query as boolean,
    threeDSecure: parsed.threeDSecure as boolean,
    installments: parsed.installments as boolean,
    preAuth: parsed.preAuth as boolean,
    capture: parsed.capture as boolean,
    cancel: parsed.cancel as boolean,
    refund: parsed.refund as boolean,
    partialRefund: parsed.partialRefund as boolean,
    tokenization: parsed.tokenization as boolean,
  });
  if ((result.preAuth !== result.capture) || (result.partialRefund && !result.refund)) invalid();
  return result;
}

function documentation(value: unknown): PaymentAdapterPacket["documentation"] {
  const parsed = denseArray(value, 1, 16).map((entry) => {
    const record = dataObject(entry, DOCUMENTATION_KEYS);
    const verifiedAt = text(record.verifiedAt, 10, 10);
    if (!DATE.test(verifiedAt) || new Date(`${verifiedAt}T00:00:00.000Z`).toISOString().slice(0, 10) !== verifiedAt || record.authority !== "official") invalid();
    return Object.freeze({ url: canonicalHttpsUrl(record.url), verifiedAt, authority: "official" as const });
  });
  if (new Set(parsed.map((entry) => entry.url)).size !== parsed.length) invalid();
  return Object.freeze(parsed);
}

export function parsePaymentAdapterPacket(value: unknown): PaymentAdapterPacket {
  return safely(() => {
    const parsed = dataObject(value, PACKET_KEYS);
    if (parsed.implementation !== "hosted") invalid();
    const providerCode = code(parsed.providerCode);
    const publicFields = fields(parsed.publicFields, false) as readonly PaymentAdapterField[];
    const credentialFields = fields(parsed.credentialFields, true) as readonly PaymentAdapterCredentialField[];
    if (new Set([...publicFields, ...credentialFields].map((field) => field.key)).size !== publicFields.length + credentialFields.length) invalid();
    return Object.freeze({
      providerCode,
      familyCode: code(parsed.familyCode),
      modeCode: code(parsed.modeCode),
      adapterVersion: boundedInteger(parsed.adapterVersion, 1, 1_000),
      implementation: "hosted" as const,
      readiness: readiness(parsed.readiness),
      endpoints: endpoints(parsed.endpoints, providerCode),
      publicFields,
      credentialFields,
      capabilities: capabilities(parsed.capabilities),
      documentation: documentation(parsed.documentation),
    });
  });
}
