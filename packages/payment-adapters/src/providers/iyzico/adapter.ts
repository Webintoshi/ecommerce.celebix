import { randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { types as nodeTypes } from "node:util";

import type {
  HostedPaymentAdapter,
  HostedPaymentCallbackInput,
  HostedPaymentInitialization,
  HostedPaymentInitializeInput,
  HostedPaymentQueryInput,
  HostedPaymentStatus,
  VerifiedProviderCallback,
} from "../../contracts.ts";
import type {
  ProviderTransport,
  ProviderTransportRequest,
  ProviderTransportResult,
} from "../../transport.ts";
import {
  createIyzicoAuthorization,
  parseIyzicoCredential,
  verifyIyzicoInitializeResponseSignature,
  verifyIyzicoRetrieveResponseSignature,
  wipeIyzicoCredential,
  type IyzicoCredential,
} from "./config.ts";
import { IYZICO_IFRAME_PACKET } from "./packet.ts";

export { IYZICO_IFRAME_PACKET } from "./packet.ts";
export type { IyzicoCredential } from "./config.ts";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9._:-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{36,256}$/;
const PAYMENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const RANDOM_KEY = /^[A-Za-z0-9_-]{16,256}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const IDENTITY_NUMBER = /^[\x21-\x7e]{5,50}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const MAXIMUM_RESPONSE_BYTES = 1_048_576;
const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const BIN_PATH = "/payment/bin/check";
const TEST_BIN = "41579200";
const CREDENTIAL_DENIAL_CODES: readonly string[] = Object.freeze(["1000", "1001", "1002", "1003"]);
const CALLBACK_BINDING = /^[A-Za-z0-9_-]{43}$/;
const SUCCESS_PATH = "/odeme/hizli/sonuc?durum=basarili";
const FAILURE_PATH = "/odeme/hizli/sonuc?durum=basarisiz";
const NORMAL_RESULT_PATH = "/odeme/sonuc";
const TRANSPORT_UNKNOWN = Object.freeze({
  kind: "unknown" as const,
  code: "transport_outcome_unknown" as const,
});
const CONTENT_TYPE = "application/json" as const;
const INITIALIZE_KEYS = Object.freeze([
  "amountMinor",
  "attemptId",
  "basket",
  "callbackUrl",
  "credential",
  "currency",
  "customer",
  "environment",
  "failureUrl",
  "orderReference",
  "signal",
  "successUrl",
]);
const CUSTOMER_REQUIRED_KEYS = Object.freeze([
  "address",
  "city",
  "country",
  "email",
  "identityNumber",
  "ipAddress",
  "name",
  "phone",
]);
const CUSTOMER_OPTIONAL_KEYS = Object.freeze(["postalCode"]);
const BASKET_KEYS = Object.freeze([
  "itemType",
  "name",
  "quantity",
  "reference",
  "unitAmountMinor",
]);
const CALLBACK_KEYS = Object.freeze([
  "body",
  "credential",
  "environment",
  "expected",
  "headers",
  "method",
  "signal",
]);
const CALLBACK_EXPECTED_KEYS = Object.freeze([
  "amountMinor",
  "attemptId",
  "currency",
  "orderReference",
  "providerReference",
]);
const QUERY_KEYS = Object.freeze([
  "amountMinor",
  "attemptId",
  "credential",
  "currency",
  "environment",
  "orderReference",
  "providerReference",
  "signal",
]);
const VALIDATION_KEYS = Object.freeze([
  "credential",
  "environment",
  "randomKey",
  "signal",
  "validationReference",
]);
const DEPENDENCY_KEYS = Object.freeze(["randomKey"]);
const RETRIEVE_REQUIRED_KEYS = Object.freeze([
  "basketId",
  "conversationId",
  "currency",
  "fraudStatus",
  "paidPrice",
  "paymentId",
  "paymentStatus",
  "price",
  "signature",
  "status",
  "token",
]);
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;

export type IyzicoCredentialValidationResult =
  | Readonly<{ kind: "validated" }>
  | Readonly<{
      kind: "rejected";
      outcomeCode: "provider_rejected" | "validation_unavailable" | "invalid_validation_request";
    }>;

export type IyzicoAdapterDependencies = Readonly<{
  randomKey: () => string;
}>;

type ValidRetrieve = Readonly<{
  kind: "valid";
  token: string;
  paymentId: string;
  fraudStatus: -1 | 0 | 1;
}>;

type RetrieveResult =
  | ValidRetrieve
  | Readonly<{ kind: "temporary" }>
  | Readonly<{ kind: "invalid" }>;

function invalid(message = "iyzico_adapter_invalid"): never {
  throw new TypeError(message);
}

function wipe(value: unknown): void {
  try {
    if (
      !nodeTypes.isProxy(value) &&
      nodeTypes.isUint8Array(value) &&
      Object.getPrototypeOf(value) === Uint8Array.prototype
    ) {
      Reflect.apply(UINT8_ARRAY_FILL, value, [0]);
    }
  } catch {
    // Best-effort cleanup must not replace a stable provider outcome.
  }
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of [...required, ...optional]) {
    const descriptor = descriptors[key];
    if (descriptor === undefined) continue;
    if (!descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

function dataRecord(
  value: unknown,
  required: readonly string[],
  maximumFields = 128,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length < required.length ||
    keys.length > maximumFields ||
    keys.some((key) => typeof key !== "string") ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < minimum ||
    value.length > maximum
  ) invalid();
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

function boundedString(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < minimum ||
    value.length > maximum ||
    CONTROL.test(value) ||
    /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(value)
  ) invalid();
  const bytes = ENCODER.encode(value);
  try {
    if (bytes.byteLength > maximum * 4) invalid();
  } finally {
    wipe(bytes);
  }
  return value;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 1) invalid();
  return value;
}

function reference(value: unknown): string {
  if (typeof value !== "string" || !REFERENCE.test(value)) invalid();
  return value;
}

function token(value: unknown): string {
  if (typeof value !== "string" || !TOKEN.test(value)) invalid();
  return value;
}

function signal(value: unknown): AbortSignal {
  if (!(value instanceof AbortSignal)) invalid();
  return value;
}

function majorAmount(amountMinor: number): string {
  positiveInteger(amountMinor);
  const whole = Math.floor(amountMinor / 100);
  return `${whole}.${String(amountMinor % 100).padStart(2, "0")}`;
}

function callbackAuthority(value: unknown): Readonly<{ url: string; origin: string }> {
  const selected = boundedString(value, 1, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(selected);
  } catch {
    return invalid();
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname !== parsed.hostname.toLowerCase() ||
    parsed.toString() !== selected
  ) invalid();
  const segments = parsed.pathname.split("/");
  const binding = segments.length === 6 ? segments[5] : undefined;
  if (
    segments[1] !== "api" ||
    segments[2] !== "payments" ||
    segments[3] !== "iyzico_iframe" ||
    segments[4] !== "callback" ||
    typeof binding !== "string" ||
    !CALLBACK_BINDING.test(binding) ||
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".invalid") ||
    !parsed.hostname.includes(".") ||
    isIP(parsed.hostname) !== 0
  ) invalid();
  let bindingBytes: Buffer | undefined;
  try {
    bindingBytes = Buffer.from(binding, "base64url");
    if (bindingBytes.byteLength !== 32 || bindingBytes.toString("base64url") !== binding) invalid();
  } finally {
    bindingBytes?.fill(0);
  }
  return Object.freeze({ url: selected, origin: parsed.origin });
}

function returnUrls(
  successValue: unknown,
  failureValue: unknown,
  origin: string,
): Readonly<{ successUrl: string; failureUrl: string }> {
  const selected = [
    boundedString(successValue, 1, 2_048),
    boundedString(failureValue, 1, 2_048),
  ] as const;
  let success: URL;
  let failure: URL;
  try {
    success = new URL(selected[0]);
    failure = new URL(selected[1]);
  } catch {
    return invalid();
  }
  for (const [raw, parsed] of [[selected[0], success], [selected[1], failure]] as const) {
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.hash ||
      parsed.toString() !== raw
    ) invalid();
  }
  const legacyPair =
    `${success.pathname}${success.search}` === SUCCESS_PATH &&
    `${failure.pathname}${failure.search}` === FAILURE_PATH;
  const normalPair =
    success.pathname === NORMAL_RESULT_PATH && success.search === "" &&
    failure.pathname === NORMAL_RESULT_PATH && failure.search === "";
  if (!legacyPair && !normalPair) invalid();
  return Object.freeze({ successUrl: selected[0], failureUrl: selected[1] });
}

function transportRequest(transport: ProviderTransport): ProviderTransport["request"] {
  if (typeof transport !== "object" || transport === null || nodeTypes.isProxy(transport)) {
    invalid();
  }
  const descriptor = Object.getOwnPropertyDescriptor(transport, "request");
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "function" ||
    nodeTypes.isProxy(descriptor.value)
  ) invalid();
  return descriptor.value as ProviderTransport["request"];
}

function dependencies(value: unknown): IyzicoAdapterDependencies {
  const selected = exactRecord(value, DEPENDENCY_KEYS);
  if (typeof selected.randomKey !== "function" || nodeTypes.isProxy(selected.randomKey)) invalid();
  return Object.freeze({ randomKey: selected.randomKey as () => string });
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  randomKey: Object.freeze(() => randomBytes(24).toString("base64url")),
});

function nextRandomKey(generator: () => string): string {
  let value: unknown;
  try {
    value = Reflect.apply(generator, undefined, []);
  } catch {
    return invalid();
  }
  if (typeof value !== "string" || !RANDOM_KEY.test(value)) invalid();
  return value;
}

function endpoint(environment: "test" | "live", path: string): string {
  const selected = IYZICO_IFRAME_PACKET.endpoints[environment].find((value) =>
    new URL(value).pathname === path);
  if (selected === undefined) invalid();
  return selected;
}

async function providerRequest(
  transport: ProviderTransport,
  environment: "test" | "live",
  credential: Readonly<IyzicoCredential>,
  path: string,
  payload: Readonly<Record<string, unknown>>,
  generator: () => string,
  abortSignal: AbortSignal,
): Promise<ProviderTransportResult> {
  let body: Uint8Array | undefined;
  try {
    body = ENCODER.encode(JSON.stringify(payload));
    const randomKey = nextRandomKey(generator);
    const authorization = createIyzicoAuthorization({ credential, randomKey, uriPath: path, body });
    const request: ProviderTransportRequest = Object.freeze({
      packet: IYZICO_IFRAME_PACKET,
      environment,
      url: endpoint(environment, path),
      method: "POST",
      headers: Object.freeze({
        "content-type": CONTENT_TYPE,
        authorization: authorization.authorization,
        "x-iyzi-rnd": authorization.randomKey,
      }),
      body,
      signal: abortSignal,
    });
    try {
      return await transportRequest(transport)(request);
    } catch {
      return TRANSPORT_UNKNOWN;
    }
  } finally {
    wipe(body);
  }
}

function duplicateJsonKeys(text: string): boolean {
  let cursor = 0;
  let depth = 0;
  const whitespace = () => {
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
  };
  const string = (): string => {
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (text[cursor] === "\"") {
        cursor += 1;
        return JSON.parse(text.slice(start, cursor)) as string;
      }
      cursor += 1;
    }
    return invalid();
  };
  const value = (): boolean => {
    whitespace();
    if (text[cursor] === "{") return object();
    if (text[cursor] === "[") {
      depth += 1;
      if (depth > 64) return true;
      cursor += 1;
      whitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      while (cursor < text.length) {
        if (value()) return true;
        whitespace();
        if (text[cursor] === "]") {
          cursor += 1;
          depth -= 1;
          return false;
        }
        if (text[cursor] !== ",") return true;
        cursor += 1;
      }
      return true;
    }
    if (text[cursor] === "\"") {
      string();
      return false;
    }
    while (cursor < text.length && !/[\s,}\]]/.test(text[cursor]!)) cursor += 1;
    return false;
  };
  const object = (): boolean => {
    depth += 1;
    if (depth > 64) return true;
    cursor += 1;
    whitespace();
    if (text[cursor] === "}") {
      cursor += 1;
      depth -= 1;
      return false;
    }
    const keys = new Set<string>();
    while (cursor < text.length) {
      whitespace();
      if (text[cursor] !== "\"") return true;
      const key = string();
      if (keys.has(key)) return true;
      keys.add(key);
      whitespace();
      if (text[cursor] !== ":") return true;
      cursor += 1;
      if (value()) return true;
      whitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      if (text[cursor] !== ",") return true;
      cursor += 1;
    }
    return true;
  };
  try {
    whitespace();
    const duplicate = value();
    whitespace();
    return duplicate || cursor !== text.length;
  } catch {
    return true;
  }
}

function responseJson(result: ProviderTransportResult): unknown | null {
  if (
    result.kind !== "response" ||
    ![200, 400, 401, 403].includes(result.status) ||
    (result.contentType !== "application/json" &&
      result.contentType !== "application/json; charset=utf-8") ||
    nodeTypes.isProxy(result.body) ||
    !nodeTypes.isUint8Array(result.body) ||
    Object.getPrototypeOf(result.body) !== Uint8Array.prototype ||
    result.body.byteLength < 2 ||
    result.body.byteLength > MAXIMUM_RESPONSE_BYTES
  ) return null;
  let encoded: Uint8Array | undefined;
  try {
    const text = DECODER.decode(result.body);
    encoded = ENCODER.encode(text);
    if (!bytesEqual(encoded, result.body) || duplicateJsonKeys(text)) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    wipe(encoded);
  }
}

function temporaryHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function explicitFailureHttpStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

function providerFailure(value: unknown): boolean {
  try {
    const selected = dataRecord(value, ["status"]);
    if (selected.status !== "failure") return false;
    for (const key of ["conversationId", "errorCode", "errorGroup", "errorMessage", "locale"]) {
      if (selected[key] !== undefined) boundedString(selected[key], 1, 512);
    }
    if (selected.systemTime !== undefined && !Number.isSafeInteger(selected.systemTime)) invalid();
    return true;
  } catch {
    return false;
  }
}

function providerCredentialDenial(value: unknown): boolean {
  try {
    const selected = dataRecord(value, ["status"]);
    return selected.status === "failure" &&
      typeof selected.errorCode === "string" &&
      CREDENTIAL_DENIAL_CODES.includes(selected.errorCode);
  } catch {
    return false;
  }
}

function constantEqual(left: string, right: string): boolean {
  let leftBytes: Buffer | undefined;
  let rightBytes: Buffer | undefined;
  try {
    leftBytes = Buffer.from(left, "utf8");
    rightBytes = Buffer.from(right, "utf8");
    return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
  } finally {
    leftBytes?.fill(0);
    rightBytes?.fill(0);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function exactPresentationUrl(
  environment: "test" | "live",
  raw: unknown,
  expectedToken: string,
): string | null {
  if (typeof raw !== "string" || raw.length > 2_048) return null;
  const rule = IYZICO_IFRAME_PACKET.presentation[environment];
  if (rule.kind !== "provider_query_token_url") return null;
  const exactQuery = `?${rule.tokenParameter}=${expectedToken}&${rule.languageParameter}=${rule.language}`;
  if (raw !== `${rule.origin}${exactQuery}` && raw !== `${rule.origin}/${exactQuery}`) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (
    parsed.origin !== rule.origin ||
    parsed.pathname !== rule.pathname ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash ||
    parsed.search !== exactQuery ||
    parsed.searchParams.size !== 2 ||
    parsed.searchParams.get(rule.tokenParameter) !== expectedToken ||
    parsed.searchParams.get(rule.languageParameter) !== rule.language
  ) return null;
  return raw;
}

function parseInitializeSuccess(
  value: unknown,
  environment: "test" | "live",
  attemptId: string,
  credential: Readonly<IyzicoCredential>,
): HostedPaymentInitialization {
  let providerReference: string | null = null;
  try {
    const selected = dataRecord(
      value,
      ["conversationId", "paymentPageUrl", "signature", "status", "token"],
    );
    if (selected.status !== "success") invalid();
    if (selected.conversationId !== attemptId) invalid();
    providerReference = token(selected.token);
    if (
      !verifyIyzicoInitializeResponseSignature({
        credential,
        conversationId: attemptId,
        token: providerReference,
        providedSignature: selected.signature as string,
      })
    ) invalid();
    const url = exactPresentationUrl(environment, selected.paymentPageUrl, providerReference);
    if (url === null) {
      return Object.freeze({
        kind: "unknown" as const,
        code: "provider_outcome_unknown" as const,
        providerReference,
      });
    }
    if (selected.checkoutFormContent !== undefined) {
      boundedString(selected.checkoutFormContent, 1, 262_144);
    }
    if (selected.locale !== undefined && selected.locale !== "tr") invalid();
    if (selected.systemTime !== undefined && !Number.isSafeInteger(selected.systemTime)) invalid();
    if (selected.tokenExpireTime !== undefined && !Number.isSafeInteger(selected.tokenExpireTime)) invalid();
    return Object.freeze({
      kind: "iframe" as const,
      url,
      token: providerReference,
      providerReference,
    });
  } catch {
    return Object.freeze({
      kind: "unknown" as const,
      code: "provider_outcome_unknown" as const,
      providerReference: null,
    });
  }
}

function buyer(value: unknown): Readonly<{
  name: string;
  firstName: string;
  surname: string;
  email: string;
  phone: string;
  ipAddress: string;
  address: string;
  identityNumber: string;
  city: string;
  country: string;
  postalCode?: string;
}> {
  const selected = exactRecord(value, CUSTOMER_REQUIRED_KEYS, CUSTOMER_OPTIONAL_KEYS);
  const name = boundedString(selected.name, 3, 128);
  const parts = name.split(/ +/u);
  if (parts.length < 2 || parts.some((part) => part.length < 1)) invalid();
  const firstName = boundedString(parts.slice(0, -1).join(" "), 1, 64);
  const surname = boundedString(parts.at(-1), 1, 64);
  const email = boundedString(selected.email, 3, 254);
  if (!EMAIL.test(email)) invalid();
  const phone = boundedString(selected.phone, 8, 16);
  if (!PHONE.test(phone)) invalid();
  const ipAddress = boundedString(selected.ipAddress, 2, 64);
  if (isIP(ipAddress) === 0) invalid();
  const identityNumber = boundedString(selected.identityNumber, 5, 50);
  if (
    !IDENTITY_NUMBER.test(identityNumber) ||
    /^([0-9])\1+$/.test(identityNumber) ||
    identityNumber === "12345678901"
  ) invalid();
  const result: {
    name: string;
    firstName: string;
    surname: string;
    email: string;
    phone: string;
    ipAddress: string;
    address: string;
    identityNumber: string;
    city: string;
    country: string;
    postalCode?: string;
  } = {
    name,
    firstName,
    surname,
    email,
    phone,
    ipAddress,
    address: boundedString(selected.address, 5, 512),
    identityNumber,
    city: boundedString(selected.city, 1, 128),
    country: boundedString(selected.country, 1, 128),
  };
  if (selected.postalCode !== undefined) {
    result.postalCode = boundedString(selected.postalCode, 1, 32);
  }
  return Object.freeze(result);
}

function basket(value: unknown, expectedAmountMinor: number): readonly Readonly<{
  reference: string;
  name: string;
  itemType: "PHYSICAL" | "VIRTUAL";
  price: string;
}>[] {
  let total = 0n;
  const selected = denseArray(value, 1, 100).map((entry) => {
    const item = exactRecord(entry, BASKET_KEYS);
    const quantity = positiveInteger(item.quantity);
    const unitAmountMinor = positiveInteger(item.unitAmountMinor);
    const itemTotal = BigInt(quantity) * BigInt(unitAmountMinor);
    total += itemTotal;
    if (itemTotal > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
    if (item.itemType !== "PHYSICAL" && item.itemType !== "VIRTUAL") invalid();
    return Object.freeze({
      reference: reference(item.reference),
      name: boundedString(item.name, 1, 200),
      itemType: item.itemType,
      price: majorAmount(Number(itemTotal)),
    });
  });
  if (total !== BigInt(expectedAmountMinor)) invalid();
  return Object.freeze(selected);
}

function addressObject(selected: ReturnType<typeof buyer>): Readonly<Record<string, string>> {
  const result: Record<string, string> = {
    contactName: selected.name,
    city: selected.city,
    country: selected.country,
    address: selected.address,
  };
  if (selected.postalCode !== undefined) result.zipCode = selected.postalCode;
  return Object.freeze(result);
}

function initializePayload(
  selected: Readonly<Record<string, unknown>>,
  selectedBuyer: ReturnType<typeof buyer>,
  selectedBasket: ReturnType<typeof basket>,
  amount: string,
): Readonly<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    locale: "tr",
    conversationId: selected.attemptId,
    price: amount,
    paidPrice: amount,
    currency: "TRY",
    basketId: selected.orderReference,
    paymentGroup: "PRODUCT",
    callbackUrl: selected.callbackUrl,
    buyer: Object.freeze({
      id: selected.attemptId,
      name: selectedBuyer.firstName,
      surname: selectedBuyer.surname,
      gsmNumber: selectedBuyer.phone,
      email: selectedBuyer.email,
      identityNumber: selectedBuyer.identityNumber,
      registrationAddress: selectedBuyer.address,
      ip: selectedBuyer.ipAddress,
      city: selectedBuyer.city,
      country: selectedBuyer.country,
      ...(selectedBuyer.postalCode === undefined ? {} : { zipCode: selectedBuyer.postalCode }),
    }),
  };
  if (selectedBasket.some((item) => item.itemType === "PHYSICAL")) {
    payload.shippingAddress = addressObject(selectedBuyer);
  }
  payload.billingAddress = addressObject(selectedBuyer);
  payload.basketItems = Object.freeze(selectedBasket.map((item) => Object.freeze({
    id: item.reference,
    name: item.name,
    category1: item.name,
    itemType: item.itemType,
    price: item.price,
  })));
  return Object.freeze(payload);
}

function amountMatches(value: unknown, expectedMinor: number): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const selected = typeof value === "number" ? String(value) : value;
  if (!/^(?:0|[1-9][0-9]{0,12})(?:[.][0-9]{1,8})?$/.test(selected)) return false;
  const [whole, fraction = ""] = selected.split(".");
  if (!/^0*$/.test(fraction.slice(2))) return false;
  const cents = `${fraction}00`.slice(0, 2);
  try {
    return BigInt(whole!) * 100n + BigInt(cents) === BigInt(expectedMinor);
  } catch {
    return false;
  }
}

async function retrieve(
  transport: ProviderTransport,
  environment: "test" | "live",
  credential: Readonly<IyzicoCredential>,
  generator: () => string,
  abortSignal: AbortSignal,
  expected: Readonly<{
    attemptId: string;
    orderReference: string;
    token: string;
    amountMinor: number;
    currency: string;
  }>,
): Promise<RetrieveResult> {
  let responseBody: Uint8Array | undefined;
  try {
    if (abortSignal.aborted) return Object.freeze({ kind: "temporary" as const });
    const result = await providerRequest(
      transport,
      environment,
      credential,
      RETRIEVE_PATH,
      Object.freeze({ locale: "tr", conversationId: expected.attemptId, token: expected.token }),
      generator,
      abortSignal,
    );
    if (result.kind === "unknown") {
      return Object.freeze({ kind: "temporary" as const });
    }
    responseBody = result.body;
    if (temporaryHttpStatus(result.status)) {
      return Object.freeze({ kind: "temporary" as const });
    }
    const raw = responseJson(result);
    if (explicitFailureHttpStatus(result.status)) {
      return Object.freeze({ kind: "invalid" as const });
    }
    if (raw === null || providerFailure(raw)) return Object.freeze({ kind: "invalid" as const });
    const selected = dataRecord(raw, RETRIEVE_REQUIRED_KEYS);
    if (
      selected.status !== "success" ||
      selected.conversationId !== expected.attemptId ||
      selected.basketId !== expected.orderReference ||
      selected.currency !== expected.currency ||
      !amountMatches(selected.price, expected.amountMinor) ||
      !amountMatches(selected.paidPrice, expected.amountMinor)
    ) return Object.freeze({ kind: "invalid" as const });
    const selectedToken = token(selected.token);
    if (!constantEqual(selectedToken, expected.token)) return Object.freeze({ kind: "invalid" as const });
    if (typeof selected.paymentId !== "string" || !PAYMENT_ID.test(selected.paymentId)) {
      return Object.freeze({ kind: "invalid" as const });
    }
    if (
      (selected.paymentStatus !== "SUCCESS" && selected.paymentStatus !== "FAILURE") ||
      (selected.fraudStatus !== -1 && selected.fraudStatus !== 0 && selected.fraudStatus !== 1) ||
      !verifyIyzicoRetrieveResponseSignature({
        credential,
        paymentStatus: selected.paymentStatus,
        paymentId: selected.paymentId,
        currency: selected.currency,
        basketId: selected.basketId as string,
        conversationId: selected.conversationId as string,
        paidPrice: selected.paidPrice as string | number,
        price: selected.price as string | number,
        token: selectedToken,
        providedSignature: selected.signature as string,
      })
    ) return Object.freeze({ kind: "invalid" as const });
    if (selected.fraudStatus !== -1 && selected.paymentStatus !== "SUCCESS") {
      return Object.freeze({ kind: "invalid" as const });
    }
    return Object.freeze({
      kind: "valid" as const,
      token: selectedToken,
      paymentId: selected.paymentId,
      fraudStatus: selected.fraudStatus,
    });
  } catch {
    return abortSignal.aborted
      ? Object.freeze({ kind: "temporary" as const })
      : Object.freeze({ kind: "invalid" as const });
  } finally {
    wipe(responseBody);
  }
}

function parseCallbackToken(value: Uint8Array): string {
  if (
    nodeTypes.isProxy(value) ||
    !nodeTypes.isUint8Array(value) ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype ||
    value.byteLength < 7 ||
    value.byteLength > 512
  ) invalid("iyzico_callback_invalid");
  const text = DECODER.decode(value);
  const encoded = ENCODER.encode(text);
  try {
    if (!bytesEqual(encoded, value)) invalid("iyzico_callback_invalid");
  } finally {
    wipe(encoded);
  }
  const params = new URLSearchParams(text);
  if (
    params.toString() !== text ||
    [...params.keys()].length !== 1 ||
    !params.has("token")
  ) invalid("iyzico_callback_invalid");
  return token(params.get("token"));
}

function retryCallback(providerReference: string, currency: string): VerifiedProviderCallback {
  return Object.freeze({
    eventKey: `iyzico:${providerReference}:retry`,
    status: "retry" as const,
    providerReference,
    paidAmountMinor: 0,
    currency,
    safeCode: "provider_temporarily_unavailable",
  });
}

export async function validateIyzicoCredentialWithTransport(
  transport: ProviderTransport,
  input: Readonly<{
    environment: "test" | "live";
    credential: IyzicoCredential;
    validationReference: string;
    signal: AbortSignal;
    randomKey: () => string;
  }>,
): Promise<IyzicoCredentialValidationResult> {
  let selectedCredential: IyzicoCredential | undefined;
  let responseBody: Uint8Array | undefined;
  try {
    let selected: Record<string, unknown>;
    let result: ProviderTransportResult;
    try {
      selected = exactRecord(input, VALIDATION_KEYS);
      if (selected.environment !== "test" && selected.environment !== "live") invalid();
      if (typeof selected.validationReference !== "string" || !UUID.test(selected.validationReference)) {
        invalid();
      }
      const abortSignal = signal(selected.signal);
      if (abortSignal.aborted || typeof selected.randomKey !== "function") invalid();
      selectedCredential = parseIyzicoCredential(selected.credential);
      result = await providerRequest(
        transport,
        selected.environment,
        selectedCredential,
        BIN_PATH,
        Object.freeze({
          locale: "tr",
          binNumber: TEST_BIN,
          conversationId: selected.validationReference,
        }),
        selected.randomKey as () => string,
        abortSignal,
      );
    } catch {
      return Object.freeze({ kind: "rejected" as const, outcomeCode: "invalid_validation_request" as const });
    }
    try {
      if (result.kind === "unknown") {
        return Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
      }
      responseBody = result.body;
      if (temporaryHttpStatus(result.status)) {
        return Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
      }
      const raw = responseJson(result);
      if (raw === null) {
        return Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
      }
      if (explicitFailureHttpStatus(result.status)) {
        return providerFailure(raw) && providerCredentialDenial(raw)
          ? Object.freeze({ kind: "rejected" as const, outcomeCode: "provider_rejected" as const })
          : Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
      }
      if (result.status !== 200) {
        return Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
      }
      if (providerFailure(raw)) {
        return providerCredentialDenial(raw)
          ? Object.freeze({ kind: "rejected" as const, outcomeCode: "provider_rejected" as const })
          : Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
      }
      if (typeof raw !== "object" || raw === null || Array.isArray(raw) || nodeTypes.isProxy(raw)) invalid();
      const descriptors = Object.getOwnPropertyDescriptors(raw) as Record<string, PropertyDescriptor>;
      for (const key of ["status", "conversationId", "binNumber"]) {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      }
      if (
        descriptors.status!.value !== "success" ||
        descriptors.conversationId!.value !== selected.validationReference ||
        descriptors.binNumber!.value !== TEST_BIN
      ) invalid();
      return Object.freeze({ kind: "validated" as const });
    } catch {
      return Object.freeze({ kind: "rejected" as const, outcomeCode: "validation_unavailable" as const });
    }
  } finally {
    wipe(responseBody);
    if (selectedCredential !== undefined) wipeIyzicoCredential(selectedCredential);
  }
}

export function createIyzicoCheckoutFormAdapter(
  transport: ProviderTransport,
  dependencyInput: IyzicoAdapterDependencies = DEFAULT_DEPENDENCIES,
): HostedPaymentAdapter<IyzicoCredential> {
  transportRequest(transport);
  const selectedDependencies = dependencies(dependencyInput);
  const parseCredential = Object.freeze((value: unknown) => parseIyzicoCredential(value));
  const maskAccount = Object.freeze((value: IyzicoCredential): string => {
    const selected = parseIyzicoCredential(value);
    try {
      return `iyzico…${selected.apiKey.slice(-4)}`;
    } finally {
      wipeIyzicoCredential(selected);
    }
  });
  const initialize = Object.freeze(async (
    input: HostedPaymentInitializeInput<IyzicoCredential>,
  ): Promise<HostedPaymentInitialization> => {
    let selectedCredential: IyzicoCredential | undefined;
    let responseBody: Uint8Array | undefined;
    try {
      const selected = exactRecord(input, INITIALIZE_KEYS);
      if (selected.environment === "live") {
        return Object.freeze({ kind: "rejected" as const, code: "environment_not_ready" });
      }
      if (selected.environment !== "test") invalid();
      selectedCredential = parseIyzicoCredential(selected.credential);
      if (typeof selected.attemptId !== "string" || !UUID.test(selected.attemptId)) invalid();
      const orderReference = reference(selected.orderReference);
      const amountMinor = positiveInteger(selected.amountMinor);
      if (selected.currency !== "TRY") invalid();
      const callback = callbackAuthority(selected.callbackUrl);
      returnUrls(selected.successUrl, selected.failureUrl, callback.origin);
      const abortSignal = signal(selected.signal);
      if (abortSignal.aborted) invalid();
      const selectedBuyer = buyer(selected.customer);
      const selectedBasket = basket(selected.basket, amountMinor);
      const result = await providerRequest(
        transport,
        "test",
        selectedCredential,
        INITIALIZE_PATH,
        initializePayload(
          { ...selected, callbackUrl: callback.url, orderReference },
          selectedBuyer,
          selectedBasket,
          majorAmount(amountMinor),
        ),
        selectedDependencies.randomKey,
        abortSignal,
      );
      if (result.kind === "unknown") {
        return Object.freeze({
          kind: "unknown" as const,
          code: "provider_outcome_unknown" as const,
          providerReference: null,
        });
      }
      responseBody = result.body;
      if (temporaryHttpStatus(result.status)) {
        return Object.freeze({
          kind: "unknown" as const,
          code: "provider_outcome_unknown" as const,
          providerReference: null,
        });
      }
      const raw = responseJson(result);
      if (explicitFailureHttpStatus(result.status)) {
        return raw !== null && providerFailure(raw)
          ? Object.freeze({ kind: "rejected" as const, code: "provider_rejected" })
          : Object.freeze({
              kind: "unknown" as const,
              code: "provider_outcome_unknown" as const,
              providerReference: null,
            });
      }
      if (result.status !== 200) {
        return Object.freeze({
          kind: "unknown" as const,
          code: "provider_outcome_unknown" as const,
          providerReference: null,
        });
      }
      if (raw !== null && providerFailure(raw)) {
        return Object.freeze({ kind: "rejected" as const, code: "provider_rejected" });
      }
      return parseInitializeSuccess(raw, "test", selected.attemptId, selectedCredential);
    } catch {
      return Object.freeze({ kind: "rejected" as const, code: "invalid_request" });
    } finally {
      wipe(responseBody);
      if (selectedCredential !== undefined) wipeIyzicoCredential(selectedCredential);
    }
  });
  const verifyCallback = Object.freeze(async (
    input: HostedPaymentCallbackInput<IyzicoCredential>,
  ): Promise<VerifiedProviderCallback> => {
    let selectedCredential: IyzicoCredential | undefined;
    try {
      const selected = exactRecord(input, CALLBACK_KEYS);
      if (
        selected.environment !== "test" ||
        selected.method !== "POST"
      ) invalid("iyzico_callback_invalid");
      const headers = exactRecord(selected.headers, ["content-type"], ["content-length"]);
      if (headers["content-type"] !== "application/x-www-form-urlencoded") {
        invalid("iyzico_callback_invalid");
      }
      const expected = exactRecord(selected.expected, CALLBACK_EXPECTED_KEYS);
      if (
        typeof expected.attemptId !== "string" ||
        !UUID.test(expected.attemptId) ||
        reference(expected.orderReference) !== expected.orderReference ||
        expected.currency !== "TRY"
      ) invalid("iyzico_callback_invalid");
      const amountMinor = positiveInteger(expected.amountMinor);
      const expectedToken = token(expected.providerReference);
      const callbackBody = selected.body as Uint8Array;
      const callbackToken = parseCallbackToken(callbackBody);
      if (headers["content-length"] !== undefined) {
        const contentLength = headers["content-length"];
        if (
          typeof contentLength !== "string" ||
          !/^(?:0|[1-9][0-9]*)$/.test(contentLength) ||
          !Number.isSafeInteger(Number(contentLength)) ||
          Number(contentLength) !== callbackBody.byteLength ||
          String(callbackBody.byteLength) !== contentLength
        ) invalid("iyzico_callback_invalid");
      }
      if (!constantEqual(callbackToken, expectedToken)) invalid("iyzico_callback_invalid");
      const abortSignal = signal(selected.signal);
      selectedCredential = parseIyzicoCredential(selected.credential);
      if (abortSignal.aborted) return retryCallback(expectedToken, "TRY");
      const result = await retrieve(
        transport,
        "test",
        selectedCredential,
        selectedDependencies.randomKey,
        abortSignal,
        {
          attemptId: expected.attemptId,
          orderReference: expected.orderReference as string,
          token: expectedToken,
          amountMinor,
          currency: "TRY",
        },
      );
      if (result.kind === "temporary") return retryCallback(expectedToken, "TRY");
      if (result.kind !== "valid") invalid("iyzico_callback_invalid");
      const status = result.fraudStatus === 1
        ? "succeeded" as const
        : result.fraudStatus === 0
          ? "pending" as const
          : "failed" as const;
      return Object.freeze({
        eventKey: `iyzico:${result.paymentId}:${result.fraudStatus}`,
        status,
        providerReference: result.token,
        paidAmountMinor: amountMinor,
        currency: "TRY",
        safeCode: result.fraudStatus === 1
          ? "success"
          : result.fraudStatus === 0
            ? "fraud_review"
            : "fraud_rejected",
      });
    } catch (error) {
      if (error instanceof TypeError && error.message === "iyzico_callback_invalid") throw error;
      return invalid("iyzico_callback_invalid");
    } finally {
      if (selectedCredential !== undefined) wipeIyzicoCredential(selectedCredential);
    }
  });
  const query = Object.freeze(async (
    input: HostedPaymentQueryInput<IyzicoCredential>,
  ): Promise<HostedPaymentStatus> => {
    let selectedCredential: IyzicoCredential | undefined;
    let providerReference: string | null = null;
    try {
      const selected = exactRecord(input, QUERY_KEYS);
      if (selected.environment !== "test" || selected.currency !== "TRY") invalid();
      if (typeof selected.attemptId !== "string" || !UUID.test(selected.attemptId)) invalid();
      const orderReference = reference(selected.orderReference);
      providerReference = token(selected.providerReference);
      const amountMinor = positiveInteger(selected.amountMinor);
      const abortSignal = signal(selected.signal);
      if (abortSignal.aborted) return Object.freeze({ kind: "unknown" as const, providerReference });
      selectedCredential = parseIyzicoCredential(selected.credential);
      const result = await retrieve(
        transport,
        "test",
        selectedCredential,
        selectedDependencies.randomKey,
        abortSignal,
        {
          attemptId: selected.attemptId,
          orderReference,
          token: providerReference,
          amountMinor,
          currency: "TRY",
        },
      );
      if (result.kind !== "valid") {
        return Object.freeze({ kind: "unknown" as const, providerReference });
      }
      if (result.fraudStatus === 1) {
        return Object.freeze({
          kind: "succeeded" as const,
          providerReference,
          paidAmountMinor: amountMinor,
          currency: "TRY",
        });
      }
      if (result.fraudStatus === 0) {
        return Object.freeze({ kind: "pending" as const, providerReference });
      }
      return Object.freeze({ kind: "failed" as const, providerReference, code: "provider_rejected" });
    } catch {
      return Object.freeze({ kind: "rejected" as const, code: "invalid_request" });
    } finally {
      if (selectedCredential !== undefined) wipeIyzicoCredential(selectedCredential);
    }
  });
  return Object.freeze({
    packet: IYZICO_IFRAME_PACKET,
    parseCredential,
    maskAccount,
    initialize,
    verifyCallback,
    query,
  });
}
