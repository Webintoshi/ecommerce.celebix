import {
  SAAS_ERROR_CODES,
  type CreateStarterTenantInput,
  type CreateStarterTenantResult,
  type SaaSContractError,
} from "@celebix/saas-contracts";

export type TenantCoreClientResult =
  | { ok: true; value: CreateStarterTenantResult }
  | { ok: false; error: SaaSContractError };

export interface TenantCoreClient {
  createStarterTenant(input: CreateStarterTenantInput): Promise<TenantCoreClientResult>;
}

const SAFE_TENANT_CORE_MESSAGE = "Mağaza oluşturma işlemi güvenli şekilde tamamlanamadı.";

export function mapTenantCoreError(error: unknown): SaaSContractError {
  if (error && typeof error === "object") {
    const candidate = error as Partial<SaaSContractError>;
    if (
      candidate.schemaVersion === 1 &&
      typeof candidate.code === "string" &&
      SAAS_ERROR_CODES.includes(candidate.code as SaaSContractError["code"]) &&
      typeof candidate.retryable === "boolean"
    ) {
      return {
        schemaVersion: 1,
        code: candidate.code as SaaSContractError["code"],
        retryable: candidate.retryable,
        ...(candidate.field ? { field: candidate.field } : {}),
        ...(candidate.safeMessage ? { safeMessage: candidate.safeMessage } : {}),
        ...(candidate.operationId ? { operationId: candidate.operationId } : {}),
      };
    }
  }

  return {
    schemaVersion: 1,
    code: "tenant_transaction_failed",
    retryable: false,
    safeMessage: SAFE_TENANT_CORE_MESSAGE,
  };
}

export class DisabledTenantCoreClient implements TenantCoreClient {
  async createStarterTenant(): Promise<TenantCoreClientResult> {
    return {
      ok: false,
      error: {
        schemaVersion: 1,
        code: "tenant_transaction_failed",
        retryable: false,
        safeMessage: "Otomatik mağaza oluşturma henüz etkin değil.",
      },
    };
  }
}

async function stableId(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex").slice(0, 16);
}

/** Deterministic contract fake for unit tests only; never selected by production wiring. */
export class DeterministicFakeTenantCoreClient implements TenantCoreClient {
  async createStarterTenant(input: CreateStarterTenantInput): Promise<TenantCoreClientResult> {
    const authorityHash = await stableId(`${input.principal.issuer}\u0000${input.principal.subject}`);
    const operationHash = await stableId(`${input.idempotencyKey}\u0000${input.store.slug}`);
    const storeId = `store_${operationHash}`;
    const principalId = `principal_${authorityHash}`;
    const now = input.requestedAt;

    return {
      ok: true,
      value: {
        schemaVersion: 1,
        operationId: `operation_${operationHash}`,
        replayed: false,
        store: { id: storeId, slug: input.store.slug, status: "active" },
        primaryDomain: {
          schemaVersion: 1,
          hostname: `${input.store.slug}.celebix.site`,
          domainId: `domain_${operationHash}`,
          domainType: "platform_subdomain",
          storeId,
          storeSlug: input.store.slug,
          canonicalHostname: `${input.store.slug}.celebix.site`,
          status: "active",
          cacheVersion: 1,
        },
        membership: {
          schemaVersion: 1,
          id: `membership_${operationHash}`,
          principalId,
          storeId,
          role: "store_owner",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        plan: {
          schemaVersion: 1,
          planId: "plan_free_starter",
          planCode: "free_starter",
          version: 1,
          status: "active",
          features: ["catalog", "orders", "customers", "content", "media", "analytics", "checkout"],
          limits: {
            products: 100,
            staff: 1,
            storageBytes: 1_000_000_000,
            monthlyOrders: 100,
            customDomains: 0,
          },
          validFrom: now,
        },
        provisioningStatus: "ready",
        panelUrl: "https://panel.celebix.site",
        storefrontUrl: `https://${input.store.slug}.celebix.site`,
      },
    };
  }
}

export async function callTenantCoreSafely(
  client: TenantCoreClient,
  input: CreateStarterTenantInput,
): Promise<TenantCoreClientResult> {
  try {
    return await client.createStarterTenant(input);
  } catch (error) {
    return { ok: false, error: mapTenantCoreError(error) };
  }
}
