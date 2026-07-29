import type {
  CheckoutAddress,
  CheckoutDeliveryInput,
  CheckoutHttpError,
  CheckoutHttpErrorResponse,
  CheckoutPaymentMethod,
  CheckoutPolicy,
  CheckoutPolicyLink,
  CheckoutQuote,
  CheckoutQuoteItem,
  CheckoutShippingOption,
  CheckoutStatus,
  CheckoutSubmissionResult,
  CheckoutSubmitSuccess,
  CheckoutSubmitInput,
} from "./types.ts";

const ENCODER = new TextEncoder();
const MAX_ITEMS = 100;
const MAX_COMPONENT_CENTS = 500_000_000_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION_ID = UUID;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const LOGO = /^\/payment-providers\/(?:paytr|iyzico)\.svg$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const POLICY_TYPES = ["distance_sales", "pre_information", "privacy", "returns", "shipping"] as const;
const HTTP_ERRORS = ["invalid_input", "origin_denied", "cart_not_found", "cart_changed", "discount_invalid", "stock_unavailable", "payment_unavailable", "processing", "unavailable"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IBAN = /^TR\d{24}$/;
const IDENTITY_NUMBER = /^[\x21-\x7e]{5,50}$/;
const PAYMENT_TOKEN = /^[A-Za-z0-9_-]{20,4096}$/;

type InputRecord = Record<string, unknown>;
type NodeUtilTypes = Readonly<{
  isProxy?: (value: unknown) => boolean;
}>;
type NodeProcess = Readonly<{
  binding?: (name: string) => unknown;
  getBuiltinModule?: (specifier: string) => unknown;
  versions?: Readonly<{ node?: unknown }>;
}>;

const NODE_PROCESS = (globalThis as typeof globalThis & { process?: NodeProcess }).process;
const IS_NODE_RUNTIME = typeof NODE_PROCESS?.versions?.node === "string";
const NODE_IS_PROXY = (() => {
  if (!IS_NODE_RUNTIME || NODE_PROCESS === undefined) return null;
  try {
    const getBuiltinModule = NODE_PROCESS.getBuiltinModule;
    if (typeof getBuiltinModule === "function") {
      const nodeTypes = Reflect.apply(
        getBuiltinModule,
        NODE_PROCESS,
        [["node", "util/types"].join(":")],
      ) as NodeUtilTypes | undefined;
      if (typeof nodeTypes?.isProxy === "function") return nodeTypes.isProxy;
    }
    const binding = NODE_PROCESS.binding;
    const legacyTypes = typeof binding === "function"
      ? Reflect.apply(binding, NODE_PROCESS, ["util"]) as NodeUtilTypes | undefined
      : undefined;
    if (typeof legacyTypes?.isProxy === "function") return legacyTypes.isProxy;
    return null;
  } catch {
    return null;
  }
})();

function isProxy(value: object): boolean {
  if (!IS_NODE_RUNTIME) return false;
  if (NODE_IS_PROXY === null) invalid();
  return NODE_IS_PROXY(value);
}

function invalid(): never {
  throw new TypeError("checkout_contract_invalid");
}

function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    return invalid();
  }
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): InputRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...required, ...optional]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const result: InputRecord = Object.create(null) as InputRecord;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output.push(descriptor.value);
  }
  return output;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || ENCODER.encode(value).byteLength < minimum || ENCODER.encode(value).byteLength > maximum || CONTROL.test(value) || EDGE.test(value) || SURROGATE.test(value)) invalid();
  return value;
}

function uuid(value: unknown): string {
  const selected = text(value, 36, 36);
  if (!UUID.test(selected)) invalid();
  return selected;
}

function shippingCode(value: unknown): "standard" {
  if (value !== "standard") invalid();
  return "standard";
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function nullableText(value: unknown, minimum: number, maximum: number): string | null {
  return value === null ? null : text(value, minimum, maximum);
}

function address(value: unknown): CheckoutAddress {
  const parsed = exact(value, ["firstName", "lastName", "line1", "district", "city", "countryCode", "phone"], ["company", "line2", "postalCode"]);
  if (parsed.countryCode !== "TR") invalid();
  return Object.freeze({
    firstName: text(parsed.firstName, 1, 120), lastName: text(parsed.lastName, 1, 120),
    ...(Object.hasOwn(parsed, "company") ? { company: text(parsed.company, 1, 160) } : {}),
    line1: text(parsed.line1, 1, 240), ...(Object.hasOwn(parsed, "line2") ? { line2: text(parsed.line2, 1, 240) } : {}),
    district: text(parsed.district, 1, 120), city: text(parsed.city, 1, 120),
    ...(Object.hasOwn(parsed, "postalCode") ? { postalCode: text(parsed.postalCode, 1, 32) } : {}),
    countryCode: "TR", phone: text(parsed.phone, 7, 32),
  });
}

function paymentMethod(value: unknown): CheckoutPaymentMethod {
  const candidate = exact(value, ["id", "kind", "label"], ["providerCode", "logoPath", "instructions", "bankName", "accountHolder", "iban"]);
  const id = uuid(candidate.id);
  const label = text(candidate.label, 1, 120);
  if (candidate.kind === "provider") {
    const parsed = exact(value, ["id", "kind", "label", "providerCode", "logoPath"]);
    if ((parsed.providerCode !== "paytr_iframe" && parsed.providerCode !== "iyzico_iframe") || typeof parsed.logoPath !== "string" || !LOGO.test(parsed.logoPath)) invalid();
    if ((parsed.providerCode === "paytr_iframe") !== (parsed.logoPath === "/payment-providers/paytr.svg")) invalid();
    return Object.freeze({ id, kind: "provider", label, providerCode: parsed.providerCode, logoPath: parsed.logoPath });
  }
  if (candidate.kind === "cash_on_delivery") {
    const parsed = exact(value, ["id", "kind", "label", "instructions"]);
    return Object.freeze({ id, kind: "cash_on_delivery", label, instructions: text(parsed.instructions, 1, 2_000) });
  }
  if (candidate.kind === "bank_transfer") {
    const parsed = exact(value, ["id", "kind", "label", "bankName", "accountHolder", "iban", "instructions"]);
    const iban = text(parsed.iban, 26, 26);
    if (!IBAN.test(iban)) invalid();
    return Object.freeze({ id, kind: "bank_transfer", label, bankName: text(parsed.bankName, 1, 160), accountHolder: text(parsed.accountHolder, 1, 160), iban, instructions: text(parsed.instructions, 1, 2_000) });
  }
  return invalid();
}

function quoteItem(value: unknown): CheckoutQuoteItem {
  const parsed = exact(value, ["id", "title", "variantLabel", "quantity", "unitPriceCents", "lineTotalCents", "imagePath"]);
  const quantity = integer(parsed.quantity, 1, 9_999);
  const unitPriceCents = integer(parsed.unitPriceCents, 0, MAX_COMPONENT_CENTS);
  const lineTotalCents = integer(parsed.lineTotalCents, 0, MAX_COMPONENT_CENTS);
  if (!Number.isSafeInteger(unitPriceCents * quantity) || lineTotalCents !== unitPriceCents * quantity) invalid();
  const imagePath = nullableText(parsed.imagePath, 1, 512);
  if (imagePath !== null && (!imagePath.startsWith("/") || imagePath.includes("//") || imagePath.includes(".."))) invalid();
  return Object.freeze({ id: uuid(parsed.id), title: text(parsed.title, 1, 240), variantLabel: nullableText(parsed.variantLabel, 1, 240), quantity, unitPriceCents, lineTotalCents, imagePath });
}

function shippingOption(value: unknown): CheckoutShippingOption {
  const parsed = exact(value, ["id", "label", "description", "priceCents"]);
  return Object.freeze({ id: shippingCode(parsed.id), label: text(parsed.label, 1, 160), description: nullableText(parsed.description, 1, 1_000), priceCents: integer(parsed.priceCents, 0, MAX_COMPONENT_CENTS) });
}

function policyLink(value: unknown): CheckoutPolicyLink {
  const parsed = exact(value, ["policyType", "label", "href"]);
  if (!POLICY_TYPES.includes(parsed.policyType as CheckoutPolicyLink["policyType"]) || typeof parsed.href !== "string" || !/^\/politikalar\/(?:distance_sales|pre_information|privacy|returns|shipping)$/.test(parsed.href) || parsed.href !== `/politikalar/${parsed.policyType}`) invalid();
  return Object.freeze({ policyType: parsed.policyType as CheckoutPolicyLink["policyType"], label: text(parsed.label, 1, 160), href: parsed.href });
}

export function parseCheckoutAddress(value: unknown): CheckoutAddress { return guarded(() => address(value)); }
export function parseCheckoutPaymentMethod(value: unknown): CheckoutPaymentMethod { return guarded(() => paymentMethod(value)); }

export function parseCheckoutQuote(value: unknown): CheckoutQuote {
  return guarded(() => {
    const parsed = exact(value, ["schemaVersion", "cartId", "cartVersion", "checkoutNonce", "storeName", "currency", "locale", "items", "shippingOptions", "selectedShippingId", "paymentMethods", "policyLinks", "subtotalCents", "shippingCents", "discountCents", "totalCents", "discountCode"]);
    if (parsed.schemaVersion !== 1 || parsed.currency !== "TRY" || parsed.locale !== "tr" || typeof parsed.checkoutNonce !== "string" || !NONCE.test(parsed.checkoutNonce)) invalid();
    const items = denseArray(parsed.items, 1, MAX_ITEMS).map(quoteItem);
    const shippingOptions = denseArray(parsed.shippingOptions, 0, MAX_ITEMS).map(shippingOption);
    const paymentMethods = denseArray(parsed.paymentMethods, 1, 3).map(paymentMethod);
    const policyLinks = denseArray(parsed.policyLinks, 0, POLICY_TYPES.length).map(policyLink);
    const subtotalCents = integer(parsed.subtotalCents, 0, MAX_COMPONENT_CENTS);
    const shippingCents = integer(parsed.shippingCents, 0, MAX_COMPONENT_CENTS);
    const discountCents = integer(parsed.discountCents, 0, MAX_COMPONENT_CENTS);
    const totalCents = integer(parsed.totalCents, 0, MAX_COMPONENT_CENTS);
    const itemSubtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    if (!Number.isSafeInteger(itemSubtotal) || itemSubtotal !== subtotalCents || discountCents > subtotalCents + shippingCents || totalCents !== subtotalCents + shippingCents - discountCents) invalid();
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length || new Set(shippingOptions.map((option) => option.id)).size !== shippingOptions.length || new Set(paymentMethods.map((method) => method.id)).size !== paymentMethods.length || new Set(policyLinks.map((link) => link.policyType)).size !== policyLinks.length || paymentMethods.filter((method) => method.kind === "provider").length > 1) invalid();
    const selectedShippingId = parsed.selectedShippingId === null ? null : shippingCode(parsed.selectedShippingId);
    if ((shippingOptions.length === 0) !== (selectedShippingId === null) || (selectedShippingId === null && shippingCents !== 0) || (selectedShippingId !== null && !shippingOptions.some((option) => option.id === selectedShippingId)) || (selectedShippingId !== null && shippingCents !== shippingOptions.find((option) => option.id === selectedShippingId)!.priceCents)) invalid();
    return Object.freeze({ schemaVersion: 1, cartId: uuid(parsed.cartId), cartVersion: integer(parsed.cartVersion, 1), checkoutNonce: parsed.checkoutNonce, storeName: text(parsed.storeName, 1, 200), currency: "TRY", locale: "tr", items: Object.freeze(items), shippingOptions: Object.freeze(shippingOptions), selectedShippingId, paymentMethods: Object.freeze(paymentMethods), policyLinks: Object.freeze(policyLinks), subtotalCents, shippingCents, discountCents, totalCents, discountCode: nullableText(parsed.discountCode, 1, 64) });
  });
}

export function parseCheckoutDeliveryInput(value: unknown): CheckoutDeliveryInput {
  return guarded(() => {
    const parsed = exact(value, ["cartVersion", "checkoutNonce", "operationId", "email", "marketingOptIn", "shippingAddress", "billingAddress", "shippingId", "discountCode"]);
    const email = text(parsed.email, 3, 320);
    if (!EMAIL.test(email) || typeof parsed.checkoutNonce !== "string" || !NONCE.test(parsed.checkoutNonce) || typeof parsed.marketingOptIn !== "boolean") invalid();
    return Object.freeze({ cartVersion: integer(parsed.cartVersion, 1), checkoutNonce: parsed.checkoutNonce, operationId: uuid(parsed.operationId), email, marketingOptIn: parsed.marketingOptIn, shippingAddress: address(parsed.shippingAddress), billingAddress: parsed.billingAddress === null ? null : address(parsed.billingAddress), shippingId: parsed.shippingId === null ? null : shippingCode(parsed.shippingId), discountCode: nullableText(parsed.discountCode, 1, 64) });
  });
}

export function parseCheckoutSubmitInput(value: unknown): CheckoutSubmitInput {
  return guarded(() => {
    const parsed = exact(value, [
      "cartVersion", "checkoutNonce", "operationId", "paymentMethodId", "identityNumber", "consents",
    ]);
    if (typeof parsed.checkoutNonce !== "string" || !NONCE.test(parsed.checkoutNonce)) invalid();
    const identityNumber = parsed.identityNumber === null
      ? null
      : text(parsed.identityNumber, 5, 50);
    if (
      identityNumber !== null && (
        !IDENTITY_NUMBER.test(identityNumber) || /^(.)\1+$/.test(identityNumber) ||
        identityNumber === "12345678901"
      )
    ) invalid();
    const consents = exact(parsed.consents, ["distanceSales", "preInformation"]);
    if (consents.distanceSales !== true || consents.preInformation !== true) invalid();
    return Object.freeze({ cartVersion: integer(parsed.cartVersion, 1), checkoutNonce: parsed.checkoutNonce, operationId: uuid(parsed.operationId), paymentMethodId: uuid(parsed.paymentMethodId), identityNumber, consents: Object.freeze({ distanceSales: true, preInformation: true }) });
  });
}

export function parseCheckoutSubmissionResult(value: unknown): CheckoutSubmissionResult {
  return guarded(() => {
    const candidate = exact(value, ["kind"], ["orderNumber", "statusPath", "location"]);
    if (candidate.kind === "placed") { const parsed = exact(value, ["kind", "orderNumber", "statusPath"]); const statusPath = text(parsed.statusPath, 1, 512); if (!statusPath.startsWith("/") || statusPath.includes("//") || statusPath.includes("?", 1) || statusPath.includes("#") || statusPath.includes("..")) invalid(); return Object.freeze({ kind: "placed", orderNumber: text(parsed.orderNumber, 1, 128), statusPath }); }
    if (candidate.kind === "hosted") { const parsed = exact(value, ["kind", "location"]); const location = text(parsed.location, 1, 2_048); const url = new URL(location); if (url.protocol !== "https:" || url.username || url.password || url.hash || url.toString() !== location) invalid(); return Object.freeze({ kind: "hosted", location }); }
    return invalid();
  });
}

export function parseCheckoutSubmitSuccess(value: unknown): CheckoutSubmitSuccess {
  return guarded(() => {
    const parsed = exact(value, ["kind", "location"]);
    if (parsed.kind !== "redirect") invalid();
    const location = text(parsed.location, 1, 4_200);
    if (location === "/odeme/sonuc") {
      return Object.freeze({ kind: "redirect" as const, location });
    }
    let selected: URL;
    try {
      selected = new URL(location);
    } catch {
      return invalid();
    }
    if (
      selected.protocol !== "https:"
      || selected.username
      || selected.password
      || selected.port
      || selected.hash
      || selected.toString() !== location
    ) invalid();
    if (selected.origin === "https://www.paytr.com") {
      const prefix = "https://www.paytr.com/odeme/guvenli/";
      const token = location.slice(prefix.length);
      if (!location.startsWith(prefix) || !PAYMENT_TOKEN.test(token) || selected.search) invalid();
      return Object.freeze({ kind: "redirect" as const, location });
    }
    if (
      selected.origin !== "https://sandbox-cpp.iyzipay.com"
      && selected.origin !== "https://cpp.iyzipay.com"
    ) invalid();
    const token = selected.searchParams.get("token");
    if (
      selected.pathname !== "/"
      || selected.searchParams.size !== 2
      || [...selected.searchParams.keys()].join(",") !== "token,lang"
      || selected.searchParams.get("lang") !== "tr"
      || token === null
      || !PAYMENT_TOKEN.test(token)
      || location !== `${selected.origin}/?token=${token}&lang=tr`
    ) invalid();
    return Object.freeze({ kind: "redirect" as const, location });
  });
}

export function parseCheckoutStatus(value: unknown): CheckoutStatus {
  return guarded(() => {
    const candidate = exact(value, ["kind"], ["orderNumber", "paymentStatus", "method"]);
    if (candidate.kind === "ready") { exact(value, ["kind"]); return Object.freeze({ kind: "ready" }); }
    if (candidate.kind === "processing" || candidate.kind === "paid" || candidate.kind === "failed") { const parsed = exact(value, ["kind", "orderNumber"]); return Object.freeze({ kind: candidate.kind, orderNumber: text(parsed.orderNumber, 1, 128) }) as CheckoutStatus; }
    if (candidate.kind === "placed") { const parsed = exact(value, ["kind", "orderNumber", "paymentStatus", "method"]); if (parsed.paymentStatus !== "pending") invalid(); const method = paymentMethod(parsed.method); if (method.kind === "provider") invalid(); return Object.freeze({ kind: "placed", orderNumber: text(parsed.orderNumber, 1, 128), paymentStatus: "pending", method }); }
    return invalid();
  });
}

export function parseCheckoutHttpError(value: unknown): CheckoutHttpError {
  return guarded(() => {
    if (typeof value !== "string" || !HTTP_ERRORS.includes(value as CheckoutHttpError)) invalid();
    return value as CheckoutHttpError;
  });
}

export function parseCheckoutHttpErrorResponse(value: unknown): CheckoutHttpErrorResponse {
  return guarded(() => {
    const parsed = exact(value, ["code"]);
    return Object.freeze({ code: parseCheckoutHttpError(parsed.code) });
  });
}

export function parseCheckoutPolicy(value: unknown): CheckoutPolicy {
  return guarded(() => {
    const parsed = exact(value, ["policyType", "label", "body", "effectiveAt"]);
    if (!POLICY_TYPES.includes(parsed.policyType as CheckoutPolicy["policyType"])) invalid();
    const effectiveAt = text(parsed.effectiveAt, 24, 24);
    if (new Date(effectiveAt).toISOString() !== effectiveAt) invalid();
    return Object.freeze({ policyType: parsed.policyType as CheckoutPolicy["policyType"], label: text(parsed.label, 1, 160), body: text(parsed.body, 1, 100_000), effectiveAt });
  });
}
