import type { InventoryLocation, Product, ProductVariant } from "@celebix/saas-contracts";

import { catalogApi, type ProductDetailResult, type ProductListResult } from "../catalog-ui/client.ts";
import { inventoryApi } from "./client.ts";

const DEFAULT_LIMITS = Object.freeze({
  maximumPages: 25,
  maximumProducts: 500,
  maximumVariants: 2_000,
  maximumLocations: 500,
});

export type InventoryProductChoice = Readonly<{
  productId: string;
  title: string;
}>;
export type InventoryVariantChoice = Readonly<{
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku?: string;
}>;
export type InventoryLocationChoice = Readonly<{
  locationId: string;
  name: string;
  isDefault: boolean;
}>;
export type InventoryFormChoices = Readonly<{
  products: readonly InventoryProductChoice[];
  variants: readonly InventoryVariantChoice[];
  locations: readonly InventoryLocationChoice[];
}>;

type CatalogChoicesApi = Readonly<{
  listProducts(input: Readonly<{ status: "active"; cursor?: string }>, signal?: AbortSignal): Promise<ProductListResult>;
  getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetailResult>;
}>;
type InventoryChoicesApi = Readonly<{
  listLocations(signal?: AbortSignal): Promise<readonly InventoryLocation[]>;
}>;
type Dependencies = Readonly<{ catalog: CatalogChoicesApi; inventory: InventoryChoicesApi }>;
type Limits = Partial<typeof DEFAULT_LIMITS>;

const unavailable = (): never => { throw new Error("inventory_choices_unavailable"); };
function check(signal: AbortSignal) {
  signal.throwIfAborted();
}
function bounded(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > fallback) unavailable();
  return value;
}
function safeArray<T>(value: readonly T[], maximum: number): readonly T[] {
  try {
    if (!Array.isArray(value) || value.length > maximum) unavailable();
    return [...value];
  } catch {
    return unavailable();
  }
}

export async function loadInventoryFormChoices(
  dependencies: Dependencies = Object.freeze({ catalog: catalogApi, inventory: inventoryApi }),
  signal: AbortSignal = new AbortController().signal,
  overrides: Limits = {},
): Promise<InventoryFormChoices> {
  const limits = Object.freeze({
    maximumPages: bounded(overrides.maximumPages, DEFAULT_LIMITS.maximumPages),
    maximumProducts: bounded(overrides.maximumProducts, DEFAULT_LIMITS.maximumProducts),
    maximumVariants: bounded(overrides.maximumVariants, DEFAULT_LIMITS.maximumVariants),
    maximumLocations: bounded(overrides.maximumLocations, DEFAULT_LIMITS.maximumLocations),
  });
  const products: Product[] = [];
  const productIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  try {
    for (let pageNumber = 0; ; pageNumber += 1) {
      check(signal);
      if (pageNumber >= limits.maximumPages) unavailable();
      const page = await dependencies.catalog.listProducts({ status: "active", ...(cursor ? { cursor } : {}) }, signal);
      check(signal);
      const pageItems = safeArray(page.items, limits.maximumProducts);
      if (products.length + pageItems.length > limits.maximumProducts) unavailable();
      for (const product of pageItems) {
        if (product.status !== "active" || productIds.has(product.id)) unavailable();
        productIds.add(product.id);
        products.push(product);
      }
      const nextCursor = page.nextCursor;
      if (nextCursor === undefined) break;
      if (typeof nextCursor !== "string" || nextCursor.length < 1 || nextCursor.length > 2_048 || cursors.has(nextCursor) || nextCursor === cursor) unavailable();
      cursors.add(nextCursor);
      cursor = nextCursor;
    }

    const locations = safeArray(await dependencies.inventory.listLocations(signal), limits.maximumLocations);
    check(signal);
    const locationIds = new Set<string>();
    const activeLocations: InventoryLocationChoice[] = [];
    for (const location of locations) {
      if (locationIds.has(location.id)) unavailable();
      locationIds.add(location.id);
      if (location.status === "active") activeLocations.push(Object.freeze({
        locationId: location.id,
        name: location.name,
        isDefault: location.isDefault,
      }));
    }

    const variants: InventoryVariantChoice[] = [];
    const variantIds = new Set<string>();
    for (const product of products) {
      check(signal);
      const detail = await dependencies.catalog.getProduct(product.id, signal);
      check(signal);
      if (detail.product.id !== product.id || detail.product.status !== "active") unavailable();
      const detailVariants = safeArray(detail.variants, limits.maximumVariants);
      for (const variant of detailVariants) {
        if (variant.productId !== product.id || variantIds.has(variant.id)) unavailable();
        variantIds.add(variant.id);
        if (variant.status !== "active") continue;
        if (variants.length >= limits.maximumVariants) unavailable();
        variants.push(Object.freeze({
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          variantTitle: variant.title,
          ...(variant.sku ? { sku: variant.sku } : {}),
        }));
      }
    }
    return Object.freeze({
      products: Object.freeze(products.map((product) => Object.freeze({ productId: product.id, title: product.title }))),
      variants: Object.freeze(variants),
      locations: Object.freeze(activeLocations),
    });
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof Error && error.message === "inventory_choices_unavailable") throw error;
    return unavailable();
  }
}

export type InventoryFormChoiceSnapshot =
  | Readonly<{ phase: "loading"; choices: InventoryFormChoices }>
  | Readonly<{ phase: "loaded"; choices: InventoryFormChoices }>
  | Readonly<{ phase: "unavailable"; choices: InventoryFormChoices }>;

const EMPTY_CHOICES: InventoryFormChoices = Object.freeze({
  products: Object.freeze([]),
  variants: Object.freeze([]),
  locations: Object.freeze([]),
});

export function createInventoryFormChoiceLifecycle(
  load: (signal: AbortSignal) => Promise<InventoryFormChoices> = (signal) => loadInventoryFormChoices(undefined, signal),
  onChange?: (snapshot: InventoryFormChoiceSnapshot) => void,
) {
  let generation = 0;
  let current: AbortController | undefined;
  let snapshot: InventoryFormChoiceSnapshot = Object.freeze({ phase: "loading", choices: EMPTY_CHOICES });
  const publish = (value: InventoryFormChoiceSnapshot) => { snapshot = Object.freeze(value); onChange?.(snapshot); };
  return Object.freeze({
    setup() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const selected = ++generation;
      publish({ phase: "loading", choices: EMPTY_CHOICES });
      void load(controller.signal).then((choices) => {
        if (!controller.signal.aborted && selected === generation && current === controller) publish({
          phase: choices.products.length || choices.variants.length || choices.locations.length ? "loaded" : "loaded",
          choices,
        });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && selected === generation && current === controller) {
          publish({ phase: "unavailable", choices: EMPTY_CHOICES });
        }
      });
      return () => {
        controller.abort();
        if (selected === generation && current === controller) current = undefined;
      };
    },
    getSnapshot: () => snapshot,
  });
}
