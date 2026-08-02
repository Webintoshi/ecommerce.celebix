import type { PublicProduct, PublicProductList, PublicProductMedia, PublicStarterThemePresentation, PublicStorefront } from "../../../saas-contracts/src/storefront/index.ts";
import type { TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type TrustedStorefrontContext = Readonly<{ storefront: PublicStorefront }>;
export type PublicStorefrontCategory = Readonly<{ id: string; name: string; slug: string }>;
export type PublicStorefrontCategoryProductList = Readonly<{ category: PublicStorefrontCategory; items: readonly PublicProduct[] }>;
export type CampaignHomeProjection = Readonly<{
  presentation: PublicStarterThemePresentation;
  productRows: readonly Readonly<{ key: string; items: readonly PublicProduct[] }>[];
}>;

export type NewsletterSubscriptionResult = Readonly<{ outcome: "subscribed" }>;
export type NewsletterSubscriber = Readonly<{
  email: string;
  status: "subscribed" | "unsubscribed";
  consentVersion: string;
  consentedAt: string;
}>;
export interface NewsletterRepository {
  subscribe(input: Readonly<{ hostname: string; now: Date; email: string; consentVersion: string }>): Promise<NewsletterSubscriptionResult>;
  list(input: Readonly<{ tenantContext: TenantContext; now: Date; limit: number }>): Promise<readonly NewsletterSubscriber[]>;
}
export type PostgresNewsletterRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  publicRole: "celebix_saas_host_resolver";
  merchantRole: "celebix_saas_app";
  timeouts: PostgresTimeoutOptions;
}>;

export interface PublicStorefrontRepository {
  getPublicStorefront(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicStorefront>;
  listPublicProducts(input: TrustedStorefrontContext & Readonly<{ now: Date; limit: number }>): Promise<PublicProductList>;
  listPublicProductsByCategory(input: TrustedStorefrontContext & Readonly<{ now: Date; slug: string; limit: number }>): Promise<PublicStorefrontCategoryProductList>;
  getPublicProductBySlug(input: TrustedStorefrontContext & Readonly<{ now: Date; slug: string }>): Promise<PublicProduct>;
  listPublicProductMedia(input: TrustedStorefrontContext & Readonly<{ now: Date; productId: string }>): Promise<readonly PublicProductMedia[]>;
  resolveCampaignHome?(input: TrustedStorefrontContext & Readonly<{ now: Date }>): Promise<CampaignHomeProjection>;
  listRelatedPublicProducts?(input: TrustedStorefrontContext & Readonly<{ now: Date; productSlug: string; limit: number }>): Promise<PublicProductList>;
}

export type PostgresPublicStorefrontRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
}>;
