export const CATALOG_WEIGHT_PROFILE_MODES = Object.freeze(["general", "jewelry"] as const);
export const CATALOG_WEIGHT_SCOPES = Object.freeze(["net_metal", "total_product", "unspecified"] as const);
export const CATALOG_WEIGHT_SALES_UNITS = Object.freeze(["single", "pair", "set", "unspecified"] as const);
export const CATALOG_WEIGHT_SOURCES = Object.freeze(["description", "manual"] as const);

export type CatalogWeightProfileMode = (typeof CATALOG_WEIGHT_PROFILE_MODES)[number];
export type CatalogWeightScope = (typeof CATALOG_WEIGHT_SCOPES)[number];
export type CatalogWeightSalesUnit = (typeof CATALOG_WEIGHT_SALES_UNITS)[number];
export type CatalogWeightSource = (typeof CATALOG_WEIGHT_SOURCES)[number];

export type CatalogWeightExtraction =
  | Readonly<{
      kind: "single";
      gramsMilli: number;
      scope: CatalogWeightScope;
      salesUnit: CatalogWeightSalesUnit;
      approximate: boolean;
      toleranceBasisPoints: number | null;
      sourceExcerpt: string;
    }>
  | Readonly<{
      kind: "range";
      minimumGramsMilli: number;
      maximumGramsMilli: number;
      scope: CatalogWeightScope;
      salesUnit: CatalogWeightSalesUnit;
      sourceExcerpt: string;
    }>
  | Readonly<{ kind: "conflict"; reason: "multiple_values"; valuesGramsMilli: readonly number[] }>
  | Readonly<{ kind: "none"; reason: "not_found" | "shipping_weight" | "ambiguous_decimal" }>;

export interface CatalogWeightDeclaration {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly gramsMilli: number;
  readonly scope: CatalogWeightScope;
  readonly salesUnit: CatalogWeightSalesUnit;
  readonly approximate: boolean;
  readonly toleranceBasisPoints: number | null;
  readonly source: CatalogWeightSource;
  readonly sourceExcerpt: string | null;
  readonly sourceDigest: string | null;
  readonly sourceProductVersion: number | null;
  readonly pricingVerified: boolean;
  readonly version: number;
  readonly updatedAt: string;
}

export interface CatalogWeightEditorProjection {
  readonly profileMode: CatalogWeightProfileMode | null;
  readonly productVersion: number;
  readonly declarations: readonly CatalogWeightDeclaration[];
}

export interface CatalogWeightSaveIntent {
  readonly operationId: string;
  readonly expectedProductVersion: number;
  readonly expectedDeclarationVersion: number;
  readonly target: Readonly<{ level: "product" | "variant"; variantId: string | null }>;
  readonly declaration: Readonly<{
    gramsMilli: number;
    scope: CatalogWeightScope;
    salesUnit: CatalogWeightSalesUnit;
    approximate: boolean;
    toleranceBasisPoints: number | null;
  }>;
}
