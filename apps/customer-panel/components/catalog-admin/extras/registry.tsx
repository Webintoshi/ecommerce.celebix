import type { CatalogAdminResource } from "@celebix/saas-contracts";

export const CATALOG_EXTRA_TYPES = Object.freeze([
  Object.freeze({ type: "size_guide", label: "Ölçü rehberi", description: "Kategori ürünlerinde açılan ölçü ve beden bilgileri.", createHref: "/products/extras/size-guides/new" }),
  Object.freeze({ type: "priced_option", label: "Fiyatlı seçenek", description: "Ürüne eklenebilen seçenekler ve fiyat farkı.", createHref: "/products/extras/new?type=priced_option" }),
] as const);

export type CatalogExtraType = (typeof CATALOG_EXTRA_TYPES)[number]["type"];

export function catalogExtraType(resource: Pick<CatalogAdminResource, "config">): CatalogExtraType {
  return resource.config.type === "size_guide" ? "size_guide" : "priced_option";
}

export function catalogExtraHref(resource: Pick<CatalogAdminResource, "id" | "config">, action: "edit" | "preview") {
  const base = catalogExtraType(resource) === "size_guide" ? "/products/extras/size-guides" : "/products/extras";
  return `${base}/${encodeURIComponent(resource.id)}/${action}`;
}
