import { createHmac, timingSafeEqual } from "node:crypto";
import { types as nodeTypes } from "node:util";

const ENCODER = new TextEncoder();
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const WHITESPACE = /\s/u;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const API_KEY = /^[\x21-\x25\x27-\x7e]{1,256}$/;
const RANDOM_KEY = /^[A-Za-z0-9_-]{16,256}$/;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,256}$/;
const TOKEN = /^[A-Za-z0-9_-]{36,256}$/;
const PAYMENT_STATUS = /^[A-Z][A-Z_]{0,31}$/;
const CURRENCY = /^[A-Z]{3}$/;
const AMOUNT = /^(?:0|[1-9][0-9]{0,12})(?:[.][0-9]{1,8})?$/;
const SIGNATURE = /^[0-9a-f]{64}$/;
const CREDENTIAL_KEYS = Object.freeze(["apiKey", "secretKey"]);
const AUTHORIZATION_KEYS = Object.freeze([
  "body",
  "credential",
  "randomKey",
  "uriPath",
]);
const INITIALIZE_SIGNATURE_KEYS = Object.freeze([
  "conversationId",
  "credential",
  "token",
]);
const INITIALIZE_VERIFICATION_KEYS = Object.freeze([
  "conversationId",
  "credential",
  "providedSignature",
  "token",
]);
const RETRIEVE_SIGNATURE_KEYS = Object.freeze([
  "basketId",
  "conversationId",
  "credential",
  "currency",
  "paidPrice",
  "paymentId",
  "paymentStatus",
  "price",
  "token",
]);
const RETRIEVE_VERIFICATION_KEYS = Object.freeze([
  "basketId",
  "conversationId",
  "credential",
  "currency",
  "paidPrice",
  "paymentId",
  "paymentStatus",
  "price",
  "providedSignature",
  "token",
]);
const IYZICO_URI_PATHS = new Set([
  "/payment/bin/check",
  "/payment/iyzipos/checkoutform/auth/ecom/detail",
  "/payment/iyzipos/checkoutform/initialize/auth/ecom",
]);
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "buffer",
)?.get as (this: Uint8Array) => ArrayBufferLike;
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
)?.get as (this: Uint8Array) => number;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const MAXIMUM_BODY_BYTES = 1_048_576;

export type IyzicoCredential = {
  apiKey: string;
  secretKey: string;
};

export type IyzicoAuthorization = Readonly<{
  authorization: string;
  randomKey: string;
}>;

export type IyzicoInitializeSignatureInput = Readonly<{
  credential: Readonly<IyzicoCredential>;
  conversationId: string;
  token: string;
}>;

export type IyzicoRetrieveSignatureInput = Readonly<{
  credential: Readonly<IyzicoCredential>;
  paymentStatus: string;
  paymentId: string;
  currency: string;
  basketId: string;
  conversationId: string;
  paidPrice: string | number;
  price: string | number;
  token: string;
}>;

function invalid(): never {
  throw new TypeError("iyzico_config_invalid");
}

function credentialInvalid(): never {
  throw new TypeError("iyzico_credential_invalid");
}

function wipeBytes(value: Uint8Array | undefined): void {
  try {
    if (value !== undefined) Reflect.apply(UINT8_ARRAY_FILL, value, [0]);
  } catch {
    // Cleanup must not replace a stable provider outcome.
  }
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

function parseSecret(value: unknown): string {
  if (typeof value !== "string") invalid();
  const bytes = ENCODER.encode(value);
  try {
    if (
      bytes.byteLength < 1 ||
      bytes.byteLength > 256 ||
      CONTROL.test(value) ||
      WHITESPACE.test(value) ||
      SURROGATE.test(value)
    ) invalid();
    return value;
  } finally {
    wipeBytes(bytes);
  }
}

export function parseIyzicoCredential(value: unknown): IyzicoCredential {
  try {
    const selected = exactRecord(value, CREDENTIAL_KEYS);
    if (typeof selected.apiKey !== "string" || !API_KEY.test(selected.apiKey)) invalid();
    return {
      apiKey: selected.apiKey,
      secretKey: parseSecret(selected.secretKey),
    };
  } catch {
    return credentialInvalid();
  }
}

export function wipeIyzicoCredential(value: IyzicoCredential): void {
  try {
    value.apiKey = "";
    value.secretKey = "";
  } catch {
    // Cleanup must not replace a stable provider outcome.
  }
}

function exactBody(value: unknown): Uint8Array {
  let byteLength = 0;
  let buffer: ArrayBufferLike;
  try {
    if (
      nodeTypes.isProxy(value) ||
      !nodeTypes.isUint8Array(value) ||
      Object.getPrototypeOf(value) !== Uint8Array.prototype
    ) invalid();
    byteLength = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH, value, []) as number;
    buffer = Reflect.apply(TYPED_ARRAY_BUFFER, value, []) as ArrayBufferLike;
  } catch {
    return invalid();
  }
  if (
    !(buffer instanceof ArrayBuffer) ||
    byteLength < 1 ||
    byteLength > MAXIMUM_BODY_BYTES
  ) invalid();
  return value as Uint8Array;
}

function parseIdentifier(value: unknown, maximum = 256): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    !IDENTIFIER.test(value)
  ) invalid();
  return value;
}

function parseToken(value: unknown): string {
  if (typeof value !== "string" || !TOKEN.test(value)) invalid();
  return value;
}

function withCredential<T>(
  value: unknown,
  operation: (apiKey: string, secretBytes: Uint8Array) => T,
): T {
  let credential: IyzicoCredential | undefined;
  let secretBytes: Uint8Array | undefined;
  try {
    credential = parseIyzicoCredential(value);
    secretBytes = ENCODER.encode(credential.secretKey);
    return operation(credential.apiKey, secretBytes);
  } finally {
    wipeBytes(secretBytes);
    if (credential !== undefined) wipeIyzicoCredential(credential);
  }
}

function hmacHex(secretBytes: Uint8Array, values: readonly string[]): string {
  return createHmac("sha256", secretBytes)
    .update(values.join(":"), "utf8")
    .digest("hex");
}

export function createIyzicoAuthorization(input: Readonly<{
  credential: Readonly<IyzicoCredential>;
  randomKey: string;
  uriPath: string;
  body: Uint8Array;
}>): IyzicoAuthorization {
  const selected = exactRecord(input, AUTHORIZATION_KEYS);
  if (typeof selected.randomKey !== "string" || !RANDOM_KEY.test(selected.randomKey)) {
    invalid();
  }
  if (
    typeof selected.uriPath !== "string" ||
    !IYZICO_URI_PATHS.has(selected.uriPath)
  ) invalid();
  const body = exactBody(selected.body);
  return withCredential(selected.credential, (apiKey, secretBytes) => {
    const signature = createHmac("sha256", secretBytes)
      .update(`${selected.randomKey}${selected.uriPath}`, "utf8")
      .update(body)
      .digest("hex");
    const authorizationInput = `apiKey:${apiKey}&randomKey:${selected.randomKey}&signature:${signature}`;
    const encoded = ENCODER.encode(authorizationInput);
    try {
      return Object.freeze({
        authorization: `IYZWSv2 ${Buffer.from(
          encoded.buffer,
          encoded.byteOffset,
          encoded.byteLength,
        ).toString("base64")}`,
        randomKey: selected.randomKey as string,
      });
    } finally {
      wipeBytes(encoded);
    }
  });
}

function initializeSignatureValues(value: unknown): Readonly<{
  credential: unknown;
  values: readonly string[];
}> {
  const selected = exactRecord(value, INITIALIZE_SIGNATURE_KEYS);
  return Object.freeze({
    credential: selected.credential,
    values: Object.freeze([
      parseIdentifier(selected.conversationId, 128),
      parseToken(selected.token),
    ]),
  });
}

export function createIyzicoInitializeResponseSignature(
  input: IyzicoInitializeSignatureInput,
): string {
  const selected = initializeSignatureValues(input);
  return withCredential(
    selected.credential,
    (_apiKey, secretBytes) => hmacHex(secretBytes, selected.values),
  );
}

export function normalizeIyzicoSignatureAmount(value: unknown): string {
  let selected: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0) || value < 0) invalid();
    selected = String(value);
  } else if (typeof value === "string") {
    selected = value;
  } else {
    return invalid();
  }
  if (!AMOUNT.test(selected)) invalid();
  if (!selected.includes(".")) return selected;
  return selected.replace(/0+$/, "").replace(/[.]$/, "");
}

function retrieveSignatureValues(value: unknown): Readonly<{
  credential: unknown;
  values: readonly string[];
}> {
  const selected = exactRecord(value, RETRIEVE_SIGNATURE_KEYS);
  if (typeof selected.paymentStatus !== "string" || !PAYMENT_STATUS.test(selected.paymentStatus)) {
    invalid();
  }
  if (typeof selected.currency !== "string" || !CURRENCY.test(selected.currency)) invalid();
  return Object.freeze({
    credential: selected.credential,
    values: Object.freeze([
      selected.paymentStatus,
      parseIdentifier(selected.paymentId, 128),
      selected.currency,
      parseIdentifier(selected.basketId, 128),
      parseIdentifier(selected.conversationId, 128),
      normalizeIyzicoSignatureAmount(selected.paidPrice),
      normalizeIyzicoSignatureAmount(selected.price),
      parseToken(selected.token),
    ]),
  });
}

export function createIyzicoRetrieveResponseSignature(
  input: IyzicoRetrieveSignatureInput,
): string {
  const selected = retrieveSignatureValues(input);
  return withCredential(
    selected.credential,
    (_apiKey, secretBytes) => hmacHex(secretBytes, selected.values),
  );
}

function canonicalSignature(value: unknown): Buffer | null {
  if (typeof value !== "string" || !SIGNATURE.test(value)) return null;
  return Buffer.from(value, "hex");
}

function constantTimeVerify(providedValue: unknown, expectedHex: string): boolean {
  let provided: Buffer | null = null;
  let expected: Buffer | undefined;
  try {
    provided = canonicalSignature(providedValue);
    if (provided === null) return false;
    expected = Buffer.from(expectedHex, "hex");
    return timingSafeEqual(provided, expected);
  } finally {
    provided?.fill(0);
    expected?.fill(0);
  }
}

export function verifyIyzicoInitializeResponseSignature(
  input: IyzicoInitializeSignatureInput & Readonly<{ providedSignature: string }>,
): boolean {
  try {
    const selected = exactRecord(input, INITIALIZE_VERIFICATION_KEYS);
    const expected = createIyzicoInitializeResponseSignature({
      credential: selected.credential as Readonly<IyzicoCredential>,
      conversationId: selected.conversationId as string,
      token: selected.token as string,
    });
    return constantTimeVerify(selected.providedSignature, expected);
  } catch {
    return false;
  }
}

export function verifyIyzicoRetrieveResponseSignature(
  input: IyzicoRetrieveSignatureInput & Readonly<{ providedSignature: string }>,
): boolean {
  try {
    const selected = exactRecord(input, RETRIEVE_VERIFICATION_KEYS);
    const expected = createIyzicoRetrieveResponseSignature({
      credential: selected.credential as Readonly<IyzicoCredential>,
      paymentStatus: selected.paymentStatus as string,
      paymentId: selected.paymentId as string,
      currency: selected.currency as string,
      basketId: selected.basketId as string,
      conversationId: selected.conversationId as string,
      paidPrice: selected.paidPrice as string | number,
      price: selected.price as string | number,
      token: selected.token as string,
    });
    return constantTimeVerify(selected.providedSignature, expected);
  } catch {
    return false;
  }
}
