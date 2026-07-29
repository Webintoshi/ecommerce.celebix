export const ABANDONED_CART_STATUSES = Object.freeze([
  "active",
  "abandoned",
  "recovered",
  "archived",
] as const);

export type AbandonedCartStatus = (typeof ABANDONED_CART_STATUSES)[number];

export const ABANDONED_CART_SORTS = Object.freeze(["newest", "oldest", "highest", "lowest"] as const);

export type AbandonedCartSort = (typeof ABANDONED_CART_SORTS)[number];

export interface AbandonedCartListItem {
  readonly id: string;
  readonly status: AbandonedCartStatus;
  readonly customerName?: string;
  readonly customerEmail?: string;
  readonly customerPhone?: string;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly itemCount: number;
  readonly checkoutStartedAt: string;
  readonly lastActivityAt: string;
  readonly abandonedAt?: string;
  readonly recoveredAt?: string;
  readonly archivedAt?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AbandonedCartItem {
  readonly id: string;
  readonly position: number;
  readonly productName: string;
  readonly variantName?: string;
  readonly sku?: string;
  readonly imageUrl?: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly discountCents: number;
  readonly lineTotalCents: number;
}

export interface AbandonedCartDetail extends AbandonedCartListItem {
  readonly items: readonly AbandonedCartItem[];
}

export interface AbandonedCartSummary {
  readonly abandoned: number;
  readonly recovered: number;
  readonly lostValueCents: number;
  readonly recoveredValueCents: number;
  readonly currency: string;
  readonly asOf: string;
}

export interface AbandonedCartMutationResult {
  readonly id: string;
  readonly status: "recovered" | "archived";
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
