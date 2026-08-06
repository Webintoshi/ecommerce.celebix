import { types as nodeTypes } from "node:util";

import { parsePublicCart, type PublicCartLine } from "@celebix/saas-contracts";

import {
  paymentAttemptCurrency,
  paymentAttemptDigest,
  paymentAttemptEnvironment,
  paymentAttemptExecutionEvidenceDigest,
  paymentAttemptInteger,
  paymentAttemptOrderReference,
  paymentAttemptProviderCode,
  paymentAttemptPublicConfig,
  paymentAttemptSealedCredentials,
  paymentAttemptTimestamp,
  paymentAttemptUuid,
} from "../payment-attempts/validation.ts";
import type { BeginPaymentAttemptResult } from "../payment-attempts/types.ts";
import { commerceCandidates, commerceDate, commerceDelivery, commerceHostname, commerceVersion } from "../storefront-commerce/validation.ts";
import type { HostedCheckoutAuthority, HostedCheckoutPresentationState, HostedCheckoutPublicStatus, HostedCheckoutProviderCode, HostedCheckoutSessionStatus } from "./types.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;

function invalid(): never { throw new TypeError("invalid_input"); }
export function hostedExact(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function plain(value: unknown, depth = 0): unknown {
  if (depth > 8) invalid();
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object" || nodeTypes.isProxy(value)) invalid();
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
    return value.map((_entry, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return invalid();
      return plain(descriptor.value, depth + 1);
    });
  }
  const parsed = hostedExact(value, Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).filter((key): key is string => typeof key === "string"));
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(parsed)) {
    Object.defineProperty(result, key, { enumerable: true, configurable: true, writable: true, value: plain(nested, depth + 1) });
  }
  return result;
}

function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value)
    || Buffer.byteLength(value, "utf8") < minimum || Buffer.byteLength(value, "utf8") > maximum
    || (pattern && !pattern.test(value))) invalid();
  return value;
}
function provider(value: unknown): HostedCheckoutProviderCode {
  const parsed = paymentAttemptProviderCode(value);
  if (parsed !== "paytr_iframe" && parsed !== "iyzico_iframe") invalid();
  return parsed;
}
function requiredFields(value: unknown, providerCode: HostedCheckoutProviderCode): readonly "identity_number"[] {
  const selected = plain(value);
  if (!Array.isArray(selected) || selected.some((entry) => entry !== "identity_number")) invalid();
  if ((providerCode === "iyzico_iframe") !== (selected.length === 1)) invalid();
  return Object.freeze(selected as "identity_number"[]);
}
function basket(value: unknown) {
  const selected = plain(value);
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 100) invalid();
  return Object.freeze(selected.map((entry) => {
    const item = hostedExact(entry, ["reference", "name", "quantity", "unitAmountMinor", "itemType"]);
    if (item.itemType !== "PHYSICAL" && item.itemType !== "VIRTUAL") invalid();
    return Object.freeze({
      reference: text(item.reference, 1, 128), name: text(item.name, 1, 512),
      quantity: paymentAttemptInteger(item.quantity), unitAmountMinor: paymentAttemptInteger(item.unitAmountMinor),
      itemType: item.itemType,
    });
  }));
}

export const hostedInput = Object.freeze({
  hostname: commerceHostname, date: commerceDate, candidates: commerceCandidates,
  version: commerceVersion, delivery: commerceDelivery, uuid: paymentAttemptUuid,
  digest: paymentAttemptDigest,
});

export function parseHostedAuthority(value: unknown): HostedCheckoutAuthority {
  const parsed = hostedExact(value, [
    "authorityDigest", "storeId", "sourceKind", "sourceId", "sourceVersion", "paymentMethodId", "methodVersion",
    "profileId", "profileVersion", "providerCode", "environment", "credentialVersion", "executionAdapterVersion",
    "executionEvidenceDigest", "orderReference", "currency", "subtotalMinor", "shippingMinor", "discountMinor",
    "totalMinor", "delivery", "items", "presentation", "requiredCustomerFields", "customerName", "customerEmail",
    "customerPhone", "customerAddress", "city", "country", "postalCode", "basket",
  ]);
  if (parsed.sourceKind !== "cart" && parsed.sourceKind !== "buy_now") invalid();
  const providerCode = provider(parsed.providerCode);
  const sourceVersion = paymentAttemptInteger(parsed.sourceVersion);
  const subtotalMinor = paymentAttemptInteger(parsed.subtotalMinor, 0);
  const shippingMinor = paymentAttemptInteger(parsed.shippingMinor, 0);
  const discountMinor = paymentAttemptInteger(parsed.discountMinor, 0);
  const totalMinor = paymentAttemptInteger(parsed.totalMinor);
  if (totalMinor !== subtotalMinor + shippingMinor - discountMinor || parsed.currency !== "TRY") invalid();
  const safeItems = plain(parsed.items) as unknown[];
  const cart = parsePublicCart(plain({
    version: sourceVersion, currency: "TRY",
    itemCount: safeItems.reduce<number>((sum, item) => sum + Number((item as { quantity: unknown }).quantity), 0),
    subtotalCents: subtotalMinor, shippingCents: shippingMinor, totalCents: totalMinor,
    checkoutReady: true, checkoutBlocker: null, items: safeItems,
  }));
  let presentation: "iframe" | "redirect";
  if (providerCode === "paytr_iframe") {
    if (parsed.presentation !== "iframe") invalid();
    presentation = "iframe";
  } else {
    if (parsed.presentation !== "redirect") invalid();
    presentation = "redirect";
  }
  const postalCode = parsed.postalCode === null ? undefined : text(parsed.postalCode, 1, 20);
  return Object.freeze({
    authorityDigest: paymentAttemptDigest(parsed.authorityDigest), storeId: paymentAttemptUuid(parsed.storeId),
    sourceKind: parsed.sourceKind, sourceId: paymentAttemptUuid(parsed.sourceId), sourceVersion,
    paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId), methodVersion: paymentAttemptInteger(parsed.methodVersion),
    profileId: paymentAttemptUuid(parsed.profileId), profileVersion: paymentAttemptInteger(parsed.profileVersion),
    providerCode, environment: paymentAttemptEnvironment(parsed.environment),
    credentialVersion: paymentAttemptInteger(parsed.credentialVersion),
    executionAdapterVersion: paymentAttemptInteger(parsed.executionAdapterVersion),
    executionEvidenceDigest: paymentAttemptExecutionEvidenceDigest(parsed.executionEvidenceDigest),
    orderReference: paymentAttemptOrderReference(parsed.orderReference), currency: "TRY", subtotalMinor, shippingMinor,
    discountMinor, totalMinor, delivery: commerceDelivery(plain(parsed.delivery)), items: cart.items as readonly PublicCartLine[],
    presentation, requiredCustomerFields: requiredFields(parsed.requiredCustomerFields, providerCode),
    customerName: text(parsed.customerName, 1, 201), customerEmail: text(parsed.customerEmail, 3, 320),
    customerPhone: text(parsed.customerPhone, 13, 13), customerAddress: text(parsed.customerAddress, 1, 1024),
    city: text(parsed.city, 1, 100), country: parsed.country === "TR" ? "TR" : invalid(),
    ...(postalCode ? { postalCode } : {}), basket: basket(parsed.basket),
  });
}

export function parseHostedBegin(value: unknown, outcome: string, expected: Readonly<{ operationId: string; paymentMethodId: string; sessionId: string }>): BeginPaymentAttemptResult {
  const parsed = hostedExact(value, [
    "attemptId", "storeId", "paymentMethodId", "profileId", "providerCode", "environment",
    "executionAdapterVersion", "executionEvidenceDigest", "credentialVersion", "amountMinor", "currency",
    "publicConfig", "sealedCredentials", "sessionId", "sessionStatus", "sessionVersion",
    "paymentSessionExpiresAt", "receiptExpiresAt", "customerExpiresAt",
  ]);
  if (outcome !== "created" && outcome !== "operation_replayed") invalid();
  if (parsed.sessionStatus !== "active" || paymentAttemptInteger(parsed.sessionVersion) !== 1
    || paymentAttemptUuid(parsed.sessionId) !== expected.sessionId) invalid();
  paymentAttemptTimestamp(parsed.paymentSessionExpiresAt); paymentAttemptTimestamp(parsed.receiptExpiresAt); paymentAttemptTimestamp(parsed.customerExpiresAt);
  const environment = paymentAttemptEnvironment(parsed.environment);
  const publicConfig = paymentAttemptPublicConfig(plain(parsed.publicConfig));
  const result = Object.freeze({
    outcome: outcome === "created" ? "created" as const : "replayed" as const,
    attemptId: paymentAttemptUuid(parsed.attemptId), storeId: paymentAttemptUuid(parsed.storeId),
    paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId), profileId: paymentAttemptUuid(parsed.profileId),
    providerCode: provider(parsed.providerCode), environment,
    executionAdapterVersion: paymentAttemptInteger(parsed.executionAdapterVersion),
    executionEvidenceDigest: paymentAttemptExecutionEvidenceDigest(parsed.executionEvidenceDigest),
    credentialVersion: paymentAttemptInteger(parsed.credentialVersion), amountMinor: paymentAttemptInteger(parsed.amountMinor),
    currency: paymentAttemptCurrency(parsed.currency), publicConfig,
    sealedCredentials: paymentAttemptSealedCredentials(plain(parsed.sealedCredentials)),
  });
  if (result.attemptId !== expected.operationId || result.paymentMethodId !== expected.paymentMethodId
    || result.currency !== "TRY" || publicConfig.environment !== environment) invalid();
  return result;
}

export function parseHostedPresentation(value: unknown, requireSeal: boolean): HostedCheckoutPresentationState {
  const parsed = hostedExact(value,
    ["sessionId", "status", "version", "providerCode", "presentationExpiresAt"],
    ["presentationKeyId", "presentationDigest", "sealedPresentation"]);
  if (parsed.status !== "provider_ready") invalid();
  const base = {
    sessionId: paymentAttemptUuid(parsed.sessionId), status: "provider_ready" as const,
    version: paymentAttemptInteger(parsed.version), providerCode: provider(parsed.providerCode),
    presentationExpiresAt: paymentAttemptTimestamp(parsed.presentationExpiresAt),
  };
  if (!requireSeal) {
    if (Object.hasOwn(parsed, "sealedPresentation") || Object.hasOwn(parsed, "presentationDigest") || Object.hasOwn(parsed, "presentationKeyId")) invalid();
    return Object.freeze(base);
  }
  if (!Object.hasOwn(parsed, "sealedPresentation") || !Object.hasOwn(parsed, "presentationDigest") || !Object.hasOwn(parsed, "presentationKeyId")) invalid();
  const keyId = text(parsed.presentationKeyId, 1, 128, KEY_ID);
  const sealedPresentation = paymentAttemptSealedCredentials(plain(parsed.sealedPresentation));
  if (sealedPresentation.keyId !== keyId) invalid();
  return Object.freeze({ ...base, presentationKeyId: keyId, presentationDigest: paymentAttemptDigest(parsed.presentationDigest), sealedPresentation });
}

export function parseHostedStatus(value: unknown): HostedCheckoutPublicStatus {
  const parsed = hostedExact(value, ["sessionId", "status", "safeCode", "version", "paymentSessionExpiresAt"]);
  const statuses: readonly HostedCheckoutSessionStatus[] = ["active", "provider_ready", "processing", "captured", "failed", "cancelled", "expired", "stock_conflict"];
  if (!statuses.includes(parsed.status as HostedCheckoutSessionStatus)) invalid();
  return Object.freeze({
    sessionId: paymentAttemptUuid(parsed.sessionId), status: parsed.status as HostedCheckoutSessionStatus,
    safeCode: text(parsed.safeCode, 1, 64, SAFE_CODE), version: paymentAttemptInteger(parsed.version),
    paymentSessionExpiresAt: paymentAttemptTimestamp(parsed.paymentSessionExpiresAt),
  });
}
