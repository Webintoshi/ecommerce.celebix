import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL_ROOT = "apps/owner/scripts/sql/saas";
const MANIFEST_PATH = `${SQL_ROOT}/phase3x-storefront-default-shipping-manifest.json`;
const PREDECESSOR_FILE = "phase3w-storefront-one-page-checkout-manifest.json";
const UP_FILE = "202607290065_storefront_default_shipping.up.sql";
const ASSERTIONS_FILE = "202607290065_storefront_default_shipping_assertions.sql";
const DOWN_FILE = "202607290065_storefront_default_shipping.down.sql";
const PRIOR_ASSERTIONS_FILE = "202607280064_storefront_one_page_checkout_assertions.sql";
const RUNNER_PATH = "tests/saas-phase3/storefront-one-page-checkout/isolated-staging-runner.mjs";
const REMOTE_REF = "refs/remotes/origin/codex/celebix-managed-umami-analytics";
const STAGING_DATABASE = "celebix_saas_staging_auth01";
const UNSAFE_AUTHORITY = /(?:production|prod|live|main)/i;

function fail() {
  throw new Error("storefront checkout isolated staging runner failed");
}

function parseArguments(argv) {
  let sourceSha;
  let mode = "dry-run";
  let explicitMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source-sha" && sourceSha === undefined) {
      sourceSha = argv[index + 1];
      index += 1;
    } else if (["--dry-run", "--apply", "--down"].includes(argument) && !explicitMode) {
      explicitMode = true;
      mode = argument.slice(2);
    } else {
      fail();
    }
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
  let output;
  try {
    output = deps.git(args);
  } catch {
    fail();
  }
  return String(output ?? "").trim();
}

function sourceArtifact(deps, sourceSha, relativePath) {
  let output;
  try {
    output = deps.git(["show", `${sourceSha}:${relativePath}`]);
  } catch {
    fail();
  }
  return String(output ?? "");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertArtifactShape(artifact) {
  if (
    typeof artifact?.file !== "string"
    || !/^[A-Za-z0-9_.-]+$/.test(artifact.file)
    || !/^[a-f0-9]{64}$/.test(artifact?.sha256 ?? "")
  ) fail();
}

function localBytes(deps, relativePath) {
  try {
    return String(deps.readFile(path.join(deps.cwd, relativePath)));
  } catch {
    fail();
  }
}

function verifyPushedSource(deps, sourceSha) {
  git(deps, ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (git(deps, ["rev-parse", "HEAD"]) !== sourceSha) fail();
  if (git(deps, ["rev-parse", REMOTE_REF]) !== sourceSha) fail();

  const protectedPaths = [
    MANIFEST_PATH,
    `${SQL_ROOT}/${PREDECESSOR_FILE}`,
    `${SQL_ROOT}/${UP_FILE}`,
    `${SQL_ROOT}/${ASSERTIONS_FILE}`,
    `${SQL_ROOT}/${DOWN_FILE}`,
    `${SQL_ROOT}/${PRIOR_ASSERTIONS_FILE}`,
    RUNNER_PATH,
  ];
  if (git(deps, ["status", "--porcelain=v1", "--untracked-files=all", "--", ...protectedPaths])) fail();

  const sourceManifest = sourceArtifact(deps, sourceSha, MANIFEST_PATH);
  if (sourceManifest !== localBytes(deps, MANIFEST_PATH)) fail();
  if (sourceArtifact(deps, sourceSha, RUNNER_PATH) !== localBytes(deps, RUNNER_PATH)) fail();

  let manifest;
  try {
    manifest = JSON.parse(sourceManifest);
  } catch {
    fail();
  }
  if (
    manifest?.phase !== "phase3x-storefront-default-shipping"
    || manifest?.postgresqlMajor !== 16
    || manifest?.externalConnections !== 0
    || manifest?.productionMutations !== 0
    || !Array.isArray(manifest?.artifacts)
    || !Array.isArray(manifest?.rollbackArtifacts)
    || manifest.artifacts.map(({ file }) => file).join("|")
      !== [PREDECESSOR_FILE, UP_FILE, ASSERTIONS_FILE].join("|")
    || manifest.rollbackArtifacts.map(({ file }) => file).join("|") !== DOWN_FILE
  ) fail();

  for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) {
    assertArtifactShape(artifact);
    const relativePath = `${SQL_ROOT}/${artifact.file}`;
    const sourceBytes = sourceArtifact(deps, sourceSha, relativePath);
    const currentBytes = localBytes(deps, relativePath);
    if (sourceBytes !== currentBytes || sha256(currentBytes) !== artifact.sha256) fail();
  }

  let predecessor;
  try {
    predecessor = JSON.parse(sourceArtifact(deps, sourceSha, `${SQL_ROOT}/${PREDECESSOR_FILE}`));
  } catch {
    fail();
  }
  const priorAssertions = Array.isArray(predecessor?.artifacts)
    ? predecessor.artifacts.filter(({ file }) => file === PRIOR_ASSERTIONS_FILE)
    : [];
  if (
    predecessor?.phase !== "phase3w-storefront-one-page-checkout"
    || priorAssertions.length !== 1
  ) fail();
  assertArtifactShape(priorAssertions[0]);
  const priorAssertionsPath = `${SQL_ROOT}/${PRIOR_ASSERTIONS_FILE}`;
  const sourcePriorAssertions = sourceArtifact(deps, sourceSha, priorAssertionsPath);
  const localPriorAssertions = localBytes(deps, priorAssertionsPath);
  if (
    sourcePriorAssertions !== localPriorAssertions
    || sha256(localPriorAssertions) !== priorAssertions[0].sha256
  ) fail();
}

function assertSafePath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || /[\u0000-\u001f\u007f]/.test(value)) fail();
}

function assertSafeBackupDirectory(deps, value) {
  assertSafePath(value);
  const selected = path.resolve(value);
  const broadTargets = [
    path.parse(selected).root,
    path.resolve(deps.cwd),
  ];
  for (const variable of ["HOME", "CODEX_HOME"]) {
    const candidate = deps.env[variable];
    if (typeof candidate === "string" && path.isAbsolute(candidate)) {
      broadTargets.push(path.resolve(candidate));
    }
  }
  const forbidden = new Set(broadTargets);
  let canonical;
  try {
    canonical = path.resolve(deps.realpath(selected));
    for (const target of broadTargets) {
      forbidden.add(path.resolve(deps.realpath(target)));
    }
  } catch {
    fail();
  }
  if (forbidden.has(selected) || forbidden.has(canonical)) fail();
}

function databaseConfiguration(deps) {
  const env = deps.env;
  const databaseUrl = env.CELEBIX_SAAS_DATABASE_URL;
  const configuredDatabase = env.CELEBIX_SAAS_STAGING_DATABASE;
  const rootCertificate = env.CELEBIX_SAAS_SSL_ROOT_CERT;
  const backupDirectory = env.CELEBIX_SAAS_BACKUP_DIRECTORY;
  if (
    typeof databaseUrl !== "string"
    || typeof configuredDatabase !== "string"
    || configuredDatabase !== STAGING_DATABASE
    || !/^[a-z][a-z0-9_]{2,62}$/.test(configuredDatabase)
    || env.CELEBIX_RUNTIME_MODE !== "approved_staging"
    || env.CELEBIX_DEPLOYMENT_TIER !== "staging"
  ) fail();
  assertSafePath(rootCertificate);
  assertSafeBackupDirectory(deps, backupDirectory);

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail();
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (
    !/^postgres(?:ql)?:$/.test(parsed.protocol)
    || database !== configuredDatabase
    || !parsed.hostname
    || !username
    || !password
    || parsed.searchParams.getAll("sslmode").length !== 1
    || parsed.searchParams.get("sslmode") !== "verify-full"
    || parsed.searchParams.getAll("channel_binding").length !== 1
    || parsed.searchParams.get("channel_binding") !== "require"
    || [...parsed.searchParams.keys()].some((key) => !["sslmode", "channel_binding"].includes(key))
    || [parsed.hostname, database, configuredDatabase].some((value) => UNSAFE_AUTHORITY.test(value))
  ) fail();

  let certificateInfo;
  let backupInfo;
  try {
    certificateInfo = deps.stat(rootCertificate);
    backupInfo = deps.stat(backupDirectory);
  } catch {
    fail();
  }
  if (!certificateInfo.isFile() || !backupInfo.isDirectory()) fail();

  return Object.freeze({
    backupDirectory,
    environment: Object.freeze({
      PATH: env.PATH ?? "",
      LC_ALL: "C",
      LANG: "C",
      PGHOST: parsed.hostname,
      PGPORT: parsed.port || "5432",
      PGUSER: username,
      PGPASSWORD: password,
      PGDATABASE: database,
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: rootCertificate,
      PGCHANNELBINDING: "require",
      PGCONNECT_TIMEOUT: "10",
      PGAPPNAME: "celebix_storefront_checkout_staging_runner",
    }),
  });
}

function readOnlyEnvironment(environment) {
  return Object.freeze({ ...environment, PGOPTIONS: "-c default_transaction_read_only=on" });
}

function psqlFile(deps, environment, relativePath, singleTransaction = false) {
  command(
    deps,
    "psql",
    [
      "-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      ...(singleTransaction ? ["--single-transaction"] : []),
      "-f", path.join(deps.cwd, relativePath),
    ],
    { env: environment },
  );
}

function psqlQuery(deps, environment, query) {
  return command(
    deps,
    "psql",
    ["-X", "--no-psqlrc", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
    { env: environment },
  ).trim();
}

function assertDatabaseSentinel(deps, environment, expectedCheckoutState) {
  const defaultShippingExpression = expectedCheckoutState === "absent"
    ? "CASE WHEN pg_catalog.to_regprocedure('saas.storefront_checkout_default_shipping_preflight()') IS NULL THEN 'absent' ELSE 'invalid' END"
    : "CASE WHEN pg_catalog.to_regprocedure('saas.storefront_checkout_default_shipping_preflight()') IS NOT NULL AND saas.storefront_checkout_default_shipping_preflight() IS TRUE THEN 'present' ELSE 'invalid' END";
  const query = [
    "SELECT current_setting('server_version_num')::int / 10000,",
    "current_database(),",
    "current_setting('celebix.deployment_tier', true),",
    "pg_catalog.pg_is_in_recovery(),",
    "current_setting('transaction_read_only') = 'on',",
    "saas.built_in_payment_methods_preflight() IS TRUE,",
    "saas.payment_provider_keyed_lifecycle_preflight() IS TRUE,",
    "saas.storefront_checkout_preflight() IS TRUE,",
    `${defaultShippingExpression};`,
  ].join(" ");
  const expected = [
    "16",
    environment.PGDATABASE,
    "isolated_staging",
    "f",
    "t",
    "t",
    "t",
    "t",
    expectedCheckoutState,
  ].join("|");
  if (psqlQuery(deps, readOnlyEnvironment(environment), query) !== expected) fail();
}

function createEncryptedBackup(deps, configuration, sourceSha, label) {
  const encryptionKey = deps.env.CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY;
  if (
    typeof encryptionKey !== "string"
    || encryptionKey.length < 32
    || encryptionKey.length > 4096
    || /[\u0000-\u001f\u007f]/.test(encryptionKey)
  ) fail();

  const suffix = label === "apply" ? "" : "-rollback";
  const encryptedBackup = path.join(
    configuration.backupDirectory,
    `storefront-checkout-before-065${suffix}-${sourceSha}.dump.enc`,
  );
  if (deps.exists(encryptedBackup)) fail();

  deps.chmod(configuration.backupDirectory, 0o700);
  const temporaryDirectory = deps.mkdtemp(path.join(configuration.backupDirectory, ".storefront-checkout-065-"));
  deps.chmod(temporaryDirectory, 0o700);
  const plainBackup = path.join(temporaryDirectory, "before-065.dump");
  let encryptedReady = false;
  try {
    command(deps, "pg_dump", ["-Fc", "--no-password", "-f", plainBackup], {
      env: configuration.environment,
    });
    deps.chmod(plainBackup, 0o600);
    if (!command(deps, "pg_restore", ["-l", plainBackup], {
      env: configuration.environment,
    }).trim()) fail();
    command(
      deps,
      "openssl",
      [
        "enc", "-aes-256-cbc", "-pbkdf2", "-salt",
        "-in", plainBackup, "-out", encryptedBackup,
        "-pass", "env:CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY",
      ],
      {
        env: {
          PATH: configuration.environment.PATH,
          LC_ALL: "C",
          LANG: "C",
          CELEBIX_SAAS_BACKUP_ENCRYPTION_KEY: encryptionKey,
        },
      },
    );
    deps.chmod(encryptedBackup, 0o600);
    const encryptedInfo = deps.stat(encryptedBackup);
    if (!encryptedInfo.isFile() || encryptedInfo.size < 32 || (encryptedInfo.mode & 0o077) !== 0) fail();
    encryptedReady = true;
  } finally {
    deps.rm(plainBackup, { force: true });
    deps.rm(temporaryDirectory, { recursive: true, force: true });
    if (!encryptedReady) deps.rm(encryptedBackup, { force: true });
  }
  return encryptedBackup;
}

function assertZeroImpactAndWritersDrained(deps, environment) {
  const query = `
    /* zero_impact */
    WITH writer_pids AS (
      SELECT activity.pid
      FROM pg_catalog.pg_stat_activity activity
      WHERE activity.pid<>pg_catalog.pg_backend_pid()
        AND activity.datname=pg_catalog.current_database()
        AND activity.state IS DISTINCT FROM 'idle'
        AND activity.usename IN('celebix_saas_app','celebix_saas_workflow','celebix_saas_owner')
      UNION
      SELECT lock_info.pid
      FROM pg_catalog.pg_locks lock_info
      WHERE lock_info.pid<>pg_catalog.pg_backend_pid() AND lock_info.granted
        AND lock_info.relation IN(
          'saas.abandoned_carts'::regclass
        )
        AND lock_info.mode IN('RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')
    )
    SELECT (
      NOT EXISTS(
        SELECT 1 FROM saas.abandoned_carts
        WHERE shipping_method_code IS NOT NULL
      )
    ), (SELECT pg_catalog.count(*) FROM writer_pids);
  `;
  if (psqlQuery(deps, readOnlyEnvironment(environment), query) !== "t|0") fail();
}

export function runIsolatedStaging(argv, supplied = {}) {
  const options = parseArguments(argv);
  const deps = {
    cwd: ROOT,
    env: process.env,
    spawn: spawnSync,
    readFile: readFileSync,
    chmod: chmodSync,
    exists: existsSync,
    mkdtemp: mkdtempSync,
    rm: rmSync,
    realpath: realpathSync,
    stat: statSync,
    git: (args) => {
      const result = spawnSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (result.error || result.status !== 0) fail();
      return result.stdout;
    },
    ...supplied,
  };

  verifyPushedSource(deps, options.sourceSha);
  if (options.mode === "dry-run") {
    return Object.freeze({ mode: "dry-run", sourceSha: options.sourceSha });
  }
  if (options.mode === "down" && deps.env.CELEBIX_STOREFRONT_WRITERS_DRAINED !== "confirmed") fail();

  const configuration = databaseConfiguration(deps);
  if (options.mode === "apply") {
    assertDatabaseSentinel(deps, configuration.environment, "absent");
    psqlFile(
      deps,
      readOnlyEnvironment(configuration.environment),
      `${SQL_ROOT}/${PRIOR_ASSERTIONS_FILE}`,
    );
    const encryptedBackup = createEncryptedBackup(deps, configuration, options.sourceSha, "apply");
    psqlFile(deps, configuration.environment, `${SQL_ROOT}/${UP_FILE}`, true);
    psqlFile(
      deps,
      readOnlyEnvironment(configuration.environment),
      `${SQL_ROOT}/${ASSERTIONS_FILE}`,
    );
    if (
      psqlQuery(
        deps,
        readOnlyEnvironment(configuration.environment),
        "SELECT saas.storefront_checkout_default_shipping_preflight();",
      ) !== "t"
    ) fail();
    assertDatabaseSentinel(deps, configuration.environment, "present");
    verifyPushedSource(deps, options.sourceSha);
    return Object.freeze({
      mode: "applied",
      sourceSha: options.sourceSha,
      encryptedBackup,
    });
  }

  assertDatabaseSentinel(deps, configuration.environment, "present");
  psqlFile(
    deps,
    readOnlyEnvironment(configuration.environment),
    `${SQL_ROOT}/${ASSERTIONS_FILE}`,
  );
  assertZeroImpactAndWritersDrained(deps, configuration.environment);
  const encryptedBackup = createEncryptedBackup(deps, configuration, options.sourceSha, "down");
  psqlFile(deps, configuration.environment, `${SQL_ROOT}/${DOWN_FILE}`, true);
  psqlFile(
    deps,
    readOnlyEnvironment(configuration.environment),
    `${SQL_ROOT}/${PRIOR_ASSERTIONS_FILE}`,
  );
  assertDatabaseSentinel(deps, configuration.environment, "absent");
  verifyPushedSource(deps, options.sourceSha);
  return Object.freeze({
    mode: "rolled-back",
    sourceSha: options.sourceSha,
    encryptedBackup,
  });
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const result = runIsolatedStaging(process.argv.slice(2));
    process.stdout.write(`${result.mode} ${result.sourceSha}\n`);
  } catch {
    process.stderr.write("storefront checkout isolated staging runner failed\n");
    process.exitCode = 1;
  }
}
