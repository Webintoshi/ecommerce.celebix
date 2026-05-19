import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const SUPABASE_MANAGEMENT_API_URL = "https://api.supabase.com/v1";

function parseArgs(argv) {
  const parsed = {
    store: "",
    manifestPath: "",
    reportPath: "",
    sourceBaseUrl: process.env.SOURCE_SUPABASE_BASE_URL || "",
    sourceRef: process.env.SOURCE_SUPABASE_PROJECT_REF || "",
    sourceBasicUser: process.env.SOURCE_SUPABASE_BASIC_USER || "",
    sourceBasicPassword: process.env.SOURCE_SUPABASE_BASIC_PASSWORD || "",
    sourceAccessToken: process.env.SUPABASE_ACCESS_TOKEN || "",
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

  if (!parsed.sourceBaseUrl && !parsed.sourceAccessToken) {
    throw new Error(
      "Read-only baseline icin SOURCE_SUPABASE_BASE_URL ya da SUPABASE_ACCESS_TOKEN gerekli.",
    );
  }

  if (parsed.sourceBaseUrl && (!parsed.sourceBasicUser || !parsed.sourceBasicPassword)) {
    throw new Error(
      "Self-hosted source icin SOURCE_SUPABASE_BASIC_USER ve SOURCE_SUPABASE_BASIC_PASSWORD gerekli.",
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
    storeConfig,
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
    manifest: readJson(resolvedPath),
    manifestPath: resolvedPath,
  };
}

function buildManagedHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function buildBasicHeaders(user, password) {
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
    body: JSON.stringify({ query, name }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Managed source query hatasi (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

async function selfHostedQuery(baseUrl, projectRef, user, password, query) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/platform/pg-meta/${projectRef}/query`, {
    method: "POST",
    headers: buildBasicHeaders(user, password),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Self-hosted source query hatasi (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

async function sourceQuery(args, sourceProjectRef, query, name) {
  if (args.sourceBaseUrl) {
    return selfHostedQuery(
      args.sourceBaseUrl,
      args.sourceRef || sourceProjectRef,
      args.sourceBasicUser,
      args.sourceBasicPassword,
      query,
    );
  }

  return managedQuery(args.sourceAccessToken, sourceProjectRef, query, name);
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function uniqueNonEmpty(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

async function collectTableCounts(args, sourceProjectRef, tables) {
  const counts = {};

  for (const table of tables) {
    const tableName = table.name;
    const rows = await sourceQuery(
      args,
      sourceProjectRef,
      `select count(*)::int as row_count from public.${quoteIdentifier(tableName)};`,
      `count_${tableName}`,
    );

    counts[tableName] = rows?.[0]?.row_count ?? 0;
  }

  return counts;
}

async function collectUniquenessChecks(args, sourceProjectRef) {
  const products = await sourceQuery(
    args,
    sourceProjectRef,
    `
      select slug, count(*)::int as duplicate_count
      from public.products
      group by slug
      having count(*) > 1
      order by duplicate_count desc, slug asc
      limit 10;
    `,
    "dup_products_slug",
  );

  const variants = await sourceQuery(
    args,
    sourceProjectRef,
    `
      select sku, count(*)::int as duplicate_count
      from public.product_variants
      where sku is not null and btrim(sku) <> ''
      group by sku
      having count(*) > 1
      order by duplicate_count desc, sku asc
      limit 10;
    `,
    "dup_variants_sku",
  );

  return {
    productSlugDuplicates: products,
    variantSkuDuplicates: variants,
  };
}

async function collectSamples(args, sourceProjectRef, manifest) {
  const productLimit = Number(manifest?.validation?.spotCheckCounts?.products || 3);
  const categoryLimit = Number(manifest?.validation?.spotCheckCounts?.categories || 2);
  const pageLimit = Number(manifest?.validation?.spotCheckCounts?.pages || 2);
  const requiredSettingsKeys = uniqueNonEmpty(manifest?.validation?.requiredSettingsKeys || []);

  const products = await sourceQuery(
    args,
    sourceProjectRef,
    `
      select slug, name, category, status, is_active,
             coalesce(array_length(images, 1), 0) as image_count,
             jsonb_array_length(coalesce(images_v2, '[]'::jsonb)) as image_v2_count
      from public.products
      order by created_at asc
      limit ${productLimit};
    `,
    "sample_products",
  );

  const categories = await sourceQuery(
    args,
    sourceProjectRef,
    `
      select slug, name, sort_order
      from public.categories
      order by sort_order asc, name asc
      limit ${categoryLimit};
    `,
    "sample_categories",
  );

  const pages = await sourceQuery(
    args,
    sourceProjectRef,
    `
      select slug, name, is_active, sort_order
      from public.pages
      order by sort_order asc, slug asc
      limit ${pageLimit};
    `,
    "sample_pages",
  );

  const settings = requiredSettingsKeys.length > 0
    ? await sourceQuery(
        args,
        sourceProjectRef,
        `
          select key,
                 case
                   when jsonb_typeof(value) = 'null' then false
                   else true
                 end as has_value
          from public.settings
          where key = any(array[${requiredSettingsKeys.map((key) => `'${key.replace(/'/g, "''")}'`).join(", ")}])
          order by key asc;
        `,
        "sample_settings_presence",
      )
    : [];

  const r2Urls = await sourceQuery(
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
      order by created_at asc
      limit 3;
    `,
    "sample_r2_urls",
  );

  return {
    products,
    categories,
    pages,
    settings,
    r2Urls,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const { storeConfig, storeConfigPath, sourceProjectRef } = resolveStoreConfig(args.store);
  const { manifest, manifestPath } = resolveManifest(args.store, args.manifestPath);

  const counts = await collectTableCounts(args, sourceProjectRef, manifest.tables || []);
  const uniqueness = await collectUniquenessChecks(args, sourceProjectRef);
  const samples = await collectSamples(args, sourceProjectRef, manifest);

  const report = {
    generatedAt: new Date().toISOString(),
    storeSlug: args.store,
    storeConfigPath,
    manifestPath,
    sourceProjectRef,
    sourceProvider: storeConfig?.supabase?.provider || "unknown",
    tableCounts: counts,
    uniqueness,
    samples,
    cutoverGuards: manifest.cutoverGuards || [],
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (args.reportPath) {
    const resolvedReportPath = path.resolve(process.cwd(), args.reportPath);
    fs.mkdirSync(path.dirname(resolvedReportPath), { recursive: true });
    fs.writeFileSync(resolvedReportPath, output, "utf8");
    console.log(`Baseline raporu yazildi: ${resolvedReportPath}`);
    return;
  }

  process.stdout.write(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
