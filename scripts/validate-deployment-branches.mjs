import {
  getAdminBranch,
  getOwnerBranch,
  getRepoRoot,
  getStoreConfig,
  getStorefrontBranch,
  getStorefrontBranchPrefix,
  getStores,
  normalizeBranch,
} from "./deployment-branch-lib.mjs";

function getSharedDevelopmentBranches() {
  return new Set(
    [
      process.env.GITHUB_SYNC_BASE_BRANCH,
      process.env.GITHUB_SYNC_BRANCH,
      process.env.COOLIFY_APPLICATION_REPOSITORY_BRANCH,
      process.env.CELEBIX_GIT_BRANCH,
      "main",
      "master",
    ]
      .map((value) => normalizeBranch(value))
      .filter(Boolean),
  );
}

const repoRoot = getRepoRoot();
const registry = getStores(repoRoot);
const sharedBranches = getSharedDevelopmentBranches();
const storefrontOwners = new Map();
const problems = [];

process.stdout.write(
  `Owner branch authority: ${getOwnerBranch()} | Storefront prefix: ${getStorefrontBranchPrefix()}\n`,
);

for (const entry of registry) {
  const config = getStoreConfig(entry.slug, repoRoot);

  if (!config) {
    process.stdout.write(`${entry.slug}: skipped (store.config.json missing)\n`);
    continue;
  }

  const ownerBranch = getOwnerBranch();
  const adminBranch = getAdminBranch(config);
  const storefrontBranch = getStorefrontBranch(entry.slug, config);

  if (storefrontBranch === ownerBranch || storefrontBranch === adminBranch) {
    problems.push(
      `${entry.slug}: storefront branch "${storefrontBranch}" owner/admin branch'i ile cakisiyor.`,
    );
  }

  if (sharedBranches.has(storefrontBranch)) {
    problems.push(
      `${entry.slug}: storefront branch "${storefrontBranch}" paylasilan gelistirme branch'i olamaz.`,
    );
  }

  const existingOwner = storefrontOwners.get(storefrontBranch);

  if (existingOwner && existingOwner !== entry.slug) {
    problems.push(
      `${entry.slug}: storefront branch "${storefrontBranch}" zaten ${existingOwner} tarafindan kullaniliyor.`,
    );
  } else {
    storefrontOwners.set(storefrontBranch, entry.slug);
  }

  process.stdout.write(
    `${entry.slug}: owner/admin=${adminBranch} storefront=${storefrontBranch}\n`,
  );
}

if (problems.length > 0) {
  process.stderr.write("\nDeployment branch validation failed:\n");

  for (const problem of problems) {
    process.stderr.write(`- ${problem}\n`);
  }

  process.exit(1);
}

process.stdout.write("\nDeployment branch validation passed.\n");

