import type { MerchantAdminJson } from "../merchant-admin/types.ts";

const ENCODER = new TextEncoder();
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const TURKISH_IBAN = /^TR\d{24}$/;

export const BUILT_IN_PAYMENT_METHODS = Object.freeze([
  "cash_on_delivery",
  "bank_transfer",
] as const);

export type BuiltInPaymentMethodKind = (typeof BUILT_IN_PAYMENT_METHODS)[number];

function invalid(): never {
  throw new TypeError("built_in_payment_method_invalid");
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
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
  try {
    structuredClone(value);
  } catch {
    invalid();
  }
  return result;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    ENCODER.encode(value).byteLength < minimum ||
    ENCODER.encode(value).byteLength > maximum ||
    CONTROL.test(value) ||
    SURROGATE.test(value)
  ) invalid();
  return value;
}

function validTurkishIban(value: unknown): string {
  const iban = text(value, 26, 26);
  if (!TURKISH_IBAN.test(iban)) invalid();
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" && character <= "Z"
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) invalid();
  return iban;
}

export function normalizeTurkishIbanInput(value: string): string {
  return value.replaceAll(" ", "").toUpperCase();
}

export function isBuiltInPaymentMethodKind(value: unknown): value is BuiltInPaymentMethodKind {
  return typeof value === "string" && BUILT_IN_PAYMENT_METHODS.includes(value as BuiltInPaymentMethodKind);
}

export function parseBuiltInPaymentMethodConfig(
  kind: unknown,
  value: unknown,
): Readonly<Record<string, MerchantAdminJson>> {
  try {
    if (kind === "cash_on_delivery") {
      const parsed = exactObject(value, ["instructions"]);
      return Object.freeze({ instructions: text(parsed.instructions, 0, 500) });
    }
    if (kind === "bank_transfer") {
      const parsed = exactObject(value, ["accountHolder", "bankName", "iban", "instructions"]);
      return Object.freeze({
        accountHolder: text(parsed.accountHolder, 2, 160),
        bankName: text(parsed.bankName, 2, 120),
        iban: validTurkishIban(parsed.iban),
        instructions: text(parsed.instructions, 0, 500),
      });
    }
  } catch {
    return invalid();
  }
  return invalid();
}
