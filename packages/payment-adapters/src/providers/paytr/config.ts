import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { types as nodeTypes } from "node:util";

const ENCODER = new TextEncoder();
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const MERCHANT_OID = /^[A-Za-z0-9]{1,64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CALLBACK_AMOUNT = /^(?:0|[1-9][0-9]{0,14})$/;
const INSTALLMENTS = new Set([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const CREDENTIAL_KEYS = Object.freeze(["merchantId", "merchantKey", "merchantSalt"]);
const TOKEN_INPUT_KEYS = Object.freeze([
  "credential",
  "currency",
  "email",
  "maxInstallment",
  "merchantOid",
  "noInstallment",
  "paymentAmount",
  "testMode",
  "userBasket",
  "userIp",
]);
const CALLBACK_HASH_KEYS = Object.freeze([
  "credential",
  "merchantOid",
  "providedHash",
  "status",
  "totalAmount",
]);
const CALLBACK_SIGN_KEYS = Object.freeze([
  "credential",
  "merchantOid",
  "status",
  "totalAmount",
]);

export type PaytrIframeCredential = {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
};

function invalid(): never {
  throw new TypeError("paytr_invalid");
}

function credentialInvalid(): never {
  throw new TypeError("paytr_credential_invalid");
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

export function parsePaytrBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") invalid();
  const encoded = ENCODER.encode(value);
  try {
    if (
      encoded.byteLength < minimum ||
      encoded.byteLength > maximum ||
      EDGE.test(value) ||
      CONTROL.test(value) ||
      SURROGATE.test(value)
    ) invalid();
    return value;
  } finally {
    Reflect.apply(UINT8_ARRAY_FILL, encoded, [0]);
  }
}

export function parsePaytrIframeCredential(value: unknown): PaytrIframeCredential {
  try {
    const parsed = exactRecord(value, CREDENTIAL_KEYS);
    return {
      merchantId: parsePaytrBoundedString(parsed.merchantId, 1, 128),
      merchantKey: parsePaytrBoundedString(parsed.merchantKey, 1, 256),
      merchantSalt: parsePaytrBoundedString(parsed.merchantSalt, 1, 256),
    };
  } catch {
    return credentialInvalid();
  }
}

export function wipePaytrCredential(value: PaytrIframeCredential): void {
  try {
    value.merchantId = "";
    value.merchantKey = "";
    value.merchantSalt = "";
  } catch {
    // Cleanup cannot replace a stable provider outcome.
  }
}

export function parsePaytrMerchantOid(value: unknown): string {
  const selected = parsePaytrBoundedString(value, 1, 64);
  if (!MERCHANT_OID.test(selected)) invalid();
  return selected;
}

export function parsePaytrPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
  return value as number;
}

export function parsePaytrCanonicalBase64(
  value: unknown,
  maximumBytes = 16_384,
): string {
  if (typeof value !== "string" || value.length < 4 || !BASE64.test(value)) invalid();
  const bytes = Buffer.from(value, "base64");
  try {
    if (
      bytes.byteLength < 1 ||
      bytes.byteLength > maximumBytes ||
      bytes.toString("base64") !== value
    ) invalid();
    return value;
  } finally {
    bytes.fill(0);
  }
}

export function parsePaytrBasket(value: unknown): string {
  const encoded = parsePaytrCanonicalBase64(value, 8_192);
  let bytes: Buffer | undefined;
  let parsed: unknown;
  try {
    bytes = Buffer.from(encoded, "base64");
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  } finally {
    bytes?.fill(0);
  }
  if (
    !Array.isArray(parsed) ||
    nodeTypes.isProxy(parsed) ||
    Object.getPrototypeOf(parsed) !== Array.prototype ||
    parsed.length < 1 ||
    parsed.length > 100
  ) invalid();
  for (const item of parsed) {
    if (
      !Array.isArray(item) ||
      nodeTypes.isProxy(item) ||
      item.length !== 3 ||
      Object.getPrototypeOf(item) !== Array.prototype
    ) invalid();
    parsePaytrBoundedString(item[0], 1, 200);
    if (
      typeof item[1] !== "string" ||
      !/^(?:0|[1-9][0-9]{0,9})[.][0-9]{2}$/.test(item[1])
    ) invalid();
    parsePaytrPositiveInteger(item[2]);
  }
  return encoded;
}

export function encodePaytrBasket(
  items: readonly Readonly<{
    name: string;
    quantity: number;
    unitAmountMinor: number;
  }>[],
): string {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) invalid();
  const tuples = items.map((item) => {
    const name = parsePaytrBoundedString(item.name, 1, 200);
    const quantity = parsePaytrPositiveInteger(item.quantity);
    const amount = parsePaytrPositiveInteger(item.unitAmountMinor);
    const major = `${String(Math.floor(amount / 100))}.${String(amount % 100).padStart(2, "0")}`;
    return [name, major, quantity];
  });
  return parsePaytrBasket(Buffer.from(JSON.stringify(tuples), "utf8").toString("base64"));
}

export function parsePaytrEmail(value: unknown): string {
  const selected = parsePaytrBoundedString(value, 3, 100);
  if (!/^[\x21-\x7e]+@[A-Za-z0-9.-]+$/.test(selected) || selected.includes("..")) invalid();
  return selected;
}

export function parsePaytrUserIp(value: unknown): string {
  const selected = parsePaytrBoundedString(value, 2, 39);
  if (isIP(selected) === 0) invalid();
  return selected;
}

export function parsePaytrInstallment(value: unknown): number {
  if (!Number.isSafeInteger(value) || !INSTALLMENTS.has(value as number)) invalid();
  return value as number;
}

function hmac(credential: PaytrIframeCredential, message: string): string {
  return createHmac("sha256", credential.merchantKey)
    .update(message, "utf8")
    .digest("base64");
}

export function createPaytrIframeToken(input: Readonly<{
  credential: PaytrIframeCredential;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: number;
  userBasket: string;
  noInstallment: 0 | 1;
  maxInstallment: number;
  currency: "TL";
  testMode: 1;
}>): string {
  let selectedCredential: PaytrIframeCredential | undefined;
  try {
    const selected = exactRecord(input, TOKEN_INPUT_KEYS);
    selectedCredential = parsePaytrIframeCredential(selected.credential);
    const ip = parsePaytrUserIp(selected.userIp);
    const oid = parsePaytrMerchantOid(selected.merchantOid);
    const email = parsePaytrEmail(selected.email);
    const amount = parsePaytrPositiveInteger(selected.paymentAmount);
    const basket = parsePaytrBasket(selected.userBasket);
    if (selected.noInstallment !== 0 && selected.noInstallment !== 1) invalid();
    const maximum = parsePaytrInstallment(selected.maxInstallment);
    if (selected.currency !== "TL" || selected.testMode !== 1) invalid();
    return hmac(
      selectedCredential,
      `${selectedCredential.merchantId}${ip}${oid}${email}${String(amount)}${basket}${String(selected.noInstallment)}${String(maximum)}TL1${selectedCredential.merchantSalt}`,
    );
  } finally {
    if (selectedCredential !== undefined) wipePaytrCredential(selectedCredential);
  }
}

export function createPaytrIframeStatusToken(
  credential: PaytrIframeCredential,
  merchantOid: string,
): string {
  const selected = parsePaytrIframeCredential(credential);
  try {
    const oid = parsePaytrMerchantOid(merchantOid);
    return hmac(selected, `${selected.merchantId}${oid}${selected.merchantSalt}`);
  } finally {
    wipePaytrCredential(selected);
  }
}

function canonicalCallbackHash(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length !== 44 || !BASE64.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 32 && bytes.toString("base64") === value) return bytes;
  bytes.fill(0);
  return null;
}

export function createPaytrIframeCallbackHash(input: Readonly<{
  credential: PaytrIframeCredential;
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: string;
}>): string {
  let credential: PaytrIframeCredential | undefined;
  try {
    const selected = exactRecord(input, CALLBACK_SIGN_KEYS);
    credential = parsePaytrIframeCredential(selected.credential);
    const oid = parsePaytrMerchantOid(selected.merchantOid);
    if (selected.status !== "success" && selected.status !== "failed") invalid();
    if (
      typeof selected.totalAmount !== "string" ||
      !CALLBACK_AMOUNT.test(selected.totalAmount)
    ) invalid();
    return hmac(
      credential,
      `${oid}${credential.merchantSalt}${selected.status}${selected.totalAmount}`,
    );
  } finally {
    if (credential !== undefined) wipePaytrCredential(credential);
  }
}

export function verifyPaytrIframeCallbackHash(input: Readonly<{
  credential: PaytrIframeCredential;
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: string;
  providedHash: string;
}>): boolean {
  let provided: Buffer | null = null;
  let expected: Buffer | undefined;
  try {
    const selected = exactRecord(input, CALLBACK_HASH_KEYS);
    provided = canonicalCallbackHash(selected.providedHash);
    if (provided === null) return false;
    expected = Buffer.from(
      createPaytrIframeCallbackHash({
        credential: selected.credential as PaytrIframeCredential,
        merchantOid: selected.merchantOid as string,
        status: selected.status as "success" | "failed",
        totalAmount: selected.totalAmount as string,
      }),
      "base64",
    );
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  } finally {
    provided?.fill(0);
    expected?.fill(0);
  }
}

export function parsePaytrReturnUrl(value: unknown): string {
  const raw = parsePaytrBoundedString(value, 1, 400);
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash ||
    parsed.pathname !== "/odeme/hizli/sonuc" ||
    (
      parsed.search !== "?durum=basarili" &&
      parsed.search !== "?durum=basarisiz"
    ) ||
    parsed.hostname !== parsed.hostname.toLowerCase() ||
    parsed.toString() !== raw
  ) invalid();
  return raw;
}
