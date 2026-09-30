import type { PublicStorefrontAsset } from "../storefront/types.ts";

export const CATALOG_COLLECTION_SORTS = Object.freeze(["custom", "newest", "title", "price-asc", "price-desc"] as const);
export type CatalogCollectionSort = typeof CATALOG_COLLECTION_SORTS[number];
export type CatalogCollectionRule = Readonly<{ kind: "category" | "brand" | "tag"; resourceId: string }>;
export type CatalogCollectionConfig = Readonly<{ schemaVersion: 1; mode: "manual" | "automatic"; published: boolean; featured: boolean; coverAssetId?: string; match: "all" | "any"; rules: readonly CatalogCollectionRule[]; sort: CatalogCollectionSort }>;
export type CatalogCollectionSummary = Readonly<{ id: string; name: string; slug: string; description?: string; status: "active" | "archived"; config: CatalogCollectionConfig; cover?: PublicStorefrontAsset; productCount: number; publicProductCount: number; version: number; createdAt: string; updatedAt: string }>;
export type CatalogCollectionDetail = CatalogCollectionSummary & Readonly<{ productIds: readonly string[] }>;
export type CatalogCollectionListQuery = Readonly<{ page: number; pageSize: number; search?: string; state: "all" | "published" | "draft" | "archived"; sort: "title" | "products" | "updated" }>;
export type CatalogCollectionMembersQuery = Readonly<{ page: number; pageSize: number; search?: string; categoryId?: string; brandId?: string; tagId?: string; mode: "members" | "catalog"; productIds?: readonly string[] }>;
export type CatalogCollectionListPage = Readonly<{ items: readonly CatalogCollectionSummary[]; page: number; pageSize: number; totalCount: number; counts: Readonly<{ all: number; published: number; draft: number; archived: number }> }>;
export type CatalogCollectionMember = Readonly<{ id: string; title: string; sku?: string; status: "draft" | "active" | "archived"; priceCents?: number | null; image?: PublicStorefrontAsset }>;
export type CatalogCollectionMembersPage = Readonly<{ items: readonly CatalogCollectionMember[]; page: number; pageSize: number; totalCount: number; orderedIds: readonly string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
function invalid(): never { throw new TypeError("catalog_collection_contract_invalid"); }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => typeof key !== "string" || !descriptors[key]?.enumerable || !("value" in descriptors[key]!))) invalid();
  const parsed = value as Record<string, unknown>, allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some(key => !allowed.has(key))) invalid();
  return parsed;
}
function text(value: unknown, min: number, max: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < min || value.length > max || value.trim() !== value || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}
export function parseCatalogCollectionDescription(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > 2000 || /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid();
  return value;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(); return value as number; }
function uuid(value: unknown) { return text(value, 36, 36, UUID); }
function oneOf<T extends string>(value: unknown, values: readonly T[]): T { if (typeof value !== "string" || !values.includes(value as T)) invalid(); return value as T; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function array(value: unknown, max: number): readonly unknown[] { if (!Array.isArray(value) || value.length > max || Object.keys(value).length !== value.length || value.some((_, index) => !Object.hasOwn(value, index))) invalid(); return value; }
export function parseCatalogCollectionProductIds(value: unknown, max = 10000): readonly string[] { const ids = array(value, max).map(uuid); if (new Set(ids).size !== ids.length) invalid(); return Object.freeze(ids); }
function timestamp(value: unknown) { const result = text(value, 24, 24, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); if (new Date(result).toISOString() !== result) invalid(); return result; }
function image(value: unknown): PublicStorefrontAsset {
  const parsed = exact(value, ["url", "altText", "mediaType", "width", "height"]);
  const url = new URL(text(parsed.url, 1, 2048));
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.toString() !== parsed.url) invalid();
  return Object.freeze({url: url.toString(),altText:text(parsed.altText,0,500),mediaType:oneOf(parsed.mediaType,["image/jpeg","image/png","image/webp"] as const),width:integer(parsed.width,1,8192),height:integer(parsed.height,1,8192)});
}
export function parseCatalogCollectionConfig(value: unknown): CatalogCollectionConfig {
  const raw = exact(value, [], ["schemaVersion","mode","published","featured","coverAssetId","match","rules","sort"]);
  if (raw.schemaVersion === undefined) {
    if (Object.keys(raw).some(key=>key !== "featured")) invalid();
    return Object.freeze({schemaVersion:1,mode:"manual",published:false,featured:raw.featured === undefined ? false : boolean(raw.featured),match:"all",rules:Object.freeze([]),sort:"custom"});
  }
  const parsed = exact(value,["schemaVersion","mode","published","featured","match","rules","sort"],["coverAssetId"]);
  if (parsed.schemaVersion !== 1) invalid();
  const mode = oneOf(parsed.mode,["manual","automatic"] as const);
  const rules = array(parsed.rules,10).map(value=>{const rule=exact(value,["kind","resourceId"]);return Object.freeze({kind:oneOf(rule.kind,["category","brand","tag"] as const),resourceId:uuid(rule.resourceId)});});
  if ((mode === "automatic" && !rules.length) || (mode === "manual" && rules.length) || new Set(rules.map(rule=>`${rule.kind}:${rule.resourceId}`)).size !== rules.length) invalid();
  return Object.freeze({schemaVersion:1,mode,published:boolean(parsed.published),featured:boolean(parsed.featured),...(parsed.coverAssetId !== undefined ? {coverAssetId:uuid(parsed.coverAssetId)}:{}),match:oneOf(parsed.match,["all","any"] as const),rules:Object.freeze(rules),sort:oneOf(parsed.sort,CATALOG_COLLECTION_SORTS)});
}
function summary(value: unknown, detail: boolean): CatalogCollectionDetail | CatalogCollectionSummary {
  const required=["id","name","slug","status","config","productCount","publicProductCount","version","createdAt","updatedAt",...(detail?["productIds"]:[])];
  const parsed=exact(value,required,["description","cover"]),createdAt=timestamp(parsed.createdAt),updatedAt=timestamp(parsed.updatedAt);
  const productCount=integer(parsed.productCount),publicProductCount=integer(parsed.publicProductCount);
  if(updatedAt<createdAt || publicProductCount>productCount) invalid();
  return Object.freeze({id:uuid(parsed.id),name:text(parsed.name,1,120),slug:text(parsed.slug,1,120,/^[a-z0-9]+(?:-[a-z0-9]+)*$/),...(parsed.description!==undefined?{description:parseCatalogCollectionDescription(parsed.description)}:{}),status:oneOf(parsed.status,["active","archived"] as const),config:parseCatalogCollectionConfig(parsed.config),...(parsed.cover!==undefined?{cover:image(parsed.cover)}:{}),productCount,publicProductCount,version:integer(parsed.version,1),createdAt,updatedAt,...(detail?{productIds:parseCatalogCollectionProductIds(parsed.productIds,parseCatalogCollectionConfig(parsed.config).mode === "automatic" ? 100000 : 10000)}:{})});
}
export function parseCatalogCollectionSummary(value: unknown): CatalogCollectionSummary { return summary(value,false); }
export function parseCatalogCollectionDetail(value: unknown): CatalogCollectionDetail { return summary(value,true) as CatalogCollectionDetail; }
export function parseCatalogCollectionListQuery(value: unknown): CatalogCollectionListQuery {
  const parsed=exact(value,[],["page","pageSize","search","state","sort"]);
  return Object.freeze({page:integer(parsed.page??1,1,100000),pageSize:integer(parsed.pageSize??20,1,50),...(parsed.search!==undefined?{search:text(parsed.search,1,100)}:{}),state:oneOf(parsed.state??"all",["all","published","draft","archived"] as const),sort:oneOf(parsed.sort??"updated",["title","products","updated"] as const)});
}
export function parseCatalogCollectionMembersQuery(value: unknown): CatalogCollectionMembersQuery {
  const parsed=exact(value,[],["page","pageSize","search","categoryId","brandId","tagId","mode","productIds"]);
  return Object.freeze({page:integer(parsed.page??1,1,100000),pageSize:integer(parsed.pageSize??20,1,50),mode:oneOf(parsed.mode??"members",["members","catalog"] as const),...(parsed.search!==undefined?{search:text(parsed.search,1,100)}:{}),...(parsed.categoryId!==undefined?{categoryId:uuid(parsed.categoryId)}:{}),...(parsed.brandId!==undefined?{brandId:uuid(parsed.brandId)}:{}),...(parsed.tagId!==undefined?{tagId:uuid(parsed.tagId)}:{}),...(parsed.productIds!==undefined?{productIds:parseCatalogCollectionProductIds(parsed.productIds,100000)}:{})});
}
export function parseCatalogCollectionListPage(value: unknown): CatalogCollectionListPage {
  const parsed=exact(value,["items","page","pageSize","totalCount","counts"]),counts=exact(parsed.counts,["all","published","draft","archived"]);
  const items=Object.freeze(array(parsed.items,50).map(parseCatalogCollectionSummary)),pageSize=integer(parsed.pageSize,1,50),totalCount=integer(parsed.totalCount);
  if(items.length>pageSize || items.length>totalCount) invalid();
  return Object.freeze({items,page:integer(parsed.page,1,100000),pageSize,totalCount,counts:Object.freeze({all:integer(counts.all),published:integer(counts.published),draft:integer(counts.draft),archived:integer(counts.archived)})});
}
export function parseCatalogCollectionMembersPage(value: unknown): CatalogCollectionMembersPage {
  const parsed=exact(value,["items","page","pageSize","totalCount","orderedIds"]);
  const items=Object.freeze(array(parsed.items,50).map(value=>{const item=exact(value,["id","title","status"],["sku","priceCents","image"]);return Object.freeze({id:uuid(item.id),title:text(item.title,1,200),status:oneOf(item.status,["draft","active","archived"] as const),...(item.sku!==undefined?{sku:text(item.sku,1,64)}:{}),...(item.priceCents!==undefined?{priceCents:item.priceCents===null?null:integer(item.priceCents)}:{}),...(item.image!==undefined?{image:image(item.image)}:{})});}));
  const pageSize=integer(parsed.pageSize,1,50),totalCount=integer(parsed.totalCount),orderedIds=parseCatalogCollectionProductIds(parsed.orderedIds,100000);
  if(items.length>pageSize || items.length>totalCount || new Set(items.map(item=>item.id)).size!==items.length) invalid();
  return Object.freeze({items,page:integer(parsed.page,1,100000),pageSize,totalCount,orderedIds});
}
