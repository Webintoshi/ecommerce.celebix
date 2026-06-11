import "server-only";

import { lookup } from "node:dns/promises";
import {
  createStore,
  getStoreAdminDomainForStorefrontDomain,
  resolveDefaultDatabaseMode,
  type DatabaseMode,
} from "@celebix/platform-config";
import {
  ensureOwnerStoreAuthorityForSlug,
  recordOwnerAuditLog,
} from "@/lib/control-plane";
import { validateNewStoreDeploymentBranches } from "@/lib/deployment-branch-guard";
import type { OwnerAuthContext } from "@/lib/owner-auth";
import { hasUnresolvedCleanupRun } from "@/lib/store-lifecycle";
import {
  getLogtoBootstrapStatus,
  validateLogtoManagementAuthority,
} from "@/lib/logto-provisioning";
import {
  getUmamiBootstrapStatus,
  validateUmamiManagementAuthority,
} from "@/lib/umami-provisioning";
import {
  runStoreProvisioningWorkflow,
  validateProvisioningEnvironmentReadiness,
} from "@/lib/store-provisioning";

export interface OwnerStoreCreateRequestBody {
  name?: string;
  slug?: string;
  domain?: string;
  theme?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  coolifyProjectName?: string;
  adminDeploymentName?: string;
  storefrontDeploymentName?: string;
  databaseMode?: DatabaseMode;
  packageStartDate?: string;
  packageDurationMonths?: number | string | null;
}

export interface OwnerStoreCreatePreflightResult {
  ok: boolean;
  status: number;
  slug: string;
  databaseMode: DatabaseMode;
  legacyModeSelected: boolean;
  errors: string[];
  deploymentBranches?: {
    owner: string;
    admin: string;
    storefront: string;
  };
}

export class OwnerStoreCreatePreflightError extends Error {
  constructor(readonly result: OwnerStoreCreatePreflightResult) {
    super(result.errors[0] || "Store create preflight failed.");
  }
}

export function predictStoreSlug(name: string, explicitSlug?: string): string {
  const candidate = explicitSlug?.trim() || name.trim();

  return candidate
    .toLocaleLowerCase("tr")
    .replace(/Ã„Â±/g, "i")
    .replace(/Ã„Å¸/g, "g")
    .replace(/ÃƒÂ¼/g, "u")
    .replace(/Ã…Å¸/g, "s")
    .replace(/ÃƒÂ¶/g, "o")
    .replace(/ÃƒÂ§/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDuration(value: number | string | null | undefined): number | null | undefined {
  if (typeof value === "string") {
    return value.trim().length > 0 ? Number(value) : null;
  }

  return value ?? undefined;
}

async function validateLiveProviderAuthority(databaseMode: DatabaseMode): Promise<string[]> {
  const errors: string[] = [];

  if (databaseMode !== "light_postgres") {
    return errors;
  }

  try {
    const status = getLogtoBootstrapStatus();

    if (!status.configured) {
      errors.push(status.lastError || "Logto live apply authority eksik.");
    } else {
      await validateLogtoManagementAuthority();
    }
  } catch (error) {
    errors.push(
      `Logto management authority dogrulanamadi: ${
        error instanceof Error ? error.message : "bilinmeyen hata"
      }`,
    );
  }

  try {
    const status = getUmamiBootstrapStatus();

    if (!status.configured) {
      errors.push(status.lastError || "Umami live apply token authority eksik.");
    } else {
      await validateUmamiManagementAuthority();
    }
  } catch (error) {
    errors.push(
      `Umami management authority dogrulanamadi: ${
        error instanceof Error ? error.message : "bilinmeyen hata"
      }`,
    );
  }

  return errors;
}

function isGeneratedManagedDomain(domain: string): boolean {
  return domain.endsWith(".celebix.site") || domain.endsWith(".demo.celebix.co");
}

async function isResolvable(domain: string): Promise<boolean> {
  try {
    await lookup(domain);
    return true;
  } catch {
    return false;
  }
}

async function validateGeneratedDomainAuthority(input: {
  storefrontDomain: string;
  adminDomain: string;
}): Promise<string[]> {
  const errors: string[] = [];

  for (const [label, domain] of Object.entries(input)) {
    if (!isGeneratedManagedDomain(domain)) {
      continue;
    }

    if (!(await isResolvable(domain))) {
      errors.push(
        `${label} DNS authority hazir degil: ${domain} resolve etmiyor. Generated store icin wildcard DNS/proxy authority gerekli.`,
      );
    }
  }

  return errors;
}

export async function validateOwnerStoreCreatePreflight(
  body: OwnerStoreCreateRequestBody,
): Promise<OwnerStoreCreatePreflightResult> {
  const requestedDatabaseMode = resolveDefaultDatabaseMode(body.databaseMode);
  const legacyModeSelected = requestedDatabaseMode === "full_supabase";
  const predictedSlug = predictStoreSlug(body.name ?? "", body.slug);
  const predictedStorefrontDomain = body.domain?.trim().toLocaleLowerCase("tr") || "";

  if (!predictedSlug) {
    return {
      ok: false,
      status: 400,
      slug: predictedSlug,
      databaseMode: requestedDatabaseMode,
      legacyModeSelected,
      errors: ["Store slug bos olamaz."],
    };
  }

  if (await hasUnresolvedCleanupRun(predictedSlug)) {
    return {
      ok: false,
      status: 409,
      slug: predictedSlug,
      databaseMode: requestedDatabaseMode,
      legacyModeSelected,
      errors: [`"${predictedSlug}" icin cozulmemis cleanup tombstone kaydi var. Ayni slug ile tekrar acilamaz.`],
    };
  }

  const branchValidation = validateNewStoreDeploymentBranches(predictedSlug);

  if (branchValidation.errors.length > 0) {
    return {
      ok: false,
      status: 409,
      slug: predictedSlug,
      databaseMode: requestedDatabaseMode,
      legacyModeSelected,
      errors: [branchValidation.errors.join(" ")],
      deploymentBranches: {
        owner: branchValidation.ownerBranch,
        admin: branchValidation.adminBranch,
        storefront: branchValidation.storefrontBranch,
      },
    };
  }

  const environmentReadiness = await validateProvisioningEnvironmentReadiness({
    databaseMode: requestedDatabaseMode,
  });
  const liveAuthorityErrors = await validateLiveProviderAuthority(requestedDatabaseMode);
  const domainAuthorityErrors: string[] = [];

  if (predictedStorefrontDomain) {
    try {
      domainAuthorityErrors.push(
        ...(await validateGeneratedDomainAuthority({
          storefrontDomain: predictedStorefrontDomain,
          adminDomain: getStoreAdminDomainForStorefrontDomain(predictedStorefrontDomain),
        })),
      );
    } catch (error) {
      domainAuthorityErrors.push(
        `Generated domain authority dogrulanamadi: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    }
  }
  const errors = [
    ...environmentReadiness.errors,
    ...liveAuthorityErrors,
    ...domainAuthorityErrors,
  ];

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? 200 : 409,
    slug: predictedSlug,
    databaseMode: requestedDatabaseMode,
    legacyModeSelected,
    errors,
  };
}

export async function assertOwnerStoreCreatePreflight(
  body: OwnerStoreCreateRequestBody,
): Promise<OwnerStoreCreatePreflightResult> {
  const result = await validateOwnerStoreCreatePreflight(body);

  if (!result.ok) {
    throw new OwnerStoreCreatePreflightError(result);
  }

  return result;
}

export async function createOwnerStoreWithProvisioning(input: {
  auth: OwnerAuthContext;
  auditActorId?: string | null;
  auditAction?: string;
  auditDetails?: Record<string, unknown>;
  body: OwnerStoreCreateRequestBody;
}) {
  const preflight = await assertOwnerStoreCreatePreflight(input.body);
  const created = createStore({
    name: input.body.name ?? "",
    slug: input.body.slug,
    domain: input.body.domain ?? "",
    theme: input.body.theme,
    tagline: input.body.tagline,
    supportEmail: input.body.supportEmail,
    supportPhone: input.body.supportPhone,
    coolifyProjectName: input.body.coolifyProjectName,
    adminDeploymentName: input.body.adminDeploymentName,
    storefrontDeploymentName: input.body.storefrontDeploymentName,
    databaseMode: preflight.databaseMode,
  });
  const auditActorId = input.auditActorId === undefined ? input.auth.user.id : input.auditActorId;

  await ensureOwnerStoreAuthorityForSlug(created.store.slug);

  await recordOwnerAuditLog({
    actorId: auditActorId,
    action: input.auditAction ?? "store_created",
    targetType: "store",
    targetId: created.store.slug,
    details: {
      name: created.store.name,
      domain: created.store.domains.storefront,
      databaseMode: preflight.databaseMode,
      legacyModeSelected: preflight.legacyModeSelected,
      provisioningState: "provisioning",
      ...(input.auditDetails ?? {}),
    },
  });

  const packageDurationMonths = parseDuration(input.body.packageDurationMonths);

  queueMicrotask(() => {
    void runStoreProvisioningWorkflow({
      auth: input.auth,
      auditActorId,
      slug: created.store.slug,
      mode: "create",
      packageStartDate: input.body.packageStartDate,
      packageDurationMonths,
    }).catch(async (error) => {
      try {
        await recordOwnerAuditLog({
          actorId: auditActorId,
          action: "store_provisioning_enqueue_failed",
          targetType: "store",
          targetId: created.store.slug,
          details: {
            message: error instanceof Error ? error.message : "Store provisioning baslatilamadi.",
            ...(input.auditDetails ?? {}),
          },
        });
      } catch {
        // Ignore audit follow-up failures for detached provisioning runs.
      }
    });
  });

  return {
    ...created,
    provisioningState: "provisioning",
    steps: [],
    blockers: [],
  };
}
