import type { PublicProduct, PublicProductList, PublicProductMedia, PublicStarterThemePresentationV2, PublicStorefront } from "../../../saas-contracts/src/storefront/index.ts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type TrustedStorefrontContext = Readonly<{ storefront: PublicStorefront }>;
export type PublicStorefrontCategory = Readonly<{ id: string; name: string; slug: string }>;
export type PublicStorefrontCategoryProductList = Readonly<{ category: PublicStorefrontCategory; items: readonly PublicProduct[] }>;
export type CampaignHomeProjection = Readonly<{
  presentation: PublicStarterThemePresentationV2;
  productRows: readonly Readonly<{ key: string; items: readonly PublicProduct[] }>[];
}>;

export interface PublicStorefrontRepository {
  getPublicStorefront(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicStorefront>;
  listPublicProducts(input: TrustedStorefrontContext & Readonly<{ now: Date; limit: number }>): Promise<PublicProductList>;
  listPublicProductsByCategory(input: TrustedStorefrontContext & Readonly<{ now: Date; slug: string; limit: number }>): Promise<PublicStorefrontCategoryProductList>;
  getPublicProductBySlug(input: TrustedStorefrontContext & Readonly<{ now: Date; slug: string }>): Promise<PublicProduct>;
  listPublicProductMedia(input: TrustedStorefrontContext & Readonly<{ now: Date; productId: string }>): Promise<readonly PublicProductMedia[]>;
  resolveCampaignHome?(input: TrustedStorefrontContext & Readonly<{ now: Date }>): Promise<CampaignHomeProjection>;
}

export type PostgresPublicStorefrontRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
}>;
