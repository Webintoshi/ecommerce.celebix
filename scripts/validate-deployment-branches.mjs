import fs from "node:fs";
import path from "node:path";

function normalizeBranch(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/^refs\/heads\//i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function readJson(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function readJsonIfExists(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function getOwnerBranch() {
  return (
    normalizeBranch(process.env.COOLIFY_OWNER_REPOSITORY_BRANCH) ||
    normalizeBranch(process.env.COOLIFY_ADMIN_REPOSITORY_BRANCH) ||
    "deploy/owner"
  );
}

function getStorefrontPrefix() {
  return (
    normalizeBranch(process.env.COOLIFY_STOREFRONT_REPOSITORY_BRANCH_PREFIX) ||
    normalizeBranch(process.env.CELEBIX_STOREFRONT_BRANCH_PREFIX) ||
    "deploy/storefront"
  );
}

function getStorefrontBranch(slug, config) {
  return (
    normalizeBranch(config?.storefront?.deploymentBranch) ||
    `${getStorefrontPrefix()}/${slug}`
  );
}

function getAdminBranch(config) {
  return normalizeBranch(config?.bootstrap?.adminDeploymentBranch) || getOwnerBranch();
}

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

const registry = readJson("stores/registry.json");
const sharedBranches = getSharedDevelopmentBranches();
const storefrontOwners = new Map();
const problems = [];

for (const entry of registry) {
  const config = readJsonIfExists(path.join("stores", entry.slug, "store.config.json"));

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
