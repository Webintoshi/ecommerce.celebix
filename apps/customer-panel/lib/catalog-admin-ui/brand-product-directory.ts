import type { ProductStatus } from "@celebix/saas-contracts";
import type { CatalogVariantChoiceResult } from "../catalog-ui/client.ts";

export type BrandProductDirectoryEntry = Readonly<{
  id: string;
  title: string;
  representativeSku?: string;
  variantCount: number;
  status: Extract<ProductStatus, "active" | "draft">;
}>;

type DirectoryApi = Readonly<{
  listVariantChoices(signal?: AbortSignal): Promise<readonly CatalogVariantChoiceResult[]>;
  listProducts(input: Readonly<{ status: "draft"; cursor?: string }>, signal?: AbortSignal): Promise<Readonly<{
    items: readonly Readonly<{ id: string; title: string; status: ProductStatus }>[];
    nextCursor?: string;
  }>>;
}>;

const MAX_DRAFT_PAGES = 500;
const MAX_DIRECTORY_PRODUCTS = 10_000;

function unavailable(): never {
  throw new Error("brand_product_directory_unavailable");
}

export async function loadBrandProductDirectory(api: DirectoryApi, signal?: AbortSignal): Promise<readonly BrandProductDirectoryEntry[]> {
  const activeChoices = await api.listVariantChoices(signal);
  const active = new Map<string, { title: string; skus: string[]; variantCount: number }>();
  for (const choice of activeChoices) {
    const known = active.get(choice.productId);
    if (known && known.title !== choice.productTitle) unavailable();
    if (known) {
      known.variantCount += 1;
      if (choice.sku && !known.skus.includes(choice.sku)) known.skus.push(choice.sku);
    } else {
      active.set(choice.productId, { title: choice.productTitle, skus: choice.sku ? [choice.sku] : [], variantCount: 1 });
    }
    if (active.size > MAX_DIRECTORY_PRODUCTS) unavailable();
  }

  const drafts = new Map<string, string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_DRAFT_PAGES; page += 1) {
    const result = await api.listProducts({ status: "draft", ...(cursor ? { cursor } : {}) }, signal);
    for (const product of result.items) {
      if (product.status !== "draft" || active.has(product.id) || drafts.has(product.id)) unavailable();
      drafts.set(product.id, product.title);
      if (active.size + drafts.size > MAX_DIRECTORY_PRODUCTS) unavailable();
    }
    if (!result.nextCursor) break;
    if (cursors.has(result.nextCursor)) unavailable();
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
    if (page === MAX_DRAFT_PAGES - 1) unavailable();
  }

  return Object.freeze([
    ...[...active.entries()].map(([id, item]) => Object.freeze({ id, title: item.title, ...(item.skus[0] ? { representativeSku: item.skus[0] } : {}), variantCount: item.variantCount, status: "active" as const })),
    ...[...drafts.entries()].map(([id, title]) => Object.freeze({ id, title, variantCount: 0, status: "draft" as const })),
  ].sort((left, right) => left.title.localeCompare(right.title, "tr-TR") || left.id.localeCompare(right.id)));
}

export function brandLogoAssetId(config: Readonly<Record<string, unknown>>): string | undefined {
  const value = config.logoAssetId;
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) ? value : undefined;
}
