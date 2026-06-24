export type SourceStoreStatus = "draft" | "active" | "paused" | string;
export type SourceDatabaseMode = "light_postgres" | "full_supabase" | string;

export interface SourceRegistryEntry {
  slug: string;
  name: string;
  domain?: string | null;
  theme?: string | null;
  status?: SourceStoreStatus | null;
}

export interface SourceStoreConfig {
  slug: string;
  name: string;
  status?: SourceStoreStatus | null;
  databaseMode?: SourceDatabaseMode | null;
  domains?: {
    storefront?: string | null;
    admin?: string | null;
    demo?: string | null;
  } | null;
  r2?: {
    bucketName?: string | null;
    publicUrl?: string | null;
    managedDomain?: string | null;
  } | null;
  bootstrap?: {
    adminDeploymentName?: string | null;
    adminDeploymentBranch?: string | null;
    adminDeploymentRuntimeUrl?: string | null;
    adminDeploymentResourceId?: string | null;
    adminDeploymentStatus?: string | null;
  } | null;
  storefront?: {
    appDir?: string | null;
    deploymentName?: string | null;
    deploymentBranch?: string | null;
    runtimeUrl?: string | null;
    resourceId?: string | null;
    deploymentStatus?: string | null;
  } | null;
}

export type ProposedStoreStatus = "draft" | "ready" | "suspended" | "failed";
export type ProposedDomainType = "storefront" | "legacy_admin" | "platform_subdomain";
export type ProposedDomainStatus = "pending" | "active";

export interface ProposedStoreRow {
  slug: string;
  name: string;
  status: ProposedStoreStatus;
  databaseMode: "light_postgres" | "full_supabase" | "unknown";
  source: "store_config" | "registry";
  sourceStatus: string | null;
}

export interface ProposedDomainRow {
  storeSlug: string;
  hostname: string;
  domainType: ProposedDomainType;
  status: ProposedDomainStatus;
  isPrimary: boolean;
  source: "store_config" | "registry";
}

export interface ProposedDeploymentRefs {
  adminDeploymentName?: string;
  adminDeploymentBranch?: string;
  adminDeploymentRuntimeUrl?: string;
  adminDeploymentResourceId?: string;
  adminDeploymentStatus?: string;
  storefrontAppDir?: string;
  storefrontDeploymentName?: string;
  storefrontDeploymentBranch?: string;
  storefrontRuntimeUrl?: string;
  storefrontResourceId?: string;
  storefrontDeploymentStatus?: string;
  r2BucketName?: string;
  r2PublicUrl?: string;
  r2ManagedDomain?: string;
}

export type RegistryMirrorWarningCode =
  | "duplicate_slug"
  | "duplicate_domain"
  | "missing_store_config"
  | "missing_membership_mapping"
  | "legacy_split_store"
  | "known_external_store_missing";

export interface RegistryMirrorWarning {
  code: RegistryMirrorWarningCode;
  message: string;
  slug?: string;
  value?: string;
  slugs?: string[];
}

export interface RegistryMirrorInput {
  registryEntries?: SourceRegistryEntry[];
  storeConfigs?: SourceStoreConfig[];
  knownExternalStoreSlugs?: string[];
}

export interface RegistryMirrorResult {
  summary: {
    totalSourceStores: number;
    proposedStores: number;
    proposedDomains: number;
    warningCount: number;
  };
  stores: ProposedStoreRow[];
  domains: ProposedDomainRow[];
  deploymentRefs: Record<string, ProposedDeploymentRefs>;
  warnings: RegistryMirrorWarning[];
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeComparableName(value: string): string {
  return normalizeKey(value).replace(/(?:^|-)(?:2|v2|tr|comtr)$/g, "");
}

function toProposedStatus(status: string | null | undefined): ProposedStoreStatus {
  if (status === "active") {
    return "ready";
  }

  if (status === "paused") {
    return "suspended";
  }

  return "draft";
}

function toDatabaseMode(value: string | null | undefined): ProposedStoreRow["databaseMode"] {
  if (value === "light_postgres" || value === "full_supabase") {
    return value;
  }

  return "unknown";
}

function pushDomain(
  domains: ProposedDomainRow[],
  input: {
    storeSlug: string;
    hostname: string | null;
    domainType: ProposedDomainType;
    status: ProposedDomainStatus;
    isPrimary: boolean;
    source: ProposedDomainRow["source"];
  },
) {
  if (!input.hostname) {
    return;
  }

  domains.push({
    storeSlug: input.storeSlug,
    hostname: input.hostname,
    domainType: input.domainType,
    status: input.status,
    isPrimary: input.isPrimary,
    source: input.source,
  });
}

function pickDefinedRefs(refs: ProposedDeploymentRefs): ProposedDeploymentRefs {
  return Object.fromEntries(
    Object.entries(refs).filter(([, value]) => cleanString(value) !== null),
  ) as ProposedDeploymentRefs;
}

function addDuplicateWarnings(
  warnings: RegistryMirrorWarning[],
  code: "duplicate_slug" | "duplicate_domain",
  values: Array<{ value: string; slug: string }>,
) {
  const grouped = new Map<string, string[]>();

  for (const item of values) {
    const current = grouped.get(item.value) ?? [];
    current.push(item.slug);
    grouped.set(item.value, current);
  }

  for (const [value, slugs] of grouped) {
    const uniqueSlugs = Array.from(new Set(slugs)).sort();

    if (uniqueSlugs.length <= 1) {
      continue;
    }

    warnings.push({
      code,
      value,
      slugs: uniqueSlugs,
      message:
        code === "duplicate_slug"
          ? `Duplicate source slug detected: ${value}`
          : `Duplicate source domain detected: ${value}`,
    });
  }
}

function addLegacySplitWarnings(warnings: RegistryMirrorWarning[], stores: ProposedStoreRow[]) {
  const groups = new Map<string, string[]>();

  for (const store of stores) {
    const key = normalizeComparableName(store.name);
    const current = groups.get(key) ?? [];
    current.push(store.slug);
    groups.set(key, current);
  }

  for (const [value, slugs] of groups) {
    const uniqueSlugs = Array.from(new Set(slugs)).sort();

    if (value && uniqueSlugs.length > 1) {
      warnings.push({
        code: "legacy_split_store",
        value,
        slugs: uniqueSlugs,
        message: `Possible legacy split store identity detected for ${value}: ${uniqueSlugs.join(", ")}`,
      });
    }
  }
}

export function buildSelfServeRegistryMirror(input: RegistryMirrorInput): RegistryMirrorResult {
  const registryEntries = input.registryEntries ?? [];
  const configBySlug = new Map((input.storeConfigs ?? []).map((config) => [config.slug, config]));
  const sourceSlugs = Array.from(
    new Set([...registryEntries.map((entry) => entry.slug), ...configBySlug.keys()].filter(Boolean)),
  ).sort();
  const warnings: RegistryMirrorWarning[] = [];
  const stores: ProposedStoreRow[] = [];
  const domains: ProposedDomainRow[] = [];
  const deploymentRefs: Record<string, ProposedDeploymentRefs> = {};

  addDuplicateWarnings(
    warnings,
    "duplicate_slug",
    registryEntries.map((entry) => ({ value: entry.slug, slug: entry.slug })),
  );

  for (const slug of sourceSlugs) {
    const registryEntry = registryEntries.find((entry) => entry.slug === slug) ?? null;
    const config = configBySlug.get(slug) ?? null;

    if (!config) {
      warnings.push({
        code: "missing_store_config",
        slug,
        message: `Local registry entry ${slug} does not have stores/${slug}/store.config.json.`,
      });
      continue;
    }

    const sourceStatus = cleanString(config.status ?? registryEntry?.status ?? null);
    const proposedStatus = toProposedStatus(sourceStatus);
    const storefrontDomain = cleanString(config.domains?.storefront ?? registryEntry?.domain ?? null);
    const adminDomain = cleanString(config.domains?.admin ?? null);

    stores.push({
      slug,
      name: cleanString(config.name) ?? cleanString(registryEntry?.name) ?? slug,
      status: proposedStatus,
      databaseMode: toDatabaseMode(config.databaseMode ?? null),
      source: "store_config",
      sourceStatus,
    });

    pushDomain(domains, {
      storeSlug: slug,
      hostname: storefrontDomain,
      domainType: "storefront",
      status: proposedStatus === "ready" ? "active" : "pending",
      isPrimary: true,
      source: "store_config",
    });
    pushDomain(domains, {
      storeSlug: slug,
      hostname: adminDomain,
      domainType: "legacy_admin",
      status: proposedStatus === "ready" ? "active" : "pending",
      isPrimary: false,
      source: "store_config",
    });

    deploymentRefs[slug] = pickDefinedRefs({
      adminDeploymentName: config.bootstrap?.adminDeploymentName ?? undefined,
      adminDeploymentBranch: config.bootstrap?.adminDeploymentBranch ?? undefined,
      adminDeploymentRuntimeUrl: config.bootstrap?.adminDeploymentRuntimeUrl ?? undefined,
      adminDeploymentResourceId: config.bootstrap?.adminDeploymentResourceId ?? undefined,
      adminDeploymentStatus: config.bootstrap?.adminDeploymentStatus ?? undefined,
      storefrontAppDir: config.storefront?.appDir ?? undefined,
      storefrontDeploymentName: config.storefront?.deploymentName ?? undefined,
      storefrontDeploymentBranch: config.storefront?.deploymentBranch ?? undefined,
      storefrontRuntimeUrl: config.storefront?.runtimeUrl ?? undefined,
      storefrontResourceId: config.storefront?.resourceId ?? undefined,
      storefrontDeploymentStatus: config.storefront?.deploymentStatus ?? undefined,
      r2BucketName: config.r2?.bucketName ?? undefined,
      r2PublicUrl: config.r2?.publicUrl ?? undefined,
      r2ManagedDomain: config.r2?.managedDomain ?? undefined,
    });

    warnings.push({
      code: "missing_membership_mapping",
      slug,
      message: `No local owner/member source was provided for ${slug}; Phase 2A must not infer store_memberships.`,
    });
  }

  addDuplicateWarnings(
    warnings,
    "duplicate_domain",
    domains.map((domain) => ({ value: domain.hostname, slug: domain.storeSlug })),
  );
  addLegacySplitWarnings(warnings, stores);

  const mappedSlugs = new Set(sourceSlugs);
  for (const slug of input.knownExternalStoreSlugs ?? []) {
    if (!mappedSlugs.has(slug)) {
      warnings.push({
        code: "known_external_store_missing",
        slug,
        message: `Known external/live store ${slug} is not present in the local registry; verify external inventory before migration.`,
      });
    }
  }

  stores.sort((left, right) => left.slug.localeCompare(right.slug));
  domains.sort((left, right) => `${left.storeSlug}:${left.hostname}`.localeCompare(`${right.storeSlug}:${right.hostname}`));
  warnings.sort((left, right) =>
    `${left.code}:${left.slug ?? ""}:${left.value ?? ""}`.localeCompare(`${right.code}:${right.slug ?? ""}:${right.value ?? ""}`),
  );

  return {
    summary: {
      totalSourceStores: sourceSlugs.length,
      proposedStores: stores.length,
      proposedDomains: domains.length,
      warningCount: warnings.length,
    },
    stores,
    domains,
    deploymentRefs,
    warnings,
  };
}
