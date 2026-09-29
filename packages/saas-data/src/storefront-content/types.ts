import type {
  PublicPolicyPage,
  PublicProduct,
  PublicProductSearch,
  StorefrontPolicyKey,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type PublicPolicySourcePage = Readonly<{
  key: StorefrontPolicyKey;
  label: string;
  route: string;
  published: boolean;
  body?: string;
  updatedAt: string;
}>;

export type StorePolicyStatus = "draft" | "published";

export type StorePolicyAdminPage = Readonly<{
  key: StorefrontPolicyKey;
  label: string;
  route: string;
  ordinal: number;
  status: StorePolicyStatus;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type PublicContentPage = Readonly<{
  id: string;
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
}>;

export type PublicContentV2 = Readonly<{
  id: string;
  kind: "page" | "blog_post";
  slug: string;
  locale: string;
  title: string;
  body: string;
  bodyFormat: "legacy" | "normalized_html";
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
}>;
export type PublicContentList = Readonly<{
  items: readonly Omit<PublicContentV2, "body">[];
  nextCursor: string | null;
}>;
export type PublicContentLocales = Readonly<{ defaultLocale: string; enabledLocales: readonly string[] }>;
export type SitemapKind = "products" | "content";
export type SitemapChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export type PublicSitemapShard = Readonly<{ kind: SitemapKind; page: number }>;
export type PublicSitemapEntry = Readonly<{ path: string; updatedAt: string; changeFrequency: SitemapChangeFrequency }>;

export interface PublicStorefrontContentRepository {
  getPage?(input: Readonly<{ hostname: string; now: Date; slug: string }>): Promise<PublicContentPage>;
  getLocales?(input: Readonly<{ hostname: string; now: Date }>): Promise<PublicContentLocales>;
  getPageV2?(input: Readonly<{ hostname: string; now: Date; slug: string; locale: string }>): Promise<PublicContentV2>;
  getBlogPost?(input: Readonly<{ hostname: string; now: Date; slug: string; locale: string }>): Promise<PublicContentV2>;
  listBlogPosts?(input: Readonly<{ hostname: string; now: Date; locale: string; limit: number; cursor?: string }>): Promise<PublicContentList>;
  getSitemapIndex?(input: Readonly<{ hostname: string; now: Date }>): Promise<readonly PublicSitemapShard[]>;
  getSitemapPage?(input: Readonly<{ hostname: string; now: Date; kind: SitemapKind; page: number }>): Promise<readonly PublicSitemapEntry[]>;
  listPolicies(input: Readonly<{ hostname: string; now: Date }>): Promise<readonly PublicPolicyPage[]>;
  getPolicy(input: Readonly<{ hostname: string; now: Date; key: StorefrontPolicyKey }>): Promise<PublicPolicySourcePage>;
  search(input: Readonly<{ hostname: string; now: Date; query: string; limit: number; cursor?: string }>): Promise<PublicProductSearch>;
  resolveProductIds(input: Readonly<{ hostname: string; now: Date; productIds: readonly string[] }>): Promise<readonly PublicProduct[]>;
}

export interface StorePolicyAdminRepository {
  list(input: Readonly<{ tenantContext: TenantContext; now: Date }>): Promise<readonly StorePolicyAdminPage[]>;
  save(input: Readonly<{
    tenantContext: TenantContext;
    now: Date;
    operationId: string;
    key: StorefrontPolicyKey;
    expectedVersion: number;
    body: string;
    status: StorePolicyStatus;
  }>): Promise<StorePolicyAdminPage>;
}

export type PostgresPublicStorefrontContentRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
}>;

export type StorePolicyAuditEvent = Readonly<{ type: "store_policy_commit_unknown" }>;

export type PostgresStorePolicyAdminRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_app";
  timeouts: PostgresTimeoutOptions;
  audit: (event: StorePolicyAuditEvent) => void | Promise<void>;
}>;
