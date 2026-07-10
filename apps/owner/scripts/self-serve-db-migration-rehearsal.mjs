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
const REQUIRED_INDEX_CONTRACTS = {
  self_serve_store_registrations_slug_key: {
    table: "self_serve_store_registrations",
    fragments: ["(store_slug)"],
  },
  self_serve_store_registrations_email_slug_idempotency_key: {
    table: "self_serve_store_registrations",
    fragments: ["(normalized_email, store_slug)"],
  },
  self_serve_store_registrations_idempotency_key: {
    table: "self_serve_store_registrations",
    fragments: ["(idempotency_key)"],
  },
  self_serve_store_registrations_email_key: {
    table: "self_serve_store_registrations",
    fragments: ["(normalized_email)"],
  },
  self_serve_store_packages_registration_key: {
    table: "self_serve_store_packages",
    fragments: ["(registration_id)"],
  },
  self_serve_store_domains_hostname_key: {
    table: "self_serve_store_domains",
    fragments: ["(hostname)"],
  },
  self_serve_store_domains_primary_per_type_key: {
    table: "self_serve_store_domains",
    fragments: ["(registration_id, domain_type)", "WHERE is_primary"],
  },
  self_serve_store_memberships_registration_role_key: {
    table: "self_serve_store_memberships",
    fragments: ["(registration_id, principal_email, role)"],
  },
  self_serve_provisioning_jobs_registration_kind_key: {
    table: "self_serve_provisioning_jobs",
    fragments: ["(registration_id, kind)"],
  },
};
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
const REQUIRED_FOREIGN_KEY_CONTRACTS = {
  self_serve_store_packages_registration_id_fkey: "self_serve_store_packages",
  self_serve_store_domains_registration_id_fkey: "self_serve_store_domains",
  self_serve_store_memberships_registration_id_fkey: "self_serve_store_memberships",
  self_serve_provisioning_jobs_registration_id_fkey: "self_serve_provisioning_jobs",
};
const EXPECTED_COLUMN_CONTRACTS = {
  self_serve_store_registrations: [
    ["id", "uuid", "NO"],
    ["normalized_email", "text", "NO"],
    ["store_slug", "text", "NO"],
    ["idempotency_key", "text", "NO"],
    ["store_name", "text", "NO"],
    ["applicant_first_name", "text", "NO"],
    ["applicant_last_name", "text", "NO"],
    ["applicant_phone", "text", "NO"],
    ["marketing_consent", "boolean", "NO"],
    ["privacy_consent", "boolean", "NO"],
    ["plan", "text", "NO"],
    ["creation_mode", "text", "NO"],
    ["persistence_mode", "text", "NO"],
    ["status", "text", "NO"],
    ["planned_store_url", "text", "NO"],
    ["planned_admin_url", "text", "NO"],
    ["auth_provider", "text", "NO"],
    ["password_stored", "boolean", "NO"],
    ["admin_redirect_url", "text", "YES"],
    ["last_error_code", "text", "YES"],
    ["last_error_message", "text", "YES"],
    ["metadata", "jsonb", "NO"],
    ["created_at", "timestamp with time zone", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
  self_serve_store_packages: [
    ["id", "uuid", "NO"],
    ["registration_id", "uuid", "NO"],
    ["plan", "text", "NO"],
    ["status", "text", "NO"],
    ["created_at", "timestamp with time zone", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
  self_serve_store_domains: [
    ["id", "uuid", "NO"],
    ["registration_id", "uuid", "NO"],
    ["hostname", "text", "NO"],
    ["domain_type", "text", "NO"],
    ["is_primary", "boolean", "NO"],
    ["status", "text", "NO"],
    ["created_at", "timestamp with time zone", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
  self_serve_store_memberships: [
    ["id", "uuid", "NO"],
    ["registration_id", "uuid", "NO"],
    ["principal_email", "text", "NO"],
    ["role", "text", "NO"],
    ["status", "text", "NO"],
    ["created_at", "timestamp with time zone", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
  self_serve_provisioning_jobs: [
    ["id", "uuid", "NO"],
    ["registration_id", "uuid", "NO"],
    ["kind", "text", "NO"],
    ["adapter", "text", "NO"],
    ["status", "text", "NO"],
    ["attempts", "integer", "NO"],
    ["locked_at", "timestamp with time zone", "YES"],
    ["completed_at", "timestamp with time zone", "YES"],
    ["error_code", "text", "YES"],
    ["error_message", "text", "YES"],
    ["safe_metadata", "jsonb", "NO"],
    ["created_at", "timestamp with time zone", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
};
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

function getIndexDefinitions(connection) {
  return new Map(
    parseLines(
      runQuery(
        connection,
        `
          select indexname || E'\\t' || indexdef
          from pg_indexes
          where schemaname = 'public'
            and tablename like 'self_serve_%'
          order by indexname;
        `,
      ),
    ).map((line) => {
      const [name, definition] = line.split("\t");
      return [name, definition];
    }),
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

function getForeignKeyDefinitions(connection) {
  return new Map(
    parseLines(
      runQuery(
        connection,
        `
          select c.conname || E'\\t' || source.relname || E'\\t' || pg_get_constraintdef(c.oid)
          from pg_constraint c
          join pg_class source on source.oid = c.conrelid
          join pg_namespace n on n.oid = source.relnamespace
          where n.nspname = 'public'
            and source.relname like 'self_serve_%'
            and c.contype = 'f'
          order by c.conname;
        `,
      ),
    ).map((line) => {
      const [name, table, definition] = line.split("\t");
      return [name, { definition, table }];
    }),
  );
}

function getColumnContracts(connection) {
  return parseLines(
    runQuery(
      connection,
      `
        select table_name || E'\\t' || column_name || E'\\t' || data_type || E'\\t' || is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name like 'self_serve_%'
        order by table_name, ordinal_position;
      `,
    ),
  ).map((line) => {
    const [table, column, dataType, nullable] = line.split("\t");
    return `${table}.${column}:${dataType}:${nullable}`;
  });
}

function expectedColumnContracts() {
  return Object.entries(EXPECTED_COLUMN_CONTRACTS).flatMap(([table, columns]) =>
    columns.map(([column, dataType, nullable]) => `${table}.${column}:${dataType}:${nullable}`),
  );
}

function getOwnerSentinelFingerprint(connection) {
  const columns = runQuery(
    connection,
    `
      select column_name || ':' || data_type || ':' || is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'owner_rehearsal_sentinel'
      order by ordinal_position;
    `,
  );
  const rows = runQuery(connection, "select id::text || ':' || note from owner_rehearsal_sentinel order by id;");
  return `${columns}\n${rows}`;
}

function assertSchemaContracts(connection) {
  assertSetEqual(new Set(getColumnContracts(connection)), new Set(expectedColumnContracts()), "self-serve column contracts");

  const indexDefinitions = getIndexDefinitions(connection);
  for (const requiredIndex of REQUIRED_INDEXES) {
    const contract = REQUIRED_INDEX_CONTRACTS[requiredIndex];
    const definition = indexDefinitions.get(requiredIndex);
    assert(definition, `missing required index definition ${requiredIndex}`);
    assert(definition.startsWith("CREATE UNIQUE INDEX "), `${requiredIndex} must be unique.`);
    assert(definition.includes(` ON public.${contract.table} `), `${requiredIndex} targets the wrong table.`);
    for (const fragment of contract.fragments) {
      assert(definition.includes(fragment), `${requiredIndex} is missing ${fragment}.`);
    }
  }

  const foreignKeys = getForeignKeyDefinitions(connection);
  assertSetEqual(new Set(foreignKeys.keys()), new Set(Object.keys(REQUIRED_FOREIGN_KEY_CONTRACTS)), "foreign key contracts");
  for (const [name, table] of Object.entries(REQUIRED_FOREIGN_KEY_CONTRACTS)) {
    const foreignKey = foreignKeys.get(name);
    assert(foreignKey?.table === table, `${name} targets the wrong source table.`);
    assert(foreignKey.definition.includes("FOREIGN KEY (registration_id)"), `${name} does not constrain registration_id.`);
    assert(
      foreignKey.definition.includes("REFERENCES self_serve_store_registrations(id) ON DELETE CASCADE"),
      `${name} does not cascade to self_serve_store_registrations(id).`,
    );
  }
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

function verifyFakeBundle(connection, fake) {
  const registrationCount = runQuery(
    connection,
    `
      select count(*)
      from self_serve_store_registrations
      where id = ${sqlString(fake.registrationId)}
        and normalized_email = ${sqlString(fake.email)}
        and store_slug = ${sqlString(fake.slug)}
        and idempotency_key = ${sqlString(fake.idempotencyKey)}
        and plan = 'free_starter'
        and creation_mode = 'production_safe_pending'
        and persistence_mode = 'persistent_db_adapter'
        and status = 'processing'
        and planned_store_url = 'https://dryrun-store.celebix.site'
        and planned_admin_url = 'https://admin-dryrun-store.celebix.site'
        and auth_provider = 'logto'
        and password_stored = false
        and admin_redirect_url is null
        and last_error_code is null
        and last_error_message is null
        and created_at is not null
        and updated_at is not null;
    `,
  );
  assert(registrationCount === "1", "registration defaults or persisted values do not match the contract.");

  const packageCount = runQuery(
    connection,
    `select count(*) from self_serve_store_packages where registration_id = ${sqlString(fake.registrationId)} and plan = 'free_starter' and status = 'pending';`,
  );
  assert(packageCount === "1", "package relationship or defaults do not match the contract.");

  const domainCount = runQuery(
    connection,
    `
      select count(*)
      from self_serve_store_domains
      where registration_id = ${sqlString(fake.registrationId)}
        and status = 'planned'
        and is_primary = true
        and hostname in ('dryrun-store.celebix.site', 'admin-dryrun-store.celebix.site');
    `,
  );
  assert(domainCount === "2", "domain relationships or defaults do not match the contract.");

  const membershipCount = runQuery(
    connection,
    `
      select count(*)
      from self_serve_store_memberships
      where registration_id = ${sqlString(fake.registrationId)}
        and principal_email = ${sqlString(fake.email)}
        and role = 'store_owner'
        and status = 'pending';
    `,
  );
  assert(membershipCount === "1", "membership relationship or defaults do not match the contract.");

  const jobCount = runQuery(
    connection,
    `
      select count(*)
      from self_serve_provisioning_jobs
      where registration_id = ${sqlString(fake.registrationId)}
        and kind = 'free_starter_store_creation'
        and adapter = 'persistent_db_adapter'
        and status = 'queued'
        and attempts = 0
        and error_code is null
        and error_message is null;
    `,
  );
  assert(jobCount === "1", "provisioning-job relationship or defaults do not match the contract.");
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
  runQuery(connection, "drop table if exists owner_rehearsal_sentinel;");
  runQuery(connection, "create table rehearsal_sentinel (id integer primary key, note text not null);");
  runQuery(connection, "insert into rehearsal_sentinel (id, note) values (1, 'preserve-me');");
  runQuery(connection, "create table owner_rehearsal_sentinel (id integer primary key, note text not null);");
  runQuery(connection, "insert into owner_rehearsal_sentinel (id, note) values (1, 'owner-preserve-me');");
  printStep("sentinel setup");

  const baselineTables = new Set(getTableNames(connection));
  assert(baselineTables.has("rehearsal_sentinel"), "sentinel table was not created.");
  assert(baselineTables.has("owner_rehearsal_sentinel"), "owner sentinel table was not created.");
  const baselineOwnerTables = new Set([...baselineTables].filter((table) => table.startsWith("owner_")));
  const ownerSentinelFingerprint = getOwnerSentinelFingerprint(connection);

  runFile(connection, proposalSqlPath);
  printStep("proposal apply");

  const tablesAfterProposal = new Set(getTableNames(connection));
  const expectedAllTables = new Set(["rehearsal_sentinel", "owner_rehearsal_sentinel", ...EXPECTED_TABLES]);
  assertSetEqual(tablesAfterProposal, expectedAllTables, "tables after proposal");
  assert(
    [...tablesAfterProposal].every(
      (table) => ["rehearsal_sentinel", "owner_rehearsal_sentinel"].includes(table) || table.startsWith("self_serve_"),
    ),
    "unexpected non-self_serve table was created.",
  );
  for (const forbidden of FORBIDDEN_GENERIC_TABLES) {
    assert(!tablesAfterProposal.has(forbidden), `generic cutover table was created: ${forbidden}`);
  }
  assertSetEqual(
    new Set([...tablesAfterProposal].filter((table) => table.startsWith("owner_"))),
    baselineOwnerTables,
    "owner_* tables after proposal",
  );
  assert(getOwnerSentinelFingerprint(connection) === ownerSentinelFingerprint, "owner_* sentinel changed during proposal apply.");
  printStep("expected tables");

  const indexes = new Set(getIndexNames(connection));
  for (const requiredIndex of REQUIRED_INDEXES) {
    assert(indexes.has(requiredIndex), `missing required index ${requiredIndex}`);
  }
  assertSchemaContracts(connection);
  const checkConstraints = new Set(getConstraintNames(connection));
  for (const requiredConstraint of REQUIRED_CHECK_CONSTRAINTS) {
    assert(checkConstraints.has(requiredConstraint), `missing required check constraint ${requiredConstraint}`);
  }
  const forbiddenColumns = getForbiddenColumns(connection);
  assert(forbiddenColumns.length === 0, `forbidden credential-like columns found: ${forbiddenColumns.join(", ")}`);
  printStep("constraints/indexes");

  const fake = insertFakeBundle(connection);
  verifyFakeBundle(connection, fake);
  printStep("fake inserts");

  exerciseUniqueness(connection, fake);
  printStep("uniqueness checks");
  printStep("foreign key rejection");

  runFile(connection, rollbackSqlPath);
  printStep("rollback");

  const tablesAfterRollback = new Set(getTableNames(connection));
  assert(tablesAfterRollback.has("rehearsal_sentinel"), "sentinel table was removed by rollback.");
  assert(tablesAfterRollback.has("owner_rehearsal_sentinel"), "owner sentinel table was removed by rollback.");
  for (const expectedTable of EXPECTED_TABLES) {
    assert(!tablesAfterRollback.has(expectedTable), `${expectedTable} still exists after rollback.`);
  }
  assertSetEqual(tablesAfterRollback, new Set(["rehearsal_sentinel", "owner_rehearsal_sentinel"]), "tables after rollback");
  assert(
    getOwnerSentinelFingerprint(connection) === ownerSentinelFingerprint,
    "owner_* sentinel changed during proposal or rollback.",
  );
  printStep("unrelated sentinel preserved");
  printStep("owner_* sentinel preserved");

  runQuery(connection, "drop table rehearsal_sentinel;");
  runQuery(connection, "drop table owner_rehearsal_sentinel;");
  assert(getTableNames(connection).length === 0, "disposable database was not returned to empty state after sentinel cleanup.");

  summary.push("# Self-Serve DB Migration Rehearsal");
  summary.push("");
  summary.push(`- PostgreSQL version: ${version}`);
  summary.push("- Proposal apply: PASS");
  summary.push("- Expected tables: PASS");
  summary.push("- Constraints/indexes: PASS");
  summary.push("- Column/foreign-key contracts: PASS");
  summary.push("- Fake inserts: PASS");
  summary.push("- Uniqueness checks: PASS");
  summary.push("- Foreign key rejection: PASS");
  summary.push("- Rollback: PASS");
  summary.push("- Unrelated sentinel preserved: PASS");
  summary.push("- Owner sentinel preserved: PASS");
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
