import type { ReferenceIdentity, VariantPricingPolicy, TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type ReferencePricingAuthorityInput = Readonly<{ tenantContext: TenantContext; now: Date }>;
export type ReferenceSetValue = Readonly<{ referenceId: string; rateTry: string | null; active: boolean }>;
export type ReferenceSetValueDetail = ReferenceSetValue & Readonly<{
  kind: "usd" | "eur" | "gold_gram";
  label: string;
  referencePurity?: string;
}>;
export type ReferenceSetDetail = Readonly<{
  setId: string; version: number; stateVersion: number; isActive: boolean;
  createdAt: string; values: readonly ReferenceSetValueDetail[];
}>;
export type ReferenceSetList = Readonly<{
  activeSetId: string | null; stateVersion: number;
  items: readonly Readonly<{ setId: string; version: number; createdAt: string; isActive: boolean }>[];
  nextCursor: number | null;
}>;
export type ReferenceDefinitionList = Readonly<{ items: readonly ReferenceIdentity[] }>;
export type ReferenceImpactEntry = Readonly<{
  variantId: string; productId: string;
  oldPriceCents: number | null; newPriceCents: number | null;
  overriddenByPriceList: boolean;
}>;
export type ReferenceImpactPreview = Readonly<{
  setId: string; scopeDigest: string;
  affectedProducts: number; affectedVariants: number;
  fixedOverrideVariants: number; unavailableVariants: number;
  entries: readonly ReferenceImpactEntry[];
  nextCursor: string | null;
}>;
export type SavedReferenceSet = ReferenceSetDetail;
export type ActivatedReferenceSet = Readonly<{
  setId: string; version: number; stateVersion: number; activatedAt: string;
}>;
export type VariantPolicyProjection = Readonly<{
  variantId: string; variantVersion: number; version: number;
  policy: VariantPricingPolicy; updatedAt: string;
}>;
export type VariantPolicyPreview = Readonly<{
  variantId: string; oldPriceCents: number | null; newPriceCents: number | null;
  sourceKind: "base" | "price_list" | null; priceListId: string | null;
  activeSetId: string | null; activeSetVersion: number | null;
  referenceId: string | null; referenceRateTry: string | null;
  method: "fixed_try" | "usd" | "eur" | "gold_gram";
  metalComponentTry: string | null; laborTry: string | null;
  policyVersion: number; variantVersion: number; scopeDigest: string;
}>;
export interface ReferencePricingRepository {
  listDefinitions(input: ReferencePricingAuthorityInput): Promise<ReferenceDefinitionList>;
  list(input: ReferencePricingAuthorityInput & Readonly<{ pageSize: number; afterSetVersion?: number }>): Promise<ReferenceSetList>;
  get(input: ReferencePricingAuthorityInput & Readonly<{ setId?: string }>): Promise<ReferenceSetDetail>;
  getPolicy(input: ReferencePricingAuthorityInput & Readonly<{ variantId: string }>): Promise<VariantPolicyProjection>;
  previewPolicy(input: ReferencePricingAuthorityInput & Readonly<{ variantId: string; channel: "storefront"; policy: VariantPricingPolicy }>): Promise<VariantPolicyPreview>;
  preview(input: ReferencePricingAuthorityInput & Readonly<{ setId: string; channel: "storefront" | "quick_order"; pageSize: number; afterVariantId?: string }>): Promise<ReferenceImpactPreview>;
  define(input: ReferencePricingAuthorityInput & Readonly<{ operationId: string; referenceId: string; kind: "usd" | "eur" | "gold_gram"; label: string; referencePurity?: string }>): Promise<ReferenceIdentity>;
  saveSet(input: ReferencePricingAuthorityInput & Readonly<{ operationId: string; setId: string; expectedStateVersion: number; values: readonly ReferenceSetValue[] }>): Promise<SavedReferenceSet>;
  activate(input: ReferencePricingAuthorityInput & Readonly<{ operationId: string; setId: string; expectedStateVersion: number; expectedScopeDigest: string }>): Promise<ActivatedReferenceSet>;
  savePolicy(input: ReferencePricingAuthorityInput & Readonly<{ operationId: string; variantId: string; expectedVariantVersion: number; expectedPolicyVersion: number; expectedScopeDigest: string; policy: VariantPricingPolicy }>): Promise<VariantPolicyProjection>;
}
export type ReferencePricingAuditEvent = Readonly<{ type: "reference_pricing_commit_unknown" }>;
export interface PostgresReferencePricingRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (event: ReferencePricingAuditEvent) => void | Promise<void>;
}
