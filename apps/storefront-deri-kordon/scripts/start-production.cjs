const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const appRoot = path.join(__dirname, "..");
const port = process.env.PORT || "3400";
const env = {
  ...process.env,
  PORT: port,
  HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
  NEXT_IGNORE_INCORRECT_LOCKFILE: process.env.NEXT_IGNORE_INCORRECT_LOCKFILE || "1",
};

const standaloneServer = path.join(
  appRoot,
  ".next",
  "standalone",
  "apps",
  "storefront-deri-kordon",
  "server.js",
);

const fallbackNextBin = path.join(
  appRoot,
  "..",
  "..",
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

const command = fs.existsSync(standaloneServer) ? process.execPath : process.execPath;
const args = fs.existsSync(standaloneServer)
  ? [standaloneServer]
  : [fallbackNextBin, "start", "--port", port];

if (!fs.existsSync(standaloneServer) && !fs.existsSync(fallbackNextBin)) {
  console.error("Neither standalone server nor Next CLI is available.");
  process.exit(1);
}

const child = spawn(command, args, {
  cwd: appRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
