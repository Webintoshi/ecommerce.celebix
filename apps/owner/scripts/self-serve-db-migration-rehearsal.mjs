import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EXPECTED_DATABASE = "self_serve_migration_rehearsal";
const REQUIRED_ACK = "disposable-only";
const EXPECTED_TABLES = [
  "self_serve_store_registrations",
  "self_serve_store_packages",
  "self_serve_store_domains",
  "self_serve_store_memberships",
  "self_serve_provisioning_jobs",
];
const REQUIRED_INDEXES = [
  "self_serve_store_registrations_slug_key",
  "self_serve_store_registrations_email_slug_idempotency_key",
  "self_serve_store_registrations_idempotency_key",
  "self_serve_store_registrations_email_key",
  "self_serve_store_packages_registration_key",
  "self_serve_store_domains_hostname_key",
  "self_serve_store_domains_primary_per_type_key",
  "self_serve_store_memberships_registration_role_key",
  "self_serve_provisioning_jobs_registration_kind_key",
];
const REQUIRED_CHECK_CONSTRAINTS = [
  "self_serve_store_registrations_status_check",
  "self_serve_store_registrations_plan_check",
  "self_serve_store_registrations_creation_mode_check",
  "self_serve_store_registrations_persistence_mode_check",
  "self_serve_store_registrations_password_never_stored",
  "self_serve_store_registrations_admin_redirect_safe",
  "self_serve_store_packages_plan_check",
  "self_serve_store_packages_status_check",
  "self_serve_store_domains_domain_type_check",
  "self_serve_store_domains_status_check",
  "self_serve_store_memberships_role_check",
  "self_serve_store_memberships_status_check",
  "self_serve_provisioning_jobs_kind_check",
  "self_serve_provisioning_jobs_adapter_check",
  "self_serve_provisioning_jobs_status_check",
];
const FORBIDDEN_PRODUCTION_HOST_PATTERNS = [
  /celebix/i,
  /supabase/i,
  /neon/i,
  /amazonaws/i,
  /rds/i,
  /azure/i,
  /google/i,
  /railway/i,
  /render/i,
  /fly\.dev/i,
  /coolify/i,
];
const FORBIDDEN_GENERIC_TABLES = ["stores", "store_domains", "store_memberships"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const proposalSqlPath = path.join(repoRoot, "apps", "owner", "scripts", "sql", "self-serve-free-store-foundation-proposal.sql");
const rollbackSqlPath = path.join(repoRoot, "apps", "owner", "scripts", "sql", "self-serve-free-store-foundation-rollback.sql");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function parseAndGuardConnection() {
  const rawUrl = process.env.SELF_SERVE_REHEARSAL_DATABASE_URL;
  const ack = process.env.SELF_SERVE_REHEARSAL_ACK;
  const localAck = process.env.SELF_SERVE_REHEARSAL_LOCAL;

  assert(rawUrl, "SELF_SERVE_REHEARSAL_DATABASE_URL is required.");
  assert(ack === REQUIRED_ACK, "SELF_SERVE_REHEARSAL_ACK=disposable-only is required.");
  assert(
    process.env.CI === "true" || localAck === REQUIRED_ACK,
    "Rehearsal must run in CI or with SELF_SERVE_REHEARSAL_LOCAL=disposable-only.",
  );
  assert(!process.env.DATABASE_URL, "DATABASE_URL must not be set for this rehearsal.");
  assert(!process.env.SUPABASE_URL, "SUPABASE_URL must not be set for this rehearsal.");
  assert(!process.env.OWNER_SUPABASE_SERVICE_ROLE_KEY, "OWNER_SUPABASE_SERVICE_ROLE_KEY must not be set for this rehearsal.");

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("SELF_SERVE_REHEARSAL_DATABASE_URL is not a valid URL.");
  }

  assert(["postgres:", "postgresql:"].includes(url.protocol), "Rehearsal URL must use postgres/postgresql protocol.");
  assert(["localhost", "127.0.0.1"].includes(url.hostname), "Rehearsal DB host must be localhost or 127.0.0.1.");
  assert(url.pathname.replace(/^\/+/, "") === EXPECTED_DATABASE, `Rehearsal database must be ${EXPECTED_DATABASE}.`);
  assert(url.username, "Rehearsal URL must include a username.");
  assert(url.password, "Rehearsal URL must include a password.");

  for (const pattern of FORBIDDEN_PRODUCTION_HOST_PATTERNS) {
    assert(!pattern.test(rawUrl), "Rehearsal URL must not reference production, cloud, Supabase, or Celebix hosts.");
  }

  return {
    host: url.hostname,
    port: url.port || "5432",
    database: EXPECTED_DATABASE,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function runPsql(connection, args, { input } = {}) {
  const result = spawnSync(
    "psql",
    ["-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-h", connection.host, "-p", connection.port, "-U", connection.user, "-d", connection.database, ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input,
      env: {
        PATH: process.env.PATH,
        PGPASSWORD: connection.password,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    throw new Error(`psql command failed with exit ${result.status}.${stderr}`);
  }

  return result.stdout.trim();
}

function runQuery(connection, sql) {
  return runPsql(connection, ["-t", "-A", "-F", "\t", "-c", sql]);
}

function runFile(connection, filePath) {
  runPsql(connection, ["-f", filePath]);
}

function runExpectFailure(connection, sql, label) {
  const result = spawnSync(
    "psql",
    ["-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-h", connection.host, "-p", connection.port, "-U", connection.user, "-d", connection.database, "-c", sql],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        PGPASSWORD: connection.password,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    fail(`${label} unexpectedly succeeded.`);
  }
}

function parseLines(output) {
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertSetEqual(actual, expected, label) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  assert(
    JSON.stringify(actualSorted) === JSON.stringify(expectedSorted),
    `${label} mismatch. Expected ${expectedSorted.join(", ")}, got ${actualSorted.join(", ")}`,
  );
}

function printStep(label, status = "PASS") {
  console.log(`${label}: ${status}`);
}

function getTableNames(connection) {
  return parseLines(
    runQuery(
      connection,
      `
        select tablename
        from pg_tables
        where schemaname = 'public'
        order by tablename;
      `,
    ),
  );
}

function getIndexNames(connection) {
  return parseLines(
    runQuery(
      connection,
      `
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and tablename like 'self_serve_%'
        order by indexname;
      `,
    ),
  );
}

function getConstraintNames(connection) {
  return parseLines(
    runQuery(
      connection,
      `
        select conname
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname like 'self_serve_%'
          and c.contype = 'c'
        order by conname;
      `,
    ),
  );
}

function getForbiddenColumns(connection) {
  return parseLines(
    runQuery(
      connection,
      `
        select table_name || '.' || column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name like 'self_serve_%'
          and column_name ~* '(raw_password|password_hash|password_digest|password_token|refresh_token|access_token|secret)'
        order by table_name, column_name;
      `,
    ),
  );
}

function insertFakeBundle(connection) {
  const idempotencyKey = "dryrun-idempotency-key";
  const email = "dryrun@example.test";
  const slug = "dryrun-store";
  const registrationOutput = runQuery(
    connection,
    `
      insert into self_serve_store_registrations (
        normalized_email,
        store_slug,
        idempotency_key,
        store_name,
        applicant_first_name,
        applicant_last_name,
        applicant_phone,
        marketing_consent,
        privacy_consent,
        planned_store_url,
        planned_admin_url,
        metadata
      )
      values (
        ${sqlString(email)},
        ${sqlString(slug)},
        ${sqlString(idempotencyKey)},
        'Dryrun Store',
        'Dry',
        'Run',
        '+905550000000',
        false,
        true,
        'https://dryrun-store.celebix.site',
        'https://admin-dryrun-store.celebix.site',
        '{"source":"ci-rehearsal"}'::jsonb
      )
      returning id;
    `,
  );
  const registrationId = registrationOutput.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  assert(registrationId, "registration insert did not return an id.");

  runQuery(
    connection,
    `
      insert into self_serve_store_packages (registration_id, plan, status)
      values (${sqlString(registrationId)}, 'free_starter', 'pending');
    `,
  );
  runQuery(
    connection,
    `
      insert into self_serve_store_domains (registration_id, hostname, domain_type, is_primary, status)
      values
        (${sqlString(registrationId)}, 'dryrun-store.celebix.site', 'platform_subdomain', true, 'planned'),
        (${sqlString(registrationId)}, 'admin-dryrun-store.celebix.site', 'admin_subdomain', true, 'planned');
    `,
  );
  runQuery(
    connection,
    `
      insert into self_serve_store_memberships (registration_id, principal_email, role, status)
      values (${sqlString(registrationId)}, ${sqlString(email)}, 'store_owner', 'pending');
    `,
  );
  runQuery(
    connection,
    `
      insert into self_serve_provisioning_jobs (registration_id, kind, adapter, status, safe_metadata)
      values (${sqlString(registrationId)}, 'free_starter_store_creation', 'persistent_db_adapter', 'queued', '{"source":"ci-rehearsal"}'::jsonb);
    `,
  );

  return { email, idempotencyKey, registrationId, slug };
}

function exerciseUniqueness(connection, fake) {
  runExpectFailure(
    connection,
    `
      insert into self_serve_store_registrations (
        normalized_email, store_slug, idempotency_key, store_name, applicant_first_name,
        applicant_last_name, applicant_phone, privacy_consent, planned_store_url, planned_admin_url
      )
      values (
        'dryrun-other-idempotency@example.test', 'dryrun-other-idempotency', ${sqlString(fake.idempotencyKey)},
        'Duplicate Idempotency', 'Dry', 'Run', '+905550000001', true,
        'https://dryrun-other-idempotency.celebix.site', 'https://admin-dryrun-other-idempotency.celebix.site'
      );
    `,
    "duplicate idempotency key check",
  );

  runExpectFailure(
    connection,
    `
      insert into self_serve_store_registrations (
        normalized_email, store_slug, idempotency_key, store_name, applicant_first_name,
        applicant_last_name, applicant_phone, privacy_consent, planned_store_url, planned_admin_url
      )
      values (
        'dryrun-slug-conflict@example.test', ${sqlString(fake.slug)}, 'dryrun-slug-conflict-key',
        'Duplicate Slug', 'Dry', 'Run', '+905550000002', true,
        'https://dryrun-store-copy.celebix.site', 'https://admin-dryrun-store-copy.celebix.site'
      );
    `,
    "duplicate store slug check",
  );

  runExpectFailure(
    connection,
    `
      insert into self_serve_store_registrations (
        normalized_email, store_slug, idempotency_key, store_name, applicant_first_name,
        applicant_last_name, applicant_phone, privacy_consent, planned_store_url, planned_admin_url
      )
      values (
        ${sqlString(fake.email)}, ${sqlString(fake.slug)}, 'dryrun-email-slug-conflict-key',
        'Duplicate Email Slug', 'Dry', 'Run', '+905550000003', true,
        'https://dryrun-store-duplicate.celebix.site', 'https://admin-dryrun-store-duplicate.celebix.site'
      );
    `,
    "duplicate normalized email + slug check",
  );

  runExpectFailure(
    connection,
    `
      insert into self_serve_store_registrations (
        normalized_email, store_slug, idempotency_key, store_name, applicant_first_name,
        applicant_last_name, applicant_phone, privacy_consent, planned_store_url, planned_admin_url
      )
      values (
        ${sqlString(fake.email)}, 'dryrun-second-store', 'dryrun-email-conflict-key',
        'Duplicate Email', 'Dry', 'Run', '+905550000004', true,
        'https://dryrun-second-store.celebix.site', 'https://admin-dryrun-second-store.celebix.site'
      );
    `,
    "one-store-per-normalized-email check",
  );

  runExpectFailure(
    connection,
    `
      insert into self_serve_store_packages (registration_id, plan, status)
      values ('00000000-0000-0000-0000-000000000000', 'free_starter', 'pending');
    `,
    "foreign key check",
  );
}

function appendGithubSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const connection = parseAndGuardConnection();
  const summary = [];

  assert(fs.existsSync(proposalSqlPath), "Proposal SQL file is missing.");
  assert(fs.existsSync(rollbackSqlPath), "Rollback SQL file is missing.");

  const version = runQuery(connection, "select version();");
  console.log(`PostgreSQL version: ${version}`);
  printStep("production connection used", "NO");

  runQuery(connection, "drop table if exists rehearsal_sentinel;");
  runQuery(connection, "create table rehearsal_sentinel (id integer primary key, note text not null);");
  runQuery(connection, "insert into rehearsal_sentinel (id, note) values (1, 'preserve-me');");
  printStep("sentinel setup");

  const baselineTables = new Set(getTableNames(connection));
  assert(baselineTables.has("rehearsal_sentinel"), "sentinel table was not created.");

  runFile(connection, proposalSqlPath);
  printStep("proposal apply");

  const tablesAfterProposal = new Set(getTableNames(connection));
  const expectedAllTables = new Set(["rehearsal_sentinel", ...EXPECTED_TABLES]);
  assertSetEqual(tablesAfterProposal, expectedAllTables, "tables after proposal");
  assert([...tablesAfterProposal].every((table) => table === "rehearsal_sentinel" || table.startsWith("self_serve_")), "unexpected non-self_serve table was created.");
  for (const forbidden of FORBIDDEN_GENERIC_TABLES) {
    assert(!tablesAfterProposal.has(forbidden), `generic cutover table was created: ${forbidden}`);
  }
  assert(![...tablesAfterProposal].some((table) => table.startsWith("owner_")), "owner_* table was created.");
  printStep("expected tables");

  const indexes = new Set(getIndexNames(connection));
  for (const requiredIndex of REQUIRED_INDEXES) {
    assert(indexes.has(requiredIndex), `missing required index ${requiredIndex}`);
  }
  const checkConstraints = new Set(getConstraintNames(connection));
  for (const requiredConstraint of REQUIRED_CHECK_CONSTRAINTS) {
    assert(checkConstraints.has(requiredConstraint), `missing required check constraint ${requiredConstraint}`);
  }
  const forbiddenColumns = getForbiddenColumns(connection);
  assert(forbiddenColumns.length === 0, `forbidden credential-like columns found: ${forbiddenColumns.join(", ")}`);
  printStep("constraints/indexes");

  const fake = insertFakeBundle(connection);
  printStep("fake inserts");

  exerciseUniqueness(connection, fake);
  printStep("uniqueness checks");

  runFile(connection, rollbackSqlPath);
  printStep("rollback");

  const tablesAfterRollback = new Set(getTableNames(connection));
  assert(tablesAfterRollback.has("rehearsal_sentinel"), "sentinel table was removed by rollback.");
  for (const expectedTable of EXPECTED_TABLES) {
    assert(!tablesAfterRollback.has(expectedTable), `${expectedTable} still exists after rollback.`);
  }
  assertSetEqual(tablesAfterRollback, new Set(["rehearsal_sentinel"]), "tables after rollback");
  printStep("unrelated sentinel preserved");

  runQuery(connection, "drop table rehearsal_sentinel;");
  assert(getTableNames(connection).length === 0, "disposable database was not returned to empty state after sentinel cleanup.");

  summary.push("# Self-Serve DB Migration Rehearsal");
  summary.push("");
  summary.push(`- PostgreSQL version: ${version}`);
  summary.push("- Proposal apply: PASS");
  summary.push("- Expected tables: PASS");
  summary.push("- Constraints/indexes: PASS");
  summary.push("- Fake inserts: PASS");
  summary.push("- Uniqueness checks: PASS");
  summary.push("- Rollback: PASS");
  summary.push("- Unrelated sentinel preserved: PASS");
  summary.push("- Production connection used: NO");
  appendGithubSummary(summary);

  console.log("");
  console.log(summary.join("\n"));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
