import process from "node:process";
import {
  analyzeChangedPaths,
  getChangedPathsForPush,
  getRepoRoot,
  resolveDeploymentTarget,
} from "./deployment-branch-lib.mjs";

function formatPathList(paths) {
  return paths.map((entry) => `  - ${entry}`).join("\n");
}

function readStdIn() {
  return new Promise((resolve, reject) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
    });
    process.stdin.on("end", () => resolve(buffer));
    process.stdin.on("error", reject);
  });
}

function fail(message) {
  process.stderr.write(`\n[celebix-deploy-guard] ${message}\n`);
  process.exit(1);
}

const repoRoot = getRepoRoot();
const input = await readStdIn();
const pushLines = input
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

for (const line of pushLines) {
  const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);

  if (!remoteRef?.startsWith("refs/heads/")) {
    continue;
  }

  const target = resolveDeploymentTarget(remoteRef, repoRoot);

  if (!target) {
    continue;
  }

  const changedPaths = getChangedPathsForPush(localSha, remoteSha, repoRoot);
  const analysis = analyzeChangedPaths(changedPaths);

  if (target.kind === "owner") {
    if (analysis.storefrontSlugs.length > 0) {
      const storefrontDetails = analysis.storefrontSlugs
        .map((slug) => `${slug}\n${formatPathList(analysis.storefrontPaths.get(slug) ?? [])}`)
        .join("\n");

      fail(
        `Owner branch'ine store-specific storefront dosyalari push edilemez.\nTarget: ${target.branch}\n${storefrontDetails}`,
      );
    }

    continue;
  }

  if (analysis.ownerPaths.length > 0) {
    fail(
      `Storefront branch'ine owner/admin/store authority dosyalari push edilemez.\nTarget: ${target.branch}\n${formatPathList(analysis.ownerPaths)}`,
    );
  }

  const foreignStorefrontSlugs = analysis.storefrontSlugs.filter((slug) => slug !== target.slug);

  if (foreignStorefrontSlugs.length > 0) {
    const storefrontDetails = foreignStorefrontSlugs
      .map((slug) => `${slug}\n${formatPathList(analysis.storefrontPaths.get(slug) ?? [])}`)
      .join("\n");

    fail(
      `Storefront branch'i sadece kendi store dosyalarini kabul eder.\nTarget: ${target.branch}\n${storefrontDetails}`,
    );
  }
}

