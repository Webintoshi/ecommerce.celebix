import type {
  QuickOrderAddress,
  QuickOrderLinkDetail,
  QuickOrderLinkListItem,
  QuickOrderLinkMutationResult,
  QuickOrderLinkStatus,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface QuickLinkAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface ListQuickLinksInput extends QuickLinkAuthorityInput {
  readonly pageSize: number;
  readonly cursor?: string;
  readonly status?: QuickOrderLinkStatus;
}

export interface GetQuickLinkInput extends QuickLinkAuthorityInput {
  readonly linkId: string;
}

export interface SealedQuickLinkToken {
  readonly algorithm: "A256GCM";
  readonly ciphertext: string;
  readonly iv: string;
  readonly keyId: string;
  readonly tag: string;
  readonly version: 1;
}

export interface CreateQuickLinkItemInput {
  readonly itemId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly itemType?: "PHYSICAL" | "VIRTUAL";
}

export interface SealedQuickLinkBuyerIdentity {
  readonly authority: string;
  readonly sealedIdentity: Readonly<SealedQuickLinkToken>;
}

export interface CreateQuickLinkInput extends QuickLinkAuthorityInput {
  readonly operationId: string;
  readonly linkId: string;
  readonly items: readonly CreateQuickLinkItemInput[];
  readonly providerConfigId?: string;
  readonly paymentMethodId?: string;
  readonly buyerIdentity?: Readonly<SealedQuickLinkBuyerIdentity>;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone?: string;
  readonly shippingAddress: Readonly<QuickOrderAddress>;
  readonly billingAddress: Readonly<QuickOrderAddress>;
  readonly customerNote?: string;
  readonly internalLabel?: string;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly expiryHours: 4 | 12 | 24 | 48 | 72;
  readonly tokenDigest: string;
  readonly sealedToken: Readonly<SealedQuickLinkToken>;
}

export interface CancelQuickLinkInput extends GetQuickLinkInput {
  readonly operationId: string;
  readonly expectedVersion: number;
}

export interface DuplicateQuickLinkInput extends GetQuickLinkInput {
  readonly operationId: string;
  readonly newLinkId: string;
  readonly newItemIds: readonly string[];
  readonly tokenDigest: string;
  readonly sealedToken: Readonly<SealedQuickLinkToken>;
}

export interface ListQuickLinksResult {
  readonly items: readonly QuickOrderLinkListItem[];
  readonly nextCursor?: string;
}

export interface QuickOrderLinkRepository {
  list(input: ListQuickLinksInput): Promise<ListQuickLinksResult>;
  get(input: GetQuickLinkInput): Promise<QuickOrderLinkDetail>;
  create(input: CreateQuickLinkInput): Promise<QuickOrderLinkMutationResult>;
  cancel(input: CancelQuickLinkInput): Promise<QuickOrderLinkMutationResult>;
  duplicate(input: DuplicateQuickLinkInput): Promise<QuickOrderLinkMutationResult>;
}

export type QuickLinkOperationKind = "create" | "cancel" | "duplicate";

export interface QuickOrderLinkAuditEvent {
  readonly type: "quick_link_commit_unknown";
}

export interface PostgresQuickOrderLinkRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (event: QuickOrderLinkAuditEvent) => void | Promise<void>;
}
