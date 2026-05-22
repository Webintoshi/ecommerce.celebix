import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateSameOriginRequest } from "@celebix/platform-config/src/http-security";
import { createServerClient } from "@/lib/supabase";

const SYNC_SECRET = "15c3a636b18920038b2945721c7adb6937a470dc33399a5a";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const SYNCED_SETTING_KEYS = [
  "announcement_bar",
  "hero_banners",
  "homepage_curation",
  "marquee_settings",
  "product_listing_order",
  "promo_banners",
  "seo_settings",
  "store_info",
  "variant_attributes_registry",
] as const;

type JsonRecord = Record<string, unknown>;

type ClonePayload = {
  mode?: string;
  meta?: JsonRecord;
  data?: {
    categories?: JsonRecord[];
    pages?: JsonRecord[];
    products?: JsonRecord[];
    reviews?: JsonRecord[];
    variants?: JsonRecord[];
  };
  settings?: Partial<Record<(typeof SYNCED_SETTING_KEYS)[number], JsonRecord | null>>;
};

function timingSafeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readProvidedSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return request.headers.get("x-derycraft-sync-key")?.trim() || "";
}

function requireSyncAccess(request: NextRequest) {
  const originCheck = validateSameOriginRequest(request);
  if (!originCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "Bu senkron istekleri ayni origin uzerinden gelmelidir." },
      { status: 403 },
    );
  }

  const providedSecret = readProvidedSecret(request);
  if (!providedSecret || !timingSafeEquals(providedSecret, SYNC_SECRET)) {
    return NextResponse.json({ success: false, error: "Yetkisiz senkron istegi." }, { status: 401 });
  }

  return null;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJsonRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isJsonRecord);
}

function sortCategoriesForInsert(categories: JsonRecord[]) {
  const byId = new Map<string, JsonRecord>();
  for (const category of categories) {
    if (typeof category.id === "string" && category.id.trim().length > 0) {
      byId.set(category.id, category);
    }
  }

  const depthCache = new Map<string, number>();

  const resolveDepth = (category: JsonRecord, stack = new Set<string>()): number => {
    const id = typeof category.id === "string" ? category.id : "";
    if (!id) {
      return 0;
    }

    const cachedDepth = depthCache.get(id);
    if (cachedDepth !== undefined) {
      return cachedDepth;
    }

    if (stack.has(id)) {
      return 0;
    }

    stack.add(id);

    const parentId = typeof category.parent_id === "string" ? category.parent_id : null;
    const parent = parentId ? byId.get(parentId) : null;
    const depth = parent ? resolveDepth(parent, stack) + 1 : 0;

    depthCache.set(id, depth);
    stack.delete(id);
    return depth;
  };

  return [...categories].sort((left, right) => {
    const leftDepth = resolveDepth(left);
    const rightDepth = resolveDepth(right);

    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    const leftSortOrder = typeof left.sort_order === "number" ? left.sort_order : Number.MAX_SAFE_INTEGER;
    const rightSortOrder = typeof right.sort_order === "number" ? right.sort_order : Number.MAX_SAFE_INTEGER;

    if (leftSortOrder !== rightSortOrder) {
      return leftSortOrder - rightSortOrder;
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "tr");
  });
}

function chunkRows<T>(rows: T[], size = 50) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

async function deleteAllRows(
  supabase: ReturnType<typeof createServerClient>,
  table: string,
  idColumn = "id",
) {
  const { error } = await supabase.from(table).delete().neq(idColumn, ZERO_UUID);
  if (error) {
    throw new Error(`${table} temizlenemedi: ${error.message}`);
  }
}

async function upsertRows(
  supabase: ReturnType<typeof createServerClient>,
  table: string,
  rows: JsonRecord[],
  onConflict: string,
) {
  if (rows.length === 0) {
    return;
  }

  for (const chunk of chunkRows(rows)) {
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`${table} yazilamadi: ${error.message}`);
    }
  }
}

async function countRows(supabase: ReturnType<typeof createServerClient>, table: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) {
    return null;
  }

  return count ?? 0;
}

export async function POST(request: NextRequest) {
  const unauthorizedResponse = requireSyncAccess(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { success: false, error: "SUPABASE_SERVICE_ROLE_KEY bulunamadi. Senkron baslatilmadi." },
      { status: 500 },
    );
  }

  let payload: ClonePayload;

  try {
    payload = (await request.json()) as ClonePayload;
  } catch {
    return NextResponse.json({ success: false, error: "Gecersiz JSON payload." }, { status: 400 });
  }

  if (payload.mode !== "replace-all") {
    return NextResponse.json(
      { success: false, error: "Bu endpoint yalnizca replace-all modu ile calisir." },
      { status: 400 },
    );
  }

  const categories = sortCategoriesForInsert(toJsonRecordArray(payload.data?.categories));
  const pages = toJsonRecordArray(payload.data?.pages);
  const products = toJsonRecordArray(payload.data?.products);
  const variants = toJsonRecordArray(payload.data?.variants);
  const reviews = toJsonRecordArray(payload.data?.reviews);
  const settingRows = SYNCED_SETTING_KEYS.flatMap((key) =>
    payload.settings && key in payload.settings
      ? [{ key, value: payload.settings[key] ?? null }]
      : [],
  );

  const supabase = createServerClient();

  try {
    await deleteAllRows(supabase, "product_reviews");
    await deleteAllRows(supabase, "product_variants");
    await deleteAllRows(supabase, "products");
    await deleteAllRows(supabase, "categories");
    await deleteAllRows(supabase, "pages");

    await upsertRows(supabase, "categories", categories, "id");
    await upsertRows(supabase, "pages", pages, "id");
    await upsertRows(supabase, "products", products, "id");
    await upsertRows(supabase, "product_variants", variants, "id");
    await upsertRows(supabase, "product_reviews", reviews, "id");
    await upsertRows(supabase, "settings", settingRows as JsonRecord[], "key");

    const [categoryCount, pageCount, productCount, variantCount, reviewCount] = await Promise.all([
      countRows(supabase, "categories"),
      countRows(supabase, "pages"),
      countRows(supabase, "products"),
      countRows(supabase, "product_variants"),
      countRows(supabase, "product_reviews"),
    ]);

    return NextResponse.json({
      success: true,
      summary: {
        sourceMeta: isJsonRecord(payload.meta) ? payload.meta : null,
        replaced: {
          categories: categories.length,
          pages: pages.length,
          products: products.length,
          reviews: reviews.length,
          settings: settingRows.length,
          variants: variants.length,
        },
        countsAfterSync: {
          categories: categoryCount,
          pages: pageCount,
          products: productCount,
          reviews: reviewCount,
          variants: variantCount,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Senkron sirasinda beklenmeyen bir hata olustu.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
