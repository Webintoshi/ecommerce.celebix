import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getOwnerRepositoryBranch,
  getRepoRoot,
  getStoreDeploymentBranches,
  requireStoreConfig,
  updateStoreStorefrontRepoSyncConfig,
} from "@celebix/platform-config";

export interface StorefrontRepoSyncResult {
  repository: string;
  branch: string;
  status: "pending" | "synced" | "failed";
  commitSha: string | null;
  syncedAt: string | null;
  message: string | null;
  committedPaths: string[];
  createdBranch?: boolean;
  baseBranch?: string | null;
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

function normalizeBranchName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/^refs\/heads\//i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function getGitHubBaseBranch(): string {
  return (
    normalizeBranchName(process.env.GITHUB_SYNC_BASE_BRANCH) ||
    normalizeBranchName(process.env.GITHUB_SYNC_BRANCH) ||
    normalizeBranchName(process.env.COOLIFY_APPLICATION_REPOSITORY_BRANCH) ||
    normalizeBranchName(process.env.CELEBIX_GIT_BRANCH) ||
    "main"
  );
}

function getAuthorityGitHubBranch(): string {
  return normalizeBranchName(getOwnerRepositoryBranch()) || getGitHubBaseBranch();
}

function getStorefrontGitHubBranch(slug: string): string {
  const store = requireStoreConfig(slug);
  return getStoreDeploymentBranches(slug, store).storefrontBranch;
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

async function readGitHubRef(
  repository: string,
  branch: string,
): Promise<GitHubRefResponse | null> {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  return (await response.json()) as GitHubRefResponse;
}

async function ensureGitHubBranch(input: {
  repository: string;
  branch: string;
  baseBranch: string;
}): Promise<{ headSha: string; createdBranch: boolean; baseBranch: string }> {
  const existingRef = await readGitHubRef(input.repository, input.branch);
  const existingHeadSha = existingRef?.object?.sha;

  if (existingHeadSha) {
    return {
      headSha: existingHeadSha,
      createdBranch: false,
      baseBranch: input.baseBranch,
    };
  }

  const baseRef = await readGitHubRef(input.repository, input.baseBranch);
  const baseHeadSha = baseRef?.object?.sha;

  if (!baseHeadSha) {
    throw new Error(`GitHub base branch referansi okunamadi: ${input.baseBranch}`);
  }

  await githubFetch(`/repos/${input.repository}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${input.branch}`,
      sha: baseHeadSha,
    }),
  });

  const createdRef = await readGitHubRef(input.repository, input.branch);
  const createdHeadSha = createdRef?.object?.sha;

  if (!createdHeadSha) {
    throw new Error(`GitHub branch olusturuldu ama referansi okunamadi: ${input.branch}`);
  }

  return {
    headSha: createdHeadSha,
    createdBranch: true,
    baseBranch: input.baseBranch,
  };
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
    return `apps/storefront-${slug}`;
  }

  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
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
  baseBranch: string;
  files: Array<{ absolutePath: string; relativePath: string }>;
  commitMessage: string;
  trackStorefrontSync?: boolean;
}): Promise<StorefrontRepoSyncResult> {
  const repository = getGitHubRepository();
  const branch = normalizeBranchName(input.branch) || input.branch;
  const syncedAt = new Date().toISOString();

  try {
    const branchRef = await ensureGitHubBranch({
      repository,
      branch,
      baseBranch: input.baseBranch,
    });
    const headSha = branchRef.headSha;

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

    if (input.trackStorefrontSync) {
      updateStoreStorefrontRepoSyncConfig(input.slug, {
        syncStatus: "synced",
        commitSha: commit.sha,
        syncedAt,
        lastError: undefined,
      });
    }

    return {
      repository,
      branch,
      status: "synced",
      commitSha: commit.sha,
      syncedAt,
      message: `${input.files.length} dosya GitHub repositorysine senkronlandi.`,
      committedPaths: input.files.map((file) => file.relativePath),
      createdBranch: branchRef.createdBranch,
      baseBranch: branchRef.baseBranch,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Storefront repo senkronu basarisiz oldu.";

    if (input.trackStorefrontSync) {
      updateStoreStorefrontRepoSyncConfig(input.slug, {
        syncStatus: "failed",
        syncedAt,
        lastError: message,
      });
    }

    return {
      repository,
      branch,
      status: "failed",
      commitSha: null,
      syncedAt,
      message,
      committedPaths: [],
      createdBranch: false,
      baseBranch: input.baseBranch,
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

async function deleteStoreRepoArtifactsFromBranch(input: {
  slug: string;
  branch: string;
  storefrontAppDir?: string | null;
  includeStorefrontApp: boolean;
}): Promise<StorefrontRepoDeleteResult> {
  const repository = getGitHubRepository();
  const branch = normalizeBranchName(input.branch) || input.branch;
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
    const relativeAppDir = normalizeRelativeAppDir(input.storefrontAppDir, input.slug);
    const ref = await readGitHubRef(repository, branch);
    const headSha = ref?.object?.sha;

    if (!headSha) {
      return {
        repository,
        branch,
        status: "missing",
        commitSha: null,
        deletedAt,
        message: "Remote branch bulunamadi.",
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
    const deletedPaths = Array.from(currentPaths).filter((entryPath) => {
      if (entryPath.startsWith(`stores/${input.slug}/`)) {
        return true;
      }

      if (input.includeStorefrontApp && entryPath.startsWith(`${relativeAppDir}/`)) {
        return true;
      }

      return false;
    });

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
        message: `chore: remove store scaffold for ${input.slug}`,
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

export async function deleteStoreRepoArtifactsForStore(
  slug: string,
  options: {
    storefrontAppDir?: string | null;
    authorityBranch?: string | null;
    storefrontBranch?: string | null;
  } = {},
): Promise<StorefrontRepoDeleteResult[]> {
  const authorityBranch = normalizeBranchName(options.authorityBranch) || getAuthorityGitHubBranch();
  let storefrontBranch = normalizeBranchName(options.storefrontBranch);

  if (!storefrontBranch) {
    try {
      storefrontBranch = getStorefrontGitHubBranch(slug);
    } catch {
      storefrontBranch = null;
    }
  }

  const branchPlans = new Map<string, { includeStorefrontApp: boolean }>();
  branchPlans.set(authorityBranch, { includeStorefrontApp: false });

  if (storefrontBranch) {
    const current = branchPlans.get(storefrontBranch);
    branchPlans.set(storefrontBranch, {
      includeStorefrontApp: current?.includeStorefrontApp || true,
    });
  }

  const results: StorefrontRepoDeleteResult[] = [];

  for (const [branch, plan] of branchPlans.entries()) {
    results.push(
      await deleteStoreRepoArtifactsFromBranch({
        slug,
        branch,
        storefrontAppDir: options.storefrontAppDir,
        includeStorefrontApp: plan.includeStorefrontApp,
      }),
    );
  }

  return results;
}

export async function checkStorefrontRepoSyncOnGithub(slug: string): Promise<boolean> {
  if (!isGitHubRepoSyncConfigured()) {
    return false;
  }

  try {
    const store = requireStoreConfig(slug);
    const relativeAppDir = store.storefront?.appDir?.trim();

    if (!relativeAppDir) {
      return false;
    }

    const repository = getGitHubRepository();
    const branch = getStorefrontGitHubBranch(slug);
    const ref = await readGitHubRef(repository, branch);
    const headSha = ref?.object?.sha;

    if (!headSha) {
      return false;
    }

    const headCommit = await githubFetch<GitHubCommitResponse>(
      `/repos/${repository}/git/commits/${headSha}`,
    );
    const baseTreeSha = headCommit.tree?.sha;

    if (!baseTreeSha) {
      return false;
    }

    const tree = await githubFetch<GitHubTreeResponse>(
      `/repos/${repository}/git/trees/${baseTreeSha}?recursive=1`,
    );
    const paths = new Set(
      (tree.tree ?? [])
        .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
        .map((entry) => entry.path as string),
    );

    return [
      "stores/registry.json",
      `stores/${slug}/store.config.json`,
      `stores/${slug}/admin.env.example`,
      `${relativeAppDir.replace(/\\/g, "/")}/package.json`,
    ].every((requiredPath) => paths.has(requiredPath));
  } catch {
    return false;
  }
}

export async function syncStoreAuthorityRepoForStore(slug: string): Promise<StorefrontRepoSyncResult> {
  return syncGitHubFiles({
    slug,
    branch: getAuthorityGitHubBranch(),
    baseBranch: getGitHubBaseBranch(),
    files: resolveAuthorityFiles(slug),
    commitMessage: `chore: sync store authority for ${slug}`,
    trackStorefrontSync: false,
  });
}

export async function syncStorefrontRepoForStore(slug: string): Promise<StorefrontRepoSyncResult> {
  return syncGitHubFiles({
    slug,
    branch: getStorefrontGitHubBranch(slug),
    baseBranch: getGitHubBaseBranch(),
    files: resolveRepoFiles(slug),
    commitMessage: `chore: sync storefront scaffold for ${slug}`,
    trackStorefrontSync: true,
  });
}
