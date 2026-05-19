import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const DEFAULT_TABLE_ORDER = [
  "categories",
  "products",
  "product_variants",
  "settings",
  "pages",
];

function parseArgs(argv) {
  const parsed = {
    store: "",
    manifestPath: "",
    reportPath: "",
    apply: false,
    sourceBaseUrl: process.env.SOURCE_SUPABASE_BASE_URL || "",
    sourceRef: process.env.SOURCE_SUPABASE_PROJECT_REF || "",
    sourceBasicUser: process.env.SOURCE_SUPABASE_BASIC_USER || "",
    sourceBasicPassword: process.env.SOURCE_SUPABASE_BASIC_PASSWORD || "",
    targetSshHost: process.env.TARGET_PG_SSH_HOST || "",
    targetSshUser: process.env.TARGET_PG_SSH_USER || "root",
    targetSshKeyPath: process.env.TARGET_PG_SSH_KEY_PATH || "",
    targetDockerContainer: process.env.TARGET_PG_DOCKER_CONTAINER || "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--store" && next) {
      parsed.store = next;
      index += 1;
      continue;
    }

    if (arg === "--manifest" && next) {
      parsed.manifestPath = next;
      index += 1;
      continue;
    }

    if (arg === "--report-path" && next) {
      parsed.reportPath = next;
      index += 1;
      continue;
    }

    if (arg === "--apply") {
      parsed.apply = true;
      continue;
    }
  }

  if (!parsed.store) {
    throw new Error("--store gerekli. Ornek: --store derycraftcomtr");
  }

  if (!parsed.sourceBaseUrl) {
    throw new Error("SOURCE_SUPABASE_BASE_URL gerekli.");
  }

  if (!parsed.sourceBasicUser || !parsed.sourceBasicPassword) {
    throw new Error("SOURCE_SUPABASE_BASIC_USER ve SOURCE_SUPABASE_BASIC_PASSWORD gerekli.");
  }

  if (!parsed.targetSshHost || !parsed.targetSshKeyPath || !parsed.targetDockerContainer) {
    throw new Error(
      "TARGET_PG_SSH_HOST, TARGET_PG_SSH_KEY_PATH ve TARGET_PG_DOCKER_CONTAINER gerekli.",
    );
  }

  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveStoreConfig(storeSlug) {
  const storeConfigPath = path.join(repoRoot, "stores", storeSlug, "store.config.json");

  if (!fs.existsSync(storeConfigPath)) {
    throw new Error(`Store config bulunamadi: ${storeConfigPath}`);
  }

  const storeConfig = readJson(storeConfigPath);
  const sourceProjectRef = storeConfig?.supabase?.projectRef?.trim();

  if (!sourceProjectRef) {
    throw new Error(`${storeSlug} icin source Supabase projectRef tanimli degil.`);
  }

  return {
    storeConfigPath,
    sourceProjectRef,
  };
}

function resolveManifest(storeSlug, manifestPath) {
  const resolvedPath = manifestPath
    ? path.resolve(process.cwd(), manifestPath)
    : path.join(__dirname, "manifests", `${storeSlug}.json`);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Manifest bulunamadi: ${resolvedPath}`);
  }

  return {
    manifestPath: resolvedPath,
    manifest: readJson(resolvedPath),
  };
}

function buildBasicHeaders(user, password) {
  const token = Buffer.from(`${user}:${password}`, "utf8").toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
  };
}

async function sourceQuery(args, sourceProjectRef, query) {
  const response = await fetch(
    `${args.sourceBaseUrl.replace(/\/+$/, "")}/api/platform/pg-meta/${args.sourceRef || sourceProjectRef}/query`,
    {
      method: "POST",
      headers: buildBasicHeaders(args.sourceBasicUser, args.sourceBasicPassword),
      body: JSON.stringify({ query }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Source pg-meta query hatasi (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

function runRemoteScript(args, script) {
  const result = spawnSync(
    "ssh",
    [
      "-o",
      "StrictHostKeyChecking=no",
      "-i",
      args.targetSshKeyPath,
      `${args.targetSshUser}@${args.targetSshHost}`,
      "bash -s",
    ],
    {
      input: script,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Remote command failed").trim());
  }

  return result.stdout || "";
}

function targetExecuteSql(args, sql) {
  const script = `set -euo pipefail
container=${shellQuote(args.targetDockerContainer)}
docker exec -i "$container" sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; psql -v ON_ERROR_STOP=1 -X -A -t -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
${sql}
SQL
`;

  return runRemoteScript(args, script);
}

function targetQueryRows(args, sql) {
  const normalizedSql = String(sql).trim().replace(/;+\s*$/u, "");
  const wrapped = `
select encode(
  convert_to(
    coalesce(json_agg(result_row)::text, '[]'),
    'utf8'
  ),
  'base64'
)
from (
${normalizedSql}
) as result_row
`;
  const output = targetExecuteSql(args, wrapped).trim();
  if (!output) {
    return [];
  }
  const decoded = Buffer.from(output, "base64").toString("utf8");
  return JSON.parse(decoded);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function jsonLiteral(value) {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

async function collectSourceCounts(args, sourceProjectRef, tables) {
  const counts = {};

  for (const table of tables) {
    const rows = await sourceQuery(
      args,
      sourceProjectRef,
      `select count(*)::int as row_count from public.${table};`,
    );
    counts[table] = rows?.[0]?.row_count ?? 0;
  }

  return counts;
}

function collectTargetCounts(args, tables) {
  const sql = tables
    .map((table) => `select '${table}'::text as table_name, count(*)::int as row_count from public.${table}`)
    .join("\nunion all\n");
  const rows = targetQueryRows(args, sql);
  return Object.fromEntries(rows.map((row) => [row.table_name, row.row_count]));
}

async function fetchSourceRows(args, sourceProjectRef, table) {
  let orderByClause = " order by id asc";

  if (table === "settings") {
    orderByClause = " order by key asc";
  } else if (table === "pages") {
    orderByClause = " order by sort_order asc, id asc";
  } else if (table === "categories") {
    orderByClause = " order by sort_order asc, id asc";
  } else if (table === "products" || table === "product_variants") {
    orderByClause = " order by created_at asc, id asc";
  }

  return sourceQuery(args, sourceProjectRef, `select * from public.${table}${orderByClause};`);
}

function buildImportSql(payloadByTable) {
  const statements = [
    "begin;",
    "truncate table public.product_variants, public.products, public.categories, public.settings, public.pages restart identity cascade;",
  ];

  for (const table of DEFAULT_TABLE_ORDER) {
    const rows = payloadByTable[table] || [];
    if (rows.length === 0) {
      continue;
    }

    statements.push(
      `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, ${jsonLiteral(rows)});`,
    );
  }

  statements.push("commit;");
  return statements.join("\n");
}

async function collectSourceDuplicateSkuReport(args, sourceProjectRef) {
  return sourceQuery(
    args,
    sourceProjectRef,
    `
      select sku, count(*)::int as duplicate_count
      from public.product_variants
      where sku is not null and btrim(sku) <> ''
      group by sku
      having count(*) > 1
      order by duplicate_count desc, sku asc
      limit 20;
    `,
  );
}

function collectTargetDuplicateSkuReport(args) {
  return targetQueryRows(
    args,
    `
      select sku, count(*)::int as duplicate_count
      from public.product_variants
      where sku is not null and btrim(sku) <> ''
      group by sku
      having count(*) > 1
      order by duplicate_count desc, sku asc
      limit 20;
    `,
  );
}

async function collectSourceSamples(args, sourceProjectRef) {
  const [products, categories, pages, settings, variants] = await Promise.all([
    sourceQuery(
      args,
      sourceProjectRef,
      `
        select p.id, p.name, p.slug, p.seo_title, p.seo_description, p.images, p.images_v2,
               (
                 select v.price
                 from public.product_variants v
                 where v.product_id = p.id
                 order by v.created_at asc, v.id asc
                 limit 1
               ) as sample_price
        from public.products p
        order by p.created_at asc, p.id asc
        limit 3;
      `,
    ),
    sourceQuery(
      args,
      sourceProjectRef,
      `
        select slug, name, null::text as seo_title, null::text as seo_description
        from public.categories
        order by sort_order asc, id asc
        limit 2;
      `,
    ),
    sourceQuery(
      args,
      sourceProjectRef,
      `
        select slug, name, seo_title, seo_description
        from public.pages
        order by sort_order asc, id asc
        limit 2;
      `,
    ),
    sourceQuery(
      args,
      sourceProjectRef,
      `
        select key, value
        from public.settings
        where key in ('store_info', 'seo_settings', 'announcement_bar')
        order by key asc;
      `,
    ),
    sourceQuery(
      args,
      sourceProjectRef,
      `
        select v.id, v.product_id, p.slug as product_slug, v.sku, v.barcode, v.price, v.stock, v.attributes
        from public.product_variants v
        join public.products p on p.id = v.product_id
        order by p.created_at asc, v.created_at asc, v.id asc
        limit 3;
      `,
    ),
  ]);

  return { products, categories, pages, settings, variants };
}

function collectTargetSamples(args) {
  const products = targetQueryRows(
    args,
    `
      select p.id, p.name, p.slug, p.seo_title, p.seo_description, p.images, p.images_v2,
             (
               select v.price
               from public.product_variants v
               where v.product_id = p.id
               order by v.created_at asc, v.id asc
               limit 1
             ) as sample_price
      from public.products p
      order by p.created_at asc, p.id asc
      limit 3;
    `,
  );
  const categories = targetQueryRows(
    args,
    `
      select slug, name, seo_title, seo_description
      from public.categories
      order by sort_order asc, id asc
      limit 2;
    `,
  );
  const pages = targetQueryRows(
    args,
    `
      select slug, name, seo_title, seo_description
      from public.pages
      order by sort_order asc, id asc
      limit 2;
    `,
  );
  const settings = targetQueryRows(
    args,
    `
      select key, value
      from public.settings
      where key in ('store_info', 'seo_settings', 'announcement_bar')
      order by key asc;
    `,
  );
  const variants = targetQueryRows(
    args,
    `
      select v.id, v.product_id, p.slug as product_slug, v.sku, v.barcode, v.price, v.stock, v.attributes
      from public.product_variants v
      join public.products p on p.id = v.product_id
      order by p.created_at asc, v.created_at asc, v.id asc
      limit 3;
    `,
  );

  return { products, categories, pages, settings, variants };
}

async function collectSourceR2Urls(args, sourceProjectRef) {
  return sourceQuery(
    args,
    sourceProjectRef,
    `
      select slug, images
      from public.products
      where exists (
        select 1
        from unnest(coalesce(images, '{}'::text[])) as image_url
        where image_url ilike '%r2.%'
           or image_url ilike '%/pub-%'
           or image_url ilike '%cloudflare%'
      )
      order by created_at asc, id asc
      limit 3;
    `,
  );
}

function collectTargetR2Urls(args) {
  return targetQueryRows(
    args,
    `
      select slug, images
      from public.products
      where exists (
        select 1
        from unnest(coalesce(images, '{}'::text[])) as image_url
        where image_url ilike '%r2.%'
           or image_url ilike '%/pub-%'
           or image_url ilike '%cloudflare%'
      )
      order by created_at asc, id asc
      limit 3;
    `,
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const args = parseArgs(process.argv);
  const { storeConfigPath, sourceProjectRef } = resolveStoreConfig(args.store);
  const { manifestPath, manifest } = resolveManifest(args.store, args.manifestPath);
  const tables = (manifest.tables || []).map((entry) => entry.name).filter(Boolean);

  const sourceCounts = await collectSourceCounts(args, sourceProjectRef, tables);
  const targetCountsBefore = collectTargetCounts(args, tables);
  const targetIsEmpty = Object.values(targetCountsBefore).every((value) => Number(value) === 0);

  if (!targetIsEmpty && args.apply) {
    throw new Error("Target light_postgres DB bos degil. Duplicate import engellendi.");
  }

  const payloadByTable = {};
  for (const table of DEFAULT_TABLE_ORDER) {
    payloadByTable[table] = await fetchSourceRows(args, sourceProjectRef, table);
  }

  if (args.apply) {
    targetExecuteSql(args, buildImportSql(payloadByTable));
  }

  const targetCountsAfter = collectTargetCounts(args, tables);
  const sourceSamples = await collectSourceSamples(args, sourceProjectRef);
  const targetSamples = collectTargetSamples(args);
  const sourceR2Urls = await collectSourceR2Urls(args, sourceProjectRef);
  const targetR2Urls = collectTargetR2Urls(args);
  const sourceDuplicateSkus = await collectSourceDuplicateSkuReport(args, sourceProjectRef);
  const targetDuplicateSkus = collectTargetDuplicateSkuReport(args);

  const report = {
    generatedAt: new Date().toISOString(),
    storeSlug: args.store,
    mode: args.apply ? "apply" : "dry-run",
    storeConfigPath,
    manifestPath,
    sourceProjectRef,
    precheck: {
      sourceCounts,
      targetCountsBefore,
      targetIsEmpty,
    },
    import: {
      applied: args.apply,
      wroteTables: args.apply ? DEFAULT_TABLE_ORDER : [],
    },
    compare: {
      targetCountsAfter,
      countsMatch: sameJson(sourceCounts, targetCountsAfter),
    },
    samples: {
      source: sourceSamples,
      target: targetSamples,
      productSpotCheckMatch: sameJson(sourceSamples.products, targetSamples.products),
      categorySpotCheckMatch: sameJson(sourceSamples.categories, targetSamples.categories),
      pageSpotCheckMatch: sameJson(sourceSamples.pages, targetSamples.pages),
      settingsSpotCheckMatch: sameJson(sourceSamples.settings, targetSamples.settings),
      variantSpotCheckMatch: sameJson(sourceSamples.variants, targetSamples.variants),
    },
    duplicateSku: {
      source: sourceDuplicateSkus,
      target: targetDuplicateSkus,
      preserved: sameJson(sourceDuplicateSkus, targetDuplicateSkus),
    },
    r2Urls: {
      source: sourceR2Urls,
      target: targetR2Urls,
      preserved: sameJson(sourceR2Urls, targetR2Urls),
    },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (args.reportPath) {
    const resolvedPath = path.resolve(process.cwd(), args.reportPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, output, "utf8");
    console.log(`Import raporu yazildi: ${resolvedPath}`);
    return;
  }

  process.stdout.write(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
