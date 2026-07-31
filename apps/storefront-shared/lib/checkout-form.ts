import type { CheckoutContact, CheckoutShippingAddress } from "./cart/types.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE = /^\+?[0-9][0-9 ()-]{6,30}[0-9]$/u;
const POSTAL = /^[A-Za-z0-9 -]{2,16}$/u;
const FIELDS = Object.freeze(["name", "email", "phone", "addressLine1", "addressLine2", "city", "district", "postalCode", "note"] as const);

export type CheckoutFormField = (typeof FIELDS)[number] | "form";
export type CheckoutFormDraft = Readonly<Record<(typeof FIELDS)[number], string>>;
export type ValidCheckoutForm = Readonly<{ contact: CheckoutContact; shippingAddress: CheckoutShippingAddress; note?: string }>;
export type CheckoutFormValidation = Readonly<{ ok: true; value: ValidCheckoutForm }> | Readonly<{ ok: false; errors: Readonly<Partial<Record<CheckoutFormField, string>>> }>;

function bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function valid(value: string, minimum: number, maximum: number, pattern?: RegExp): boolean {
  return value.length > 0 && !CONTROL.test(value) && bytes(value) >= minimum && bytes(value) <= maximum && (pattern?.test(value) ?? true);
}

export function validateCheckoutFormDraft(input: unknown): CheckoutFormValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).length !== FIELDS.length || FIELDS.some((field) => !Object.hasOwn(input, field))) {
    return Object.freeze({ ok: false, errors: Object.freeze({ form: "Teslimat bilgileri geçersiz." }) });
  }
  const source = input as Record<string, unknown>;
  const normalized = Object.fromEntries(FIELDS.map((field) => [field, typeof source[field] === "string" ? source[field].trim() : source[field]])) as Record<(typeof FIELDS)[number], unknown>;
  const errors: Partial<Record<CheckoutFormField, string>> = Object.create(null) as Partial<Record<CheckoutFormField, string>>;
  const checks = Object.freeze([
    ["name", 2, 200, undefined, "Ad soyadınızı kontrol edin."],
    ["email", 3, 320, EMAIL, "E-posta adresinizi kontrol edin."],
    ["phone", 8, 32, PHONE, "Telefon numaranızı kontrol edin."],
    ["addressLine1", 3, 300, undefined, "Adresinizi kontrol edin."],
    ["city", 2, 100, undefined, "Şehir bilgisini kontrol edin."],
    ["district", 2, 100, undefined, "İlçe bilgisini kontrol edin."],
    ["postalCode", 2, 16, POSTAL, "Posta kodunu kontrol edin."],
  ] as const);
  for (const [field, minimum, maximum, pattern, message] of checks) {
    const value = normalized[field];
    if (typeof value !== "string" || !valid(value, minimum, maximum, pattern)) errors[field] = message;
  }
  for (const [field, maximum] of [["addressLine2", 300], ["note", 1_000]] as const) {
    const value = normalized[field];
    if (typeof value !== "string" || value !== "" && !valid(value, 1, maximum)) errors[field] = `${field === "note" ? "Not" : "Adres"} bilgisini kontrol edin.`;
  }
  if (Object.keys(errors).length > 0) return Object.freeze({ ok: false, errors: Object.freeze(errors) });
  const contact = Object.freeze({ name: normalized.name as string, email: (normalized.email as string).toLowerCase(), phone: normalized.phone as string });
  const shippingAddress = Object.freeze({
    addressLine1: normalized.addressLine1 as string,
    ...((normalized.addressLine2 as string) ? { addressLine2: normalized.addressLine2 as string } : {}),
    city: normalized.city as string,
    district: normalized.district as string,
    postalCode: normalized.postalCode as string,
  });
  return Object.freeze({ ok: true, value: Object.freeze({ contact, shippingAddress, ...((normalized.note as string) ? { note: normalized.note as string } : {}) }) });
}
