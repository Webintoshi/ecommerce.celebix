import type { PaymentProviderCatalogEntry } from "@celebix/saas-contracts";

/** Setup describes credential verification, independently of approved payment execution. */
export function paymentProviderCredentialCatalogEntry(entry: PaymentProviderCatalogEntry): PaymentProviderCatalogEntry {
  if (entry.providerCode !== "paytr_iframe" || entry.familyCode !== "paytr" || entry.modeCode !== "iframe"
    || !["verification", "sandbox_ready", "production_ready"].includes(entry.readiness)) return entry;
  return Object.freeze({ ...entry, readiness: "verification", environments: Object.freeze(["test", "live"] as const), executionAuthority: null });
}

export function paymentProviderCredentialCatalog(catalog: readonly PaymentProviderCatalogEntry[]): readonly PaymentProviderCatalogEntry[] {
  return Object.freeze(catalog.map(paymentProviderCredentialCatalogEntry));
}
