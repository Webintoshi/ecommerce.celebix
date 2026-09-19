import {
  parseReferenceIdentity,
  parseVariantPricingPolicy,
  type ReferenceIdentity,
  type VariantPricingPolicy,
} from "@celebix/saas-contracts";
import type {
  ActivatedReferenceSet,
  ReferenceDefinitionList,
  ReferenceImpactPreview,
  ReferenceSetDetail,
  ReferenceSetList,
  ReferenceSetValue,
  VariantPolicyProjection,
} from "@celebix/saas-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const MICROSECOND_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_WHOLE = "9007199254740991";
type JsonRecord = Readonly<Record<string, unknown>>;

function invalid(): never { throw new TypeError("reference_pricing_http_invalid"); }

export function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

export function dense(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

export function id(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

export function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

export function digest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

export function label(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 120
    || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

export function decimal(value: unknown, scale: number, positive: boolean, purity = false): string {
  if (typeof value !== "string" || value.length > 25) invalid();
  const match = DECIMAL.exec(value);
  if (!match || (match[2]?.length ?? 0) > scale) invalid();
  const whole = match[1]!;
  const fraction = match[2] ?? "";
  if (whole.length > MAX_WHOLE.length || (whole.length === MAX_WHOLE.length && whole > MAX_WHOLE)
    || (whole === MAX_WHOLE && /[1-9]/.test(fraction))) invalid();
  if (positive && whole === "0" && !/[1-9]/.test(fraction)) invalid();
  if (purity && !(whole === "0" || (whole === "1" && !/[1-9]/.test(fraction)))) invalid();
  return value;
}

function bool(value: unknown): boolean {
  if (value !== true && value !== false) invalid();
  return value;
}

function microsecondUtc(value: unknown): string {
  if (typeof value !== "string" || !MICROSECOND_UTC.test(value)) invalid();
  const millis = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  const parsed = new Date(millis);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== millis) invalid();
  return value;
}

export function setValues(value: unknown): readonly ReferenceSetValue[] {
  const seen = new Set<string>();
  return Object.freeze(dense(value, 1, 100).map((entry) => {
    const raw = exact(entry, ["referenceId", "rateTry", "active"]);
    const referenceId = id(raw.referenceId);
    if (seen.has(referenceId)) invalid();
    seen.add(referenceId);
    const active = bool(raw.active);
    if (active && raw.rateTry === null) invalid();
    return Object.freeze({ referenceId, rateTry: raw.rateTry === null ? null : decimal(raw.rateTry, 8, true), active });
  }));
}

export function referenceIdentity(value: unknown): ReferenceIdentity {
  return parseReferenceIdentity(value);
}

export function policy(value: unknown): VariantPricingPolicy {
  return parseVariantPricingPolicy(value);
}

export function definitionsOutput(value: unknown): ReferenceDefinitionList {
  const raw = exact(value, ["items"]);
  return Object.freeze({ items: Object.freeze(dense(raw.items, 0, 1000).map(referenceIdentity)) });
}

export function listOutput(value: unknown): ReferenceSetList {
  const raw = exact(value, ["activeSetId", "stateVersion", "items", "nextCursor"]);
  const items = dense(raw.items, 0, 100).map((entry) => {
    const item = exact(entry, ["setId", "version", "createdAt", "isActive"]);
    return Object.freeze({ setId: id(item.setId), version: integer(item.version, 1), createdAt: microsecondUtc(item.createdAt), isActive: bool(item.isActive) });
  });
  return Object.freeze({
    activeSetId: raw.activeSetId === null ? null : id(raw.activeSetId),
    stateVersion: integer(raw.stateVersion, 0),
    items: Object.freeze(items),
    nextCursor: raw.nextCursor === null ? null : integer(raw.nextCursor, 1),
  });
}

export function setOutput(value: unknown): ReferenceSetDetail {
  const raw = exact(value, ["setId", "version", "stateVersion", "isActive", "createdAt", "values"]);
  const values = dense(raw.values, 0, 100).map((entry) => {
    const item = exact(entry, ["referenceId", "kind", "label", "rateTry", "active"], ["referencePurity"]);
    if (item.kind !== "usd" && item.kind !== "eur" && item.kind !== "gold_gram") invalid();
    if (item.kind !== "gold_gram" && Object.hasOwn(item, "referencePurity")) invalid();
    const active = bool(item.active);
    if (active && item.rateTry === null) invalid();
    return Object.freeze({
      referenceId: id(item.referenceId), kind: item.kind, label: label(item.label),
      ...(Object.hasOwn(item, "referencePurity") ? { referencePurity: decimal(item.referencePurity, 8, true, true) } : {}),
      rateTry: item.rateTry === null ? null : decimal(item.rateTry, 8, true), active,
    });
  });
  return Object.freeze({
    setId: id(raw.setId), version: integer(raw.version, 1), stateVersion: integer(raw.stateVersion, 0),
    isActive: bool(raw.isActive), createdAt: microsecondUtc(raw.createdAt), values: Object.freeze(values),
  });
}

export function previewOutput(value: unknown): ReferenceImpactPreview {
  const raw = exact(value, [
    "setId", "scopeDigest", "affectedProducts", "affectedVariants", "fixedOverrideVariants",
    "unavailableVariants", "entries", "nextCursor",
  ]);
  const entries = dense(raw.entries, 0, 100).map((entry) => {
    const item = exact(entry, ["variantId", "productId", "oldPriceCents", "newPriceCents", "overriddenByPriceList"]);
    const cents = (number: unknown) => number === null ? null : integer(number, 0, 8_000_000_000);
    return Object.freeze({
      variantId: id(item.variantId), productId: id(item.productId),
      oldPriceCents: cents(item.oldPriceCents), newPriceCents: cents(item.newPriceCents),
      overriddenByPriceList: bool(item.overriddenByPriceList),
    });
  });
  return Object.freeze({
    setId: id(raw.setId), scopeDigest: digest(raw.scopeDigest),
    affectedProducts: integer(raw.affectedProducts, 0), affectedVariants: integer(raw.affectedVariants, 0),
    fixedOverrideVariants: integer(raw.fixedOverrideVariants, 0), unavailableVariants: integer(raw.unavailableVariants, 0),
    entries: Object.freeze(entries), nextCursor: raw.nextCursor === null ? null : id(raw.nextCursor),
  });
}

export function activatedOutput(value: unknown): ActivatedReferenceSet {
  const raw = exact(value, ["setId", "version", "stateVersion", "activatedAt"]);
  return Object.freeze({
    setId: id(raw.setId), version: integer(raw.version, 1),
    stateVersion: integer(raw.stateVersion, 1), activatedAt: microsecondUtc(raw.activatedAt),
  });
}

export function policyOutput(value: unknown): VariantPolicyProjection {
  const raw = exact(value, ["variantId", "variantVersion", "version", "policy", "updatedAt"]);
  return Object.freeze({
    variantId: id(raw.variantId), variantVersion: integer(raw.variantVersion, 1),
    version: integer(raw.version, 1), policy: policy(raw.policy), updatedAt: microsecondUtc(raw.updatedAt),
  });
}
