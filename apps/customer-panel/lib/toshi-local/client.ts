import {
  parseAbandonedCartSummary,
  parseCustomerListItem,
  parseCustomerSummary,
  parseOrderDashboardSummary,
  parseOrderListItem,
  parseProduct,
} from "@celebix/saas-contracts";

import { projectToshiLocalReply } from "./response.ts";
import type { ToshiLocalIntent, ToshiLocalReply } from "./types.ts";

const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
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

function parseCatalogSummary(value: unknown): void {
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
}

function parseSearchEnvelope(value: unknown, parser: (item: unknown) => unknown): void {
  const envelope = record(value);
  if (
    envelope === null || !Array.isArray(envelope.items) || envelope.items.length > 10 ||
    !["items", "items,nextCursor"].includes(Object.keys(envelope).sort().join(",")) ||
    (envelope.nextCursor !== undefined && (typeof envelope.nextCursor !== "string" || !CURSOR.test(envelope.nextCursor)))
  ) throw new ToshiLocalError();
  for (const item of envelope.items) parser(item);
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
          parseCatalogSummary(catalog);
          parseOrderDashboardSummary(orders);
          parseCustomerSummary(customers);
          parseAbandonedCartSummary(abandoned);
          return projectToshiLocalReply(intent, null);
        }
        case "pending_orders":
          parseOrderDashboardSummary(await read("/api/orders/summary", signal));
          return projectToshiLocalReply(intent, null);
        case "low_stock":
          parseCatalogSummary(await read("/api/catalog/summary", signal));
          return projectToshiLocalReply(intent, null);
        case "find_product":
          parseSearchEnvelope(await read(`/api/catalog/products?${new URLSearchParams({ search: intent.query, limit: "10", status: "all" })}`, signal), parseProduct);
          return projectToshiLocalReply(intent, null);
        case "find_customer":
          parseSearchEnvelope(await read(`/api/customers?${new URLSearchParams({ search: intent.query, limit: "10" })}`, signal), parseCustomerListItem);
          return projectToshiLocalReply(intent, null);
        case "find_order":
          parseSearchEnvelope(await read(`/api/orders?${new URLSearchParams({ search: intent.query, limit: "10", sort: "updated_desc" })}`, signal), parseOrderListItem);
          return projectToshiLocalReply(intent, null);
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
