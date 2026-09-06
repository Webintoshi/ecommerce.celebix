import type { PublicProduct, PublicProductMedia } from "./types.ts";
import { parsePublicProduct, parsePublicProductMedia } from "./validation.ts";
import { normalizePromotionCode } from "../promotions/validation.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ORDER_REFERENCE = /^[A-Z0-9](?:[A-Z0-9-]{0,63})$/;
const TURKISH_IBAN = /^TR\d{24}$/;
const MAX_MONEY_CENTS = 100_000_000_000;

export const FIXED_STOREFRONT_POLICIES = Object.freeze([
  Object.freeze({ key: "privacy_security", route: "/policies/privacy-security", label: "Gizlilik ve Güvenlik" }),
  Object.freeze({ key: "distance_sales", route: "/policies/distance-sales", label: "Mesafeli Satış Sözleşmesi" }),
  Object.freeze({ key: "kvkk", route: "/policies/kvkk", label: "KVKK" }),
  Object.freeze({ key: "payment_delivery", route: "/policies/payment-delivery", label: "Ödeme & Teslimat" }),
  Object.freeze({ key: "cookie_usage", route: "/policies/cookies", label: "Çerez Kullanımı" }),
  Object.freeze({ key: "returns_exchanges", route: "/policies/returns-exchanges", label: "İade & Değişim" }),
  Object.freeze({ key: "membership", route: "/policies/membership", label: "Üyelik" }),
] as const);

export type StorefrontPolicyKey = (typeof FIXED_STOREFRONT_POLICIES)[number]["key"];

export type PublicPolicyPage = Readonly<{
  key: StorefrontPolicyKey;
  label: string;
  route: string;
  published: boolean;
  html?: string;
  updatedAt?: string;
}>;

export type PublicProductSearch = Readonly<{
  items: readonly PublicProduct[];
  nextCursor?: string;
}>;

export type PublicCartLine = Readonly<{
  productId: string;
  categoryId?: string;
  variantId: string;
  slug: string;
  title: string;
  variantTitle: string;
  media?: PublicProductMedia;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  available: boolean;
}>;

export type PublicCartCheckoutBlocker =
  | "empty_cart"
  | "stock_unavailable"
  | "shipping_unavailable"
  | "payment_unavailable"
  | null;

export type PublicCart = Readonly<{
  version: number;
  currency: "TRY";
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  checkoutReady: boolean;
  checkoutBlocker: PublicCartCheckoutBlocker;
  items: readonly PublicCartLine[];
}>;

export type PublicOfflinePaymentMethod = Readonly<{
  kind: "bank_transfer" | "cash_on_delivery";
  label: string;
  instructions: string;
  bankName?: string;
  accountHolder?: string;
  iban?: string;
}>;

export type PublicHostedCardPaymentMethod = Readonly<{
  kind: "hosted_card";
  id: string;
  label: string;
  instructions: string;
  providerCode: "paytr_iframe" | "iyzico_iframe";
  presentation: "iframe" | "redirect";
  requiredCustomerFields: readonly "identity_number"[];
}>;

export type PublicPaymentMethod = PublicOfflinePaymentMethod | PublicHostedCardPaymentMethod;

export type PublicCheckoutQuote = Readonly<{
  cart: PublicCart;
  paymentMethods: readonly PublicPaymentMethod[];
  estimatedDays?: number;
}>;

export type PublicCartLineV2 = Readonly<{
  productId: string;
  categoryId?: string;
  variantId: string;
  slug: string;
  title: string;
  variantTitle: string;
  media?: PublicProductMedia;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  discountCents: number;
  payableCents: number;
  available: boolean;
}>;

export type PublicCartV2 = Readonly<{
  version: number;
  currency: "TRY";
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  lineDiscountCents: number;
  shippingDiscountCents: number;
  discountCents: number;
  totalCents: number;
  checkoutReady: boolean;
  checkoutBlocker: PublicCartCheckoutBlocker;
  items: readonly PublicCartLineV2[];
}>;

export type PublicAppliedPromotion = Readonly<{
  name: string;
  benefitKind: "percentage" | "fixed_amount" | "free_shipping" | "buy_x_get_y" | "quantity_tiers" | "bundle_price" | "gift";
  normalizedCode?: string;
  lineDiscountCents: number;
  shippingDiscountCents: number;
  discountCents: number;
}>;

export type PublicRejectedPromotion = Readonly<{
  normalizedCode: string;
  reason: "invalid_code" | "not_eligible";
}>;

export type PublicPromotionGift = Readonly<{
  variantId: string;
  quantity: number;
  autoAdd: boolean;
}>;

export type PublicPromotionEvaluationStatus =
  | Readonly<{ kind: "evaluated" }>
  | Readonly<{ kind: "not_evaluated"; reason: "cart_line_limit" }>;

export const PROMOTION_CART_LINE_LIMIT_MESSAGE = "Sepetinizde çok fazla ürün satırı olduğu için promosyon uygulanamadı.";

export type PublicCheckoutQuoteV2 = Readonly<{
  cart: PublicCartV2;
  paymentMethods: readonly PublicPaymentMethod[];
  promotionStatus: PublicPromotionEvaluationStatus;
  appliedPromotions: readonly PublicAppliedPromotion[];
  rejectedPromotions: readonly PublicRejectedPromotion[];
  gifts: readonly PublicPromotionGift[];
  progressMessages: readonly string[];
  estimatedDays?: number;
}>;

export type PublicCheckoutReceipt = Readonly<{
  orderReference: string;
  currency: "TRY";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  paymentStatus: "pending" | "completed";
  paymentMethod: PublicPaymentMethod;
  delivery: Readonly<{
    recipientName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    district?: string;
    postalCode?: string;
    country: "TR";
  }>;
  items: readonly PublicCartLine[];
  createdAt: string;
}>;

export type PublicCheckoutReceiptV2 = Readonly<{
  orderReference: string;
  currency: "TRY";
  subtotalCents: number;
  shippingCents: number;
  lineDiscountCents: number;
  shippingDiscountCents: number;
  discountCents: number;
  totalCents: number;
  paymentStatus: "pending" | "completed";
  paymentMethod: PublicPaymentMethod;
  delivery: PublicCheckoutReceipt["delivery"];
  items: readonly PublicCartLineV2[];
  promotionStatus: PublicPromotionEvaluationStatus;
  appliedPromotions: readonly PublicAppliedPromotion[];
  gifts: readonly PublicPromotionGift[];
  createdAt: string;
}>;

type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never {
  throw new TypeError("storefront_commerce_contract_invalid");
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): InputRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...required, ...optional]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) invalid();
  const length = integer(lengthDescriptor.value, minimum, maximum);
  if (Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output.push(descriptor.value);
  }
  return output;
}

function text(value: unknown, minimumBytes: number, maximumBytes: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value)) invalid();
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < minimumBytes || bytes > maximumBytes || (pattern && !pattern.test(value))) invalid();
  return value;
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function timestamp(value: unknown): string {
  const selected = text(value, 24, 24, ISO_UTC);
  const parsed = new Date(selected);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== selected) invalid();
  return selected;
}

function fixedPolicy(keyValue: unknown): (typeof FIXED_STOREFRONT_POLICIES)[number] {
  const match = FIXED_STOREFRONT_POLICIES.find(({ key }) => key === keyValue);
  if (!match) invalid();
  return match;
}

function validTurkishIban(value: unknown): string {
  const iban = text(value, 26, 26, TURKISH_IBAN);
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const expanded = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) invalid();
  return iban;
}

function cartLines(value: unknown, minimum: number, maximum: number): readonly PublicCartLine[] {
  const rows = denseArray(value, minimum, maximum);
  const output: PublicCartLine[] = [];
  const variants = new Set<string>();
  for (const row of rows) {
    const parsed = exact(row, ["productId", "variantId", "slug", "title", "variantTitle", "quantity", "unitPriceCents", "lineTotalCents", "available"], ["categoryId", "media"]);
    const productId = text(parsed.productId, 36, 36, UUID);
    const variantId = text(parsed.variantId, 36, 36, UUID);
    if (variants.has(variantId)) invalid();
    variants.add(variantId);
    const quantity = integer(parsed.quantity, 1, 9_999);
    const unitPriceCents = integer(parsed.unitPriceCents, 0, MAX_MONEY_CENTS);
    const lineTotalCents = integer(parsed.lineTotalCents, 0, MAX_MONEY_CENTS);
    if (!Number.isSafeInteger(unitPriceCents * quantity) || lineTotalCents !== unitPriceCents * quantity) invalid();
    const media = Object.hasOwn(parsed, "media") ? parsePublicProductMedia(parsed.media) : undefined;
    if (media && media.productId !== productId) invalid();
    output.push(Object.freeze({
      productId,
      ...(Object.hasOwn(parsed, "categoryId") ? { categoryId: text(parsed.categoryId, 36, 36, UUID) } : {}),
      variantId,
      slug: text(parsed.slug, 3, 100, SLUG),
      title: text(parsed.title, 1, 200),
      variantTitle: text(parsed.variantTitle, 1, 200),
      ...(media ? { media } : {}),
      quantity,
      unitPriceCents,
      lineTotalCents,
      available: bool(parsed.available),
    }));
  }
  return Object.freeze(output);
}

function cartLinesV2(
  value: unknown,
  minimum: number,
  maximum: number,
  uniqueVariants = true,
): readonly PublicCartLineV2[] {
  const rows = denseArray(value, minimum, maximum);
  const output: PublicCartLineV2[] = [];
  const variants = new Set<string>();
  for (const row of rows) {
    const parsed = exact(row, [
      "productId", "variantId", "slug", "title", "variantTitle", "quantity", "unitPriceCents",
      "lineTotalCents", "discountCents", "payableCents", "available",
    ], ["categoryId", "media"]);
    const productId = text(parsed.productId, 36, 36, UUID);
    const variantId = text(parsed.variantId, 36, 36, UUID);
    if (uniqueVariants && variants.has(variantId)) invalid();
    variants.add(variantId);
    const quantity = integer(parsed.quantity, 1, 9_999);
    const unitPriceCents = integer(parsed.unitPriceCents, 0, MAX_MONEY_CENTS);
    const lineTotalCents = integer(parsed.lineTotalCents, 0, MAX_MONEY_CENTS);
    const discountCents = integer(parsed.discountCents, 0, MAX_MONEY_CENTS);
    const payableCents = integer(parsed.payableCents, 0, MAX_MONEY_CENTS);
    if (!Number.isSafeInteger(unitPriceCents * quantity)
      || lineTotalCents !== unitPriceCents * quantity
      || discountCents > lineTotalCents
      || payableCents !== lineTotalCents - discountCents) invalid();
    const media = Object.hasOwn(parsed, "media") ? parsePublicProductMedia(parsed.media) : undefined;
    if (media && media.productId !== productId) invalid();
    output.push(Object.freeze({
      productId,
      ...(Object.hasOwn(parsed, "categoryId") ? { categoryId: text(parsed.categoryId, 36, 36, UUID) } : {}),
      variantId,
      slug: text(parsed.slug, 3, 100, SLUG),
      title: text(parsed.title, 1, 200),
      variantTitle: text(parsed.variantTitle, 1, 200),
      ...(media ? { media } : {}),
      quantity,
      unitPriceCents,
      lineTotalCents,
      discountCents,
      payableCents,
      available: bool(parsed.available),
    }));
  }
  return Object.freeze(output);
}

const PUBLIC_PROMOTION_BENEFIT_KINDS = new Set([
  "percentage", "fixed_amount", "free_shipping", "buy_x_get_y", "quantity_tiers", "bundle_price", "gift",
]);

function appliedPromotion(value: unknown): PublicAppliedPromotion {
  const parsed = exact(value, [
    "name", "benefitKind", "lineDiscountCents", "shippingDiscountCents", "discountCents",
  ], ["normalizedCode"]);
  if (typeof parsed.benefitKind !== "string" || !PUBLIC_PROMOTION_BENEFIT_KINDS.has(parsed.benefitKind)) invalid();
  const lineDiscountCents = integer(parsed.lineDiscountCents, 0, MAX_MONEY_CENTS);
  const shippingDiscountCents = integer(parsed.shippingDiscountCents, 0, MAX_MONEY_CENTS);
  const discountCents = integer(parsed.discountCents, 0, MAX_MONEY_CENTS);
  if (!Number.isSafeInteger(lineDiscountCents + shippingDiscountCents)
    || discountCents !== lineDiscountCents + shippingDiscountCents) invalid();
  let normalizedCode: string | undefined;
  if (Object.hasOwn(parsed, "normalizedCode")) {
    normalizedCode = normalizePromotionCode(parsed.normalizedCode);
    if (normalizedCode !== parsed.normalizedCode) invalid();
  }
  return Object.freeze({
    name: text(parsed.name, 1, 200),
    benefitKind: parsed.benefitKind as PublicAppliedPromotion["benefitKind"],
    ...(normalizedCode ? { normalizedCode } : {}),
    lineDiscountCents,
    shippingDiscountCents,
    discountCents,
  });
}

function rejectedPromotion(value: unknown): PublicRejectedPromotion {
  const parsed = exact(value, ["normalizedCode", "reason"]);
  if (parsed.reason !== "invalid_code" && parsed.reason !== "not_eligible") invalid();
  const normalizedCode = normalizePromotionCode(parsed.normalizedCode);
  if (normalizedCode !== parsed.normalizedCode) invalid();
  return Object.freeze({ normalizedCode, reason: parsed.reason });
}

function promotionGift(value: unknown): PublicPromotionGift {
  const parsed = exact(value, ["variantId", "quantity", "autoAdd"]);
  return Object.freeze({
    variantId: text(parsed.variantId, 36, 36, UUID),
    quantity: integer(parsed.quantity, 1, 1_000_000),
    autoAdd: bool(parsed.autoAdd),
  });
}

function promotionGifts(value: unknown): readonly PublicPromotionGift[] {
  const gifts = denseArray(value, 0, 100).map(promotionGift);
  if (new Set(gifts.map((gift) => `${gift.variantId}:${gift.autoAdd ? "1" : "0"}`)).size !== gifts.length) invalid();
  for (let index = 1; index < gifts.length; index += 1) {
    const previous = gifts[index - 1]!;
    const current = gifts[index]!;
    if (previous.variantId > current.variantId
      || (previous.variantId === current.variantId && Number(previous.autoAdd) >= Number(current.autoAdd))) invalid();
  }
  return Object.freeze(gifts);
}

function frozenMerchandiseLines(
  items: readonly PublicCartLineV2[],
  gifts: readonly PublicPromotionGift[],
): readonly PublicCartLineV2[] {
  const expectedGiftRows = gifts.flatMap((gift) => {
    if (!gift.autoAdd) return [];
    const rows: { variantId: string; quantity: number }[] = [];
    let remaining = gift.quantity;
    while (remaining > 0) {
      const quantity = Math.min(remaining, 9_999);
      rows.push({ variantId: gift.variantId, quantity });
      remaining -= quantity;
    }
    return rows;
  });
  if (expectedGiftRows.length === 0) {
    if (new Set(items.map(({ variantId }) => variantId)).size !== items.length) invalid();
    return items;
  }
  const giftStart = items.length - expectedGiftRows.length;
  if (giftStart < 1 || !expectedGiftRows.every((expected, index) => {
    const item = items[giftStart + index]!;
    return item.variantId === expected.variantId
      && item.quantity === expected.quantity
      && item.unitPriceCents === 0
      && item.lineTotalCents === 0
      && item.discountCents === 0
      && item.payableCents === 0
      && item.available;
  })) invalid();
  const merchandiseItems = items.slice(0, giftStart);
  if (new Set(merchandiseItems.map(({ variantId }) => variantId)).size !== merchandiseItems.length) invalid();
  for (const giftItem of items.slice(giftStart)) {
    const sameVariant = merchandiseItems.find(({ variantId }) => variantId === giftItem.variantId);
    if (sameVariant && sameVariant.productId !== giftItem.productId) invalid();
  }
  return Object.freeze(merchandiseItems);
}

function promotionEvaluationStatus(value: unknown): PublicPromotionEvaluationStatus {
  const parsed = exact(value, ["kind"], ["reason"]);
  if (parsed.kind === "evaluated") {
    if (Object.hasOwn(parsed, "reason")) invalid();
    return Object.freeze({ kind: "evaluated" });
  }
  if (parsed.kind !== "not_evaluated" || parsed.reason !== "cart_line_limit") invalid();
  return Object.freeze({ kind: "not_evaluated", reason: "cart_line_limit" });
}

function promotionPresentation(
  value: Readonly<Record<string, unknown>>,
  cart: PublicCartV2,
  gifts: readonly PublicPromotionGift[],
  merchandiseLineCount: number,
) {
  const appliedPromotions = denseArray(value.appliedPromotions, 0, 100).map(appliedPromotion);
  const rejectedPromotions = denseArray(value.rejectedPromotions, 0, 5).map(rejectedPromotion);
  const progressMessages = denseArray(value.progressMessages, 0, 2).map((message) => text(message, 1, 200));
  const promotionStatus = promotionEvaluationStatus(value.promotionStatus);
  const appliedCodes = appliedPromotions.flatMap((promotion) => promotion.normalizedCode ? [promotion.normalizedCode] : []);
  const rejectedCodes = rejectedPromotions.map((promotion) => promotion.normalizedCode);
  if (new Set([...appliedCodes, ...rejectedCodes]).size !== appliedCodes.length + rejectedCodes.length) invalid();
  const appliedDiscount = appliedPromotions.reduce((total, promotion) => total + promotion.discountCents, 0);
  if (!Number.isSafeInteger(appliedDiscount) || appliedDiscount !== cart.discountCents) invalid();
  if (promotionStatus.kind === "evaluated") {
    if (merchandiseLineCount > 20) invalid();
  } else if (merchandiseLineCount <= 20 || cart.discountCents !== 0 || appliedPromotions.length !== 0
    || rejectedPromotions.length !== 0 || gifts.length !== 0 || progressMessages.length !== 1
    || progressMessages[0] !== PROMOTION_CART_LINE_LIMIT_MESSAGE) invalid();
  return Object.freeze({
    promotionStatus,
    appliedPromotions: Object.freeze(appliedPromotions),
    rejectedPromotions: Object.freeze(rejectedPromotions),
    gifts: Object.freeze(gifts),
    progressMessages: Object.freeze(progressMessages),
  });
}

function paymentMethod(value: unknown): PublicPaymentMethod {
  const parsed = exact(
    value,
    ["kind", "label", "instructions"],
    ["bankName", "accountHolder", "iban", "id", "providerCode", "presentation", "requiredCustomerFields"],
  );
  const label = text(parsed.label, 1, 120);
  const instructions = text(parsed.instructions, 1, 2_000);
  if (parsed.kind === "bank_transfer") {
    if (
      !Object.hasOwn(parsed, "bankName")
      || !Object.hasOwn(parsed, "accountHolder")
      || !Object.hasOwn(parsed, "iban")
      || Object.hasOwn(parsed, "id")
      || Object.hasOwn(parsed, "providerCode")
      || Object.hasOwn(parsed, "presentation")
      || Object.hasOwn(parsed, "requiredCustomerFields")
    ) invalid();
    return Object.freeze({
      kind: "bank_transfer",
      label,
      instructions,
      bankName: text(parsed.bankName, 1, 160),
      accountHolder: text(parsed.accountHolder, 1, 160),
      iban: validTurkishIban(parsed.iban),
    });
  }
  if (parsed.kind === "cash_on_delivery") {
    if (
      Object.hasOwn(parsed, "bankName")
      || Object.hasOwn(parsed, "accountHolder")
      || Object.hasOwn(parsed, "iban")
      || Object.hasOwn(parsed, "id")
      || Object.hasOwn(parsed, "providerCode")
      || Object.hasOwn(parsed, "presentation")
      || Object.hasOwn(parsed, "requiredCustomerFields")
    ) invalid();
    return Object.freeze({ kind: "cash_on_delivery", label, instructions });
  }
  if (parsed.kind === "hosted_card") {
    if (
      !Object.hasOwn(parsed, "id")
      || !Object.hasOwn(parsed, "providerCode")
      || !Object.hasOwn(parsed, "presentation")
      || !Object.hasOwn(parsed, "requiredCustomerFields")
      || Object.hasOwn(parsed, "bankName")
      || Object.hasOwn(parsed, "accountHolder")
      || Object.hasOwn(parsed, "iban")
    ) invalid();
    const providerCode = parsed.providerCode === "paytr_iframe" || parsed.providerCode === "iyzico_iframe"
      ? parsed.providerCode
      : invalid();
    const presentation = parsed.presentation === "iframe" || parsed.presentation === "redirect"
      ? parsed.presentation
      : invalid();
    const requiredCustomerFields = Object.freeze(denseArray(parsed.requiredCustomerFields, 0, 1).map<"identity_number">((field) => (
      field === "identity_number" ? field : invalid()
    )));
    return Object.freeze({
      kind: "hosted_card",
      id: text(parsed.id, 36, 36, UUID),
      label,
      instructions,
      providerCode,
      presentation,
      requiredCustomerFields,
    });
  }
  return invalid();
}

function receiptDelivery(value: unknown): PublicCheckoutReceipt["delivery"] {
  const parsed = exact(value, ["recipientName", "addressLine1", "city", "country"], ["addressLine2", "district", "postalCode"]);
  if (parsed.country !== "TR") invalid();
  return Object.freeze({
    recipientName: text(parsed.recipientName, 2, 201),
    addressLine1: text(parsed.addressLine1, 1, 300),
    ...(Object.hasOwn(parsed, "addressLine2") ? { addressLine2: text(parsed.addressLine2, 1, 300) } : {}),
    city: text(parsed.city, 1, 100),
    ...(Object.hasOwn(parsed, "district") ? { district: text(parsed.district, 1, 100) } : {}),
    ...(Object.hasOwn(parsed, "postalCode") ? { postalCode: text(parsed.postalCode, 1, 20) } : {}),
    country: "TR",
  });
}

export function parsePublicPolicyPage(value: unknown): PublicPolicyPage {
  const parsed = exact(value, ["key", "label", "route", "published"], ["html", "updatedAt"]);
  const definition = fixedPolicy(parsed.key);
  if (parsed.label !== definition.label || parsed.route !== definition.route) invalid();
  const published = bool(parsed.published);
  if (!published && Object.hasOwn(parsed, "html")) invalid();
  return Object.freeze({
    key: definition.key,
    label: definition.label,
    route: definition.route,
    published,
    ...(Object.hasOwn(parsed, "html") ? { html: text(parsed.html, 1, 100_000) } : {}),
    ...(Object.hasOwn(parsed, "updatedAt") ? { updatedAt: timestamp(parsed.updatedAt) } : {}),
  });
}

export function parsePublicPolicyIndex(value: unknown): readonly PublicPolicyPage[] {
  const rows = denseArray(value, FIXED_STOREFRONT_POLICIES.length, FIXED_STOREFRONT_POLICIES.length);
  const output = rows.map(parsePublicPolicyPage);
  for (let index = 0; index < output.length; index += 1) {
    if (output[index]?.key !== FIXED_STOREFRONT_POLICIES[index]?.key || Object.hasOwn(output[index]!, "html")) invalid();
  }
  return Object.freeze(output);
}

export function parsePublicProductSearch(value: unknown): PublicProductSearch {
  const parsed = exact(value, ["items"], ["nextCursor"]);
  const rows = denseArray(parsed.items, 0, 48);
  const items = Object.freeze(rows.map(parsePublicProduct));
  const ids = new Set(items.map(({ id }) => id));
  if (ids.size !== items.length) invalid();
  return Object.freeze({
    items,
    ...(Object.hasOwn(parsed, "nextCursor") ? { nextCursor: text(parsed.nextCursor, 1, 512) } : {}),
  });
}

export function parsePublicCart(value: unknown): PublicCart {
  const parsed = exact(value, ["version", "currency", "itemCount", "subtotalCents", "shippingCents", "totalCents", "checkoutReady", "checkoutBlocker", "items"]);
  if (parsed.currency !== "TRY") invalid();
  const items = cartLines(parsed.items, 0, 100);
  const itemCount = integer(parsed.itemCount, 0, 999_900);
  const subtotalCents = integer(parsed.subtotalCents, 0, MAX_MONEY_CENTS);
  const shippingCents = integer(parsed.shippingCents, 0, MAX_MONEY_CENTS);
  const totalCents = integer(parsed.totalCents, 0, MAX_MONEY_CENTS);
  const computedCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const computedSubtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (!Number.isSafeInteger(computedSubtotal) || itemCount !== computedCount || subtotalCents !== computedSubtotal || totalCents !== subtotalCents + shippingCents) invalid();
  const checkoutReady = bool(parsed.checkoutReady);
  const unavailable = items.some(({ available }) => !available);
  const checkoutBlocker: PublicCartCheckoutBlocker = parsed.checkoutBlocker === null
    ? null
    : parsed.checkoutBlocker === "empty_cart"
      || parsed.checkoutBlocker === "stock_unavailable"
      || parsed.checkoutBlocker === "shipping_unavailable"
      || parsed.checkoutBlocker === "payment_unavailable"
      ? parsed.checkoutBlocker
      : invalid();
  if (checkoutReady !== (checkoutBlocker === null)) invalid();
  if (checkoutReady && (items.length === 0 || unavailable)) invalid();
  if (checkoutBlocker === "empty_cart" && items.length !== 0) invalid();
  if (checkoutBlocker !== "empty_cart" && items.length === 0) invalid();
  if (checkoutBlocker === "stock_unavailable" && !unavailable) invalid();
  if ((checkoutBlocker === "shipping_unavailable" || checkoutBlocker === "payment_unavailable") && unavailable) invalid();
  return Object.freeze({
    version: integer(parsed.version, 0),
    currency: "TRY",
    itemCount,
    subtotalCents,
    shippingCents,
    totalCents,
    checkoutReady,
    checkoutBlocker,
    items,
  });
}

function publicCartV2(
  value: unknown,
  uniqueVariants: boolean,
  frozenGifts?: readonly PublicPromotionGift[],
): PublicCartV2 {
  const parsed = exact(value, [
    "version", "currency", "itemCount", "subtotalCents", "shippingCents", "lineDiscountCents",
    "shippingDiscountCents", "discountCents", "totalCents", "checkoutReady", "checkoutBlocker", "items",
  ]);
  if (parsed.currency !== "TRY") invalid();
  const items = cartLinesV2(parsed.items, 0, 100, uniqueVariants);
  const itemCount = integer(parsed.itemCount, 0, 999_900);
  const subtotalCents = integer(parsed.subtotalCents, 0, MAX_MONEY_CENTS);
  const shippingCents = integer(parsed.shippingCents, 0, MAX_MONEY_CENTS);
  const lineDiscountCents = integer(parsed.lineDiscountCents, 0, MAX_MONEY_CENTS);
  const shippingDiscountCents = integer(parsed.shippingDiscountCents, 0, MAX_MONEY_CENTS);
  const discountCents = integer(parsed.discountCents, 0, MAX_MONEY_CENTS);
  const totalCents = integer(parsed.totalCents, 0, MAX_MONEY_CENTS);
  const countedItems = frozenGifts ? frozenMerchandiseLines(items, frozenGifts) : items;
  const computedCount = countedItems.reduce((sum, item) => sum + item.quantity, 0);
  const computedSubtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const computedLineDiscount = items.reduce((sum, item) => sum + item.discountCents, 0);
  if (!Number.isSafeInteger(computedSubtotal) || !Number.isSafeInteger(computedLineDiscount)
    || itemCount !== computedCount || subtotalCents !== computedSubtotal
    || lineDiscountCents !== computedLineDiscount || shippingDiscountCents > shippingCents
    || !Number.isSafeInteger(lineDiscountCents + shippingDiscountCents)
    || discountCents !== lineDiscountCents + shippingDiscountCents
    || totalCents !== subtotalCents + shippingCents - discountCents) invalid();
  const checkoutReady = bool(parsed.checkoutReady);
  const unavailable = items.some(({ available }) => !available);
  const checkoutBlocker: PublicCartCheckoutBlocker = parsed.checkoutBlocker === null
    ? null
    : parsed.checkoutBlocker === "empty_cart"
      || parsed.checkoutBlocker === "stock_unavailable"
      || parsed.checkoutBlocker === "shipping_unavailable"
      || parsed.checkoutBlocker === "payment_unavailable"
      ? parsed.checkoutBlocker
      : invalid();
  if (checkoutReady !== (checkoutBlocker === null)) invalid();
  if (checkoutReady && (items.length === 0 || unavailable)) invalid();
  if (checkoutBlocker === "empty_cart" && items.length !== 0) invalid();
  if (checkoutBlocker !== "empty_cart" && items.length === 0) invalid();
  if (checkoutBlocker === "stock_unavailable" && !unavailable) invalid();
  if ((checkoutBlocker === "shipping_unavailable" || checkoutBlocker === "payment_unavailable") && unavailable) invalid();
  return Object.freeze({
    version: integer(parsed.version, 0),
    currency: "TRY",
    itemCount,
    subtotalCents,
    shippingCents,
    lineDiscountCents,
    shippingDiscountCents,
    discountCents,
    totalCents,
    checkoutReady,
    checkoutBlocker,
    items,
  });
}

export function parsePublicCartV2(value: unknown): PublicCartV2 {
  return publicCartV2(value, true);
}

export function parsePublicCheckoutQuote(value: unknown): PublicCheckoutQuote {
  const parsed = exact(value, ["cart", "paymentMethods"], ["estimatedDays"]);
  const cart = parsePublicCart(parsed.cart);
  const methods = denseArray(parsed.paymentMethods, 0, 3).map(paymentMethod);
  if (new Set(methods.map(({ kind }) => kind)).size !== methods.length) invalid();
  const hostedIds = methods.flatMap((method) => method.kind === "hosted_card" ? [method.id] : []);
  if (new Set(hostedIds).size !== hostedIds.length) invalid();
  return Object.freeze({
    cart,
    paymentMethods: Object.freeze(methods),
    ...(Object.hasOwn(parsed, "estimatedDays") ? { estimatedDays: integer(parsed.estimatedDays, 1, 365) } : {}),
  });
}

export function parsePublicCheckoutQuoteV2(value: unknown): PublicCheckoutQuoteV2 {
  const parsed = exact(value, [
    "cart", "paymentMethods", "promotionStatus", "appliedPromotions", "rejectedPromotions", "gifts", "progressMessages",
  ], ["estimatedDays"]);
  const gifts = promotionGifts(parsed.gifts);
  const cart = publicCartV2(parsed.cart, false, gifts);
  const merchandiseItems = frozenMerchandiseLines(cart.items, gifts);
  const methods = denseArray(parsed.paymentMethods, 0, 3).map(paymentMethod);
  if (new Set(methods.map(({ kind }) => kind)).size !== methods.length) invalid();
  const hostedIds = methods.flatMap((method) => method.kind === "hosted_card" ? [method.id] : []);
  if (new Set(hostedIds).size !== hostedIds.length) invalid();
  const presentation = promotionPresentation(parsed, cart, gifts, merchandiseItems.length);
  return Object.freeze({
    cart,
    paymentMethods: Object.freeze(methods),
    ...presentation,
    ...(Object.hasOwn(parsed, "estimatedDays") ? { estimatedDays: integer(parsed.estimatedDays, 1, 365) } : {}),
  });
}

export function parsePublicCheckoutReceipt(value: unknown): PublicCheckoutReceipt {
  const parsed = exact(value, ["orderReference", "currency", "subtotalCents", "shippingCents", "totalCents", "paymentStatus", "paymentMethod", "delivery", "items", "createdAt"]);
  if (parsed.currency !== "TRY" || (parsed.paymentStatus !== "pending" && parsed.paymentStatus !== "completed")) invalid();
  const selectedPaymentMethod = paymentMethod(parsed.paymentMethod);
  if (parsed.paymentStatus === "completed" && selectedPaymentMethod.kind !== "hosted_card") invalid();
  const items = cartLines(parsed.items, 1, 100);
  const subtotalCents = integer(parsed.subtotalCents, 0, MAX_MONEY_CENTS);
  const shippingCents = integer(parsed.shippingCents, 0, MAX_MONEY_CENTS);
  const totalCents = integer(parsed.totalCents, 0, MAX_MONEY_CENTS);
  const computedSubtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (!Number.isSafeInteger(computedSubtotal) || subtotalCents !== computedSubtotal || totalCents !== subtotalCents + shippingCents) invalid();
  return Object.freeze({
    orderReference: text(parsed.orderReference, 1, 64, ORDER_REFERENCE),
    currency: "TRY",
    subtotalCents,
    shippingCents,
    totalCents,
    paymentStatus: parsed.paymentStatus,
    paymentMethod: selectedPaymentMethod,
    delivery: receiptDelivery(parsed.delivery),
    items,
    createdAt: timestamp(parsed.createdAt),
  });
}


export function parsePublicCheckoutReceiptV2(value: unknown): PublicCheckoutReceiptV2 {
  const parsed = exact(value, [
    "orderReference", "currency", "subtotalCents", "shippingCents", "lineDiscountCents",
    "shippingDiscountCents", "discountCents", "totalCents", "paymentStatus", "paymentMethod", "delivery",
    "items", "promotionStatus", "appliedPromotions", "gifts", "createdAt",
  ]);
  if (parsed.currency !== "TRY" || (parsed.paymentStatus !== "pending" && parsed.paymentStatus !== "completed")) invalid();
  const selectedPaymentMethod = paymentMethod(parsed.paymentMethod);
  if (parsed.paymentStatus === "completed" && selectedPaymentMethod.kind !== "hosted_card") invalid();
  const gifts = promotionGifts(parsed.gifts);
  const items = cartLinesV2(parsed.items, 1, 100, false);
  const merchandiseItems = frozenMerchandiseLines(items, gifts);
  const subtotalCents = integer(parsed.subtotalCents, 0, MAX_MONEY_CENTS);
  const shippingCents = integer(parsed.shippingCents, 0, MAX_MONEY_CENTS);
  const lineDiscountCents = integer(parsed.lineDiscountCents, 0, MAX_MONEY_CENTS);
  const shippingDiscountCents = integer(parsed.shippingDiscountCents, 0, MAX_MONEY_CENTS);
  const discountCents = integer(parsed.discountCents, 0, MAX_MONEY_CENTS);
  const totalCents = integer(parsed.totalCents, 0, MAX_MONEY_CENTS);
  const computedSubtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const computedLineDiscount = items.reduce((sum, item) => sum + item.discountCents, 0);
  if (!Number.isSafeInteger(computedSubtotal) || !Number.isSafeInteger(computedLineDiscount)
    || subtotalCents !== computedSubtotal || lineDiscountCents !== computedLineDiscount
    || shippingDiscountCents > shippingCents || discountCents !== lineDiscountCents + shippingDiscountCents
    || totalCents !== subtotalCents + shippingCents - discountCents) invalid();
  const appliedPromotions = denseArray(parsed.appliedPromotions, 0, 100).map(appliedPromotion);
  if (appliedPromotions.reduce((total, promotion) => total + promotion.discountCents, 0) !== discountCents) invalid();
  const promotionStatus = promotionEvaluationStatus(parsed.promotionStatus);
  if ((promotionStatus.kind === "evaluated" && merchandiseItems.length > 20)
    || (promotionStatus.kind === "not_evaluated"
      && (merchandiseItems.length <= 20 || gifts.some(({ autoAdd }) => autoAdd) || discountCents !== 0
        || appliedPromotions.length !== 0 || gifts.length !== 0))) invalid();
  return Object.freeze({
    orderReference: text(parsed.orderReference, 1, 64, ORDER_REFERENCE),
    currency: "TRY",
    subtotalCents,
    shippingCents,
    lineDiscountCents,
    shippingDiscountCents,
    discountCents,
    totalCents,
    paymentStatus: parsed.paymentStatus,
    paymentMethod: selectedPaymentMethod,
    delivery: receiptDelivery(parsed.delivery),
    items,
    promotionStatus,
    appliedPromotions: Object.freeze(appliedPromotions),
    gifts: Object.freeze(gifts),
    createdAt: timestamp(parsed.createdAt),
  });
}
