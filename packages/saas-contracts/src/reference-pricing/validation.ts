import type {
  FxPricingPolicy,
  GoldPricingPolicy,
  ReferenceDefinition,
  VariantPricingPolicy,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const MAX_PRICE_CENTS = 8_000_000_000;
const MAX_INTEGER_PART = BigInt(Number.MAX_SAFE_INTEGER);

type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never {
  throw new TypeError("reference_pricing_contract_invalid");
}

function guarded<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    return invalid();
  }
}

function record(value: unknown): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): InputRecord {
  const descriptors = Object.getOwnPropertyDescriptors(record(value));
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function text(value: unknown, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max
    || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

function uuid(value: unknown): string {
  const parsed = text(value, 36, 36);
  if (!UUID.test(parsed)) invalid();
  return parsed;
}

function decimal(value: unknown, scale: number, positive: boolean): string {
  if (typeof value !== "string" || value.length > 25) invalid();
  const matched = DECIMAL.exec(value);
  if (!matched || (matched[2]?.length ?? 0) > scale
    || BigInt(matched[1]!) > MAX_INTEGER_PART
    || (BigInt(matched[1]!) === MAX_INTEGER_PART && matched[2] !== undefined && !/^0+$/.test(matched[2]))
    || (positive && matched[1] === "0" && (!matched[2] || /^0+$/.test(matched[2])))) invalid();
  return value;
}

function purity(value: unknown): string {
  const parsed = decimal(value, 8, true);
  const [integer, fraction] = parsed.split(".");
  if (integer !== "0" && (integer !== "1" || (fraction !== undefined && !/^0+$/.test(fraction)))) invalid();
  return parsed;
}

function fixedCents(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_PRICE_CENTS) invalid();
  return value as number;
}

function labor(parsed: InputRecord, gold: false): Readonly<{
  laborMode?: "none" | "per_item_try";
  laborAmount?: string;
}>;
function labor(parsed: InputRecord, gold: true): Readonly<{
  laborMode?: "none" | "per_item_try" | "per_gram_try";
  laborAmount?: string;
}>;
function labor(parsed: InputRecord, gold: boolean): Readonly<{
  laborMode?: "none" | "per_item_try" | "per_gram_try";
  laborAmount?: string;
}> {
  const mode = parsed.laborMode;
  if (mode === undefined) {
    if (Object.hasOwn(parsed, "laborAmount")) invalid();
    return gold ? { laborMode: "none" } : {};
  }
  if (mode === "none") {
    if (Object.hasOwn(parsed, "laborAmount")) invalid();
    return { laborMode: "none" };
  }
  if (mode !== "per_item_try" && !(gold && mode === "per_gram_try")) invalid();
  if (!Object.hasOwn(parsed, "laborAmount")) invalid();
  return {
    laborMode: mode as "per_item_try" | "per_gram_try",
    laborAmount: decimal(parsed.laborAmount, 8, false),
  };
}

export function parseReferenceDefinition(value: unknown): ReferenceDefinition {
  return guarded(() => {
    const parsed = exact(value, ["id", "kind", "label", "rateTry"], ["referencePurity"]);
    if (parsed.kind !== "usd" && parsed.kind !== "eur" && parsed.kind !== "gold_gram") invalid();
    if (parsed.kind !== "gold_gram" && Object.hasOwn(parsed, "referencePurity")) invalid();
    const definition: ReferenceDefinition = {
      id: uuid(parsed.id),
      kind: parsed.kind,
      label: text(parsed.label, 1, 120),
      rateTry: decimal(parsed.rateTry, 8, true),
      ...(Object.hasOwn(parsed, "referencePurity") ? { referencePurity: purity(parsed.referencePurity) } : {}),
    };
    return Object.freeze(definition);
  });
}

export function parseVariantPricingPolicy(value: unknown): VariantPricingPolicy {
  return guarded(() => {
    const method = exact(value, ["method"], [
      "fixedPriceCents", "referenceId", "sourceAmount", "metalGrams", "purityMode",
      "productPurity", "laborMode", "laborAmount", "upliftPercent", "allowFullDiscount",
    ]).method;
    if (method === "fixed_try") {
      const parsed = exact(value, ["method", "fixedPriceCents"]);
      return Object.freeze({ method, fixedPriceCents: fixedCents(parsed.fixedPriceCents) });
    }
    if (method === "usd" || method === "eur") {
      const parsed = exact(value, ["method", "referenceId", "sourceAmount"], ["upliftPercent", "laborMode", "laborAmount"]);
      const selectedLabor = labor(parsed, false);
      const policy: FxPricingPolicy = {
        method,
        referenceId: uuid(parsed.referenceId),
        sourceAmount: decimal(parsed.sourceAmount, 8, false),
        ...(Object.hasOwn(parsed, "upliftPercent") ? { upliftPercent: decimal(parsed.upliftPercent, 8, false) } : {}),
        ...selectedLabor,
      };
      return Object.freeze(policy);
    }
    if (method === "gold_gram") {
      const parsed = exact(value, ["method", "referenceId", "metalGrams", "purityMode"], [
        "productPurity", "laborMode", "laborAmount", "upliftPercent", "allowFullDiscount",
      ]);
      if (parsed.purityMode !== "direct" && parsed.purityMode !== "ratio") invalid();
      if (parsed.purityMode === "direct" && Object.hasOwn(parsed, "productPurity")) invalid();
      if (parsed.purityMode === "ratio" && !Object.hasOwn(parsed, "productPurity")) invalid();
      if (Object.hasOwn(parsed, "allowFullDiscount") && typeof parsed.allowFullDiscount !== "boolean") invalid();
      const selectedLabor = labor(parsed, true);
      const policy: GoldPricingPolicy = {
        method,
        referenceId: uuid(parsed.referenceId),
        metalGrams: decimal(parsed.metalGrams, 6, false),
        purityMode: parsed.purityMode,
        ...(parsed.purityMode === "ratio" ? { productPurity: purity(parsed.productPurity) } : {}),
        laborMode: selectedLabor.laborMode ?? "none",
        ...(selectedLabor.laborAmount === undefined ? {} : { laborAmount: selectedLabor.laborAmount }),
        upliftPercent: Object.hasOwn(parsed, "upliftPercent") ? decimal(parsed.upliftPercent, 8, false) : "0",
        allowFullDiscount: Object.hasOwn(parsed, "allowFullDiscount") ? parsed.allowFullDiscount as boolean : false,
      };
      return Object.freeze(policy);
    }
    return invalid();
  });
}
