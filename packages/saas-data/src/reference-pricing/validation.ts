import { parseReferenceIdentity, parseVariantPricingPolicy, type VariantPricingPolicy } from "@celebix/saas-contracts";
import { pricingAuthority, exactPricingInput, pricingUuid } from "../pricing/validation.ts";
import { pricingRepositoryErrorCode } from "../pricing/errors.ts";
import type { ValidatedOrderAuthority } from "../orders/validation.ts";
import { failure, type ReferencePricingErrorCode } from "./errors.ts";
import type {
  ActivatedReferenceSet, ReferenceDefinitionList, ReferenceImpactPreview, ReferenceSetDetail, ReferenceSetList,
  ReferenceSetValue, SavedReferenceSet, VariantPolicyProjection, VariantPolicyPreview,
} from "./types.ts";

const HEX = /^[a-f0-9]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_RATE = 9_007_199_254_740_991n;
type RecordValue = Readonly<Record<string, unknown>>;
const invalid = (): never => { throw failure("invalid_input"); };
const unavailable = (): never => { throw failure("unavailable"); };

export function exact(value: unknown, required: readonly string[], optional: readonly string[] = [], output = false): RecordValue {
  try { return exactPricingInput(value, required, optional); }
  catch { return output ? unavailable() : invalid(); }
}
export function authorityInput(value: unknown, required: readonly string[], optional: readonly string[] = []): { parsed: RecordValue; authority: ValidatedOrderAuthority } {
  const parsed = exact(value, ["tenantContext", "now", ...required], optional);
  try { return { parsed, authority: pricingAuthority(parsed.tenantContext as never, parsed.now as never) }; }
  catch (error) {
    const code = pricingRepositoryErrorCode(error);
    if (code && ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(code)) throw failure(code as ReferencePricingErrorCode);
    throw failure("durable_authority_invalid");
  }
}
export function uuid(value: unknown, output = false): string {
  try { return pricingUuid(value); } catch { return output ? unavailable() : invalid(); }
}
export function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER, output = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) return output ? unavailable() : invalid();
  return value as number;
}
export function digest(value: unknown, output = false): string {
  if (typeof value !== "string" || !HEX.test(value)) return output ? unavailable() : invalid();
  return value;
}
export function decimal(value: unknown, scale: number, positive: boolean, maximum = MAX_RATE, output = false): string {
  if (typeof value !== "string" || value.length > 26) return output ? unavailable() : invalid();
  const matched = DECIMAL.exec(value);
  if (!matched || (matched[2]?.length ?? 0) > scale) return output ? unavailable() : invalid();
  const whole = BigInt(matched[1]!);
  if (whole > maximum || (whole === maximum && matched[2] !== undefined && !/^0+$/.test(matched[2]))
    || (positive && whole === 0n && (!matched[2] || /^0+$/.test(matched[2])))) return output ? unavailable() : invalid();
  return value;
}
export function label(value: unknown, output = false): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 120 || value !== value.trim() || CONTROL.test(value)) return output ? unavailable() : invalid();
  return value;
}
export function timestamp(value: unknown): string {
  if (typeof value !== "string" || !UTC.test(value)) return unavailable();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value.replace(/(\.\d{3})\d{3}Z$/, "$1Z")) return unavailable();
  return value;
}
export function dense(value: unknown, min: number, max: number, output = false): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) return output ? unavailable() : invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) return output ? unavailable() : invalid();
  const result: unknown[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const d = descriptors[String(i)];
    if (!d || !("value" in d) || !d.enumerable) return output ? unavailable() : invalid();
    result.push(d.value);
  }
  return result;
}
export function setValues(value: unknown, output = false): readonly ReferenceSetValue[] {
  const seen = new Set<string>();
  const entries = dense(value, output ? 0 : 1, 100, output).map((entry) => {
    const raw = exact(entry, ["referenceId", "rateTry", "active"], [], output);
    const referenceId = uuid(raw.referenceId, output);
    if (seen.has(referenceId) || typeof raw.active !== "boolean") return output ? unavailable() : invalid();
    seen.add(referenceId);
    if (raw.active && raw.rateTry === null) return output ? unavailable() : invalid();
    const rateTry = raw.rateTry === null ? null : decimal(raw.rateTry, 8, true, MAX_RATE, output);
    return Object.freeze({ referenceId, rateTry, active: raw.active });
  });
  return Object.freeze(output ? entries : [...entries].sort((a, b) => a.referenceId.localeCompare(b.referenceId)));
}
export function policy(value: unknown, output = false): VariantPricingPolicy {
  try { return parseVariantPricingPolicy(value); } catch { return output ? unavailable() : invalid(); }
}
export function parseList(value: unknown): ReferenceSetList {
  const raw = exact(value, ["activeSetId", "stateVersion", "items", "nextCursor"], [], true);
  const items = dense(raw.items, 0, 100, true).map((entry) => {
    const item = exact(entry, ["setId", "version", "createdAt", "isActive"], [], true);
    if (typeof item.isActive !== "boolean") return unavailable();
    return Object.freeze({ setId: uuid(item.setId, true), version: integer(item.version, 1, Number.MAX_SAFE_INTEGER, true), createdAt: timestamp(item.createdAt), isActive: item.isActive });
  });
  return Object.freeze({ activeSetId: raw.activeSetId === null ? null : uuid(raw.activeSetId, true), stateVersion: integer(raw.stateVersion, 0, Number.MAX_SAFE_INTEGER, true), items: Object.freeze(items), nextCursor: raw.nextCursor === null ? null : integer(raw.nextCursor, 1, Number.MAX_SAFE_INTEGER, true) });
}
export function parseDefinitionsList(value: unknown): ReferenceDefinitionList {
  const raw = exact(value, ["items"], [], true);
  const items = dense(raw.items, 0, 1000, true).map((item) => {
    try { return parseReferenceIdentity(item); } catch { return unavailable(); }
  });
  return Object.freeze({ items: Object.freeze(items) });
}
export function parseSet(value: unknown): ReferenceSetDetail {
  const raw = exact(value, ["setId", "version", "stateVersion", "isActive", "createdAt", "values"], [], true);
  if (typeof raw.isActive !== "boolean") return unavailable();
  const values = dense(raw.values, 0, 100, true).map((entry) => {
    const item = exact(entry, ["referenceId", "kind", "label", "rateTry", "active"], ["referencePurity"], true);
    if (item.kind !== "usd" && item.kind !== "eur" && item.kind !== "gold_gram") return unavailable();
    if (item.kind !== "gold_gram" && Object.hasOwn(item, "referencePurity")) return unavailable();
    if (typeof item.active !== "boolean" || (item.active && item.rateTry === null)) return unavailable();
    return Object.freeze({ referenceId: uuid(item.referenceId, true), kind: item.kind, label: label(item.label, true), ...(Object.hasOwn(item, "referencePurity") ? { referencePurity: decimal(item.referencePurity, 8, true, 1n, true) } : {}), rateTry: item.rateTry === null ? null : decimal(item.rateTry, 8, true, MAX_RATE, true), active: item.active });
  });
  return Object.freeze({ setId: uuid(raw.setId, true), version: integer(raw.version, 1, Number.MAX_SAFE_INTEGER, true), stateVersion: integer(raw.stateVersion, 0, Number.MAX_SAFE_INTEGER, true), isActive: raw.isActive, createdAt: timestamp(raw.createdAt), values: Object.freeze(values) });
}
export function parseSavedSet(value: unknown): SavedReferenceSet {
  const selected = parseSet(value);
  if (selected.isActive) return unavailable();
  return selected;
}
export function parseActivated(value: unknown): ActivatedReferenceSet {
  const raw = exact(value, ["setId", "version", "stateVersion", "activatedAt"], [], true);
  return Object.freeze({ setId: uuid(raw.setId, true), version: integer(raw.version, 1, Number.MAX_SAFE_INTEGER, true), stateVersion: integer(raw.stateVersion, 1, Number.MAX_SAFE_INTEGER, true), activatedAt: timestamp(raw.activatedAt) });
}
export function parsePolicy(value: unknown): VariantPolicyProjection {
  const raw = exact(value, ["variantId", "variantVersion", "version", "policy", "updatedAt"], [], true);
  return Object.freeze({ variantId: uuid(raw.variantId, true), variantVersion: integer(raw.variantVersion, 1, Number.MAX_SAFE_INTEGER, true), version: integer(raw.version, 1, Number.MAX_SAFE_INTEGER, true), policy: policy(raw.policy, true), updatedAt: timestamp(raw.updatedAt) });
}
export function parsePolicyPreview(value: unknown): VariantPolicyPreview {
  const raw = exact(value, ["variantId", "oldPriceCents", "newPriceCents", "sourceKind", "priceListId", "activeSetId", "activeSetVersion", "referenceId", "referenceRateTry", "method", "metalComponentTry", "laborTry", "policyVersion", "variantVersion", "scopeDigest"], [], true);
  if (raw.sourceKind !== null && raw.sourceKind !== "base" && raw.sourceKind !== "price_list") return unavailable();
  if (raw.method !== "fixed_try" && raw.method !== "usd" && raw.method !== "eur" && raw.method !== "gold_gram") return unavailable();
  const cents = (entry: unknown) => entry === null ? null : integer(entry, 0, 8_000_000_000, true);
  const optionalId = (entry: unknown) => entry === null ? null : uuid(entry, true);
  const amount = (entry: unknown) => entry === null ? null : decimal(entry, 8, false, MAX_RATE, true);
  const parsed: VariantPolicyPreview = Object.freeze({
    variantId: uuid(raw.variantId, true), oldPriceCents: cents(raw.oldPriceCents), newPriceCents: cents(raw.newPriceCents),
    sourceKind: raw.sourceKind, priceListId: optionalId(raw.priceListId),
    activeSetId: optionalId(raw.activeSetId), activeSetVersion: raw.activeSetVersion === null ? null : integer(raw.activeSetVersion, 0, Number.MAX_SAFE_INTEGER, true),
    referenceId: optionalId(raw.referenceId), referenceRateTry: amount(raw.referenceRateTry), method: raw.method,
    metalComponentTry: amount(raw.metalComponentTry), laborTry: amount(raw.laborTry),
    policyVersion: integer(raw.policyVersion, 0, Number.MAX_SAFE_INTEGER, true), variantVersion: integer(raw.variantVersion, 1, Number.MAX_SAFE_INTEGER, true), scopeDigest: digest(raw.scopeDigest, true),
  });
  if ((parsed.sourceKind === "price_list") !== (parsed.priceListId !== null)) return unavailable();
  if (parsed.method === "fixed_try" && (parsed.referenceId !== null || parsed.referenceRateTry !== null || parsed.metalComponentTry !== null || parsed.laborTry !== null)) return unavailable();
  return parsed;
}
export function parsePreview(value: unknown): ReferenceImpactPreview {
  const raw = exact(value, ["setId", "scopeDigest", "affectedProducts", "affectedVariants", "fixedOverrideVariants", "unavailableVariants", "entries", "nextCursor"], [], true);
  const entries = dense(raw.entries, 0, 100, true).map((entry) => {
    const item = exact(entry, ["variantId", "productId", "oldPriceCents", "newPriceCents", "overriddenByPriceList"], [], true);
    if (typeof item.overriddenByPriceList !== "boolean") return unavailable();
    const cents = (selected: unknown) => selected === null ? null : integer(selected, 0, 8_000_000_000, true);
    return Object.freeze({ variantId: uuid(item.variantId, true), productId: uuid(item.productId, true), oldPriceCents: cents(item.oldPriceCents), newPriceCents: cents(item.newPriceCents), overriddenByPriceList: item.overriddenByPriceList });
  });
  return Object.freeze({ setId: uuid(raw.setId, true), scopeDigest: digest(raw.scopeDigest, true), affectedProducts: integer(raw.affectedProducts, 0, Number.MAX_SAFE_INTEGER, true), affectedVariants: integer(raw.affectedVariants, 0, Number.MAX_SAFE_INTEGER, true), fixedOverrideVariants: integer(raw.fixedOverrideVariants, 0, Number.MAX_SAFE_INTEGER, true), unavailableVariants: integer(raw.unavailableVariants, 0, Number.MAX_SAFE_INTEGER, true), entries: Object.freeze(entries), nextCursor: raw.nextCursor === null ? null : uuid(raw.nextCursor, true) });
}
