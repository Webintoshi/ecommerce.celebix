import "server-only";

import {
  getStoreAdminDomainForStorefrontDomain,
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
  persistDomainMigrationSummary,
  type DomainMigrationSummary,
} from "@/lib/store-lifecycle";
import {
  releaseStoreProvisioningWindow,
  reserveStoreProvisioningWindow,
} from "@/lib/store-provisioning-guard";
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
  domainMigration: DomainMigrationSummary;
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
  const requestedAdminDomain = getStoreAdminDomainForStorefrontDomain(normalizedRequestedDomain);
  const mutationWindow = await reserveStoreProvisioningWindow({
    slug,
    mode: "repair",
    actionLabel: "domain migration",
  });
  let domainUpdated = false;

  try {
    if (!normalizedRequestedDomain) {
      throw new Error("Yeni storefront domain zorunludur.");
    }

    if (
      normalizedRequestedDomain === previousStorefrontDomain &&
      requestedAdminDomain === previousAdminDomain
    ) {
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

    const startedAt = new Date().toISOString();
    await persistDomainMigrationSummary(slug, {
      state: "running",
      previousStorefrontDomain,
      previousAdminDomain,
      storefrontDomain: normalizedRequestedDomain,
      adminDomain: requestedAdminDomain,
      startedAt,
      completedAt: null,
      lastError: null,
      authoritySyncMessage: null,
      adminDeploymentStatus: null,
      storefrontDeploymentStatus: null,
      rollbackState: "not_needed",
      rollbackCompletedAt: null,
      rollbackError: null,
    });

    const nextConfig = updateStoreDomains(slug, {
      storefrontDomain: normalizedRequestedDomain,
      refreshDerivedBrandingEmails: true,
    });
    domainUpdated = true;

    const authoritySyncMessage = await syncAuthorityOrThrow(slug);
    await persistDomainMigrationSummary(slug, {
      authoritySyncMessage,
    });
    await syncOwnerStoresAndMetrics();

    const [adminDeployment, storefrontDeployment] = await Promise.all([
      provisionAdminDeploymentForStore(slug, { waitForRuntime: true }),
      provisionStorefrontDeploymentForStore(slug, { waitForRuntime: true }),
    ]);

    await syncOwnerStoresAndMetrics();

    const domainMigration = await persistDomainMigrationSummary(slug, {
      state: "completed",
      completedAt: new Date().toISOString(),
      authoritySyncMessage,
      adminDeploymentStatus: adminDeployment.status,
      storefrontDeploymentStatus: storefrontDeployment.status,
      rollbackState: "not_needed",
      rollbackCompletedAt: null,
      rollbackError: null,
    });

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
      domainMigration,
    };
  } catch (error) {
    const originalMessage =
      error instanceof Error ? error.message : "Domain migration basarisiz oldu.";

    await persistDomainMigrationSummary(slug, {
      state: "failed",
      completedAt: new Date().toISOString(),
      lastError: originalMessage,
    }).catch(() => null);

    if (domainUpdated) {
      await persistDomainMigrationSummary(slug, {
        rollbackState: "running",
      }).catch(() => null);

      let rollbackCompleted = false;

      try {
        updateStoreDomains(slug, {
          storefrontDomain: previousStorefrontDomain,
          adminDomain: previousAdminDomain,
          refreshDerivedBrandingEmails: true,
        });
        const rollbackAuthoritySyncMessage = await syncAuthorityOrThrow(slug);
        const [adminRollback, storefrontRollback] = await Promise.allSettled([
          provisionAdminDeploymentForStore(slug, { waitForRuntime: true }),
          provisionStorefrontDeploymentForStore(slug, { waitForRuntime: true }),
        ]);
        await syncOwnerStoresAndMetrics();
        const rollbackCompletedAt = new Date().toISOString();

        await persistDomainMigrationSummary(slug, {
          state: "rolled_back",
          storefrontDomain: previousStorefrontDomain,
          adminDomain: previousAdminDomain,
          completedAt: rollbackCompletedAt,
          authoritySyncMessage: rollbackAuthoritySyncMessage,
          adminDeploymentStatus:
            adminRollback.status === "fulfilled" ? adminRollback.value.status : "failed",
          storefrontDeploymentStatus:
            storefrontRollback.status === "fulfilled"
              ? storefrontRollback.value.status
              : "failed",
          rollbackState: "completed",
          rollbackCompletedAt,
          rollbackError: null,
        }).catch(() => null);

        await recordOwnerAuditLog({
          actorId: context.user.id,
          action: "store_domain_migration_rolled_back",
          targetType: "store",
          targetId: slug,
          details: {
            failedStorefrontDomain: normalizedRequestedDomain,
            failedAdminDomain: requestedAdminDomain,
            restoredStorefrontDomain: previousStorefrontDomain,
            restoredAdminDomain: previousAdminDomain,
            reason: originalMessage,
          },
        }).catch(() => null);
        rollbackCompleted = true;
      } catch (rollbackError) {
        const rollbackMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : "Rollback basarisiz oldu.";

        await persistDomainMigrationSummary(slug, {
          state: "failed",
          rollbackState: "failed",
          rollbackError: rollbackMessage,
        }).catch(() => null);

        await recordOwnerAuditLog({
          actorId: context.user.id,
          action: "store_domain_migration_failed",
          targetType: "store",
          targetId: slug,
          details: {
            previousStorefrontDomain,
            previousAdminDomain,
            storefrontDomain: normalizedRequestedDomain,
            adminDomain: requestedAdminDomain,
            error: originalMessage,
            rollbackError: rollbackMessage,
          },
        }).catch(() => null);

        throw new Error(`${originalMessage} Rollback da basarisiz oldu: ${rollbackMessage}`);
      }

      if (rollbackCompleted) {
        throw new Error(`${originalMessage} Rollback tamamlandi; eski domain geri yuklendi.`);
      }
    }

    throw new Error(originalMessage);
  } finally {
    await releaseStoreProvisioningWindow(mutationWindow);
  }
}
