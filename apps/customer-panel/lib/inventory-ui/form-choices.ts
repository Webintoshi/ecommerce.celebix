import type { InventoryLocation } from "@celebix/saas-contracts";

import { catalogApi, type ProductDetailResult, type ProductListResult } from "../catalog-ui/client.ts";
import {
  loadCatalogVariantChoices,
  type CatalogProductChoice,
  type CatalogVariantChoice,
} from "../catalog-ui/variant-choices.ts";
import { inventoryApi } from "./client.ts";

const DEFAULT_LIMITS = Object.freeze({
  maximumPages: 25,
  maximumProducts: 500,
  maximumVariants: 5_000,
  maximumLocations: 500,
  maximumDetailConcurrency: 4,
});

export type InventoryProductChoice = CatalogProductChoice;
export type InventoryVariantChoice = CatalogVariantChoice;
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
type Limits = Readonly<Partial<{
  maximumPages: number;
  maximumProducts: number;
  maximumVariants: number;
  maximumLocations: number;
  maximumDetailConcurrency: number;
}>>;

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
    maximumDetailConcurrency: bounded(
      overrides.maximumDetailConcurrency,
      DEFAULT_LIMITS.maximumDetailConcurrency,
    ),
  });
  try {
    const catalogChoices = await loadCatalogVariantChoices(dependencies.catalog, signal, {
      maximumPages: limits.maximumPages,
      maximumProducts: limits.maximumProducts,
      maximumVariants: limits.maximumVariants,
      maximumDetailConcurrency: limits.maximumDetailConcurrency,
    });

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

    return Object.freeze({
      products: catalogChoices.products,
      variants: catalogChoices.variants,
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
