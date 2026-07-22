import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const SQL_ROOT = "apps/owner/scripts/sql/saas";
const PRECHECK = path.join(ROOT, "tests/saas-phase3/quick-order-runtime/isolated-staging-preflight.sql");
const MIGRATIONS = Object.freeze([
  "202607220026_quick_order_checkout_runtime",
  "202607220027_quick_order_checkout_api",
  "202607220028_quick_order_redemption_expiry_authority",
  "202607220029_quick_order_settlement_authority",
]);
const RUNTIME_MANIFEST = `${SQL_ROOT}/phase3b2-quick-order-runtime-manifest.json`;
const REQUIRED_RUNTIME_ARTIFACTS = Object.freeze(MIGRATIONS.flatMap((migration) => [
  `${migration}.up.sql`, `${migration}.down.sql`, `${migration}_assertions.sql`,
]));
const UNSAFE_AUTHORITY = /(?:production|prod|live|main)/i;

function fail(message) {
  throw new Error(`isolated staging runner: ${message}`);
}

function parseArguments(argv) {
  let sourceSha;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--source-sha") sourceSha = argv[++index];
    else if (argv[index] === "--apply") apply = true;
    else fail(`unsupported argument ${argv[index]}`);
  }
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "")) fail("--source-sha must be a 40-character lowercase SHA");
  return { sourceSha, apply };
}

function command(deps, executable, args, options = {}) {
  const result = deps.spawn(executable, args, { cwd: deps.cwd, encoding: "utf8", ...options });
  if (result.error || result.status !== 0) fail(`${executable} failed`);
  return String(result.stdout ?? "");
}

function git(deps, args) {
  return String(deps.git(args)).trim();
}

function sourceArtifact(deps, sourceSha, relative) {
  return String(deps.git(["show", `${sourceSha}:${relative}`]));
}

function verifySourceArtifacts(deps, sourceSha) {
  const manifests = git(deps, ["ls-tree", "-r", "--name-only", sourceSha, "--", SQL_ROOT])
    .split("\n").filter((file) => file.endsWith("-manifest.json"));
  if (manifests.length === 0) fail("source SHA has no immutable migration manifests");
  let runtimeManifest;
  for (const manifestPath of manifests) {
    const sourceManifest = sourceArtifact(deps, sourceSha, manifestPath);
    const localManifest = String(deps.readFile(path.join(deps.cwd, manifestPath)));
    if (localManifest !== sourceManifest) fail("local manifest bytes do not match source SHA");
    let manifest;
    try { manifest = JSON.parse(sourceManifest); } catch { fail("source manifest is invalid JSON"); }
    if (manifestPath === RUNTIME_MANIFEST) runtimeManifest = manifest;
    if (!Array.isArray(manifest.artifacts)) fail("source manifest artifacts are invalid");
    for (const artifact of manifest.artifacts) {
      if (typeof artifact?.file !== "string" || !/^[a-f0-9]{64}$/.test(artifact?.sha256 ?? "")) fail("source manifest artifact is invalid");
      const relative = `${SQL_ROOT}/${artifact.file}`;
      const local = String(deps.readFile(path.join(deps.cwd, relative)));
      const source = sourceArtifact(deps, sourceSha, relative);
      if (local !== source || createHash("sha256").update(local).digest("hex") !== artifact.sha256) fail("local migration artifact bytes do not match source SHA");
    }
  }
  if (!runtimeManifest || [...runtimeManifest.artifacts ?? []].map((artifact) => artifact.file).sort().join("\n") !== [...REQUIRED_RUNTIME_ARTIFACTS].sort().join("\n")) fail("source SHA does not contain the exact 026-029 artifact set");
}

function databaseConnection(env) {
  const databaseUrl = env.CELEBIX_SAAS_DATABASE_URL;
  const configured = env.CELEBIX_SAAS_STAGING_DATABASE;
  if (typeof databaseUrl !== "string" || typeof configured !== "string" || !/^[a-z][a-z0-9_]{2,62}$/.test(configured)) fail("staging database configuration is invalid");
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { fail("database configuration is invalid"); }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || database !== configured) fail("database is not the exact configured staging database");
  if ([parsed.hostname, database, configured, env.CELEBIX_RUNTIME_MODE, env.CELEBIX_DEPLOYMENT_TIER].some((value) => UNSAFE_AUTHORITY.test(value ?? ""))) fail("unsafe authority sentinel");
  return Object.freeze({
    PATH: env.PATH ?? "",
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: database,
  });
}

function assertEnvironment(env, connection) {
  if (env.CELEBIX_RUNTIME_MODE !== "approved_staging" || env.CELEBIX_DEPLOYMENT_TIER !== "staging") fail("unsafe authority sentinel");
  const probe = "SELECT current_setting('server_version_num')::int / 10000, current_database(), current_setting('celebix.deployment_tier', true), pg_is_in_recovery(), current_setting('transaction_read_only') = 'on';";
  const output = command(connection.deps, "psql", ["-X", "-At", "-c", probe], { env: connection.environment }).trim();
  const [major, database, tier, recovery, readOnly] = output.split("|");
  if (major !== "16" || database !== connection.environment.PGDATABASE) fail("server is not PostgreSQL 16 or the configured database");
  if (tier !== "isolated_staging" || recovery !== "f" || readOnly !== "f") fail("server sentinel is incompatible");
}

function psqlFile(deps, environment, file, singleTransaction = false) {
  command(deps, "psql", ["-X", "-v", "ON_ERROR_STOP=1", ...(singleTransaction ? ["--single-transaction"] : []), "-f", file], { env: environment });
}

export function runIsolatedStaging(argv, supplied = {}) {
  const options = parseArguments(argv);
  if (!options.apply) return { mode: "dry-run", sourceSha: options.sourceSha };
  const deps = {
    cwd: ROOT,
    env: process.env,
    spawn: spawnSync,
    readFile: readFileSync,
    mkdir: mkdirSync,
    chmod: chmodSync,
    mkdtemp: (prefix) => mkdtempSync(prefix),
    git: (args) => {
      const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
      if (result.status !== 0) fail("git source verification failed");
      return result.stdout;
    },
    ...supplied,
  };
  if (git(deps, ["rev-parse", "HEAD"]) !== options.sourceSha) fail("source SHA is not local HEAD");
  verifySourceArtifacts(deps, options.sourceSha);
  const environment = databaseConnection(deps.env);
  const connection = { deps, environment };
  assertEnvironment(deps.env, connection);
  const readOnlyEnvironment = Object.freeze({ ...environment, PGOPTIONS: "-c default_transaction_read_only=on" });
  psqlFile(deps, readOnlyEnvironment, path.join(deps.cwd, SQL_ROOT, "202607220024_quick_order_links_assertions.sql"));
  psqlFile(deps, readOnlyEnvironment, path.join(deps.cwd, SQL_ROOT, "202607220025_quick_order_links_api_assertions.sql"));
  psqlFile(deps, readOnlyEnvironment, PRECHECK);
  const backupDirectory = deps.mkdtemp(path.join(tmpdir(), "celebix-isolated-staging-"));
  deps.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  deps.chmod(backupDirectory, 0o700);
  const backup = path.join(backupDirectory, "before-quick-order-runtime.dump");
  command(deps, "pg_dump", ["-Fc", "-f", backup], { env: environment });
  deps.chmod(backup, 0o600);
  for (const migration of MIGRATIONS) psqlFile(deps, environment, path.join(deps.cwd, SQL_ROOT, `${migration}.up.sql`), true);
  for (const migration of MIGRATIONS) psqlFile(deps, environment, path.join(deps.cwd, SQL_ROOT, `${migration}_assertions.sql`));
  verifySourceArtifacts(deps, options.sourceSha);
  return { mode: "applied", sourceSha: options.sourceSha };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const result = runIsolatedStaging(process.argv.slice(2));
    process.stdout.write(`${result.mode}\n`);
  } catch (error) {
    process.stderr.write("isolated staging runner failed\n");
    process.exitCode = 1;
  }
}
