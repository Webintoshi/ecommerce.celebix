import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const DEFAULT_SETTINGS_SPOT_KEYS = ["store_info", "seo_settings", "announcement_bar"];
const TABLE_NAMES = ["products", "product_variants", "categories", "settings", "pages"];

function parseArgs(argv) {
  const parsed = {
    store: "",
    manifestPath: "",
    reportPath: "",
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
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

  return JSON.parse(Buffer.from(output, "base64").toString("utf8"));
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

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return ["true", "t", "1", "yes", "y"].includes(value.trim().toLowerCase());
  }

  return false;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string" && entry.length > 0);
}

function normalizeJsonValue(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).map(([key, entry]) => [key, normalizeJsonValue(entry)]);
    return Object.fromEntries(entries);
  }

  return null;
}

function normalizeProductSampleRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    seo_title: row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
    images: normalizeStringArray(row.images),
    images_v2: Array.isArray(row.images_v2) ? row.images_v2.map((entry) => normalizeJsonValue(entry)) : [],
    sample_price: normalizeNumber(row.sample_price),
  }));
}

function normalizeVariantSampleRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    product_slug: row.product_slug,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    price: normalizeNumber(row.price),
    stock: normalizeNumber(row.stock),
    attributes: normalizeJsonValue(row.attributes),
  }));
}

function normalizeCategorySampleRows(rows) {
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    seo_title: row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
    seo_keywords: normalizeStringArray(row.seo_keywords),
    is_active: row.is_active === undefined ? true : normalizeBoolean(row.is_active),
    sort_order: normalizeNumber(row.sort_order) ?? 0,
  }));
}

function normalizeSettingSampleRows(rows) {
  return rows.map((row) => ({
    key: row.key,
    value: normalizeJsonValue(row.value),
  }));
}

function normalizePageSampleRows(rows) {
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    seo_title: row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
    seo_keywords: normalizeStringArray(row.seo_keywords),
    is_active: normalizeBoolean(row.is_active),
    sort_order: normalizeNumber(row.sort_order) ?? 0,
  }));
}

function normalizeUrlRows(rows) {
  return rows.map((row) => ({
    slug: row.slug,
    images: normalizeStringArray(row.images),
  }));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function collectSourceSamples(args, sourceProjectRef, settingsKeys) {
  const safeSettingKeys = settingsKeys.map((key) => `'${String(key).replace(/'/g, "''")}'`).join(", ");
  const [products, variants, categories, settings, pages, r2Urls, duplicateSku] = await Promise.all([
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
        select v.id, v.product_id, p.slug as product_slug, v.sku, v.barcode, v.price, v.stock, v.attributes
        from public.product_variants v
        join public.products p on p.id = v.product_id
        order by p.created_at asc, v.created_at asc, v.id asc
        limit 3;
      `,
    ),
    sourceQuery(
      args,
      sourceProjectRef,
      `
        select slug, name,
               null::text as seo_title,
               null::text as seo_description,
               '{}'::text[] as seo_keywords,
               true as is_active,
               coalesce(sort_order, 0) as sort_order
        from public.categories
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
        where key in (${safeSettingKeys})
        order by key asc;
      `,
    ),
    sourceQuery(
      args,
      sourceProjectRef,
      `
        select slug, name, seo_title, seo_description, coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
               coalesce(is_active, true) as is_active, coalesce(sort_order, 0) as sort_order
        from public.pages
        order by sort_order asc, id asc
        limit 2;
      `,
    ),
    sourceQuery(
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
    ),
    sourceQuery(
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
    ),
  ]);

  return {
    products: normalizeProductSampleRows(products),
    variants: normalizeVariantSampleRows(variants),
    categories: normalizeCategorySampleRows(categories),
    settings: normalizeSettingSampleRows(settings),
    pages: normalizePageSampleRows(pages),
    r2Urls: normalizeUrlRows(r2Urls),
    duplicateSku,
  };
}

function collectTargetSamples(args, settingsKeys) {
  const safeSettingKeys = settingsKeys.map((key) => `'${String(key).replace(/'/g, "''")}'`).join(", ");
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
  const categories = targetQueryRows(
    args,
    `
      select slug, name,
             coalesce(seo_title, null) as seo_title,
             coalesce(seo_description, null) as seo_description,
             coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             true as is_active,
             coalesce(sort_order, 0) as sort_order
      from public.categories
      order by sort_order asc, id asc
      limit 2;
    `,
  );
  const settings = targetQueryRows(
    args,
    `
      select key, value
      from public.settings
      where key in (${safeSettingKeys})
      order by key asc;
    `,
  );
  const pages = targetQueryRows(
    args,
    `
      select slug, name, seo_title, seo_description, coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             coalesce(is_active, true) as is_active, coalesce(sort_order, 0) as sort_order
      from public.pages
      order by sort_order asc, id asc
      limit 2;
    `,
  );
  const r2Urls = targetQueryRows(
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
  const duplicateSku = targetQueryRows(
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

  return {
    products: normalizeProductSampleRows(products),
    variants: normalizeVariantSampleRows(variants),
    categories: normalizeCategorySampleRows(categories),
    settings: normalizeSettingSampleRows(settings),
    pages: normalizePageSampleRows(pages),
    r2Urls: normalizeUrlRows(r2Urls),
    duplicateSku,
  };
}

function detectWrongBucketLeak(sourceUrlRows, targetUrlRows) {
  const sourceUrls = new Set(sourceUrlRows.flatMap((row) => row.images));
  const targetUrls = targetUrlRows.flatMap((row) => row.images);
  const unexpectedUrls = targetUrls.filter((url) => !sourceUrls.has(url));

  return {
    wrongBucketLeakDetected: unexpectedUrls.length > 0,
    unexpectedUrls,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const { storeConfigPath, sourceProjectRef } = resolveStoreConfig(args.store);
  const { manifestPath, manifest } = resolveManifest(args.store, args.manifestPath);
  const tables = (manifest.tables || []).map((entry) => entry.name).filter(Boolean);
  const settingsKeys = manifest.validation?.requiredSettingsKeys?.slice(0, 3) || DEFAULT_SETTINGS_SPOT_KEYS;

  const sourceCounts = await collectSourceCounts(args, sourceProjectRef, tables);
  const targetCounts = collectTargetCounts(args, tables);
  const samples = {
    source: await collectSourceSamples(args, sourceProjectRef, settingsKeys),
    target: collectTargetSamples(args, settingsKeys),
  };
  const r2Leak = detectWrongBucketLeak(samples.source.r2Urls, samples.target.r2Urls);

  const report = {
    generatedAt: new Date().toISOString(),
    storeSlug: args.store,
    storeConfigPath,
    manifestPath,
    counts: {
      source: sourceCounts,
      target: targetCounts,
      match: sameJson(sourceCounts, targetCounts),
    },
    samples: {
      source: {
        products: samples.source.products,
        variants: samples.source.variants,
        categories: samples.source.categories,
        settings: samples.source.settings,
        pages: samples.source.pages,
      },
      target: {
        products: samples.target.products,
        variants: samples.target.variants,
        categories: samples.target.categories,
        settings: samples.target.settings,
        pages: samples.target.pages,
      },
      semanticMatch: {
        products: sameJson(samples.source.products, samples.target.products),
        variants: sameJson(samples.source.variants, samples.target.variants),
        categories: sameJson(samples.source.categories, samples.target.categories),
        settings: sameJson(samples.source.settings, samples.target.settings),
        pages: sameJson(samples.source.pages, samples.target.pages),
      },
    },
    duplicateSku: {
      source: samples.source.duplicateSku,
      target: samples.target.duplicateSku,
      preserved: sameJson(samples.source.duplicateSku, samples.target.duplicateSku),
    },
    r2Urls: {
      source: samples.source.r2Urls,
      target: samples.target.r2Urls,
      preserved: sameJson(samples.source.r2Urls, samples.target.r2Urls),
      wrongBucketLeakDetected: r2Leak.wrongBucketLeakDetected,
      unexpectedUrls: r2Leak.unexpectedUrls,
    },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (args.reportPath) {
    const resolvedPath = path.resolve(process.cwd(), args.reportPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, output, "utf8");
    console.log(`Shadow compare raporu yazildi: ${resolvedPath}`);
    return;
  }

  process.stdout.write(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
