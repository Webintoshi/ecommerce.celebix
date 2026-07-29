import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SQL_ROOT = "apps/owner/scripts/sql/saas";
const MANIFEST_PATH = `${SQL_ROOT}/phase3j-payment-method-admin-manifest.json`;
const PREFLIGHT_PATH = path.join(ROOT, "tests/saas-phase3/payment-provider-admin/isolated-staging-preflight.sql");
const UP_FILE = "202607270051_payment_method_admin.up.sql";
const ASSERTIONS_FILE = "202607270051_payment_method_admin_assertions.sql";
const DOWN_FILE = "202607270051_payment_method_admin.down.sql";
const PRIOR_ASSERTIONS = Object.freeze([
  "202607250049_merchant_provider_profiles_assertions.sql",
  "202607250050_merchant_provider_execution_assertions.sql",
]);
const UNSAFE_AUTHORITY = /(?:production|prod|live|main)/i;

function fail() {
  throw new Error("payment method isolated staging validation failed");
}

function parseArguments(argv) {
  let sourceSha;
  let mode = "dry-run";
  let explicitMode;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source-sha") sourceSha = argv[++index];
    else if (argument === "--dry-run" || argument === "--apply") {
      if (explicitMode) fail();
      explicitMode = argument;
      mode = argument.slice(2);
    } else fail();
  }
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "")) fail();
  return Object.freeze({ sourceSha, mode });
}

function command(deps, executable, args, options = {}) {
  const result = deps.spawn(executable, args, {
    cwd: deps.cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) fail();
  return String(result.stdout ?? "");
}

function git(deps, args) {
  return command(deps, "git", args).trim();
}

function sourceArtifact(deps, sourceSha, relativePath) {
  return command(deps, "git", ["show", `${sourceSha}:${relativePath}`]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertArtifactShape(artifact) {
  if (
    typeof artifact?.file !== "string"
    || !/^[A-Za-z0-9_.-]+$/.test(artifact.file)
    || !/^[a-f0-9]{64}$/.test(artifact?.sha256 ?? "")
  ) fail();
}

function verifyPushedSource(deps, sourceSha) {
  command(deps, "git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (git(deps, ["rev-parse", "HEAD"]) !== sourceSha) fail();
  if (!git(deps, ["branch", "-r", "--contains", sourceSha])) fail();

  const sourceManifestBytes = sourceArtifact(deps, sourceSha, MANIFEST_PATH);
  const localManifestBytes = String(deps.readFile(path.join(deps.cwd, MANIFEST_PATH)));
  if (sourceManifestBytes !== localManifestBytes) fail();

  let manifest;
  try { manifest = JSON.parse(sourceManifestBytes); } catch { fail(); }
  if (
    manifest?.phase !== "phase3j-payment-method-admin"
    || manifest?.postgresqlMajor !== 16
    || manifest?.externalConnections !== 0
    || manifest?.productionMutations !== 0
    || !Array.isArray(manifest?.migrationChain)
    || !Array.isArray(manifest?.rollbackArtifacts)
  ) fail();
  if (manifest.migrationChain.slice(-2).map(({ file }) => file).join("|") !== `${UP_FILE}|${ASSERTIONS_FILE}`) fail();
  if (manifest.rollbackArtifacts.at(-1)?.file !== DOWN_FILE) fail();

  for (const artifact of [...manifest.migrationChain, ...manifest.rollbackArtifacts]) {
    assertArtifactShape(artifact);
    const relativePath = `${SQL_ROOT}/${artifact.file}`;
    const sourceBytes = sourceArtifact(deps, sourceSha, relativePath);
    const localBytes = String(deps.readFile(path.join(deps.cwd, relativePath)));
    if (sourceBytes !== localBytes || sha256(localBytes) !== artifact.sha256) fail();
  }
}

function databaseEnvironment(env) {
  const databaseUrl = env.CELEBIX_SAAS_DATABASE_URL;
  const configuredDatabase = env.CELEBIX_SAAS_STAGING_DATABASE;
  if (
    typeof databaseUrl !== "string"
    || typeof configuredDatabase !== "string"
    || !/^[a-z][a-z0-9_]{2,62}$/.test(configuredDatabase)
    || env.CELEBIX_RUNTIME_MODE !== "approved_staging"
    || env.CELEBIX_DEPLOYMENT_TIER !== "staging"
  ) fail();

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { fail(); }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || database !== configuredDatabase) fail();
  if ([parsed.hostname, database, configuredDatabase].some((value) => UNSAFE_AUTHORITY.test(value ?? ""))) fail();

  return Object.freeze({
    PATH: env.PATH ?? "",
    LC_ALL: "C",
    LANG: "C",
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: database,
  });
}

function assertDatabaseSentinels(deps, environment) {
  const probe = [
    "SELECT current_setting('server_version_num')::int / 10000,",
    "current_database(),",
    "current_setting('celebix.deployment_tier', true),",
    "pg_is_in_recovery(),",
    "current_setting('transaction_read_only') = 'on';",
  ].join(" ");
  const output = command(deps, "psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", probe], { env: environment }).trim();
  const [major, database, deploymentTier, recovery, readOnly] = output.split("|");
  if (
    major !== "16"
    || database !== environment.PGDATABASE
    || deploymentTier !== "isolated_staging"
    || recovery !== "f"
    || readOnly !== "f"
  ) fail();
}

function psqlFile(deps, environment, file, singleTransaction = false) {
  command(
    deps,
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", ...(singleTransaction ? ["--single-transaction"] : []), "-f", file],
    { env: environment },
  );
}

function createEncryptedBackup(deps, environment) {
  const encryptionKey = deps.env.CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY;
  if (
    typeof encryptionKey !== "string"
    || encryptionKey.length < 32
    || encryptionKey.length > 4096
    || /[\u0000-\u001f\u007f]/.test(encryptionKey)
  ) fail();

  const backupDirectory = deps.mkdtemp(path.join(tmpdir(), "celebix-payment-method-staging-"));
  deps.chmod(backupDirectory, 0o700);
  const plainBackup = path.join(backupDirectory, "before-payment-method-admin.dump");
  const encryptedBackup = `${plainBackup}.enc`;
  try {
    command(deps, "pg_dump", ["-Fc", "-f", plainBackup], { env: environment });
    deps.chmod(plainBackup, 0o600);
    command(
      deps,
      "openssl",
      ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in", plainBackup, "-out", encryptedBackup, "-pass", "env:CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY"],
      { env: { ...environment, CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY: encryptionKey } },
    );
  } finally {
    deps.rm(plainBackup, { force: true });
  }
  deps.chmod(encryptedBackup, 0o600);
  if (deps.stat(encryptedBackup).size < 32) fail();
  return encryptedBackup;
}

export function runIsolatedStaging(argv, supplied = {}) {
  const options = parseArguments(argv);
  const deps = {
    cwd: ROOT,
    env: process.env,
    spawn: spawnSync,
    readFile: readFileSync,
    chmod: chmodSync,
    mkdtemp: mkdtempSync,
    rm: rmSync,
    stat: statSync,
    ...supplied,
  };

  verifyPushedSource(deps, options.sourceSha);
  if (options.mode === "dry-run") return Object.freeze({ mode: "dry-run", sourceSha: options.sourceSha });

  const environment = databaseEnvironment(deps.env);
  assertDatabaseSentinels(deps, environment);
  const readOnlyEnvironment = Object.freeze({ ...environment, PGOPTIONS: "-c default_transaction_read_only=on" });
  for (const assertion of PRIOR_ASSERTIONS) {
    psqlFile(deps, readOnlyEnvironment, path.join(deps.cwd, SQL_ROOT, assertion));
  }
  psqlFile(deps, readOnlyEnvironment, PREFLIGHT_PATH);
  createEncryptedBackup(deps, environment);
  psqlFile(deps, environment, path.join(deps.cwd, SQL_ROOT, UP_FILE), true);
  psqlFile(deps, readOnlyEnvironment, path.join(deps.cwd, SQL_ROOT, ASSERTIONS_FILE));
  verifyPushedSource(deps, options.sourceSha);
  return Object.freeze({ mode: "applied", sourceSha: options.sourceSha });
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const result = runIsolatedStaging(process.argv.slice(2));
    process.stdout.write(`${result.mode}\n`);
  } catch {
    process.stderr.write("isolated staging runner failed\n");
    process.exitCode = 1;
  }
}
