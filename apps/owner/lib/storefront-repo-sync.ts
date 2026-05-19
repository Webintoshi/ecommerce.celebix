import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  getStoreConfig,
  requireStoreConfig,
} from "@celebix/platform-config";
import {
  getExpectedStorefrontAppDir,
  getExpectedStorefrontPackageName,
  resolveAuthorityRepositoryBranch,
  resolveStorefrontRepositoryBranch,
} from "../../../packages/platform-config/src/index";
import { applyStorefrontAuthorityPatch } from "@/lib/store-config-authority";

export interface StorefrontRepoSyncResult {
  repository: string;
  branch: string;
  status: "pending" | "synced" | "failed";
  commitSha: string | null;
  syncedAt: string | null;
  message: string | null;
  committedPaths: string[];
}

export interface StorefrontRepoDeleteResult {
  repository: string;
  branch: string;
  status: "deleted" | "missing" | "failed" | "skipped";
  commitSha: string | null;
  deletedAt: string | null;
  message: string | null;
  deletedPaths: string[];
}

interface GitHubRefResponse {
  object?: {
    sha?: string;
  };
}

interface GitHubCommitResponse {
  tree?: {
    sha?: string;
  };
}

interface GitHubBlobResponse {
  sha?: string;
}

interface GitHubTreeResponse {
  sha?: string;
  tree?: Array<{
    path?: string;
    type?: string;
  }>;
}

interface GitHubCreateCommitResponse {
  sha?: string;
}

interface GitHubContentFileResponse {
  content?: string;
  encoding?: string;
}

const EXCLUDED_DIRECTORY_NAMES = new Set([".next", "node_modules"]);
const EXCLUDED_FILENAMES = new Set([".env.local"]);

function getGitHubToken(): string {
  const token =
    process.env.GITHUB_SYNC_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    "";

  if (!token) {
    throw new Error("GITHUB_SYNC_TOKEN tanimli degil.");
  }

  return token;
}

function normalizeRepositoryIdentifier(raw: string): string {
  const value = raw.trim();

  if (!value) {
    throw new Error("GitHub repository bilgisi bos.");
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    return value;
  }

  const match = value.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i);

  if (!match?.[1]) {
    throw new Error("GitHub repository bilgisi gecersiz.");
  }

  return match[1];
}

function getGitHubRepository(): string {
  return normalizeRepositoryIdentifier(
    process.env.GITHUB_SYNC_REPOSITORY?.trim() ||
      process.env.COOLIFY_APPLICATION_REPOSITORY_URL?.trim() ||
      process.env.CELEBIX_GIT_REPOSITORY?.trim() ||
      "Webintoshi/ecommerce.celebix",
  );
}

function getAuthorityBranch(): string {
  return resolveAuthorityRepositoryBranch();
}

function getAuthorityBranchBase(): string {
  const configured =
    process.env.GITHUB_SYNC_BRANCH?.trim() ||
    process.env.CELEBIX_GIT_BRANCH?.trim() ||
    "main";

  return configured === getAuthorityBranch() ? "main" : configured;
}

function getCommitterName(): string {
  return process.env.GITHUB_SYNC_COMMITTER_NAME?.trim() || "Celebix Owner Bot";
}

function getCommitterEmail(): string {
  return process.env.GITHUB_SYNC_COMMITTER_EMAIL?.trim() || "noreply@celebix.co";
}

function buildHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${getGitHubToken()}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      ...buildHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function collectFilesRecursively(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      files.push(...collectFilesRecursively(absolutePath));
      continue;
    }

    if (EXCLUDED_FILENAMES.has(entry.name)) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function normalizeRelativeAppDir(value: string | null | undefined, slug: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return getExpectedStorefrontAppDir(slug);
  }

  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
}

function resolveStorefrontBranch(slug: string): string {
  return getStoreConfig(slug)?.storefront?.deploymentBranch?.trim() || resolveStorefrontRepositoryBranch(slug);
}

function resolveAuthorityFiles(slug: string): Array<{ absolutePath: string; relativePath: string }> {
  const repoRoot = getRepoRoot();
  const files: Array<{ absolutePath: string; relativePath: string }> = [];

  const registryPath = path.join(repoRoot, "stores", "registry.json");
  const storeDirectory = path.join(repoRoot, "stores", slug);
  const storeConfigPath = path.join(storeDirectory, "store.config.json");
  const adminEnvExamplePath = path.join(storeDirectory, "admin.env.example");

  for (const absolutePath of [registryPath, storeConfigPath, adminEnvExamplePath]) {
    if (fs.existsSync(absolutePath)) {
      files.push({
        absolutePath,
        relativePath: path.relative(repoRoot, absolutePath).replace(/\\/g, "/"),
      });
    }
  }

  return files;
}

function resolveRepoFiles(slug: string): Array<{ absolutePath: string; relativePath: string }> {
  const repoRoot = getRepoRoot();
  const store = requireStoreConfig(slug);
  const files = resolveAuthorityFiles(slug);
  const relativeAppDir = store.storefront?.appDir?.trim();

  if (!relativeAppDir) {
    throw new Error("Storefront app dizini tanimli degil.");
  }

  const appDirectory = path.join(repoRoot, relativeAppDir);

  if (!fs.existsSync(appDirectory)) {
    throw new Error("Storefront app dizini bulunamadi.");
  }

  for (const absolutePath of collectFilesRecursively(appDirectory)) {
    files.push({
      absolutePath,
      relativePath: path.relative(repoRoot, absolutePath).replace(/\\/g, "/"),
    });
  }

  return files;
}

async function syncGitHubFiles(input: {
  slug: string;
  branch: string;
  baseBranch?: string;
  files: Array<{ absolutePath: string; relativePath: string }>;
  commitMessage: string;
}): Promise<StorefrontRepoSyncResult> {
  const repository = getGitHubRepository();
  const branch = input.branch;
  const syncedAt = new Date().toISOString();

  try {
    const headSha = await ensureGitHubBranch(repository, branch, input.baseBranch);

    if (!headSha) {
      throw new Error("GitHub branch referansi okunamadi.");
    }

    const headCommit = await githubFetch<GitHubCommitResponse>(
      `/repos/${repository}/git/commits/${headSha}`,
    );
    const baseTreeSha = headCommit.tree?.sha;

    if (!baseTreeSha) {
      throw new Error("GitHub base tree okunamadi.");
    }

    const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];

    for (const file of input.files) {
      const content = fs.readFileSync(file.absolutePath);
      const blob = await githubFetch<GitHubBlobResponse>(`/repos/${repository}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: content.toString("base64"),
          encoding: "base64",
        }),
      });

      if (!blob.sha) {
        throw new Error(`GitHub blob SHA donmedi: ${file.relativePath}`);
      }

      treeEntries.push({
        path: file.relativePath,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const tree = await githubFetch<GitHubTreeResponse>(`/repos/${repository}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    });

    if (!tree.sha) {
      throw new Error("GitHub tree SHA donmedi.");
    }

    const commit = await githubFetch<GitHubCreateCommitResponse>(`/repos/${repository}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: input.commitMessage,
        tree: tree.sha,
        parents: [headSha],
        author: {
          name: getCommitterName(),
          email: getCommitterEmail(),
          date: syncedAt,
        },
        committer: {
          name: getCommitterName(),
          email: getCommitterEmail(),
          date: syncedAt,
        },
      }),
    });

    if (!commit.sha) {
      throw new Error("GitHub commit SHA donmedi.");
    }

    await githubFetch(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({
        sha: commit.sha,
        force: false,
      }),
    });

    return {
      repository,
      branch,
      status: "synced",
      commitSha: commit.sha,
      syncedAt,
      message: `${input.files.length} dosya ${branch} branch'ine senkronlandi.`,
      committedPaths: input.files.map((file) => file.relativePath),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storefront repo senkronu basarisiz oldu.";

    return {
      repository,
      branch,
      status: "failed",
      commitSha: null,
      syncedAt,
      message,
      committedPaths: [],
    };
  }
}

export function isGitHubRepoSyncConfigured(): boolean {
  return Boolean(
    (process.env.GITHUB_SYNC_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()) &&
      (process.env.GITHUB_SYNC_REPOSITORY?.trim() ||
        process.env.COOLIFY_APPLICATION_REPOSITORY_URL?.trim() ||
        process.env.CELEBIX_GIT_REPOSITORY?.trim()),
  );
}

async function getBranchHeadSha(repository: string, branch: string): Promise<string | null> {
  try {
    const ref = await githubFetch<GitHubRefResponse>(
      `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return ref.object?.sha ?? null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("GitHub API hatasi (404)")) {
      return null;
    }

    throw error;
  }
}

async function ensureGitHubBranch(
  repository: string,
  branch: string,
  baseBranch?: string,
): Promise<string> {
  const existingHeadSha = await getBranchHeadSha(repository, branch);

  if (existingHeadSha) {
    return existingHeadSha;
  }

  const resolvedBaseBranch = baseBranch ?? getAuthorityBranchBase();
  const baseHeadSha = await getBranchHeadSha(repository, resolvedBaseBranch);

  if (!baseHeadSha) {
    throw new Error(`GitHub base branch bulunamadi: ${resolvedBaseBranch}`);
  }

  try {
    const payload = await githubFetch<{ object?: { sha?: string } }>(`/repos/${repository}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseHeadSha,
      }),
    });

    return payload.object?.sha ?? baseHeadSha;
  } catch (error) {
    if (error instanceof Error && error.message.includes("GitHub API hatasi (422)")) {
      const createdHeadSha = await getBranchHeadSha(repository, branch);

      if (createdHeadSha) {
        return createdHeadSha;
      }
    }

    throw error;
  }
}

async function getBranchBlobPaths(
  repository: string,
  branch: string,
): Promise<{ headSha: string; paths: Set<string> }> {
  const headSha = await getBranchHeadSha(repository, branch);

  if (!headSha) {
    throw new Error(`GitHub branch bulunamadi: ${branch}`);
  }

  const headCommit = await githubFetch<GitHubCommitResponse>(
    `/repos/${repository}/git/commits/${headSha}`,
  );
  const baseTreeSha = headCommit.tree?.sha;

  if (!baseTreeSha) {
    throw new Error("GitHub base tree okunamadi.");
  }

  const tree = await githubFetch<GitHubTreeResponse>(
    `/repos/${repository}/git/trees/${baseTreeSha}?recursive=1`,
  );
  const paths = new Set(
    (tree.tree ?? [])
      .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
      .map((entry) => entry.path as string),
  );

  return {
    headSha,
    paths,
  };
}

async function readGitHubTextFile(
  repository: string,
  branch: string,
  filePath: string,
): Promise<string | null> {
  try {
    const payload = await githubFetch<GitHubContentFileResponse>(
      `/repos/${repository}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
    );

    if (payload.encoding !== "base64" || !payload.content) {
      return null;
    }

    return Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("GitHub API hatasi (404)")) {
      return null;
    }

    throw error;
  }
}

export interface StorefrontBranchVerificationResult {
  repository: string;
  branch: string;
  headSha: string | null;
  expectedAppDir: string;
  appDir: string | null;
  appDirMatches: boolean;
  storeConfigExists: boolean;
  packageJsonExists: boolean;
  packageName: string | null;
  packageNameMatches: boolean;
  verified: boolean;
  message: string | null;
}

export async function verifyStorefrontBranchState(
  slug: string,
): Promise<StorefrontBranchVerificationResult> {
  const store = requireStoreConfig(slug);
  const repository = getGitHubRepository();
  const branch = resolveStorefrontBranch(slug);
  const expectedAppDir = getExpectedStorefrontAppDir(slug);
  const expectedPackageName = getExpectedStorefrontPackageName(slug);
  const appDir = store.storefront?.appDir?.trim() || null;
  const appDirMatches = appDir === expectedAppDir;
  const storeConfigPath = `stores/${slug}/store.config.json`;
  const packageJsonPath = `${expectedAppDir}/package.json`;

  try {
    const { headSha, paths } = await getBranchBlobPaths(repository, branch);
    const storeConfigExists = paths.has(storeConfigPath);
    const packageJsonExists = paths.has(packageJsonPath);
    let packageName: string | null = null;

    if (packageJsonExists) {
      const packageText = await readGitHubTextFile(repository, branch, packageJsonPath);

      if (packageText) {
        const packageJson = JSON.parse(packageText) as { name?: string };
        packageName = typeof packageJson.name === "string" ? packageJson.name.trim() : null;
      }
    }

    const packageNameMatches = packageName === expectedPackageName;
    const issues: string[] = [];

    if (!appDir) {
      issues.push("storefront appDir authority tanimli degil");
    } else if (!appDirMatches) {
      issues.push(`storefront appDir beklenen dizinle uyusmuyor: ${appDir}`);
    }

    if (!storeConfigExists) {
      issues.push(`target branch store config icermiyor: ${storeConfigPath}`);
    }

    if (!packageJsonExists) {
      issues.push(`target branch package.json icermiyor: ${packageJsonPath}`);
    } else if (!packageNameMatches) {
      issues.push(
        `package name uyusmuyor: ${packageName || "bos"} (beklenen ${expectedPackageName})`,
      );
    }

    return {
      repository,
      branch,
      headSha,
      expectedAppDir,
      appDir,
      appDirMatches,
      storeConfigExists,
      packageJsonExists,
      packageName,
      packageNameMatches,
      verified: issues.length === 0,
      message: issues.length > 0 ? issues.join(" / ") : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storefront branch dogrulamasi basarisiz oldu.";

    return {
      repository,
      branch,
      headSha: null,
      expectedAppDir,
      appDir,
      appDirMatches,
      storeConfigExists: false,
      packageJsonExists: false,
      packageName: null,
      packageNameMatches: false,
      verified: false,
      message,
    };
  }
}

export async function deleteStorefrontRepoForStore(
  slug: string,
  options: { storefrontAppDir?: string | null } = {},
): Promise<StorefrontRepoDeleteResult> {
  const repository = getGitHubRepository();
  const branch = resolveStorefrontBranch(slug);
  const deletedAt = new Date().toISOString();

  if (!isGitHubRepoSyncConfigured()) {
    return {
      repository,
      branch,
      status: "skipped",
      commitSha: null,
      deletedAt,
      message: "GitHub repo write-back ayari tanimli olmadigi icin remote cleanup atlandi.",
      deletedPaths: [],
    };
  }

  try {
    const repoRoot = getRepoRoot();
    const relativeAppDir = normalizeRelativeAppDir(options.storefrontAppDir, slug);
    const headSha = await getBranchHeadSha(repository, branch);

    if (!headSha) {
      return {
        repository,
        branch,
        status: "missing",
        commitSha: null,
        deletedAt,
        message: "Storefront deploy branch'i remote repoda bulunamadi.",
        deletedPaths: [],
      };
    }

    const headCommit = await githubFetch<GitHubCommitResponse>(
      `/repos/${repository}/git/commits/${headSha}`,
    );
    const baseTreeSha = headCommit.tree?.sha;

    if (!baseTreeSha) {
      throw new Error("GitHub base tree okunamadi.");
    }

    const tree = await githubFetch<GitHubTreeResponse>(
      `/repos/${repository}/git/trees/${baseTreeSha}?recursive=1`,
    );
    const currentPaths = new Set(
      (tree.tree ?? [])
        .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
        .map((entry) => entry.path as string),
    );
    const deletedPaths = Array.from(currentPaths).filter(
      (entryPath) =>
        entryPath.startsWith(`stores/${slug}/`) ||
        entryPath.startsWith(`${relativeAppDir}/`),
    );

    const registryPath = path.join(repoRoot, "stores", "registry.json");
    const treeEntries: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string | null;
    }> = [];

    if (fs.existsSync(registryPath)) {
      const registryBlob = await githubFetch<GitHubBlobResponse>(`/repos/${repository}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: fs.readFileSync(registryPath).toString("base64"),
          encoding: "base64",
        }),
      });

      if (!registryBlob.sha) {
        throw new Error("GitHub registry blob SHA donmedi.");
      }

      treeEntries.push({
        path: "stores/registry.json",
        mode: "100644",
        type: "blob",
        sha: registryBlob.sha,
      });
    }

    for (const entryPath of deletedPaths) {
      treeEntries.push({
        path: entryPath,
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }

    if (treeEntries.length === 0) {
      return {
        repository,
        branch,
        status: "missing",
        commitSha: null,
        deletedAt,
        message: "Remote repoda silinecek store artifact bulunamadi.",
        deletedPaths: [],
      };
    }

    const nextTree = await githubFetch<GitHubTreeResponse>(`/repos/${repository}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    });

    if (!nextTree.sha) {
      throw new Error("GitHub silme tree SHA donmedi.");
    }

    const commit = await githubFetch<GitHubCreateCommitResponse>(`/repos/${repository}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: `chore: remove store scaffold for ${slug}`,
        tree: nextTree.sha,
        parents: [headSha],
        author: {
          name: getCommitterName(),
          email: getCommitterEmail(),
          date: deletedAt,
        },
        committer: {
          name: getCommitterName(),
          email: getCommitterEmail(),
          date: deletedAt,
        },
      }),
    });

    if (!commit.sha) {
      throw new Error("GitHub silme commit SHA donmedi.");
    }

    await githubFetch(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({
        sha: commit.sha,
        force: false,
      }),
    });

    return {
      repository,
      branch,
      status: "deleted",
      commitSha: commit.sha,
      deletedAt,
      message: `${deletedPaths.length} dosya remote repodan kaldirildi.`,
      deletedPaths,
    };
  } catch (error) {
    return {
      repository,
      branch,
      status: "failed",
      commitSha: null,
      deletedAt,
      message: error instanceof Error ? error.message : "Storefront repo cleanup basarisiz oldu.",
      deletedPaths: [],
    };
  }
}

export async function checkStorefrontRepoSyncOnGithub(slug: string): Promise<boolean> {
  if (!isGitHubRepoSyncConfigured()) {
    return false;
  }

  const verification = await verifyStorefrontBranchState(slug);
  return verification.verified;
}

export async function syncStoreAuthorityRepoForStore(slug: string): Promise<StorefrontRepoSyncResult> {
  return syncGitHubFiles({
    slug,
    branch: getAuthorityBranch(),
    files: resolveAuthorityFiles(slug),
    commitMessage: `chore: sync store authority for ${slug}`,
  });
}

export async function syncStorefrontRepoForStore(slug: string): Promise<StorefrontRepoSyncResult> {
  const branch = resolveStorefrontBranch(slug);
  const result = await syncGitHubFiles({
    slug,
    branch,
    baseBranch: getAuthorityBranch(),
    files: resolveRepoFiles(slug),
    commitMessage: `chore: sync storefront scaffold for ${slug}`,
  });

  if (result.status !== "synced") {
    await applyStorefrontAuthorityPatch(slug, {
      deploymentBranch: branch,
      repoSyncStatus: "failed",
      lastRepoSyncError: result.message,
      deploymentStatus: "pending-repo-sync",
    });
    return result;
  }

  const verification = await verifyStorefrontBranchState(slug);

  if (!verification.verified) {
    const message = verification.message || "Storefront branch dogrulamasi basarisiz oldu.";

    await applyStorefrontAuthorityPatch(slug, {
      deploymentBranch: branch,
      repoSyncStatus: "failed",
      repoCommitSha: result.commitSha,
      repoSyncedAt: result.syncedAt,
      lastRepoSyncError: message,
      deploymentStatus: "pending-repo-sync",
    });

    return {
      ...result,
      status: "failed",
      message,
    };
  }

  await applyStorefrontAuthorityPatch(slug, {
    appDir: verification.appDir ?? verification.expectedAppDir,
    deploymentBranch: branch,
    repoSyncStatus: "synced",
    repoCommitSha: verification.headSha ?? result.commitSha,
    repoSyncedAt: result.syncedAt,
    lastRepoSyncError: null,
    status: "scaffolded",
  });

  return {
    ...result,
    commitSha: verification.headSha ?? result.commitSha,
    message: verification.message ?? result.message,
  };
}
