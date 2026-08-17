import type { CheckoutContact, CheckoutShippingAddress } from "./cart/types.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE = /^\+90[1-9][0-9]{9}$/u;
const PHONE_INPUT = /^[+0-9 ().-]+$/u;
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

function checkoutName(value: unknown): string | null {
  if (typeof value !== "string" || CONTROL.test(value) || /[^\S ]/u.test(value)) return null;
  const normalized = value.trim().replace(/ +/gu, " ");
  if (!valid(normalized, 2, 200)) return null;
  const split = normalized.lastIndexOf(" ");
  const firstName = split > 0 ? normalized.slice(0, split) : normalized;
  const lastName = split > 0 ? normalized.slice(split + 1) : "-";
  return firstName.length <= 100 && lastName.length <= 100 ? normalized : null;
}

function checkoutPhone(value: unknown): string | null {
  if (typeof value !== "string" || CONTROL.test(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length < 10 || trimmed.length > 24 || !PHONE_INPUT.test(trimmed)) return null;
  const compact = trimmed.replace(/[ ().-]/gu, "");
  const local = compact.startsWith("+90")
    ? compact.slice(3)
    : compact.startsWith("90")
      ? compact.slice(2)
      : compact.startsWith("0")
        ? compact.slice(1)
        : compact;
  const canonical = `+90${local}`;
  return PHONE.test(canonical) ? canonical : null;
}

export function validateCheckoutFormDraft(input: unknown): CheckoutFormValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).length !== FIELDS.length || FIELDS.some((field) => !Object.hasOwn(input, field))) {
    return Object.freeze({ ok: false, errors: Object.freeze({ form: "Teslimat bilgileri geçersiz." }) });
  }
  const source = input as Record<string, unknown>;
  const normalized = Object.fromEntries(FIELDS.map((field) => [field, typeof source[field] === "string" ? source[field].trim() : source[field]])) as Record<(typeof FIELDS)[number], unknown>;
  normalized.name = checkoutName(source.name) ?? source.name;
  normalized.phone = checkoutPhone(source.phone) ?? source.phone;
  const errors: Partial<Record<CheckoutFormField, string>> = Object.create(null) as Partial<Record<CheckoutFormField, string>>;
  const checks = Object.freeze([
    ["email", 3, 320, EMAIL, "E-posta adresinizi kontrol edin."],
    ["phone", 13, 13, PHONE, "Telefon numaranızı 0555 111 22 33 veya +905551112233 biçiminde yazın."],
    ["addressLine1", 3, 300, undefined, "Adresinizi kontrol edin."],
    ["city", 2, 100, undefined, "Şehir bilgisini kontrol edin."],
    ["district", 2, 100, undefined, "İlçe bilgisini kontrol edin."],
  ] as const);
  if (checkoutName(source.name) === null) errors.name = "Ad soyadınızı kontrol edin.";
  for (const [field, minimum, maximum, pattern, message] of checks) {
    const value = normalized[field];
    if (typeof value !== "string" || !valid(value, minimum, maximum, pattern)) errors[field] = message;
  }
  for (const [field, maximum, pattern] of [["addressLine2", 300, undefined], ["postalCode", 16, POSTAL], ["note", 500, undefined]] as const) {
    const value = normalized[field];
    if (typeof value !== "string" || value !== "" && !valid(value, 1, maximum, pattern)) errors[field] = `${field === "note" ? "Not" : field === "postalCode" ? "Posta kodu" : "Adres"} bilgisini kontrol edin.`;
  }
  if (Object.keys(errors).length > 0) return Object.freeze({ ok: false, errors: Object.freeze(errors) });
  const contact = Object.freeze({ name: normalized.name as string, email: (normalized.email as string).toLowerCase(), phone: normalized.phone as string });
  const shippingAddress = Object.freeze({
    addressLine1: normalized.addressLine1 as string,
    ...((normalized.addressLine2 as string) ? { addressLine2: normalized.addressLine2 as string } : {}),
    city: normalized.city as string,
    district: normalized.district as string,
    ...((normalized.postalCode as string) ? { postalCode: normalized.postalCode as string } : {}),
  });
  return Object.freeze({ ok: true, value: Object.freeze({ contact, shippingAddress, ...((normalized.note as string) ? { note: normalized.note as string } : {}) }) });
}
