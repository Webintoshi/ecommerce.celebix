import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { PublicStorefrontContentRepository } from "../storefront-content/types.ts";

export type CatalogSearchScope = Readonly<{ storeId: string; pending: boolean }>;
export interface CatalogSearchScopeRepository {
  resolve(input: Readonly<{ hostname: string; now: Date }>): Promise<CatalogSearchScope>;
}
export interface CatalogSearchProvider {
  search(input: Readonly<{ storeId: string; query: string; limit: number; offset: number }>): Promise<Readonly<{ productIds: readonly string[]; nextOffset: number | null }>>;
}
export type CatalogSearchContentRepositoryOptions = Readonly<{ base: PublicStorefrontContentRepository; scope: CatalogSearchScopeRepository; provider: CatalogSearchProvider }>;
export type MeilisearchCatalogSearchOptions = Readonly<{
  url: string;
  apiKey: string;
  index?: string;
  queryTimeoutMs?: number;
  fetch?: typeof fetch;
}>;
export type MeilisearchCatalogSearchIndexerOptions = MeilisearchCatalogSearchOptions & Readonly<{
  taskTimeoutMs?: number;
  taskPollMs?: number;
  onIndexCreated?: () => Promise<void>;
}>;
export type CatalogSearchDocument = Readonly<{
  id: string;
  storeId: string;
  productId: string;
  title: string;
  searchText: string;
  skus: readonly string[];
  barcodes: readonly string[];
  slug?: string;
}>;
export type CatalogSearchJob = Readonly<{ storeId: string; productId: string; generation: number; document: CatalogSearchDocument | null }>;
export type CatalogSearchAckOutcome = "acknowledged" | "retry" | "stale";
export interface CatalogSearchJobRepository {
  claim(input: Readonly<{ now: Date; limit: number; leaseId: string }>): Promise<readonly CatalogSearchJob[]>;
  acknowledge(input: Readonly<{ leaseId: string; storeId: string; productId: string; generation: number; now: Date; error: string | null }>): Promise<CatalogSearchAckOutcome>;
}
export interface CatalogSearchIndexer {
  ensureReady(): Promise<void>;
  apply(job: CatalogSearchJob): Promise<void>;
}
export type PostgresPublicCatalogSearchScopeRepositoryOptions = Readonly<{ pool: PostgresPoolLike; role: "celebix_saas_host_resolver"; timeouts: PostgresTimeoutOptions }>;
export type PostgresCatalogSearchJobRepositoryOptions = Readonly<{ pool: PostgresPoolLike; role: "celebix_saas_workflow"; timeouts: PostgresTimeoutOptions }>;
export type CatalogSearchWorkerOptions = Readonly<{
  repository: CatalogSearchJobRepository;
  indexer: CatalogSearchIndexer;
  now?: () => Date;
  limit?: number;
  leaseId?: string;
}>;
export type CatalogSearchWorkerResult = Readonly<{ claimed: number; acknowledged: number; retried: number; stale: number }>;
