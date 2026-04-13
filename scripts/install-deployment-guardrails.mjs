import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const repoRoot = git(["rev-parse", "--show-toplevel"], process.cwd());
const gitCommonDir = git(["rev-parse", "--git-common-dir"], repoRoot);
const hooksDir = path.resolve(repoRoot, gitCommonDir, "celebix-hooks");
const sourceScripts = [
  "deployment-branch-lib.mjs",
  "git-pre-push-deployment-guard.mjs",
];

fs.mkdirSync(hooksDir, { recursive: true });

for (const filename of sourceScripts) {
  const sourcePath = path.join(repoRoot, "scripts", filename);
  const targetPath = path.join(hooksDir, filename);
  fs.copyFileSync(sourcePath, targetPath);
}

const prePushHookPath = path.join(hooksDir, "pre-push");
fs.writeFileSync(
  prePushHookPath,
  "#!/bin/sh\nWORKTREE_ROOT=\"$(git rev-parse --show-toplevel)\"\nWORKTREE_SCRIPT=\"$WORKTREE_ROOT/scripts/git-pre-push-deployment-guard.mjs\"\nif [ -f \"$WORKTREE_SCRIPT\" ]; then\n  exec node \"$WORKTREE_SCRIPT\" \"$@\"\nfi\nexec node \"$(git rev-parse --git-common-dir)/celebix-hooks/git-pre-push-deployment-guard.mjs\" \"$@\"\n",
  "utf8",
);

try {
  fs.chmodSync(prePushHookPath, 0o755);
} catch {
  // Windows may not honor POSIX modes; hook still works via Git Bash.
}

git(["config", "core.hooksPath", hooksDir], repoRoot);
git(["config", "extensions.worktreeConfig", "true"], repoRoot);

process.stdout.write(`Deployment guardrails installed.\nHooks path: ${hooksDir}\n`);
