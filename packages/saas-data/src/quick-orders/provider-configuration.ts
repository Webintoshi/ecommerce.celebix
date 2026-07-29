import { createHash } from "node:crypto";

export interface CanonicalPaytrConfiguration {
  readonly version: 1;
  readonly merchantId: string;
  readonly merchantKey: string;
  readonly merchantSalt: string;
  readonly callbackUrl: string;
  readonly testMode: 1;
}

const CONTROL = /[\u0000-\u001f\u007f]/;
type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never {
  throw new TypeError("paytr_configuration_invalid");
}

function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    return invalid();
  }
}

function exact(value: unknown): InputRecord {
  const required = ["version", "merchantId", "merchantKey", "merchantSalt", "callbackUrl", "testMode"] as const;
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== required.length || keys.some((key) => typeof key !== "string" || !required.includes(key as typeof required[number])) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    copy[key] = descriptor.value;
  }
  return copy;
}

function string(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

function callbackUrl(value: unknown): string {
  const raw = string(value, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return invalid();
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || raw.includes("?") || raw.includes("#") ||
    parsed.hostname !== parsed.hostname.toLowerCase() || parsed.pathname !== "/api/payments/paytr/callback" || parsed.toString() !== raw
  ) invalid();
  return raw;
}

function configuration(value: unknown): CanonicalPaytrConfiguration {
  const parsed = exact(value);
  if (parsed.version !== 1 || parsed.testMode !== 1) invalid();
  return Object.freeze({
    version: 1,
    merchantId: string(parsed.merchantId, 128),
    merchantKey: string(parsed.merchantKey, 256),
    merchantSalt: string(parsed.merchantSalt, 256),
    callbackUrl: callbackUrl(parsed.callbackUrl),
    testMode: 1,
  });
}

function canonicalBytes(value: CanonicalPaytrConfiguration): string {
  return JSON.stringify([
    "celebix-paytr", 1, value.merchantId, value.merchantKey,
    value.merchantSalt, value.callbackUrl, 1,
  ]);
}

export function serializeCanonicalPaytrConfiguration(input: CanonicalPaytrConfiguration): string {
  return guarded(() => canonicalBytes(configuration(input)));
}

export function parseCanonicalPaytrConfiguration(serialized: string): CanonicalPaytrConfiguration {
  return guarded(() => {
    if (typeof serialized !== "string" || serialized.length < 1 || Buffer.byteLength(serialized, "utf8") > 8_192) invalid();
    const decoded: unknown = JSON.parse(serialized);
    if (!Array.isArray(decoded) || Object.getPrototypeOf(decoded) !== Array.prototype) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(decoded) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = descriptors.length;
    if (!length || !("value" in length) || length.value !== 7 || length.enumerable || Reflect.ownKeys(descriptors).length !== 8) invalid();
    const values: unknown[] = [];
    for (let index = 0; index < 7; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
      values.push(descriptor.value);
    }
    if (values[0] !== "celebix-paytr") invalid();
    const parsed = configuration({
      version: values[1],
      merchantId: values[2],
      merchantKey: values[3],
      merchantSalt: values[4],
      callbackUrl: values[5],
      testMode: values[6],
    });
    if (canonicalBytes(parsed) !== serialized) invalid();
    return parsed;
  });
}

export function digestCanonicalPaytrConfiguration(serialized: string): string {
  return guarded(() => {
    parseCanonicalPaytrConfiguration(serialized);
    return createHash("sha256").update(serialized, "utf8").digest("hex");
  });
}
