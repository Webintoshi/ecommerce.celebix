import {
  parseCatalogOnboardingIntent,
  parseCatalogCategoryFields,
  type CatalogOnboardingIntent,
  type CatalogCategoryFields,
} from "@celebix/saas-contracts";

import { CatalogRepositoryError } from "../catalog/errors.ts";
import { catalogAuthority, type ValidatedCatalogAuthority } from "../catalog/validation.ts";
import { CatalogOnboardingRepositoryError, type CatalogOnboardingErrorCode } from "./errors.ts";
import type { CatalogMerchandisingPayload } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(code: CatalogOnboardingErrorCode = "invalid_input"): never {
  throw new CatalogOnboardingRepositoryError(code);
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  return value as Record<string, unknown>;
}

export function exactCatalogOnboardingInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const parsed = object(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) fail();
  return parsed;
}

export function catalogOnboardingUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function catalogOnboardingPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail();
  return value as number;
}

export function catalogOnboardingCount(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) fail();
  return value as number;
}

export function catalogOnboardingAuthority(context: unknown, now: unknown): ValidatedCatalogAuthority {
  try {
    return catalogAuthority(context as never, now as never);
  } catch (error) {
    if (error instanceof CatalogRepositoryError) {
      const mapped = error.code === "invalid_input" ? "durable_authority_invalid" : error.code;
      if (["unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(mapped)) {
        fail(mapped as CatalogOnboardingErrorCode);
      }
    }
    fail("durable_authority_invalid");
  }
}

export function catalogOnboardingIntent(value: unknown): CatalogOnboardingIntent {
  try { return parseCatalogOnboardingIntent(value); } catch { fail(); }
}

export function catalogCategoryFields(value: unknown): CatalogCategoryFields {
  try { return parseCatalogCategoryFields(value); } catch { fail(); }
}

export function catalogMerchandisingPayload(value: unknown): CatalogMerchandisingPayload {
  const parsed = exactCatalogOnboardingInput(value, ["profile", "categoryIds", "resourceIds", "channelIds"]);
  try {
    const synthetic = parseCatalogOnboardingIntent({
      kind: "advanced",
      productType: "physical",
      title: "Doğrulama ürünü",
      publish: false,
      variants: [{
        title: "Standart",
        priceCents: 0,
        stockTracking: true,
        stockQuantity: 0,
        attributes: {},
        continueSellingWhenOutOfStock: false,
        inventory: [],
      }],
      categoryIds: parsed.categoryIds,
      resourceIds: parsed.resourceIds,
      channelIds: parsed.channelIds,
      profile: parsed.profile,
    });
    if (synthetic.kind !== "advanced") fail();
    return Object.freeze({
      profile: synthetic.profile,
      categoryIds: synthetic.categoryIds,
      resourceIds: synthetic.resourceIds,
      channelIds: synthetic.channelIds,
    });
  } catch (error) {
    if (error instanceof CatalogOnboardingRepositoryError) throw error;
    fail();
  }
}
