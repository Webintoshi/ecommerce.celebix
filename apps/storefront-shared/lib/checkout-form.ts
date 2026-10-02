import type { CheckoutContact, CheckoutShippingAddress } from "./cart/types.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE = /^\+[1-9][0-9]{7,14}$/u;
const POSTAL = /^[A-Za-z0-9 -]{2,16}$/u;
const FIELDS = Object.freeze(["firstName", "lastName", "email", "phone", "addressLine1", "city", "district", "postalCode", "note"] as const);

export type CheckoutFormField = (typeof FIELDS)[number] | "form";
export type CheckoutFormDraft = Readonly<Record<(typeof FIELDS)[number], string>>;
export type ValidCheckoutForm = Readonly<{ contact: CheckoutContact; shippingAddress: CheckoutShippingAddress; note?: string }>;
export type CheckoutFormValidation = Readonly<{ ok: true; value: ValidCheckoutForm }> | Readonly<{ ok: false; errors: Readonly<Partial<Record<CheckoutFormField, string>>> }>;

function bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function valid(value: string, minimum: number, maximum: number, pattern?: RegExp): boolean {
  return value.length > 0 && !CONTROL.test(value) && bytes(value) >= minimum && bytes(value) <= maximum && (pattern?.test(value) ?? true);
}

function checkoutNamePart(value: unknown): string | null {
  if (typeof value !== "string" || CONTROL.test(value) || /[^\S ]/u.test(value)) return null;
  const normalized = value.trim().replace(/ +/gu, " ");
  return valid(normalized, 1, 100) ? normalized : null;
}

export function validateCheckoutFormDraft(input: unknown): CheckoutFormValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).length !== FIELDS.length || FIELDS.some((field) => !Object.hasOwn(input, field))) {
    return Object.freeze({ ok: false, errors: Object.freeze({ form: "Teslimat bilgileri geçersiz." }) });
  }
  const source = input as Record<string, unknown>;
  const normalized = Object.fromEntries(FIELDS.map((field) => [field, typeof source[field] === "string" ? source[field].trim() : source[field]])) as Record<(typeof FIELDS)[number], unknown>;
  normalized.firstName = checkoutNamePart(source.firstName) ?? source.firstName;
  normalized.lastName = checkoutNamePart(source.lastName) ?? source.lastName;
  const errors: Partial<Record<CheckoutFormField, string>> = Object.create(null) as Partial<Record<CheckoutFormField, string>>;
  const checks = Object.freeze([
    ["email", 3, 320, EMAIL, "E-posta adresinizi kontrol edin."],
    ["phone", 9, 16, PHONE, "Ülke kodunu seçip geçerli bir telefon numarası yazın."],
    ["addressLine1", 3, 300, undefined, "Adresinizi kontrol edin."],
    ["city", 2, 100, undefined, "Şehir bilgisini kontrol edin."],
    ["district", 2, 100, undefined, "İlçe bilgisini kontrol edin."],
    ["postalCode", 2, 16, POSTAL, "Posta kodunuzu kontrol edin."],
  ] as const);
  if (checkoutNamePart(source.firstName) === null) errors.firstName = "Adınızı kontrol edin.";
  if (checkoutNamePart(source.lastName) === null) errors.lastName = "Soyadınızı kontrol edin.";
  const name = `${normalized.firstName} ${normalized.lastName}`;
  // The existing delivery wire contract stores one name and SQL splits at its last space.
  if (!errors.firstName && !errors.lastName && (!valid(name, 2, 200) || bytes(name.slice(0, name.lastIndexOf(" "))) > 100)) {
    errors.lastName = "Ad ve soyad bilgilerinizi kısaltarak kontrol edin.";
  }
  for (const [field, minimum, maximum, pattern, message] of checks) {
    const value = normalized[field];
    if (typeof value !== "string" || !valid(value, minimum, maximum, pattern)) errors[field] = message;
  }
  for (const [field, maximum, pattern] of [["note", 500, undefined]] as const) {
    const value = normalized[field];
    if (typeof value !== "string" || value !== "" && !valid(value, 1, maximum, pattern)) errors[field] = "Not bilgisini kontrol edin.";
  }
  if (Object.keys(errors).length > 0) return Object.freeze({ ok: false, errors: Object.freeze(errors) });
  const contact = Object.freeze({ name, email: (normalized.email as string).toLowerCase(), phone: normalized.phone as string });
  const shippingAddress = Object.freeze({
    addressLine1: normalized.addressLine1 as string,
    city: normalized.city as string,
    district: normalized.district as string,
    postalCode: normalized.postalCode as string,
  });
  return Object.freeze({ ok: true, value: Object.freeze({ contact, shippingAddress, ...((normalized.note as string) ? { note: normalized.note as string } : {}) }) });
}
