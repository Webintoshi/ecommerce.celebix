import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);
const Module = require("node:module");
const ts = require("typescript");

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

function toSqlLiteral(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Sonlu olmayan sayi SQL parametresi desteklenmiyor.");
    }

    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function inlineSqlParams(sql, params = []) {
  return params.reduce((current, value, index) => {
    const placeholder = new RegExp(`\\$${index + 1}(?!\\d)`, "g");
    return current.replace(placeholder, toSqlLiteral(value));
  }, sql);
}

function installTsRequireHook() {
  const previous = Module._extensions[".ts"];
  Module._extensions[".ts"] = function transpileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        esModuleInterop: true,
      },
      fileName: filename,
    });

    module._compile(outputText, filename);
  };

  return () => {
    if (previous) {
      Module._extensions[".ts"] = previous;
      return;
    }

    delete Module._extensions[".ts"];
  };
}

function loadAppLocalLightPostgresAdapter() {
  const adapterPath = path.join(
    repoRoot,
    "apps",
    "storefront-derycraftcomtr",
    "lib",
    "db",
    "light-postgres-public-read.ts",
  );

  if (!fs.existsSync(adapterPath)) {
    throw new Error(`App-local light_postgres adapter bulunamadi: ${adapterPath}`);
  }

  const restoreRequireHook = installTsRequireHook();

  try {
    return require(adapterPath);
  } finally {
    restoreRequireHook();
  }
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

function normalizeTargetProduct(product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    seo_title: product.seoTitle ?? null,
    seo_description: product.seoDescription ?? null,
    images: normalizeStringArray(product.images),
    images_v2: Array.isArray(product.imagesV2)
      ? product.imagesV2.map((entry) => normalizeJsonValue(entry))
      : [],
    sample_price: normalizeNumber(product.variants?.[0]?.price ?? null),
  };
}

function normalizeTargetVariant(variant, productSlugById) {
  return {
    id: variant.id,
    product_id: variant.productId,
    product_slug: productSlugById.get(variant.productId) ?? null,
    sku: variant.sku ?? null,
    barcode: variant.barcode ?? null,
    price: normalizeNumber(variant.price),
    stock: normalizeNumber(variant.stock),
    attributes: normalizeJsonValue(variant.rawAttributes),
  };
}

function normalizeTargetCategory(category) {
  return {
    slug: category.slug,
    name: category.name,
    seo_title: category.seoTitle ?? null,
    seo_description: category.seoDescription ?? null,
    seo_keywords: normalizeStringArray(category.seoKeywords),
    is_active: normalizeBoolean(category.isActive),
    sort_order: normalizeNumber(category.sortOrder) ?? 0,
  };
}

function normalizeTargetPage(page) {
  return {
    slug: page.slug,
    name: page.name,
    seo_title: page.seoTitle ?? null,
    seo_description: page.seoDescription ?? null,
    seo_keywords: normalizeStringArray(page.seoKeywords),
    is_active: normalizeBoolean(page.isActive),
    sort_order: normalizeNumber(page.sortOrder) ?? 0,
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
  const { createLightPostgresPublicReadAdapter } = loadAppLocalLightPostgresAdapter();

  const adapter = createLightPostgresPublicReadAdapter((sql, params = []) =>
    targetQueryRows(args, inlineSqlParams(sql, params)),
  );

  const sourceCounts = await collectSourceCounts(args, sourceProjectRef, tables.length ? tables : TABLE_NAMES);
  const sourceSamples = await collectSourceSamples(args, sourceProjectRef, settingsKeys);
  const [targetProducts, targetVariants, targetCategories, targetSettings, targetPages] = await Promise.all([
    adapter.listProducts(),
    adapter.listProductVariants(),
    adapter.listCategories(),
    adapter.getAllSettings(),
    adapter.listPages(),
  ]);

  const targetCounts = {
    products: targetProducts.length,
    product_variants: targetVariants.length,
    categories: targetCategories.length,
    settings: Object.keys(targetSettings).length,
    pages: targetPages.length,
  };

  const productBySlug = new Map(targetProducts.map((product) => [product.slug, product]));
  const productSlugById = new Map(targetProducts.map((product) => [product.id, product.slug]));
  const variantById = new Map(targetVariants.map((variant) => [variant.id, variant]));
  const categoryBySlug = new Map(targetCategories.map((category) => [category.slug, category]));
  const pageBySlug = new Map(targetPages.map((page) => [page.slug, page]));

  const targetSamples = {
    products: sourceSamples.products
      .map((sample) => productBySlug.get(sample.slug))
      .filter(Boolean)
      .map((product) => normalizeTargetProduct(product)),
    variants: sourceSamples.variants
      .map((sample) => variantById.get(sample.id))
      .filter(Boolean)
      .map((variant) => normalizeTargetVariant(variant, productSlugById)),
    categories: sourceSamples.categories
      .map((sample) => categoryBySlug.get(sample.slug))
      .filter(Boolean)
      .map((category) => normalizeTargetCategory(category)),
    settings: settingsKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(targetSettings, key))
      .sort()
      .map((key) => ({ key, value: normalizeJsonValue(targetSettings[key]) })),
    pages: sourceSamples.pages
      .map((sample) => pageBySlug.get(sample.slug))
      .filter(Boolean)
      .map((page) => normalizeTargetPage(page)),
    r2Urls: targetProducts
      .filter((product) =>
        normalizeStringArray(product.images).some(
          (imageUrl) =>
            imageUrl.toLowerCase().includes("r2.") ||
            imageUrl.toLowerCase().includes("/pub-") ||
            imageUrl.toLowerCase().includes("cloudflare"),
        ),
      )
      .slice(0, 3)
      .map((product) => ({
        slug: product.slug,
        images: normalizeStringArray(product.images),
      })),
    duplicateSku: Array.from(
      targetVariants.reduce((map, variant) => {
        if (!variant.sku || !variant.sku.trim()) {
          return map;
        }

        map.set(variant.sku, (map.get(variant.sku) ?? 0) + 1);
        return map;
      }, new Map()),
    )
      .filter(([, duplicateCount]) => duplicateCount > 1)
      .sort(([leftSku, leftCount], [rightSku, rightCount]) => {
        if (leftCount !== rightCount) {
          return rightCount - leftCount;
        }

        return leftSku.localeCompare(rightSku);
      })
      .map(([sku, duplicateCount]) => ({ sku, duplicate_count: duplicateCount })),
  };

  const r2Leak = detectWrongBucketLeak(sourceSamples.r2Urls, targetSamples.r2Urls);

  const report = {
    generatedAt: new Date().toISOString(),
    storeSlug: args.store,
    storeConfigPath,
    manifestPath,
    adapterPath: path.join(
      repoRoot,
      "apps",
      "storefront-derycraftcomtr",
      "lib",
      "db",
      "light-postgres-public-read.ts",
    ),
    counts: {
      source: sourceCounts,
      target: targetCounts,
      match: sameJson(sourceCounts, targetCounts),
    },
    samples: {
      source: {
        products: sourceSamples.products,
        variants: sourceSamples.variants,
        categories: sourceSamples.categories,
        settings: sourceSamples.settings,
        pages: sourceSamples.pages,
      },
      target: {
        products: targetSamples.products,
        variants: targetSamples.variants,
        categories: targetSamples.categories,
        settings: targetSamples.settings,
        pages: targetSamples.pages,
      },
      semanticMatch: {
        products: sameJson(sourceSamples.products, targetSamples.products),
        variants: sameJson(sourceSamples.variants, targetSamples.variants),
        categories: sameJson(sourceSamples.categories, targetSamples.categories),
        settings: sameJson(sourceSamples.settings, targetSamples.settings),
        pages: sameJson(sourceSamples.pages, targetSamples.pages),
      },
    },
    duplicateSku: {
      source: sourceSamples.duplicateSku,
      target: targetSamples.duplicateSku,
      preserved: sameJson(sourceSamples.duplicateSku, targetSamples.duplicateSku),
    },
    r2Urls: {
      source: sourceSamples.r2Urls,
      target: targetSamples.r2Urls,
      preserved: sameJson(sourceSamples.r2Urls, targetSamples.r2Urls),
      wrongBucketLeakDetected: r2Leak.wrongBucketLeakDetected,
      unexpectedUrls: r2Leak.unexpectedUrls,
    },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (args.reportPath) {
    const resolvedPath = path.resolve(process.cwd(), args.reportPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, output, "utf8");
    console.log(`App-local shadow compare raporu yazildi: ${resolvedPath}`);
    return;
  }

  process.stdout.write(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
