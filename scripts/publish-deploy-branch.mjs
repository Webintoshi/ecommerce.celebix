import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import {
  getOwnerBranch,
  getRepoRoot,
  getStoreConfig,
  getStorefrontBranch,
  inferAutoDeployTarget,
  normalizeBranch,
} from "./deployment-branch-lib.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    stdio: options.stdio ?? "inherit",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

const { values } = parseArgs({
  options: {
    auto: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    remote: { type: "string", default: "origin" },
    "skip-validate": { type: "boolean", default: false },
    slug: { type: "string" },
    target: { type: "string" },
  },
  allowPositionals: false,
});

const repoRoot = getRepoRoot();
let targetBranch = null;
let targetLabel = null;

if (values.auto) {
  const inferredTarget = inferAutoDeployTarget(repoRoot);
  targetBranch = inferredTarget.branch;
  targetLabel =
    inferredTarget.kind === "owner"
      ? "owner"
      : `storefront:${inferredTarget.slug}`;
} else if (values.target === "owner") {
  targetBranch = getOwnerBranch();
  targetLabel = "owner";
} else if (values.target === "storefront") {
  const slug = values.slug?.trim();

  if (!slug) {
    throw new Error("Storefront publish icin --slug zorunlu.");
  }

  targetBranch = getStorefrontBranch(slug, getStoreConfig(slug, repoRoot));
  targetLabel = `storefront:${slug}`;
} else {
  throw new Error("--target owner|storefront veya --auto kullan.");
}

if (!targetBranch) {
  throw new Error("Deploy branch belirlenemedi.");
}

const normalizedTargetBranch = normalizeBranch(targetBranch);

if (!values["skip-validate"]) {
  run("node", ["./scripts/validate-deployment-branches.mjs"], { cwd: repoRoot });
}

process.stdout.write(
  `Publishing HEAD to ${values.remote}/${normalizedTargetBranch} (${targetLabel})\n`,
);

if (values["dry-run"]) {
  process.stdout.write("Dry run tamamlandi. Push atilmadi.\n");
  process.exit(0);
}

run("git", ["push", values.remote, `HEAD:refs/heads/${normalizedTargetBranch}`], {
  cwd: repoRoot,
});

