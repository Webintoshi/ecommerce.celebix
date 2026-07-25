import { createHash } from "node:crypto";

import {
  MERCHANT_PROVIDER_CAPABILITIES,
  parseMerchantAdminConfig,
  type MerchantAdminJson,
  type MerchantProviderCapability,
  type TenantContext,
} from "@celebix/saas-contracts";

import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import type { SealedMerchantProviderCredential } from "./credential-crypto.ts";
import { MerchantProviderProfileRepositoryError } from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const ENCODER = new TextEncoder();

function fail(code: ConstructorParameters<typeof MerchantProviderProfileRepositoryError>[0] = "invalid_input"): never {
  throw new MerchantProviderProfileRepositoryError(code);
}

export function exactProviderInput(
  value: unknown,
  required: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== required.length ||
    keys.some((key) => typeof key !== "string" || !required.includes(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) fail();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") fail();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail();
    result[key] = descriptor.value;
  }
  return result;
}

export function providerUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function providerCode(value: unknown): string {
  if (typeof value !== "string" || !PROVIDER_CODE.test(value)) fail();
  return value;
}

export function providerCapability(value: unknown): MerchantProviderCapability {
  if (!MERCHANT_PROVIDER_CAPABILITIES.includes(value as never)) fail();
  return value as MerchantProviderCapability;
}

export function providerVersion(value: unknown, minimum: 0 | 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail();
  return value as number;
}

export function providerDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) fail();
  return value;
}

export function providerMaskedReference(value: unknown): string {
  if (
    typeof value !== "string" ||
    ENCODER.encode(value).byteLength < 1 ||
    ENCODER.encode(value).byteLength > 640 ||
    value.length > 160 ||
    EDGE.test(value) ||
    CONTROL.test(value)
  ) fail();
  return value;
}

function canonicalBase64url(value: unknown, exactLength?: number): string {
  if (
    typeof value !== "string" ||
    !BASE64URL.test(value) ||
    (exactLength !== undefined && value.length !== exactLength) ||
    value.length > 22_000 ||
    value.length % 4 === 1
  ) fail();
  const decoded = Buffer.from(value, "base64url");
  try {
    if (decoded.length < 1 || decoded.toString("base64url") !== value) fail();
    return value;
  } finally {
    decoded.fill(0);
  }
}

export function providerSealedCredential(value: unknown): SealedMerchantProviderCredential {
  const parsed = exactProviderInput(value, ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  if (parsed.algorithm !== "A256GCM" || parsed.version !== 1 || typeof parsed.keyId !== "string" || !KEY_ID.test(parsed.keyId)) fail();
  return Object.freeze({
    algorithm: "A256GCM",
    ciphertext: canonicalBase64url(parsed.ciphertext),
    iv: canonicalBase64url(parsed.iv, 16),
    keyId: parsed.keyId,
    tag: canonicalBase64url(parsed.tag, 22),
    version: 1,
  });
}

export function providerPublicConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>> {
  try {
    const parsed = parseMerchantAdminConfig(value);
    if (ENCODER.encode(stable(parsed)).byteLength > 8_192) fail();
    return parsed;
  } catch (error) {
    if (error instanceof MerchantProviderProfileRepositoryError) throw error;
    fail();
  }
}

export function providerAuthority(context: TenantContext, now: Date): ValidatedOrderAuthority {
  try {
    return merchantAuthority(context, now, "integrations");
  } catch (error) {
    if (error instanceof OrderRepositoryError) {
      if (["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(error.code)) {
        fail(error.code as ConstructorParameters<typeof MerchantProviderProfileRepositoryError>[0]);
      }
    }
    fail("durable_authority_invalid");
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
    .join(",")}}`;
}

export function providerProfileFingerprint(kind: "save" | "disable" | "revoke", storeId: string, payload: unknown): string {
  return createHash("sha256").update(stable({ kind, storeId, payload }), "utf8").digest("hex");
}
