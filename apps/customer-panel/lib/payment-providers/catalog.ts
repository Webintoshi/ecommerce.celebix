import {
  parsePaymentProviderCatalog,
  type PaymentProviderCatalogEntry,
} from "@celebix/saas-contracts";

import { RAW_PAYMENT_PROVIDER_CATALOG } from "./catalog-data.ts";

export const PAYMENT_PROVIDER_CATALOG = parsePaymentProviderCatalog(RAW_PAYMENT_PROVIDER_CATALOG);

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
