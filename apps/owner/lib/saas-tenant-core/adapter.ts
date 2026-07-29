import type {
  CreateStarterTenantOutcome,
  CreateStarterTenantService,
} from "@celebix/saas-tenant-core";

export interface OwnerServiceUnavailableError {
  schemaVersion: 1;
  code: "service_unavailable";
  retryable: true;
}

export type OwnerTenantCoreOutcome =
  | CreateStarterTenantOutcome
  | { ok: false; error: OwnerServiceUnavailableError };

export interface OwnerTenantCoreAdapter {
  createStarterTenant(input: unknown): Promise<OwnerTenantCoreOutcome>;
}

export function createUnavailableOwnerTenantCoreAdapter(): OwnerTenantCoreAdapter {
  return {
    createStarterTenant: async () => ({
      ok: false,
      error: { schemaVersion: 1, code: "service_unavailable", retryable: true },
    }),
  };
}

export function createOwnerTenantCoreAdapter(
  service: CreateStarterTenantService,
): OwnerTenantCoreAdapter {
  return {
    createStarterTenant: (input) => service.execute(input),
  };
}
