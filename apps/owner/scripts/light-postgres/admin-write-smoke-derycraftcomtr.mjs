import process from "node:process";
import { Pool } from "pg";

function readEnv(name) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    cleanup: argv.includes("--cleanup"),
    store:
      argv.includes("--store") && argv[argv.indexOf("--store") + 1]
        ? argv[argv.indexOf("--store") + 1]
        : "derycraftcomtr",
    prefix:
      argv.includes("--prefix") && argv[argv.indexOf("--prefix") + 1]
        ? argv[argv.indexOf("--prefix") + 1]
        : "atlas-test",
  };
}

function resolveConnectionString() {
  const rawUrl =
    readEnv("ADMIN_LIGHT_POSTGRES_DATABASE_URL") ??
    readEnv("LIGHT_POSTGRES_DATABASE_URL");

  if (!rawUrl) {
    throw new Error("LIGHT_POSTGRES_DATABASE_URL tanimli degil.");
  }

  const databaseName =
    readEnv("ADMIN_LIGHT_POSTGRES_DATABASE_NAME") ??
    readEnv("LIGHT_POSTGRES_DATABASE_NAME");

  if (!databaseName) {
    return rawUrl;
  }

  const parsed = new URL(rawUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function resolveSsl() {
  const sslMode =
    readEnv("ADMIN_LIGHT_POSTGRES_DATABASE_SSLMODE") ??
    readEnv("LIGHT_POSTGRES_DATABASE_SSLMODE");

  return sslMode?.toLowerCase() === "disable"
    ? false
    : { rejectUnauthorized: false };
}

async function query(pool, text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function cleanupSmokeData(pool, prefix) {
  await pool.query("delete from public.products where slug like $1", [`${prefix}-%`]);
  await pool.query("delete from public.pages where slug like $1", [`${prefix}-%`]);
  await pool.query("delete from public.categories where slug like $1", [`${prefix}-%`]);
  await pool.query("delete from public.settings where key like $1", [`${prefix}:%`]);
}

async function run() {
  const args = parseArgs(process.argv);

  if (args.store !== "derycraftcomtr") {
    throw new Error("Bu smoke harness yalnizca derycraftcomtr icin tasarlandi.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slugPrefix = `${args.prefix}-${timestamp}`.toLowerCase();
  const settingKey = `${args.prefix}:${timestamp}:setting`;
  const categorySlug = `${slugPrefix}-category`;
  const pageSlug = `${slugPrefix}-page`;
  const productSlug = `${slugPrefix}-product`;
  const variantSku = `${slugPrefix}-sku`;

  const pool = new Pool({
    connectionString: resolveConnectionString(),
    ssl: resolveSsl(),
    max: 1,
    idleTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    application_name: "celebix-owner-admin-write-smoke",
  });

  try {
    if (!args.apply) {
      console.log(JSON.stringify({
        mode: "dry-run",
        store: args.store,
        plan: {
          settingKey,
          categorySlug,
          pageSlug,
          productSlug,
          variantSku,
          cleanupWith: `node apps/owner/scripts/light-postgres/admin-write-smoke-derycraftcomtr.mjs --apply --cleanup --prefix ${args.prefix}`,
        },
      }, null, 2));
      return;
    }

    if (args.cleanup) {
      await cleanupSmokeData(pool, args.prefix);
      console.log(JSON.stringify({
        success: true,
        mode: "cleanup",
        prefix: args.prefix,
      }, null, 2));
      return;
    }

    const settingPayload = {
      source: "admin-write-smoke",
      store: args.store,
      createdAt: new Date().toISOString(),
    };

    const insertedSetting = (
      await query(
        pool,
        `
          insert into public.settings (key, value)
          values ($1, $2::jsonb)
          on conflict (key)
          do update set value = excluded.value, updated_at = now()
          returning key, value, updated_at
        `,
        [settingKey, JSON.stringify(settingPayload)],
      )
    )[0] ?? null;

    const insertedCategory = (
      await query(
        pool,
        `
          insert into public.categories (
            name, slug, description, image, parent_id, sort_order,
            seo_title, seo_description, seo_keywords
          )
          values ($1, $2, $3, null, null, 9999, $4, $5, $6::text[])
          returning id, name, slug, sort_order
        `,
        [
          `Atlas Test Category ${timestamp}`,
          categorySlug,
          "Atlas smoke category",
          `Atlas Test Category ${timestamp}`,
          "Atlas smoke category description",
          ["atlas", "smoke", "category"],
        ],
      )
    )[0] ?? null;

    const insertedPage = (
      await query(
        pool,
        `
          insert into public.pages (
            name, slug, schema_type, icon, seo_title, seo_description,
            seo_keywords, faq, geo_data, is_active, sort_order
          )
          values ($1, $2, 'WebPage', 'FileText', $3, $4, $5::text[], '[]'::jsonb,
                  '{"keyTakeaways":[],"entities":[]}'::jsonb, true, 9999)
          returning id, name, slug, schema_type, is_active
        `,
        [
          `Atlas Test Page ${timestamp}`,
          pageSlug,
          `Atlas Test Page ${timestamp}`,
          "Atlas smoke page description",
          ["atlas", "smoke", "page"],
        ],
      )
    )[0] ?? null;

    const insertedProduct = (
      await query(
        pool,
        `
          insert into public.products (
            name, slug, description, short_description, images, images_v2,
            category, subcategory, tags, is_active, status, is_draft,
            brand, country_of_origin, seo_title, seo_description,
            seo_keywords, seo_robots, track_stock, shopify_metadata, shopify_metafields
          )
          values (
            $1, $2, $3, $4, $5::text[], $6::jsonb,
            $7, null, $8::text[], true, 'published', false,
            $9, $10, $11, $12,
            $13::text[], 'index,follow', true, '{}'::jsonb, '{}'::jsonb
          )
          returning id, name, slug, category, status, is_active
        `,
        [
          `Atlas Test Product ${timestamp}`,
          productSlug,
          "<p>Atlas smoke product</p>",
          "Atlas smoke short description",
          [],
          "[]",
          categorySlug,
          ["atlas", "smoke", "product"],
          "Atlas",
          "Türkiye",
          `Atlas Test Product ${timestamp}`,
          "Atlas smoke product description",
          ["atlas", "smoke", "product"],
        ],
      )
    )[0] ?? null;

    const insertedVariant = insertedProduct
      ? (
          await query(
            pool,
            `
              insert into public.product_variants (
                product_id, name, sku, price, original_price, stock, weight,
                images, unit, attributes, shopify_metadata
              )
              values (
                $1, $2, $3, $4, $5, $6, $7,
                $8::text[], $9, $10::jsonb, $11::jsonb
              )
              returning id, product_id, name, sku, price, stock
            `,
            [
              insertedProduct.id,
              `Atlas Test Variant ${timestamp}`,
              variantSku,
              199.9,
              249.9,
              7,
              "100",
              [],
              "adet",
              JSON.stringify([{ name: "Boyut", value: "100" }]),
              "{}",
            ],
          )
        )[0] ?? null
      : null;

    const updatedProduct = insertedProduct
      ? (
          await query(
            pool,
            `
              update public.products
              set
                short_description = $2,
                is_featured = true,
                updated_at = now()
              where id = $1
              returning id, slug, short_description, is_featured
            `,
            [
              insertedProduct.id,
              "Atlas smoke short description updated",
            ],
          )
        )[0] ?? null
      : null;

    const updatedVariant = insertedVariant
      ? (
          await query(
            pool,
            `
              update public.product_variants
              set
                price = $2,
                stock = $3
              where id = $1
              returning id, sku, price, stock
            `,
            [
              insertedVariant.id,
              209.9,
              11,
            ],
          )
        )[0] ?? null
      : null;

    const [readBackSetting, readBackCategory, readBackPage, readBackProduct, readBackVariants, storefrontVisibleProduct] = await Promise.all([
      query(pool, "select key, value from public.settings where key = $1 limit 1", [settingKey]),
      query(pool, "select id, slug, name from public.categories where slug = $1 limit 1", [categorySlug]),
      query(pool, "select id, slug, name from public.pages where slug = $1 limit 1", [pageSlug]),
      query(
        pool,
        `
          select id, slug, category, short_description, is_featured, status, is_active
          from public.products
          where slug = $1
          limit 1
        `,
        [productSlug],
      ),
      query(
        pool,
        `
          select id, product_id, sku, price, stock
          from public.product_variants
          where product_id = $1
          order by created_at asc, id asc
        `,
        [insertedProduct?.id ?? null],
      ),
      query(
        pool,
        `
          select id, slug
          from public.products
          where slug = $1
            and coalesce(is_active, true) = true
            and (status = 'published' or status is null)
          limit 1
        `,
        [productSlug],
      ),
    ]);

    console.log(JSON.stringify({
      success: true,
      mode: "apply",
      store: args.store,
      created: {
        setting: insertedSetting,
        category: insertedCategory,
        page: insertedPage,
        product: insertedProduct,
        variant: insertedVariant,
        updatedProduct,
        updatedVariant,
      },
      readBack: {
        setting: readBackSetting[0] ?? null,
        category: readBackCategory[0] ?? null,
        page: readBackPage[0] ?? null,
        product: readBackProduct[0] ?? null,
        variants: readBackVariants,
        storefrontVisibleProduct: storefrontVisibleProduct[0] ?? null,
      },
      cleanupHint: `node apps/owner/scripts/light-postgres/admin-write-smoke-derycraftcomtr.mjs --apply --cleanup --prefix ${args.prefix}`,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
