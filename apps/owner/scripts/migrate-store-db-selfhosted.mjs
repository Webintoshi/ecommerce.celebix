import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const SUPABASE_MANAGEMENT_API_URL = "https://api.supabase.com/v1";
const DEFAULT_BATCH_SIZE = 100;
const AUTH_TABLES_TO_COPY = [
  "users",
  "identities",
  "sessions",
  "refresh_tokens",
  "mfa_factors",
  "mfa_challenges",
  "mfa_amr_claims",
  "one_time_tokens",
  "sso_providers",
  "sso_domains",
  "saml_providers",
  "saml_relay_states",
];
const BOOTSTRAP_SQL_FILES = [
  ["apps", "admin", "supabase", "schema.sql"],
  ["apps", "admin", "supabase", "migrations", "003_add_auth_integration.sql"],
  ["apps", "admin", "supabase", "migrations", "004_add_customer_addresses.sql"],
  ["apps", "admin", "supabase", "migrations", "005_add_customer_preferences.sql"],
  ["apps", "admin", "supabase", "migrations", "008_product_wizard_schema.sql"],
  ["apps", "admin", "supabase", "migrations", "20260209_admin_roles.sql"],
  ["apps", "admin", "supabase", "migrations", "20260219000000_seo_hub.sql"],
  ["apps", "admin", "supabase", "migrations", "020_create_pages_table.sql"],
  ["apps", "admin", "supabase", "migrations", "021_create_cart_system.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402000000_analytics_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402010000_abandoned_cart_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260224000000_product_customization.sql"],
  ["apps", "admin", "supabase", "migrations", "025_create_accounting_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260314000100_product_tag_suggestions.sql"],
  ["apps", "admin", "supabase", "migrations", "20260314001000_marketplace_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260315002000_lucky_wheel_production.sql"],
  ["apps", "admin", "supabase", "migrations", "20260328000000_payment_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "006_add_product_columns.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402020000_default_product_tax_rate_zero.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402183000_products_subcategory_compat.sql"],
  ["apps", "admin", "supabase", "migrations", "20260405010000_product_reviews.sql"],
  ["apps", "admin", "supabase", "migrations", "20260405120000_translation_cache.sql"],
];

function parseArgs(argv) {
  const parsed = {
    store: "",
    targetBaseUrl: process.env.TARGET_SUPABASE_BASE_URL || "",
    targetRef: process.env.TARGET_SUPABASE_PROJECT_REF || "default",
    targetBasicUser: process.env.TARGET_SUPABASE_BASIC_USER || "",
    targetBasicPassword: process.env.TARGET_SUPABASE_BASIC_PASSWORD || "",
    sourceAccessToken: process.env.SUPABASE_ACCESS_TOKEN || "",
    batchSize: Number(process.env.MIGRATION_BATCH_SIZE || DEFAULT_BATCH_SIZE),
    reportPath: "",
    skipSchema: false,
    skipAuth: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--store" && next) {
      parsed.store = next;
      index += 1;
      continue;
    }

    if (arg === "--target-base-url" && next) {
      parsed.targetBaseUrl = next;
      index += 1;
      continue;
    }

    if (arg === "--target-ref" && next) {
      parsed.targetRef = next;
      index += 1;
      continue;
    }

    if (arg === "--target-basic-user" && next) {
      parsed.targetBasicUser = next;
      index += 1;
      continue;
    }

    if (arg === "--target-basic-password" && next) {
      parsed.targetBasicPassword = next;
      index += 1;
      continue;
    }

    if (arg === "--source-access-token" && next) {
      parsed.sourceAccessToken = next;
      index += 1;
      continue;
    }

    if (arg === "--batch-size" && next) {
      parsed.batchSize = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--report-path" && next) {
      parsed.reportPath = next;
      index += 1;
      continue;
    }

    if (arg === "--skip-schema") {
      parsed.skipSchema = true;
      continue;
    }

    if (arg === "--skip-auth") {
      parsed.skipAuth = true;
      continue;
    }
  }

  if (!parsed.store) {
    throw new Error("--store gerekli. Ornek: --store deri-kordon");
  }

  if (!parsed.targetBaseUrl) {
    throw new Error("TARGET_SUPABASE_BASE_URL veya --target-base-url gerekli.");
  }

  if (!parsed.targetBasicUser || !parsed.targetBasicPassword) {
    throw new Error("TARGET_SUPABASE_BASIC_USER ve TARGET_SUPABASE_BASIC_PASSWORD gerekli.");
  }

  if (!parsed.sourceAccessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN veya --source-access-token gerekli.");
  }

  if (!Number.isFinite(parsed.batchSize) || parsed.batchSize <= 0) {
    throw new Error("batch size pozitif bir sayi olmali.");
  }

  return parsed;
}

function readStoreConfig(storeSlug) {
  const storeConfigPath = path.join(repoRoot, "stores", storeSlug, "store.config.json");

  if (!fs.existsSync(storeConfigPath)) {
    throw new Error(`Store config bulunamadi: ${storeConfigPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(storeConfigPath, "utf8"));
  const sourceProjectRef = parsed?.supabase?.projectRef?.trim();

  if (!sourceProjectRef) {
    throw new Error(`${storeSlug} icin source Supabase projectRef tanimli degil.`);
  }

  return {
    config: parsed,
    configPath: storeConfigPath,
    sourceProjectRef,
  };
}

function buildManagedHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function buildTargetHeaders(user, password) {
  const token = Buffer.from(`${user}:${password}`, "utf8").toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
  };
}

async function managedQuery(accessToken, projectRef, query, name) {
  const response = await fetch(`${SUPABASE_MANAGEMENT_API_URL}/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: buildManagedHeaders(accessToken),
    body: JSON.stringify({
      query,
      name,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Source query hatasi (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

async function targetPgMetaQuery(baseUrl, projectRef, user, password, query) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/platform/pg-meta/${projectRef}/query`, {
    method: "POST",
    headers: buildTargetHeaders(user, password),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Target query hatasi (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

async function getTargetTables(baseUrl, projectRef, user, password) {
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/api/platform/pg-meta/${projectRef}/tables?included_schemas=public,auth`,
    {
      headers: buildTargetHeaders(user, password),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Target tables okunamadi (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, "\"\"")}"`;
}

function quoteQualified(schema, table) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function escapeLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function buildBootstrapQueries() {
  return BOOTSTRAP_SQL_FILES.map((segments) => ({
    name: segments[segments.length - 1],
    sql: fs.readFileSync(path.join(repoRoot, ...segments), "utf8"),
  }));
}

async function ensureTargetSchema(args) {
  const productsExists = await targetPgMetaQuery(
    args.targetBaseUrl,
    args.targetRef,
    args.targetBasicUser,
    args.targetBasicPassword,
    "select to_regclass('public.products') is not null as exists;",
  );

  if (productsExists?.[0]?.exists) {
    return { applied: false };
  }

  const files = buildBootstrapQueries();

  for (const file of files) {
    await targetPgMetaQuery(
      args.targetBaseUrl,
      args.targetRef,
      args.targetBasicUser,
      args.targetBasicPassword,
      file.sql,
    );
  }

  return { applied: true, files: files.map((file) => file.name) };
}

async function listSourcePublicTables(args, sourceProjectRef) {
  const rows = await managedQuery(
    args.sourceAccessToken,
    sourceProjectRef,
    `
      select table_schema, table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name;
    `,
    "list_public_tables",
  );

  return rows.map((row) => ({
    schema: row.table_schema,
    table: row.table_name,
  }));
}

function listAuthTables() {
  return AUTH_TABLES_TO_COPY.map((table) => ({
    schema: "auth",
    table,
  }));
}

function buildTargetTableMap(targetTables) {
  const map = new Map();

  for (const table of targetTables) {
    map.set(`${table.schema}.${table.name}`, table);
  }

  return map;
}

function getInsertableColumns(targetTable, sourceRowSample) {
  const sourceKeys = new Set(sourceRowSample ? Object.keys(sourceRowSample) : []);

  return (targetTable.columns || [])
    .filter((column) => !column.is_generated)
    .filter((column) => sourceKeys.has(column.name))
    .map((column) => column.name);
}

function buildOrderBy(targetTable) {
  const primaryKey = (targetTable.primary_keys || [])[0];
  return primaryKey?.name ? ` order by ${quoteIdentifier(primaryKey.name)}` : "";
}

async function getSourceRowCount(args, sourceProjectRef, schema, table) {
  const result = await managedQuery(
    args.sourceAccessToken,
    sourceProjectRef,
    `select count(*)::int as row_count from ${quoteQualified(schema, table)};`,
    `count_${schema}_${table}`,
  );

  return result?.[0]?.row_count ?? 0;
}

async function fetchSourceBatch(args, sourceProjectRef, schema, table, orderByClause, limit, offset) {
  const query = `select * from ${quoteQualified(schema, table)}${orderByClause} limit ${limit} offset ${offset};`;
  return managedQuery(args.sourceAccessToken, sourceProjectRef, query, `dump_${schema}_${table}_${offset}`);
}

function buildInsertQuery(schema, table, columns, rows) {
  const columnList = columns.map(quoteIdentifier).join(", ");
  const normalizedRows = rows.map((row) => {
    const filtered = {};
    for (const column of columns) {
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        filtered[column] = row[column];
      }
    }
    return filtered;
  });
  const jsonPayload = escapeLiteral(JSON.stringify(normalizedRows));

  return `
    begin;
    set local session_replication_role = replica;
    insert into ${quoteQualified(schema, table)} (${columnList})
    select ${columnList}
    from jsonb_populate_recordset(null::${quoteQualified(schema, table)}, '${jsonPayload}'::jsonb);
    commit;
  `;
}

async function truncateTargetTables(args, tableRefs) {
  if (tableRefs.length === 0) {
    return;
  }

  const tableList = tableRefs.map((entry) => quoteQualified(entry.schema, entry.table)).join(", ");
  const query = `
    begin;
    set local session_replication_role = replica;
    truncate table ${tableList} restart identity cascade;
    commit;
  `;

  await targetPgMetaQuery(args.targetBaseUrl, args.targetRef, args.targetBasicUser, args.targetBasicPassword, query);
}

async function resetTargetSequence(args, schema, table, primaryKeyName) {
  const query = `
    select pg_get_serial_sequence('${schema}.${table}', '${primaryKeyName}') as seq_name;
  `;
  const sequenceResult = await targetPgMetaQuery(
    args.targetBaseUrl,
    args.targetRef,
    args.targetBasicUser,
    args.targetBasicPassword,
    query,
  );
  const sequenceName = sequenceResult?.[0]?.seq_name;

  if (!sequenceName) {
    return;
  }

  const resetQuery = `
    select setval(
      '${escapeLiteral(sequenceName)}',
      coalesce((select max(${quoteIdentifier(primaryKeyName)}) from ${quoteQualified(schema, table)}), 1),
      (select exists(select 1 from ${quoteQualified(schema, table)}))
    );
  `;
  await targetPgMetaQuery(args.targetBaseUrl, args.targetRef, args.targetBasicUser, args.targetBasicPassword, resetQuery);
}

async function copyTable(args, sourceProjectRef, targetTable) {
  const schema = targetTable.schema;
  const table = targetTable.name;
  const orderByClause = buildOrderBy(targetTable);
  const rowCount = await getSourceRowCount(args, sourceProjectRef, schema, table);

  if (rowCount === 0) {
    return {
      schema,
      table,
      rowCount: 0,
      inserted: 0,
      batches: 0,
      skipped: false,
    };
  }

  const firstBatch = await fetchSourceBatch(
    args,
    sourceProjectRef,
    schema,
    table,
    orderByClause,
    Math.min(args.batchSize, rowCount),
    0,
  );
  const insertableColumns = getInsertableColumns(targetTable, firstBatch[0]);

  if (insertableColumns.length === 0) {
    return {
      schema,
      table,
      rowCount,
      inserted: 0,
      batches: 0,
      skipped: true,
      reason: "Insertable column bulunamadi",
    };
  }

  let inserted = 0;
  let batches = 0;

  if (firstBatch.length > 0) {
    const insertQuery = buildInsertQuery(schema, table, insertableColumns, firstBatch);
    await targetPgMetaQuery(args.targetBaseUrl, args.targetRef, args.targetBasicUser, args.targetBasicPassword, insertQuery);
    inserted += firstBatch.length;
    batches += 1;
  }

  for (let offset = firstBatch.length; offset < rowCount; offset += args.batchSize) {
    const batch = await fetchSourceBatch(
      args,
      sourceProjectRef,
      schema,
      table,
      orderByClause,
      args.batchSize,
      offset,
    );

    if (batch.length === 0) {
      continue;
    }

    const insertQuery = buildInsertQuery(schema, table, insertableColumns, batch);
    await targetPgMetaQuery(args.targetBaseUrl, args.targetRef, args.targetBasicUser, args.targetBasicPassword, insertQuery);
    inserted += batch.length;
    batches += 1;
  }

  const primaryKey = (targetTable.primary_keys || [])[0];
  if (primaryKey?.name) {
    await resetTargetSequence(args, schema, table, primaryKey.name);
  }

  return {
    schema,
    table,
    rowCount,
    inserted,
    batches,
    skipped: false,
  };
}

async function getTargetCount(args, schema, table) {
  const result = await targetPgMetaQuery(
    args.targetBaseUrl,
    args.targetRef,
    args.targetBasicUser,
    args.targetBasicPassword,
    `select count(*)::int as row_count from ${quoteQualified(schema, table)};`,
  );

  return result?.[0]?.row_count ?? 0;
}

function resolveReportPath(args) {
  if (args.reportPath) {
    return path.resolve(process.cwd(), args.reportPath);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, ".tmp", "selfhosted-migrations", `${args.store}-${args.targetRef}-${timestamp}.json`);
}

async function main() {
  const args = parseArgs(process.argv);
  const { config, sourceProjectRef } = readStoreConfig(args.store);

  console.log(`[1/6] Source store: ${config.name} (${args.store})`);
  console.log(`[2/6] Target self-hosted project: ${args.targetBaseUrl} (${args.targetRef})`);

  const report = {
    store: args.store,
    sourceProjectRef,
    targetProjectRef: args.targetRef,
    targetBaseUrl: args.targetBaseUrl,
    startedAt: new Date().toISOString(),
    schemaBootstrap: null,
    copiedTables: [],
    skippedTables: [],
    verification: [],
  };

  if (!args.skipSchema) {
    console.log("[3/6] Applying Celebix schema bundle to target if needed...");
    report.schemaBootstrap = await ensureTargetSchema(args);
  } else {
    report.schemaBootstrap = { applied: false, skipped: true };
  }

  console.log("[4/6] Discovering source and target tables...");
  const sourcePublicTables = await listSourcePublicTables(args, sourceProjectRef);
  const targetTables = await getTargetTables(args.targetBaseUrl, args.targetRef, args.targetBasicUser, args.targetBasicPassword);
  const targetTableMap = buildTargetTableMap(targetTables);

  const tablesToCopy = [];
  for (const entry of sourcePublicTables) {
    const key = `${entry.schema}.${entry.table}`;
    if (targetTableMap.has(key)) {
      tablesToCopy.push(targetTableMap.get(key));
    }
  }

  if (!args.skipAuth) {
    for (const entry of listAuthTables()) {
      const key = `${entry.schema}.${entry.table}`;
      if (targetTableMap.has(key)) {
        tablesToCopy.push(targetTableMap.get(key));
      }
    }
  }

  const uniqueTables = [];
  const seen = new Set();
  for (const table of tablesToCopy) {
    const key = `${table.schema}.${table.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTables.push(table);
    }
  }

  console.log(`[5/6] Truncating ${uniqueTables.length} target tables before import...`);
  await truncateTargetTables(
    args,
    uniqueTables.map((table) => ({ schema: table.schema, table: table.name })),
  );

  console.log("[6/6] Copying rows...");
  for (const table of uniqueTables) {
    const result = await copyTable(args, sourceProjectRef, table);
    if (result.skipped) {
      report.skippedTables.push(result);
      console.log(`- skipped ${result.schema}.${result.table}: ${result.reason}`);
      continue;
    }

    report.copiedTables.push(result);
    console.log(`- copied ${result.schema}.${result.table}: ${result.inserted}/${result.rowCount}`);
  }

  console.log("Verifying target counts...");
  for (const table of report.copiedTables) {
    const targetCount = await getTargetCount(args, table.schema, table.table);
    const verified = targetCount === table.rowCount;
    report.verification.push({
      schema: table.schema,
      table: table.table,
      sourceCount: table.rowCount,
      targetCount,
      verified,
    });
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = resolveReportPath(args);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const failures = report.verification.filter((entry) => !entry.verified);
  if (failures.length > 0) {
    console.error("Migration completed with verification mismatches.");
    console.error(`Report: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  console.log("Migration completed successfully.");
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
