import {
  parseAbandonedCartSummary,
  parseCustomerListItem,
  parseCustomerSummary,
  parseOrderDashboardSummary,
  parseOrderListItem,
  parseProduct,
  type Product,
} from "@celebix/saas-contracts";

import { projectToshiLocalReply } from "./response.ts";
import type { ToshiLocalIntent, ToshiLocalReply } from "./types.ts";

const CATALOG_SUMMARY_KEYS = Object.freeze([
  "activeMedia",
  "activeProducts",
  "activeVariants",
  "draftProducts",
  "outOfStockVariants",
  "productLimit",
  "productsWithoutMedia",
  "totalProducts",
]);

type CatalogSummary = Readonly<{
  totalProducts: number;
  outOfStockVariants: number;
}>;

export class ToshiLocalError extends Error {
  readonly code = "unavailable";

  constructor() {
    super("unavailable");
    this.name = "ToshiLocalError";
  }
}

export interface ToshiLocalClient {
  execute(intent: ToshiLocalIntent, signal?: AbortSignal): Promise<ToshiLocalReply>;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ToshiLocalError();
  return value;
}

function parseCatalogSummary(value: unknown): CatalogSummary {
  const summary = record(value);
  if (summary === null || JSON.stringify(Object.keys(summary).sort()) !== JSON.stringify(CATALOG_SUMMARY_KEYS)) {
    throw new ToshiLocalError();
  }
  const totalProducts = count(summary.totalProducts);
  const activeProducts = count(summary.activeProducts);
  const draftProducts = count(summary.draftProducts);
  const activeVariants = count(summary.activeVariants);
  const outOfStockVariants = count(summary.outOfStockVariants);
  const productsWithoutMedia = count(summary.productsWithoutMedia);
  count(summary.productLimit);
  count(summary.activeMedia);
  if (
    activeProducts + draftProducts !== totalProducts ||
    outOfStockVariants > activeVariants ||
    productsWithoutMedia > totalProducts
  ) throw new ToshiLocalError();
  return Object.freeze({ totalProducts, outOfStockVariants });
}

function parseSearchEnvelope<T>(
  value: unknown,
  maximum: number,
  cursorMaximum: number,
  parser: (item: unknown) => T,
): readonly T[] {
  const envelope = record(value);
  if (
    envelope === null || !Array.isArray(envelope.items) || envelope.items.length > maximum ||
    !["items", "items,nextCursor"].includes(Object.keys(envelope).sort().join(",")) ||
    (envelope.nextCursor !== undefined && (
      typeof envelope.nextCursor !== "string" ||
      !new RegExp(`^[A-Za-z0-9_-]{1,${cursorMaximum}}$`).test(envelope.nextCursor)
    ))
  ) throw new ToshiLocalError();
  return Object.freeze(envelope.items.map(parser));
}

function matchesProduct(product: Product, query: string): boolean {
  const normalizedQuery = query.toLocaleLowerCase("tr-TR");
  const sku = (product as Product & Readonly<{ sku?: unknown }>).sku;
  return [product.title, product.slug, ...(typeof sku === "string" ? [sku] : [])]
    .some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedQuery));
}

function unavailable(error: unknown): ToshiLocalError {
  return error instanceof ToshiLocalError ? error : new ToshiLocalError();
}

export function createToshiLocalClient(fetcher: typeof fetch = fetch): ToshiLocalClient {
  async function read(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetcher(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      throw new ToshiLocalError();
    }
    return response.json();
  }

  async function execute(intent: ToshiLocalIntent, signal?: AbortSignal): Promise<ToshiLocalReply> {
    try {
      switch (intent.kind) {
        case "store_summary": {
          const [catalog, orders, customers, abandoned] = await Promise.all([
            read("/api/catalog/summary", signal),
            read("/api/orders/summary", signal),
            read("/api/customers/summary", signal),
            read("/api/orders/abandoned-carts/summary", signal),
          ]);
          return projectToshiLocalReply(intent, {
            catalog: parseCatalogSummary(catalog),
            orders: parseOrderDashboardSummary(orders),
            customers: parseCustomerSummary(customers),
            abandoned: parseAbandonedCartSummary(abandoned),
          });
        }
        case "pending_orders":
          return projectToshiLocalReply(intent, parseOrderDashboardSummary(await read("/api/orders/summary", signal)));
        case "low_stock":
          return projectToshiLocalReply(intent, parseCatalogSummary(await read("/api/catalog/summary", signal)));
        case "find_product": {
          const products = parseSearchEnvelope(await read("/api/catalog/products?pageSize=100", signal), 100, 2048, parseProduct)
            .filter((product) => matchesProduct(product, intent.query))
            .slice(0, 10);
          return projectToshiLocalReply(intent, products);
        }
        case "find_customer":
          return projectToshiLocalReply(intent, parseSearchEnvelope(await read(`/api/customers?${new URLSearchParams({ search: intent.query, pageSize: "10" })}`, signal), 10, 1024, parseCustomerListItem));
        case "find_order":
          return projectToshiLocalReply(intent, parseSearchEnvelope(await read(`/api/orders?${new URLSearchParams({ search: intent.query, pageSize: "10", sort: "newest" })}`, signal), 10, 1024, parseOrderListItem));
        case "navigate":
        case "unsupported":
          return projectToshiLocalReply(intent, null);
      }
    } catch (error) {
      throw unavailable(error);
    }
  }

  return Object.freeze({ execute });
}
