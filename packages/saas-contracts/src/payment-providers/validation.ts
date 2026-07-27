import { parseMerchantAdminConfig } from "../merchant-admin/validation.ts";
import {
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_STATES,
  PAYMENT_PROVIDER_INTERACTION_MODES,
  PAYMENT_PROVIDER_READINESS,
  type MerchantPaymentMethod,
  type PaymentMethodKind,
  type PaymentMethodMutationResult,
  type PaymentMethodReorderResult,
  type PaymentMethodState,
  type PaymentProviderCatalogEntry,
  type PaymentProviderCategory,
  type PaymentProviderEnvironment,
  type PaymentProviderInteractionMode,
  type PaymentProviderReadiness,
  type PaymentProviderSupport,
} from "./types.ts";

const ENCODER = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOGO = /^\/payment-providers\/[a-z0-9_]+\.(?:svg|png|webp)$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const CATEGORIES = Object.freeze(["bank_pos", "payment_institution", "wallet", "international"] as const);
const SUPPORT = Object.freeze(["yes", "no", "unknown"] as const);
const ENVIRONMENTS = Object.freeze(["test", "live"] as const);
const ENTRY_KEYS = Object.freeze([
  "aliases", "category", "environments", "familyCode", "interactionMode", "label",
  "logoPath", "modeCode", "modeLabel", "providerCode", "readiness", "sourceSlug", "support",
]);
const METHOD_KEYS = Object.freeze([
  "config", "createdAt", "emergencyReason", "id", "kind", "label", "position",
  "profileId", "providerCode", "state", "updatedAt", "version",
]);
const MUTATION_KEYS = Object.freeze(["id", "position", "replayed", "state", "updatedAt", "version"]);
const SUPPORT_KEYS = Object.freeze(["cancel", "capture", "installments", "refund", "threeDSecure"]);

function invalid(): never {
  throw new Error("payment_provider_contract_invalid");
}

function dataObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
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
  const selected = text(value, 1, 64);
  if (!CODE.test(selected) || selected === "dummy_payment") invalid();
  return selected;
}

function uuid(value: unknown): string {
  const selected = text(value, 36, 36);
  if (!UUID.test(selected)) invalid();
  return selected;
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function timestamp(value: unknown): string {
  const selected = text(value, 24, 24);
  if (new Date(selected).toISOString() !== selected) invalid();
  return selected;
}

function member<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) invalid();
  return value as T;
}

function stringList(value: unknown, maximum: number): readonly string[] {
  const selected = denseArray(value, 0, maximum).map((entry) => text(entry, 1, 120));
  if (new Set(selected).size !== selected.length) invalid();
  return Object.freeze(selected);
}

function environments(value: unknown): readonly PaymentProviderEnvironment[] {
  const selected = denseArray(value, 1, 2).map((entry) => member(entry, ENVIRONMENTS));
  if (new Set(selected).size !== selected.length) invalid();
  return Object.freeze(selected);
}

function providerSupport(value: unknown): PaymentProviderCatalogEntry["support"] {
  const parsed = dataObject(value, SUPPORT_KEYS);
  return Object.freeze({
    threeDSecure: member(parsed.threeDSecure, SUPPORT) as PaymentProviderSupport,
    installments: member(parsed.installments, SUPPORT) as PaymentProviderSupport,
    refund: member(parsed.refund, SUPPORT) as PaymentProviderSupport,
    cancel: member(parsed.cancel, SUPPORT) as PaymentProviderSupport,
    capture: member(parsed.capture, SUPPORT) as PaymentProviderSupport,
  });
}

export function parsePaymentProviderCatalogEntry(value: unknown): PaymentProviderCatalogEntry {
  const parsed = dataObject(value, ENTRY_KEYS);
  const providerCode = code(parsed.providerCode);
  const sourceSlug = text(parsed.sourceSlug, 1, 96);
  if (!SLUG.test(sourceSlug) || sourceSlug === "dummy-payment" || providerCode !== sourceSlug.replaceAll("-", "_")) invalid();
  const logoPath = text(parsed.logoPath, 1, 160);
  if (!LOGO.test(logoPath)) invalid();
  const interactionMode = member(parsed.interactionMode, PAYMENT_PROVIDER_INTERACTION_MODES);
  if (interactionMode === "offline") invalid();
  return Object.freeze({
    providerCode,
    familyCode: code(parsed.familyCode),
    modeCode: code(parsed.modeCode),
    sourceSlug,
    label: text(parsed.label, 1, 120),
    modeLabel: text(parsed.modeLabel, 1, 120),
    category: member(parsed.category, CATEGORIES) as PaymentProviderCategory,
    interactionMode: interactionMode as Exclude<PaymentProviderInteractionMode, "offline">,
    readiness: member(parsed.readiness, PAYMENT_PROVIDER_READINESS) as PaymentProviderReadiness,
    support: providerSupport(parsed.support),
    logoPath,
    aliases: stringList(parsed.aliases, 32),
    environments: environments(parsed.environments),
  });
}

export function parsePaymentProviderCatalog(value: unknown): readonly PaymentProviderCatalogEntry[] {
  const selected = denseArray(value, 0, 100).map(parsePaymentProviderCatalogEntry);
  const providerCodes = selected.map((entry) => entry.providerCode);
  const modes = selected.map((entry) => entry.familyCode + "\u0000" + entry.modeCode);
  if (new Set(providerCodes).size !== selected.length || new Set(modes).size !== selected.length) invalid();
  return Object.freeze(selected);
}

function config(value: unknown): MerchantPaymentMethod["config"] {
  try {
    const parsed = parseMerchantAdminConfig(value);
    if (ENCODER.encode(JSON.stringify(parsed)).byteLength > 8_192) invalid();
    return parsed;
  } catch {
    return invalid();
  }
}

export function parseMerchantPaymentMethod(value: unknown): MerchantPaymentMethod {
  const parsed = dataObject(value, METHOD_KEYS);
  const kind = member(parsed.kind, PAYMENT_METHOD_KINDS) as PaymentMethodKind;
  const profileId = parsed.profileId === null ? null : uuid(parsed.profileId);
  const providerCode = parsed.providerCode === null ? null : code(parsed.providerCode);
  if (kind === "provider" ? profileId === null || providerCode === null : profileId !== null || providerCode !== null) invalid();
  const state = member(parsed.state, PAYMENT_METHOD_STATES) as PaymentMethodState;
  const emergencyReason = parsed.emergencyReason === null ? null : text(parsed.emergencyReason, 1, 240);
  if ((state === "emergency_disabled") !== (emergencyReason !== null)) invalid();
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  if (updatedAt < createdAt) invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    kind,
    profileId,
    providerCode,
    label: text(parsed.label, 1, 120),
    state,
    emergencyReason,
    position: integer(parsed.position, 0, 9_999),
    config: config(parsed.config),
    version: integer(parsed.version, 1),
    createdAt,
    updatedAt,
  });
}

export function parsePaymentMethodMutationResult(value: unknown): PaymentMethodMutationResult {
  const parsed = dataObject(value, MUTATION_KEYS);
  if (typeof parsed.replayed !== "boolean") invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    state: member(parsed.state, PAYMENT_METHOD_STATES) as PaymentMethodState,
    position: integer(parsed.position, 0, 9_999),
    version: integer(parsed.version, 1),
    updatedAt: timestamp(parsed.updatedAt),
    replayed: parsed.replayed,
  });
}

export function parsePaymentMethodReorderResult(value: unknown): PaymentMethodReorderResult {
  const parsed = dataObject(value, ["items", "replayed"]);
  if (typeof parsed.replayed !== "boolean") invalid();
  const items = denseArray(parsed.items, 1, 100).map(parsePaymentMethodMutationResult);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.position)).size !== items.length ||
    items.some((item) => item.replayed !== parsed.replayed)
  ) invalid();
  return Object.freeze({ items: Object.freeze(items), replayed: parsed.replayed });
}
