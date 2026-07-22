import type { CatalogAdminResource, CatalogAdminResourceKind } from "@celebix/saas-contracts";

export interface CatalogResourceRouteDefinition {
  readonly kind: CatalogAdminResourceKind;
  readonly segment: "collections" | "brands" | "attributes" | "extras" | "definitions";
  readonly title: string;
}

const ROUTES = Object.freeze({
  collections: Object.freeze({ kind: "collection", segment: "collections", title: "Koleksiyon" }),
  brands: Object.freeze({ kind: "brand", segment: "brands", title: "Marka" }),
  attributes: Object.freeze({ kind: "attribute", segment: "attributes", title: "Nitelik" }),
  extras: Object.freeze({ kind: "extra", segment: "extras", title: "Ekstra" }),
  definitions: Object.freeze({ kind: "definition", segment: "definitions", title: "Tanımlama" }),
} satisfies Record<string, CatalogResourceRouteDefinition>);

const ROUTES_BY_KIND = Object.freeze(Object.values(ROUTES).reduce((result, route) => {
  result[route.kind] = route;
  return result;
}, {} as Record<CatalogAdminResourceKind, CatalogResourceRouteDefinition>));

export function getCatalogResourceRouteDefinition(segment: string): CatalogResourceRouteDefinition {
  const result = ROUTES[segment as keyof typeof ROUTES];
  if (result === undefined) throw new TypeError("catalog_resource_route_invalid");
  return result;
}

export function getCatalogResourceRouteDefinitionForKind(kind: CatalogAdminResourceKind): CatalogResourceRouteDefinition {
  const result = ROUTES_BY_KIND[kind];
  if (result === undefined) throw new TypeError("catalog_resource_route_invalid");
  return result;
}

export function selectCatalogResourceForEdit<T extends Pick<CatalogAdminResource, "id" | "kind">>(
  resources: readonly T[],
  kind: CatalogAdminResourceKind,
  resourceId: string,
): T | undefined {
  return resources.find((candidate) => candidate.kind === kind && candidate.id === resourceId);
}
