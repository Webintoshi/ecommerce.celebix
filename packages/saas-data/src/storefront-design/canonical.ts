import { createHash } from "node:crypto";

import type { StorefrontDesignDocument, TenantContext } from "@celebix/saas-contracts";

import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { StorefrontDesignRepositoryError } from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const MEDIA_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);

function fail(code: ConstructorParameters<typeof StorefrontDesignRepositoryError>[0] = "invalid_input"): never {
  throw new StorefrontDesignRepositoryError(code);
}

export function exactDesignInput(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== required.length || keys.some((key) => typeof key !== "string" || !required.includes(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) fail();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") fail();
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !("value" in descriptor)) fail();
    result[key] = descriptor.value;
  }
  return result;
}

export function designUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function designVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail();
  return value as number;
}

export function designDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) fail();
  return value;
}

export function designMediaType(value: unknown): (typeof MEDIA_TYPES)[number] {
  if (!MEDIA_TYPES.includes(value as never)) fail();
  return value as (typeof MEDIA_TYPES)[number];
}

export function designText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value) || new TextEncoder().encode(value).byteLength > maximum) fail();
  return value;
}

export function designDimension(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) fail();
  return value as number;
}

export function designAuthority(context: TenantContext, now: Date): ValidatedOrderAuthority {
  try { return merchantAuthority(context, now, "catalog"); }
  catch (error) {
    if (error instanceof OrderRepositoryError && ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled"].includes(error.code)) fail(error.code as ConstructorParameters<typeof StorefrontDesignRepositoryError>[0]);
    fail("durable_authority_invalid");
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, nested]) => nested !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
}

export function designFingerprint(kind: "save_draft" | "publish" | "media_reserve", storeId: string, value: unknown): string {
  return createHash("sha256").update(stable({ kind, storeId, value }), "utf8").digest("hex");
}

export function designJson(value: StorefrontDesignDocument): string {
  return stable(value);
}
