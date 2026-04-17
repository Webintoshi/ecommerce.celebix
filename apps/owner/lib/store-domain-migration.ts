import "server-only";

import {
  requireStoreConfig,
  updateStoreDomains,
} from "@celebix/platform-config";
import { provisionAdminDeploymentForStore } from "@/lib/admin-deployment-coolify";
import {
  recordOwnerAuditLog,
  syncOwnerStoresAndMetrics,
} from "@/lib/control-plane";
import type { OwnerAuthContext } from "@/lib/owner-auth";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import {
  syncStoreAuthorityRepoForStore,
  validateGitHubRepoSyncReadiness,
} from "@/lib/storefront-repo-sync";
import { provisionStorefrontDeploymentForStore } from "@/lib/storefront-deployment-coolify";

interface DomainMigrationInput {
  storefrontDomain: string;
}

interface DomainMigrationDeploymentSummary {
  status: string;
  runtimeUrl: string;
  message: string | null;
}

function normalizeRequestedDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLocaleLowerCase("tr");
}

export interface StoreDomainMigrationResult {
  previousStorefrontDomain: string;
  previousAdminDomain: string;
  storefrontDomain: string;
  adminDomain: string;
  authoritySyncMessage: string;
  adminDeployment: DomainMigrationDeploymentSummary;
  storefrontDeployment: DomainMigrationDeploymentSummary;
}

async function syncAuthorityOrThrow(slug: string): Promise<string> {
  const readiness = await validateGitHubRepoSyncReadiness();

  if (!readiness.ready) {
    throw new Error(readiness.message || "GitHub repo sync authority hazir degil.");
  }

  const syncResult = await syncStoreAuthorityRepoForStore(slug);

  if (syncResult.status !== "synced") {
    throw new Error(syncResult.message || "Store authority repo senkronu tamamlanamadi.");
  }

  return syncResult.message || "Store authority repo senkronlandi.";
}

export async function migrateStoreDomain(
  context: OwnerAuthContext,
  slug: string,
  input: DomainMigrationInput,
): Promise<StoreDomainMigrationResult> {
  if (context.profile.role !== "super_admin") {
    throw new Error("Bu islem icin super admin yetkisi gerekli.");
  }

  const currentStore = requireStoreConfig(slug);
  const previousStorefrontDomain = currentStore.domains.storefront;
  const previousAdminDomain = currentStore.domains.admin;
  const normalizedRequestedDomain = normalizeRequestedDomain(input.storefrontDomain);
  const requestedAdminDomain = `admin.${normalizedRequestedDomain}`;

  if (!normalizedRequestedDomain) {
    throw new Error("Yeni storefront domain zorunludur.");
  }

  if (normalizedRequestedDomain === previousStorefrontDomain) {
    throw new Error("Yeni domain mevcut storefront domain ile ayni.");
  }

  const serviceClient = createOwnerServiceClient();
  const { data: conflictingStores, error: conflictError } = await serviceClient
    .from("owner_stores")
    .select("slug, storefront_domain, admin_domain")
    .neq("slug", slug);

  if (conflictError) {
    throw new Error(conflictError.message);
  }

  const matchingConflict = (conflictingStores ?? []).find((store) => {
    const candidate = store as {
      storefront_domain?: string | null;
      admin_domain?: string | null;
    };
    return (
      candidate.storefront_domain === normalizedRequestedDomain ||
      candidate.admin_domain === normalizedRequestedDomain ||
      candidate.storefront_domain === requestedAdminDomain ||
      candidate.admin_domain === requestedAdminDomain
    );
  });

  if (matchingConflict) {
    const conflict = matchingConflict as {
      slug?: string | null;
      storefront_domain?: string | null;
      admin_domain?: string | null;
    };
    throw new Error(
      `Bu domain baska bir magazada kullaniliyor: ${conflict.slug ?? "unknown"} (${conflict.storefront_domain ?? "-"} / ${conflict.admin_domain ?? "-"})`,
    );
  }

  let domainUpdated = false;

  try {
    const nextConfig = updateStoreDomains(slug, {
      storefrontDomain: normalizedRequestedDomain,
      refreshDerivedBrandingEmails: true,
    });
    domainUpdated = true;

    const authoritySyncMessage = await syncAuthorityOrThrow(slug);
    await syncOwnerStoresAndMetrics();

    const [adminDeployment, storefrontDeployment] = await Promise.all([
      provisionAdminDeploymentForStore(slug, { waitForRuntime: true }),
      provisionStorefrontDeploymentForStore(slug, { waitForRuntime: true }),
    ]);

    await syncOwnerStoresAndMetrics();

    await recordOwnerAuditLog({
      actorId: context.user.id,
      action: "store_domain_migrated",
      targetType: "store",
      targetId: slug,
      details: {
        previousStorefrontDomain,
        previousAdminDomain,
        storefrontDomain: nextConfig.domains.storefront,
        adminDomain: nextConfig.domains.admin,
      },
    });

    return {
      previousStorefrontDomain,
      previousAdminDomain,
      storefrontDomain: nextConfig.domains.storefront,
      adminDomain: nextConfig.domains.admin,
      authoritySyncMessage,
      adminDeployment: {
        status: adminDeployment.status,
        runtimeUrl: adminDeployment.runtimeUrl,
        message: adminDeployment.message,
      },
      storefrontDeployment: {
        status: storefrontDeployment.status,
        runtimeUrl: storefrontDeployment.runtimeUrl,
        message: storefrontDeployment.message,
      },
    };
  } catch (error) {
    if (domainUpdated) {
      try {
        updateStoreDomains(slug, {
          storefrontDomain: previousStorefrontDomain,
          adminDomain: previousAdminDomain,
          refreshDerivedBrandingEmails: true,
        });
        await syncAuthorityOrThrow(slug);
        await Promise.allSettled([
          provisionAdminDeploymentForStore(slug, { waitForRuntime: true }),
          provisionStorefrontDeploymentForStore(slug, { waitForRuntime: true }),
        ]);
        await syncOwnerStoresAndMetrics();
      } catch (rollbackError) {
        const originalMessage = error instanceof Error ? error.message : "Domain migration basarisiz oldu.";
        const rollbackMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : "Rollback basarisiz oldu.";
        throw new Error(`${originalMessage} Rollback da basarisiz oldu: ${rollbackMessage}`);
      }
    }

    throw error;
  }
}
