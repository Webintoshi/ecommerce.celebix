import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ZERO_SHA = "0000000000000000000000000000000000000000";
const ROOT_SHARED_FILES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "README.md",
  ".gitignore",
  ".npmrc",
  "nixpacks.toml",
]);
const SHARED_SCRIPT_FILES = new Set([
  "scripts/iyzico-runner.cjs",
  "scripts/prepare-next-standalone.cjs",
  "scripts/create-store.mjs",
  "scripts/deployment-branch-lib.mjs",
  "scripts/manage-worktrees.mjs",
  "scripts/git-pre-commit-workspace-guard.mjs",
  "scripts/install-deployment-guardrails.mjs",
  "scripts/git-pre-push-deployment-guard.mjs",
  "scripts/publish-deploy-branch.mjs",
  "scripts/validate-deployment-branches.mjs",
]);

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

export function normalizeBranch(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/^refs\/heads\//i, "")
    .replace(/^[^/]+\/(deploy\/.+)$/i, "$1")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function getRepoRoot(cwd = process.cwd()) {
  return git(["rev-parse", "--show-toplevel"], { cwd });
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readJsonIfExists(repoRoot, relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

export function getOwnerBranch(env = process.env) {
  return (
    normalizeBranch(env.COOLIFY_OWNER_REPOSITORY_BRANCH) ||
    normalizeBranch(env.COOLIFY_ADMIN_REPOSITORY_BRANCH) ||
    "deploy/owner"
  );
}

export function getStorefrontBranchPrefix(env = process.env) {
  return (
    normalizeBranch(env.COOLIFY_STOREFRONT_REPOSITORY_BRANCH_PREFIX) ||
    normalizeBranch(env.CELEBIX_STOREFRONT_BRANCH_PREFIX) ||
    "deploy/storefront"
  );
}

export function getStores(repoRoot = getRepoRoot()) {
  return readJson(repoRoot, "stores/registry.json");
}

export function getStoreConfig(slug, repoRoot = getRepoRoot()) {
  return readJsonIfExists(repoRoot, path.join("stores", slug, "store.config.json"));
}

export function getStorefrontBranch(slug, config, env = process.env) {
  return (
    normalizeBranch(config?.storefront?.deploymentBranch) ||
    `${getStorefrontBranchPrefix(env)}/${slug}`
  );
}

export function getAdminBranch(config, env = process.env) {
  return normalizeBranch(config?.bootstrap?.adminDeploymentBranch) || getOwnerBranch(env);
}

export function getDeploymentTargets(repoRoot = getRepoRoot(), env = process.env) {
  return getStores(repoRoot).map((entry) => {
    const config = getStoreConfig(entry.slug, repoRoot);

    return {
      slug: entry.slug,
      ownerBranch: getOwnerBranch(env),
      adminBranch: getAdminBranch(config, env),
      storefrontBranch: getStorefrontBranch(entry.slug, config, env),
    };
  });
}

export function resolveDeploymentTarget(branch, repoRoot = getRepoRoot(), env = process.env) {
  const normalizedBranch = normalizeBranch(branch);

  if (!normalizedBranch) {
    return null;
  }

  if (normalizedBranch === getOwnerBranch(env)) {
    return { kind: "owner", branch: normalizedBranch };
  }

  for (const target of getDeploymentTargets(repoRoot, env)) {
    if (normalizedBranch === target.storefrontBranch) {
      return {
        kind: "storefront",
        branch: normalizedBranch,
        slug: target.slug,
      };
    }

    if (normalizedBranch === target.adminBranch) {
      return {
        kind: "owner",
        branch: normalizedBranch,
      };
    }
  }

  return null;
}

function classifyChangedPath(relativePath) {
  const normalizedPath = normalizePath(relativePath);

  if (
    normalizedPath.startsWith("apps/owner/") ||
    normalizedPath.startsWith("apps/storefront-base/") ||
    normalizedPath.startsWith("stores/")
  ) {
    return {
      kind: "owner",
      path: normalizedPath,
    };
  }

  const storefrontMatch = normalizedPath.match(/^apps\/storefront-([^/]+)\//);

  if (storefrontMatch) {
    return {
      kind: "storefront",
      slug: storefrontMatch[1],
      path: normalizedPath,
    };
  }

  if (normalizedPath.startsWith("apps/admin/")) {
    return {
      kind: "admin",
      path: normalizedPath,
    };
  }

  if (
    normalizedPath.startsWith("packages/") ||
    ROOT_SHARED_FILES.has(normalizedPath) ||
    SHARED_SCRIPT_FILES.has(normalizedPath)
  ) {
    return {
      kind: "shared",
      path: normalizedPath,
    };
  }

  return {
    kind: "neutral",
    path: normalizedPath,
  };
}

export function analyzeChangedPaths(paths) {
  const ownerPaths = [];
  const adminPaths = [];
  const sharedPaths = [];
  const neutralPaths = [];
  const storefrontPaths = new Map();

  for (const relativePath of paths) {
    const classification = classifyChangedPath(relativePath);

    if (classification.kind === "owner") {
      ownerPaths.push(classification.path);
      continue;
    }

    if (classification.kind === "admin") {
      adminPaths.push(classification.path);
      continue;
    }

    if (classification.kind === "shared") {
      sharedPaths.push(classification.path);
      continue;
    }

    if (classification.kind === "storefront") {
      const existing = storefrontPaths.get(classification.slug) ?? [];
      existing.push(classification.path);
      storefrontPaths.set(classification.slug, existing);
      continue;
    }

    neutralPaths.push(classification.path);
  }

  return {
    ownerPaths,
    adminPaths,
    sharedPaths,
    neutralPaths,
    storefrontPaths,
    storefrontSlugs: Array.from(storefrontPaths.keys()).sort(),
  };
}

function listCommitsForPush(localSha, remoteSha, cwd) {
  if (!localSha || localSha === ZERO_SHA) {
    return [];
  }

  if (!remoteSha || remoteSha === ZERO_SHA) {
    const unpublished = git(["rev-list", "--reverse", localSha, "--not", "--remotes"], { cwd })
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    return unpublished.length > 0 ? unpublished : [localSha];
  }

  const commits = git(["rev-list", "--reverse", `${remoteSha}..${localSha}`], { cwd })
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  return commits;
}

export function getChangedPathsForPush(localSha, remoteSha, cwd = process.cwd()) {
  const commitList = listCommitsForPush(localSha, remoteSha, cwd);
  const changedPaths = new Set();

  for (const commitSha of commitList) {
    const output = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", commitSha], {
      cwd,
    });

    for (const line of output.split(/\r?\n/)) {
      const normalizedPath = normalizePath(line.trim());

      if (normalizedPath) {
        changedPaths.add(normalizedPath);
      }
    }
  }

  return Array.from(changedPaths).sort();
}

export function getUpstreamBranch(cwd = process.cwd()) {
  try {
    return normalizeBranch(git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { cwd }));
  } catch {
    return null;
  }
}

export function getHeadChangedPaths(cwd = process.cwd()) {
  const output = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "HEAD"], {
    cwd,
  });

  return output
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean)
    .sort();
}

export function inferAutoDeployTarget(cwd = process.cwd(), env = process.env) {
  const repoRoot = getRepoRoot(cwd);
  const upstreamBranch = getUpstreamBranch(cwd);
  const upstreamTarget = upstreamBranch
    ? resolveDeploymentTarget(upstreamBranch, repoRoot, env)
    : null;

  if (upstreamTarget) {
    return {
      ...upstreamTarget,
      source: "upstream",
    };
  }

  const changedPaths = getHeadChangedPaths(cwd);
  const analysis = analyzeChangedPaths(changedPaths);

  const hasOwnerScope = analysis.ownerPaths.length > 0;
  const hasAdminScope = analysis.adminPaths.length > 0;
  const hasStorefrontScope = analysis.storefrontSlugs.length > 0;

  if ((hasOwnerScope || hasAdminScope) && hasStorefrontScope) {
    throw new Error(
      `Son commit owner ve store-specific degisiklikleri ayni anda iceriyor: ${analysis.storefrontSlugs.join(", ")}`,
    );
  }

  if (hasOwnerScope && hasAdminScope) {
    throw new Error("Son commit owner ve admin degisikliklerini ayni anda iceriyor. Deploy hedefini explicit sec.");
  }

  if (hasOwnerScope) {
    return {
      kind: "owner",
      branch: getOwnerBranch(env),
      source: "head",
    };
  }

  if (hasAdminScope) {
    return {
      kind: "admin",
      branch: getOwnerBranch(env),
      source: "head",
    };
  }

  if (analysis.storefrontSlugs.length === 1) {
    const slug = analysis.storefrontSlugs[0];
    const storeConfig = getStoreConfig(slug, repoRoot);

    return {
      kind: "storefront",
      slug,
      branch: getStorefrontBranch(slug, storeConfig, env),
      source: "head",
    };
  }

  if (analysis.storefrontSlugs.length > 1) {
    throw new Error(
      `Son commit birden fazla storefront hedefi iceriyor: ${analysis.storefrontSlugs.join(", ")}`,
    );
  }

  throw new Error("Deploy hedefi otomatik cikarilamadi. --target veya --slug ile acikca belirt.");
}

