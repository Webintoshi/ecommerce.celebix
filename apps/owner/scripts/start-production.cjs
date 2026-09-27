const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { superviseOnboardingWorker } = require("./onboarding-supervisor.cjs");
const { prepareNextStandalone } = require("../../../scripts/prepare-next-standalone.cjs");

const appRoot = path.join(__dirname, "..");
const port = process.env.PORT || "3000";
const env = {
  ...process.env,
  PORT: port,
  HOSTNAME: "0.0.0.0",
  CELEBIX_REPO_ROOT: path.join(appRoot, "..", ".."),
  NEXT_IGNORE_INCORRECT_LOCKFILE: process.env.NEXT_IGNORE_INCORRECT_LOCKFILE || "1",
};

const standaloneCandidates = [
  path.join(appRoot, ".next", "standalone", "apps", "owner", "server.js"),
  path.join(appRoot, ".next", "standalone", "server.js"),
];
const standaloneServer = standaloneCandidates.find((candidate) => fs.existsSync(candidate));
prepareNextStandalone(appRoot, standaloneServer);

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

const command = process.execPath;
const args = standaloneServer
  ? [standaloneServer]
  : [fallbackNextBin, "start", "--port", port];

if (!standaloneServer && !fs.existsSync(fallbackNextBin)) {
  console.error("Neither standalone server nor Next CLI is available.");
  console.error("Checked standalone candidates:", standaloneCandidates);
  console.error("Checked Next CLI path:", fallbackNextBin);
  process.exit(1);
}

let workerSupervisor;
const workerFlag = env.CELEBIX_ONBOARDING_WORKER_ENABLED;
if (workerFlag !== undefined && workerFlag !== "false" && workerFlag !== "true") {
  console.error("onboarding_worker_config_invalid_degraded");
} else if (workerFlag === "true") {
  const workerScript = path.join(__dirname, "onboarding-worker.mjs");
  const workerArgs = [workerScript];
  // Fail the package/source compatibility gate before launching a worker. Web health remains independent.
  const gate = spawnSync(command, [...workerArgs, "--check-runtime"], { cwd: appRoot, env, stdio: "ignore", timeout: 10000 });
  if (gate.status !== 0 || gate.error) {
    console.error("onboarding_worker_runtime_unavailable_degraded");
  } else {
    workerSupervisor = superviseOnboardingWorker({ spawn: () => spawn(command, workerArgs, { cwd: appRoot, env, stdio: "inherit" }) });
  }
}
const child = spawn(command, args, {
  cwd: appRoot,
  env,
  stdio: "inherit",
});

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  shuttingDown = true;
  workerSupervisor?.stop(signal);
  child.kill(signal);
});
child.on("error", () => { workerSupervisor?.stop(); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  workerSupervisor?.stop();
  if (signal && !shuttingDown) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
