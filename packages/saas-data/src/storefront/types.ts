import type { PublicStorefrontDesign } from "../../../saas-contracts/src/storefront-design/index.ts";
import type { PublicProduct, PublicProductList, PublicProductMedia, PublicStorefront } from "../../../saas-contracts/src/storefront/index.ts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type TrustedStorefrontContext = Readonly<{ storefront: PublicStorefront }>;

export interface PublicStorefrontRepository {
  getPublicStorefront(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicStorefront>;
  listPublicProducts(input: TrustedStorefrontContext & Readonly<{ now: Date; limit: number }>): Promise<PublicProductList>;
  getPublicProductBySlug(input: TrustedStorefrontContext & Readonly<{ now: Date; slug: string }>): Promise<PublicProduct>;
  listPublicProductMedia(input: TrustedStorefrontContext & Readonly<{ now: Date; productId: string }>): Promise<readonly PublicProductMedia[]>;
  getPublicStorefrontDesign(input: TrustedStorefrontContext & Readonly<{ now: Date }>): Promise<PublicStorefrontDesign>;
}

export type PostgresPublicStorefrontRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
}>;
