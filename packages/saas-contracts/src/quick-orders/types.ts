export const QUICK_ORDER_LINK_STATUSES = Object.freeze(["active", "opened", "paid", "cancelled", "expired"] as const);
export const QUICK_ORDER_EXPIRY_HOURS = Object.freeze([4, 12, 24, 48, 72] as const);
export const QUICK_ORDER_MAX_UNIT_PRICE_CENTS = 8_000_000_000;
export const QUICK_ORDER_MAX_COMPONENT_CENTS = 500_000_000_000_000;
export const QUICK_ORDER_MAX_TOTAL_CENTS = 8_500_000_000_000_000;

export type QuickOrderLinkStatus = (typeof QUICK_ORDER_LINK_STATUSES)[number];

export interface QuickOrderLinkItem {
  readonly id: string;
  readonly position: number;
  readonly productName: string;
  readonly variantName?: string;
  readonly sku?: string;
  readonly imageUrl?: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

export interface QuickOrderAddress {
  readonly recipientName: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2?: string;
  readonly district?: string;
  readonly city: string;
  readonly postalCode?: string;
  readonly country: string;
}

export interface QuickOrderCreateIntent {
  readonly items: readonly Readonly<{ variantId: string; quantity: number }>[];
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone: string;
  readonly shippingAddress: Readonly<QuickOrderAddress>;
  readonly billingAddress: Readonly<QuickOrderAddress>;
  readonly customerNote?: string;
  readonly internalLabel?: string;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly expiryHours: 4 | 12 | 24 | 48 | 72;
}

export interface QuickOrderLinkListItem {
  readonly id: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly firstProductName: string;
  readonly itemCount: number;
  readonly status: QuickOrderLinkStatus;
  readonly currency: string;
  readonly totalCents: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly version: number;
}

export interface QuickOrderLinkDetail extends QuickOrderLinkListItem {
  readonly customerPhone?: string;
  readonly shippingAddress: Readonly<QuickOrderAddress>;
  readonly billingAddress: Readonly<QuickOrderAddress>;
  readonly customerNote?: string;
  readonly internalLabel?: string;
  readonly providerKey: "paytr";
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly items: readonly QuickOrderLinkItem[];
  readonly openedAt?: string;
  readonly paidAt?: string;
  readonly cancelledAt?: string;
  readonly orderId?: string;
  readonly updatedAt: string;
}

export interface QuickOrderLinkMutationResult {
  readonly id: string;
  readonly status: QuickOrderLinkStatus;
  readonly version: number;
  readonly expiresAt: string;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
