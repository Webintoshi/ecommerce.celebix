const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.join(__dirname, "..", "..", "..");
const appRoot = path.join(__dirname, "..");
const port = process.env.PORT || "3000";
const standaloneCandidates = [
  path.join(appRoot, ".next", "standalone", "apps", "admin", "server.js"),
  path.join(appRoot, ".next", "standalone", "server.js"),
];
const standaloneServer = standaloneCandidates.find((candidate) => fs.existsSync(candidate));

if (!standaloneServer) {
  console.error("Admin standalone server output is missing.");
  console.error("Checked:", standaloneCandidates);
  process.exit(1);
}

const child = spawn(process.execPath, [standaloneServer], {
  cwd: appRoot,
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: "0.0.0.0",
    CELEBIX_REPO_ROOT: repoRoot,
    NEXT_IGNORE_INCORRECT_LOCKFILE: process.env.NEXT_IGNORE_INCORRECT_LOCKFILE || "1",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
