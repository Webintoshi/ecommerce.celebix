import { types as nodeTypes } from "node:util";

import {
  PROMOTION_CART_LINE_LIMIT_MESSAGE,
  normalizePromotionCode,
  parsePublicCart,
  parsePublicCartV2,
  parsePublicCheckoutQuoteV2,
  type PublicCartLine,
} from "@celebix/saas-contracts";

import {
  paymentAttemptCurrency,
  paymentAttemptDigest,
  paymentAttemptEnvironment,
  paymentAttemptExecutionEvidenceDigest,
  paymentAttemptInteger,
  paymentAttemptMethodConfig,
  paymentAttemptOrderReference,
  paymentAttemptProviderCode,
  paymentAttemptPublicConfig,
  paymentAttemptSealedCredentials,
  paymentAttemptTimestamp,
  paymentAttemptUuid,
} from "../payment-attempts/validation.ts";
import type { HostedCheckoutBeginResult, HostedCheckoutBeginV2Result, HostedCheckoutPromotionReservation } from "./types.ts";
import { commerceCandidates, commerceDate, commerceDelivery, commerceHostname, commerceVersion } from "../storefront-commerce/validation.ts";
import type { HostedCheckoutAuthority, HostedCheckoutAuthorityV2, HostedCheckoutPresentationState, HostedCheckoutPublicStatus, HostedCheckoutProviderCode, HostedCheckoutSessionStatus } from "./types.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const HOSTED_BEGIN_RESULT_FIELDS = Object.freeze([
  "attemptId", "storeId", "paymentMethodId", "profileId", "providerCode", "environment",
  "executionAdapterVersion", "executionEvidenceDigest", "credentialVersion", "amountMinor", "currency",
  "methodConfig", "publicConfig", "sealedCredentials", "sessionId", "sessionStatus", "sessionVersion",
  "paymentSessionExpiresAt", "receiptExpiresAt", "customerExpiresAt",
  "paymentSessionKeyId", "receiptKeyId", "customerKeyId",
] as const);

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

function allocatedBasket(
  value: unknown,
  items: HostedCheckoutAuthorityV2["items"],
  shippingPayableMinor: number,
  totalMinor: number,
): HostedCheckoutAuthorityV2["basket"] {
  const selected = basket(value);
  const payableItems = items.filter((item) => item.payableCents > 0);
  const expectedLength = payableItems.length + (shippingPayableMinor > 0 ? 1 : 0);
  if (selected.length !== expectedLength || expectedLength > 100) invalid();
  for (let index = 0; index < payableItems.length; index += 1) {
    const line = payableItems[index]!;
    const allocation = selected[index]!;
    if (allocation.reference !== line.variantId || allocation.name !== line.title
      || allocation.quantity !== 1 || allocation.unitAmountMinor !== line.payableCents
      || allocation.itemType !== "PHYSICAL") invalid();
  }
  if (shippingPayableMinor > 0) {
    const shipping = selected.at(-1)!;
    if (shipping.reference !== "shipping:standard" || shipping.name !== "Kargo"
      || shipping.quantity !== 1 || shipping.unitAmountMinor !== shippingPayableMinor
      || shipping.itemType !== "VIRTUAL") invalid();
  }
  const allocatedTotal = selected.reduce((sum, item) => sum + item.unitAmountMinor, 0);
  if (!Number.isSafeInteger(allocatedTotal) || allocatedTotal !== totalMinor) invalid();
  return selected;
}

export function hostedPromotionCodes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 5) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const seen = new Set<string>();
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    const code = normalizePromotionCode(descriptor.value);
    if (code !== descriptor.value || seen.has(code)) invalid();
    seen.add(code);
    result.push(code);
  }
  return Object.freeze(result.sort());
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

export function parseHostedAuthorityV2(value: unknown): HostedCheckoutAuthorityV2 {
  const parsed = hostedExact(value, [
    "authorityDigest", "storeId", "sourceKind", "sourceId", "sourceVersion", "paymentMethodId", "methodVersion",
    "profileId", "profileVersion", "providerCode", "environment", "credentialVersion", "executionAdapterVersion",
    "executionEvidenceDigest", "orderReference", "orderId", "customerId", "evaluatorAuthorityDigest", "currency",
    "subtotalMinor", "shippingMinor", "lineDiscountMinor", "shippingDiscountMinor", "discountMinor", "totalMinor",
    "delivery", "items", "promotionStatus", "appliedPromotions", "gifts", "presentation", "requiredCustomerFields",
    "customerName", "customerEmail", "customerPhone", "customerAddress", "city", "country", "postalCode", "basket",
  ]);
  if (parsed.sourceKind !== "cart" && parsed.sourceKind !== "buy_now") invalid();
  const providerCode = provider(parsed.providerCode);
  const sourceVersion = paymentAttemptInteger(parsed.sourceVersion);
  const subtotalMinor = paymentAttemptInteger(parsed.subtotalMinor, 0);
  const shippingMinor = paymentAttemptInteger(parsed.shippingMinor, 0);
  const lineDiscountMinor = paymentAttemptInteger(parsed.lineDiscountMinor, 0);
  const shippingDiscountMinor = paymentAttemptInteger(parsed.shippingDiscountMinor, 0);
  const discountMinor = paymentAttemptInteger(parsed.discountMinor, 0);
  const totalMinor = paymentAttemptInteger(parsed.totalMinor);
  const safeItems = plain(parsed.items) as unknown[];
  const promotionStatus = plain(parsed.promotionStatus);
  const rawGifts = plain(parsed.gifts);
  if (!Array.isArray(rawGifts)) invalid();
  const expectedAutoAddedGiftRows: { readonly variantId: string; readonly quantity: number }[] = [];
  for (const rawGift of rawGifts) {
    const gift = hostedExact(rawGift, ["variantId", "quantity", "autoAdd"]);
    const variantId = paymentAttemptUuid(gift.variantId);
    const quantity = paymentAttemptInteger(gift.quantity);
    if (quantity > 1_000_000) invalid();
    if (typeof gift.autoAdd !== "boolean") invalid();
    if (!gift.autoAdd) continue;
    let remaining = quantity;
    while (remaining > 0) {
      const chunk = Math.min(remaining, 9_999);
      expectedAutoAddedGiftRows.push(Object.freeze({ variantId, quantity: chunk }));
      remaining -= chunk;
    }
  }
  if (expectedAutoAddedGiftRows.length > safeItems.length) invalid();
  const giftStart = safeItems.length - expectedAutoAddedGiftRows.length;
  const evaluatorItems = safeItems.slice(0, giftStart);
  const parsedGiftItems = safeItems.slice(giftStart).map((rawItem, index) => {
    const expected = expectedAutoAddedGiftRows[index]!;
    const source = plain(rawItem) as Readonly<Record<string, unknown>>;
    const item = parsePublicCartV2(plain({
      version: sourceVersion,
      currency: "TRY",
      itemCount: source.quantity,
      subtotalCents: source.lineTotalCents,
      shippingCents: 0,
      lineDiscountCents: source.discountCents,
      shippingDiscountCents: 0,
      discountCents: source.discountCents,
      totalCents: source.payableCents,
      checkoutReady: true,
      checkoutBlocker: null,
      items: [source],
    })).items[0]!;
    if (item.variantId !== expected.variantId || item.quantity !== expected.quantity
      || item.unitPriceCents !== 0 || item.lineTotalCents !== 0
      || item.discountCents !== 0 || item.payableCents !== 0 || !item.available) invalid();
    return item;
  });
  const evaluatorCart = parsePublicCartV2(plain({
    version: sourceVersion,
    currency: "TRY",
    itemCount: evaluatorItems.reduce<number>((sum, item) => sum + Number((item as { quantity: unknown }).quantity), 0),
    subtotalCents: subtotalMinor,
    shippingCents: shippingMinor,
    lineDiscountCents: lineDiscountMinor,
    shippingDiscountCents: shippingDiscountMinor,
    discountCents: discountMinor,
    totalCents: totalMinor,
    checkoutReady: true,
    checkoutBlocker: null,
    items: evaluatorItems,
  }));
  const combinedItems = Object.freeze([...evaluatorCart.items, ...parsedGiftItems]);
  const cart = Object.freeze({
    ...evaluatorCart,
    items: combinedItems,
  });
  const promotions = parsePublicCheckoutQuoteV2(plain({
    cart,
    paymentMethods: [],
    promotionStatus,
    appliedPromotions: plain(parsed.appliedPromotions),
    rejectedPromotions: [],
    gifts: rawGifts,
    progressMessages: (promotionStatus as { kind?: unknown }).kind === "not_evaluated"
      ? [PROMOTION_CART_LINE_LIMIT_MESSAGE]
      : [],
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
  const safeBasket = allocatedBasket(parsed.basket, cart.items, shippingMinor - shippingDiscountMinor, totalMinor);
  return Object.freeze({
    authorityDigest: paymentAttemptDigest(parsed.authorityDigest),
    storeId: paymentAttemptUuid(parsed.storeId),
    sourceKind: parsed.sourceKind,
    sourceId: paymentAttemptUuid(parsed.sourceId),
    sourceVersion,
    paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId),
    methodVersion: paymentAttemptInteger(parsed.methodVersion),
    profileId: paymentAttemptUuid(parsed.profileId),
    profileVersion: paymentAttemptInteger(parsed.profileVersion),
    providerCode,
    environment: paymentAttemptEnvironment(parsed.environment),
    credentialVersion: paymentAttemptInteger(parsed.credentialVersion),
    executionAdapterVersion: paymentAttemptInteger(parsed.executionAdapterVersion),
    executionEvidenceDigest: paymentAttemptExecutionEvidenceDigest(parsed.executionEvidenceDigest),
    orderReference: paymentAttemptOrderReference(parsed.orderReference),
    orderId: paymentAttemptUuid(parsed.orderId),
    customerId: paymentAttemptUuid(parsed.customerId),
    evaluatorAuthorityDigest: paymentAttemptDigest(parsed.evaluatorAuthorityDigest),
    currency: parsed.currency === "TRY" ? "TRY" : invalid(),
    subtotalMinor,
    shippingMinor,
    lineDiscountMinor,
    shippingDiscountMinor,
    discountMinor,
    totalMinor,
    delivery: commerceDelivery(plain(parsed.delivery)),
    items: cart.items,
    promotionStatus: promotions.promotionStatus,
    appliedPromotions: promotions.appliedPromotions,
    gifts: promotions.gifts,
    presentation,
    requiredCustomerFields: requiredFields(parsed.requiredCustomerFields, providerCode),
    customerName: text(parsed.customerName, 1, 201),
    customerEmail: text(parsed.customerEmail, 3, 320),
    customerPhone: text(parsed.customerPhone, 13, 13),
    customerAddress: text(parsed.customerAddress, 1, 1024),
    city: text(parsed.city, 1, 100),
    country: parsed.country === "TR" ? "TR" : invalid(),
    ...(postalCode ? { postalCode } : {}),
    basket: safeBasket,
  });
}

export function parseHostedBegin(value: unknown, outcome: string, expected: Readonly<{ operationId: string; paymentMethodId: string; sessionId: string }>): HostedCheckoutBeginResult {
  const parsed = hostedExact(value, HOSTED_BEGIN_RESULT_FIELDS);
  if (outcome !== "created" && outcome !== "operation_replayed") invalid();
  if (parsed.sessionStatus !== "active" || paymentAttemptInteger(parsed.sessionVersion) !== 1
    || paymentAttemptUuid(parsed.sessionId) !== expected.sessionId) invalid();
  paymentAttemptTimestamp(parsed.paymentSessionExpiresAt); paymentAttemptTimestamp(parsed.receiptExpiresAt); paymentAttemptTimestamp(parsed.customerExpiresAt);
  const environment = paymentAttemptEnvironment(parsed.environment);
  const providerCode = provider(parsed.providerCode);
  const methodConfig = paymentAttemptMethodConfig(providerCode, plain(parsed.methodConfig));
  const publicConfig = paymentAttemptPublicConfig(plain(parsed.publicConfig));
  const result = Object.freeze({
    outcome: outcome === "created" ? "created" as const : "replayed" as const,
    attemptId: paymentAttemptUuid(parsed.attemptId), storeId: paymentAttemptUuid(parsed.storeId),
    paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId), profileId: paymentAttemptUuid(parsed.profileId),
    providerCode, environment,
    executionAdapterVersion: paymentAttemptInteger(parsed.executionAdapterVersion),
    executionEvidenceDigest: paymentAttemptExecutionEvidenceDigest(parsed.executionEvidenceDigest),
    credentialVersion: paymentAttemptInteger(parsed.credentialVersion), amountMinor: paymentAttemptInteger(parsed.amountMinor),
    currency: paymentAttemptCurrency(parsed.currency), methodConfig, publicConfig,
    sealedCredentials: paymentAttemptSealedCredentials(plain(parsed.sealedCredentials)),
    paymentSessionKeyId: text(parsed.paymentSessionKeyId, 1, 128, KEY_ID),
    receiptKeyId: text(parsed.receiptKeyId, 1, 128, KEY_ID),
    customerKeyId: text(parsed.customerKeyId, 1, 128, KEY_ID),
  });
  if (result.attemptId !== expected.operationId || result.paymentMethodId !== expected.paymentMethodId
    || result.currency !== "TRY" || publicConfig.environment !== environment
    || methodConfig.environment !== environment) invalid();
  return result;
}

export function parseHostedBeginV2(
  value: unknown,
  outcome: string,
  expected: Readonly<{
    operationId: string;
    paymentMethodId: string;
    sessionId: string;
    authorityDigest: string;
    evaluatorAuthorityDigest: string;
    orderId: string;
    customerId: string;
  }>,
): HostedCheckoutBeginV2Result {
  const parsed = hostedExact(value, [...HOSTED_BEGIN_RESULT_FIELDS, "authority", "promotionReservation"]);
  const basePayload: Record<string, unknown> = {};
  for (const field of HOSTED_BEGIN_RESULT_FIELDS) basePayload[field] = parsed[field];
  const base = parseHostedBegin(basePayload, outcome, expected);
  const authority = parseHostedAuthorityV2(parsed.authority);
  if (base.amountMinor !== authority.totalMinor
    || base.storeId !== authority.storeId
    || base.paymentMethodId !== authority.paymentMethodId
    || base.profileId !== authority.profileId
    || base.providerCode !== authority.providerCode
    || base.environment !== authority.environment
    || base.executionAdapterVersion !== authority.executionAdapterVersion
    || base.executionEvidenceDigest !== authority.executionEvidenceDigest
    || base.credentialVersion !== authority.credentialVersion
    || base.currency !== authority.currency
    || authority.authorityDigest !== expected.authorityDigest
    || authority.evaluatorAuthorityDigest !== expected.evaluatorAuthorityDigest
    || authority.orderId !== expected.orderId
    || authority.customerId !== expected.customerId) invalid();
  const requiresReservation = authority.discountMinor > 0
    || authority.appliedPromotions.length > 0
    || authority.gifts.length > 0;
  let promotionReservation: HostedCheckoutPromotionReservation | null = null;
  if (parsed.promotionReservation === null) {
    if (requiresReservation) invalid();
  } else {
    if (!requiresReservation) invalid();
    const reservation = hostedExact(parsed.promotionReservation, [
      "reservationGroupId", "status", "expiresAt", "evaluatorFingerprint",
    ]);
    if (reservation.status !== "reserved") invalid();
    const expiresAt = paymentAttemptTimestamp(reservation.expiresAt);
    if (expiresAt !== paymentAttemptTimestamp(parsed.receiptExpiresAt)) invalid();
    promotionReservation = Object.freeze({
      reservationGroupId: paymentAttemptUuid(reservation.reservationGroupId),
      status: "reserved",
      expiresAt,
      evaluatorFingerprint: paymentAttemptDigest(reservation.evaluatorFingerprint),
    });
  }
  return Object.freeze({ ...base, authority, promotionReservation });
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
