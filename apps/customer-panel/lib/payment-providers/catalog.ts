import {
  parsePaymentProviderCatalog,
  type PaymentProviderCatalogEntry,
} from "@celebix/saas-contracts";

import { RAW_PAYMENT_PROVIDER_CATALOG } from "./catalog-data.ts";
import logoManifest from "./logo-manifest.json" with { type: "json" };

export type PaymentProviderLogoBinding = Readonly<{
  familyCode: string;
  file: string;
}>;

export function validatePaymentProviderLogoBindings(
  catalog: readonly PaymentProviderCatalogEntry[],
  manifest: readonly PaymentProviderLogoBinding[],
): void {
  if (!Array.isArray(manifest)) throw new TypeError("Invalid payment provider logo manifest");
  const manifestByFamily = new Map<string, string>();
  const manifestFiles = new Set<string>();

  for (const row of manifest) {
    if (!row || typeof row !== "object" ||
        !/^[a-z][a-z0-9_]{0,63}$/.test(row.familyCode) ||
        !/^\/payment-providers\/[a-z0-9_]+\.(?:svg|png|webp)$/.test(row.file) ||
        manifestByFamily.has(row.familyCode) || manifestFiles.has(row.file)) {
      throw new TypeError("Invalid payment provider logo manifest");
    }
    manifestByFamily.set(row.familyCode, row.file);
    manifestFiles.add(row.file);
  }

  const catalogFamilies = new Set(catalog.map((entry) => entry.familyCode));
  if (catalogFamilies.size !== manifestByFamily.size ||
      [...manifestByFamily.keys()].some((familyCode) => !catalogFamilies.has(familyCode))) {
    throw new TypeError("Invalid payment provider logo manifest coverage");
  }

  for (const entry of catalog) {
    if (!/^\/payment-providers\/[a-z0-9_]+\.(?:svg|png|webp)$/.test(entry.logoPath) ||
        manifestByFamily.get(entry.familyCode) !== entry.logoPath) {
      throw new TypeError("Invalid payment provider logo path");
    }
  }
}

export const PAYMENT_PROVIDER_CATALOG = parsePaymentProviderCatalog(RAW_PAYMENT_PROVIDER_CATALOG);
validatePaymentProviderLogoBindings(PAYMENT_PROVIDER_CATALOG, logoManifest);

const BY_PROVIDER_CODE = new Map(
  PAYMENT_PROVIDER_CATALOG.map((entry) => [entry.providerCode, entry] as const),
);

export function listPaymentProviderCatalog(): readonly PaymentProviderCatalogEntry[] {
  return PAYMENT_PROVIDER_CATALOG;
}

export function getPaymentProviderCatalogEntry(providerCode: string): PaymentProviderCatalogEntry | null {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(providerCode)) return null;
  return BY_PROVIDER_CODE.get(providerCode) ?? null;
}
