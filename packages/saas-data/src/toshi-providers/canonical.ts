import { createHash } from "node:crypto";

import {
  TOSHI_PROVIDERS,
  type TenantContext,
  type ToshiProvider,
  type ToshiProviderModel,
} from "@celebix/saas-contracts";

import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { providerSealedCredential } from "../provider-execution/canonical.ts";
import type { SealedMerchantProviderCredential } from "../provider-execution/credential-crypto.ts";
import { ToshiProviderRepositoryError } from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MASKED_KEY = /^••••[^\s\p{C}]{4}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const ENCODER = new TextEncoder();

function fail(code: ConstructorParameters<typeof ToshiProviderRepositoryError>[0] = "invalid_input"): never {
  throw new ToshiProviderRepositoryError(code);
}

export function exactToshiInput(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
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

export function toshiProvider(value: unknown): ToshiProvider {
  if (!TOSHI_PROVIDERS.includes(value as never)) fail();
  return value as ToshiProvider;
}

export function toshiUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function toshiVersion(value: unknown, minimum: 0 | 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail();
  return value as number;
}

export function toshiDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) fail();
  return value;
}

export function toshiMaskedKey(value: unknown): string {
  if (typeof value !== "string" || !MASKED_KEY.test(value)) fail();
  return value;
}

function text(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 1 || value !== value.trim() ||
    CONTROL.test(value) || ENCODER.encode(value).byteLength > 160
  ) fail();
  return value;
}

export function toshiModels(value: unknown): readonly ToshiProviderModel[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 100) fail();
  const models = value.map((entry) => {
    const parsed = exactToshiInput(entry, ["id", "label"]);
    return Object.freeze({ id: text(parsed.id), label: text(parsed.label) });
  });
  if (new Set(models.map(({ id }) => id)).size !== models.length) fail();
  return Object.freeze(models);
}

export function toshiSelectedModel(value: unknown, availableModels?: readonly ToshiProviderModel[]): string {
  const selected = text(value);
  if (availableModels !== undefined && !availableModels.some(({ id }) => id === selected)) fail();
  return selected;
}

export function toshiSealedCredential(value: unknown): SealedMerchantProviderCredential {
  try { return providerSealedCredential(value); } catch { fail(); }
}

export function toshiAuthority(context: TenantContext, now: Date): ValidatedOrderAuthority {
  try { return merchantAuthority(context, now, "catalog"); }
  catch (error) {
    if (error instanceof OrderRepositoryError) {
      if (["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled"].includes(error.code)) {
        fail(error.code as ConstructorParameters<typeof ToshiProviderRepositoryError>[0]);
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

export function toshiFingerprint(kind: "connect" | "select_model" | "set_default" | "revoke", storeId: string, value: unknown): string {
  return createHash("sha256").update(stable({ kind, storeId, value }), "utf8").digest("hex");
}
