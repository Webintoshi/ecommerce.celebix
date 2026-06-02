import "server-only";

import {
  getLightPostgresCustomizationSchemaById,
  getLightPostgresCustomizationSchemaForProduct,
  type LightPostgresCustomizationSchemaPayload,
} from "../../../../packages/platform-config/src/light-postgres-customization-read";
import { queryLightPostgres } from "@/lib/db/light-postgres-client";
import { shouldUseLightPostgresStorefront } from "@/lib/db/storefront-database-mode";

async function executeLightPostgres<TRow extends Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
) {
  return queryLightPostgres<TRow>(sql, params);
}

export async function maybeGetStorefrontCustomizationSchemaById(schemaId: string) {
  if (!shouldUseLightPostgresStorefront()) {
    return undefined;
  }

  return getLightPostgresCustomizationSchemaById(
    executeLightPostgres,
    schemaId,
    { activeOnly: true },
  ) as Promise<LightPostgresCustomizationSchemaPayload | null>;
}

export async function maybeGetStorefrontCustomizationSchemaForProduct(productId: string) {
  if (!shouldUseLightPostgresStorefront()) {
    return undefined;
  }

  return getLightPostgresCustomizationSchemaForProduct(
    executeLightPostgres,
    productId,
  ) as Promise<LightPostgresCustomizationSchemaPayload | null>;
}
