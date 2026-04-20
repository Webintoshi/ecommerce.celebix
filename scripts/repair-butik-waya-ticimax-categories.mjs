import { createClient } from "@supabase/supabase-js";
import {
  buildAuditReport,
  fetchAndMapButikWayaFeed,
  getButikWayaTicimaxDefaults,
  readJson,
} from "./lib/butik-waya-ticimax.mjs";

function parseArgs(argv) {
  const defaults = getButikWayaTicimaxDefaults();
  const args = {
    storeSlug: "butik-waya",
    profile: defaults.profilePath,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--store-slug" && argv[index + 1]) {
      args.storeSlug = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--profile" && argv[index + 1]) {
      args.profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function toJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

async function resolveStoreCredentials(storeSlug) {
  const directStoreUrl =
    process.env.STORE_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const directStoreServiceRole =
    process.env.STORE_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (directStoreUrl && directStoreServiceRole) {
    return {
      source: "direct-store-env",
      storeUrl: directStoreUrl,
      storeServiceRoleKey: directStoreServiceRole,
    };
  }

  const ownerUrl = process.env.NEXT_PUBLIC_OWNER_SUPABASE_URL?.trim();
  const ownerServiceRoleKey = process.env.OWNER_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!ownerUrl || !ownerServiceRoleKey) {
    throw new Error(
      "Canlı repair için STORE_SUPABASE_URL + STORE_SUPABASE_SERVICE_ROLE_KEY veya NEXT_PUBLIC_OWNER_SUPABASE_URL + OWNER_SUPABASE_SERVICE_ROLE_KEY gerekli.",
    );
  }

  const ownerClient = createClient(ownerUrl, ownerServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: ownerStore, error: ownerStoreError } = await ownerClient
    .from("owner_stores")
    .select("id")
    .eq("slug", storeSlug)
    .maybeSingle();

  if (ownerStoreError) {
    throw new Error(`Owner store authority okunamadı: ${ownerStoreError.message}`);
  }

  if (!ownerStore?.id) {
    throw new Error(`Owner authority içinde store bulunamadı: ${storeSlug}`);
  }

  const { data: secretRow, error: secretError } = await ownerClient
    .from("owner_store_secrets")
    .select("supabase_url, supabase_service_role_key")
    .eq("store_id", ownerStore.id)
    .maybeSingle();

  if (secretError) {
    throw new Error(`Store secret authority okunamadı: ${secretError.message}`);
  }

  if (!secretRow?.supabase_url || !secretRow?.supabase_service_role_key) {
    throw new Error(`Store Supabase secret eksik: ${storeSlug}`);
  }

  return {
    source: "owner-secret-authority",
    storeUrl: secretRow.supabase_url,
    storeServiceRoleKey: secretRow.supabase_service_role_key,
  };
}

async function getCategoryBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, parent_id")
    .eq("slug", slug)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

async function ensureCategoryRecord(supabase, input) {
  if (!input.slug) {
    return null;
  }

  const existing = await getCategoryBySlug(supabase, input.slug);
  if (existing) {
    const updatePayload = {};
    if ((existing.parent_id || null) !== (input.parentId || null)) {
      updatePayload.parent_id = input.parentId || null;
    }
    if (!existing.name || existing.name.trim().length === 0 || existing.name !== input.name) {
      updatePayload.name = input.name;
    }
    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabase.from("categories").update(updatePayload).eq("id", existing.id);
      if (error) {
        throw error;
      }
    }
    return existing;
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      name: input.name,
      slug: input.slug,
      description: null,
      image: null,
      parent_id: input.parentId || null,
      sort_order: 0,
    })
    .select("id, slug, name, parent_id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureCategoryHierarchy(supabase, categoryPath) {
  let parentId = null;

  for (const segment of categoryPath) {
    const record = await ensureCategoryRecord(supabase, {
      slug: segment.slug,
      name: segment.name,
      parentId,
    });
    parentId = record?.id || null;
  }
}

function normalizeLookupKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildProductLookupIndex(products) {
  const bySlug = new Map();
  const byItemGroupId = new Map();

  for (const row of products || []) {
    if (row?.slug) {
      bySlug.set(normalizeLookupKey(row.slug), row);
    }

    const importSource = toJsonObject(row?.shopify_metadata).celebix_import_source;
    const itemGroupId = normalizeLookupKey(toJsonObject(importSource).itemGroupId);
    if (itemGroupId) {
      byItemGroupId.set(itemGroupId, row);
    }
  }

  return { bySlug, byItemGroupId };
}

function resolveProductRow(lookup, mappedFeedItem) {
  const slugMatch = lookup.bySlug.get(normalizeLookupKey(mappedFeedItem.slug));
  if (slugMatch) {
    return { row: slugMatch, source: "slug" };
  }

  const itemGroupId = normalizeLookupKey(mappedFeedItem.itemGroupId);
  if (itemGroupId) {
    const itemGroupMatch = lookup.byItemGroupId.get(itemGroupId);
    if (itemGroupMatch) {
      return { row: itemGroupMatch, source: "itemGroupId" };
    }
  }

  return { row: null, source: null };
}

function mergeMetadata(existingMetadata, mappedFeedItem) {
  const metadata = toJsonObject(existingMetadata);
  const existingImportSource = toJsonObject(metadata.celebix_import_source);

  metadata.celebix_import_source = {
    ...existingImportSource,
    kind: "xml_feed",
    rawCategoryPath: mappedFeedItem.primaryPath,
    itemGroupId: mappedFeedItem.itemGroupId || existingImportSource.itemGroupId || null,
  };

  metadata.celebix_category_hierarchy = {
    categorySlug: mappedFeedItem.category,
    subcategorySlug: mappedFeedItem.subcategory,
    path: mappedFeedItem.categoryPath.map((segment) => ({
      slug: segment.slug,
      name: segment.name,
    })),
  };

  return metadata;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = readJson(args.profile);
  const parsedFeed = await fetchAndMapButikWayaFeed(profile);
  const audit = buildAuditReport(profile, parsedFeed);

  if (audit.unmappedItemCount > 0) {
    throw new Error(
      `Repair durduruldu. ${audit.unmappedItemCount} ürün hâlâ kategori mapping dışında.`,
    );
  }

  const result = {
    storeSlug: args.storeSlug,
    dryRun: args.dryRun,
    totalFeedItems: audit.totalItems,
    matchedProducts: 0,
    matchedBySlug: 0,
    matchedByItemGroupId: 0,
    updatedProducts: 0,
    skippedProducts: 0,
    failedProducts: 0,
    categoriesEnsured: 0,
    errors: [],
  };

  const feedBySlug = new Map(parsedFeed.mappedItems.map((item) => [item.slug, item]));

  if (args.dryRun) {
    result.matchedProducts = feedBySlug.size;
    result.updatedProducts = feedBySlug.size;
    result.matchedBySlug = feedBySlug.size;
    result.categoriesEnsured = parsedFeed.mappedItems.reduce(
      (total, item) => total + item.categoryPath.length,
      0,
    );
    console.log(JSON.stringify({ audit, result }, null, 2));
    return;
  }

  const credentials = await resolveStoreCredentials(args.storeSlug);
  const supabase = createClient(credentials.storeUrl, credentials.storeServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: allProducts, error: productFetchError } = await supabase
    .from("products")
    .select("id, slug, name, category, subcategory, shopify_metadata");

  if (productFetchError) {
    throw productFetchError;
  }

  const lookup = buildProductLookupIndex(allProducts);

  for (const mappedFeedItem of feedBySlug.values()) {
    const match = resolveProductRow(lookup, mappedFeedItem);
    if (!match.row) {
      result.skippedProducts += 1;
      continue;
    }

    result.matchedProducts += 1;
    if (match.source === "itemGroupId") {
      result.matchedByItemGroupId += 1;
    } else {
      result.matchedBySlug += 1;
    }

    try {
      await ensureCategoryHierarchy(supabase, mappedFeedItem.categoryPath);
      result.categoriesEnsured += mappedFeedItem.categoryPath.length;

      const mergedMetadata = mergeMetadata(match.row.shopify_metadata, mappedFeedItem);
      const { error: updateError } = await supabase
        .from("products")
        .update({
          category: mappedFeedItem.category,
          subcategory: mappedFeedItem.subcategory,
          shopify_metadata: mergedMetadata,
        })
        .eq("id", match.row.id);

      if (updateError) {
        throw updateError;
      }

      result.updatedProducts += 1;
    } catch (error) {
      result.failedProducts += 1;
      result.errors.push(
        `${mappedFeedItem.slug}: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        credentialsSource: credentials.source,
        audit,
        result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
