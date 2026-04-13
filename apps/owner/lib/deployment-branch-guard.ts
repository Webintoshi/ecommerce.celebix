import "server-only";

import {
  getDefaultAdminDeploymentBranch,
  getDefaultStorefrontDeploymentBranch,
  getOwnerRepositoryBranch,
  getStoreConfig,
  getStoreDeploymentBranches,
  getStores,
  type StoreConfig,
} from "@celebix/platform-config";

export interface DeploymentBranchPreview {
  ownerBranch: string;
  adminBranch: string;
  storefrontBranch: string;
}

export interface DeploymentBranchValidation extends DeploymentBranchPreview {
  errors: string[];
  collidingStoreSlugs: string[];
}

function normalizeBranch(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/^refs\/heads\//i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function getSharedDevelopmentBranches(): string[] {
  const candidates = [
    process.env.GITHUB_SYNC_BASE_BRANCH,
    process.env.GITHUB_SYNC_BRANCH,
    process.env.COOLIFY_APPLICATION_REPOSITORY_BRANCH,
    process.env.CELEBIX_GIT_BRANCH,
    "main",
    "master",
  ];

  return Array.from(
    new Set(
      candidates
        .map((value) => normalizeBranch(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function readExistingStorefrontBranches(excludeSlug?: string): Array<{ slug: string; branch: string }> {
  return getStores()
    .map((entry) => getStoreConfig(entry.slug))
    .filter((store): store is StoreConfig => Boolean(store))
    .filter((store) => store.slug !== excludeSlug)
    .map((store) => {
      const branches = getStoreDeploymentBranches(store.slug, store);
      return {
        slug: store.slug,
        branch: branches.storefrontBranch,
      };
    });
}

function buildValidation(
  preview: DeploymentBranchPreview,
  excludeSlug?: string,
): DeploymentBranchValidation {
  const errors: string[] = [];
  const collidingStoreSlugs = readExistingStorefrontBranches(excludeSlug)
    .filter((entry) => entry.branch === preview.storefrontBranch)
    .map((entry) => entry.slug);

  if (preview.storefrontBranch === preview.ownerBranch || preview.storefrontBranch === preview.adminBranch) {
    errors.push(
      `Storefront deployment branch "${preview.storefrontBranch}" owner/admin deployment branch'i ile ayni olamaz.`,
    );
  }

  if (getSharedDevelopmentBranches().includes(preview.storefrontBranch)) {
    errors.push(
      `Storefront deployment branch "${preview.storefrontBranch}" paylasilan gelistirme branch'i olamaz.`,
    );
  }

  if (collidingStoreSlugs.length > 0) {
    errors.push(
      `Storefront deployment branch "${preview.storefrontBranch}" zaten ${collidingStoreSlugs.join(", ")} tarafindan kullaniliyor.`,
    );
  }

  return {
    ...preview,
    errors,
    collidingStoreSlugs,
  };
}

export function previewStoreDeploymentBranches(slug: string): DeploymentBranchPreview {
  return {
    ownerBranch: getOwnerRepositoryBranch(),
    adminBranch: getDefaultAdminDeploymentBranch(),
    storefrontBranch: getDefaultStorefrontDeploymentBranch(slug),
  };
}

export function validateNewStoreDeploymentBranches(slug: string): DeploymentBranchValidation {
  return buildValidation(previewStoreDeploymentBranches(slug), slug);
}

export function validateConfiguredStoreDeploymentBranches(store: StoreConfig): DeploymentBranchValidation {
  return buildValidation(getStoreDeploymentBranches(store.slug, store), store.slug);
}

