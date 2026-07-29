export const ORDER_STATUSES = Object.freeze([
  "pending", "confirmed", "preparing", "shipped", "delivered", "cancelled", "refunded",
] as const);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = Object.freeze([
  "pending", "processing", "completed", "failed", "refunded",
] as const);
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const ORDER_SOURCES = Object.freeze(["storefront", "quick_link", "marketplace", "manual_import"] as const);
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SORTS = Object.freeze(["newest", "oldest", "highest", "lowest"] as const);
export type OrderSort = (typeof ORDER_SORTS)[number];

export interface OrderAddress {
  readonly recipientName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly district?: string;
  readonly city: string;
  readonly postalCode?: string;
  readonly country: string;
}

export interface OrderTracking {
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly trackingUrl?: string;
  readonly shippedAt?: string;
}

export interface OrderItem {
  readonly id: string;
  readonly position: number;
  readonly productName: string;
  readonly variantName?: string;
  readonly sku?: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly discountCents: number;
  readonly lineTotalCents: number;
}

export interface OrderEvent {
  readonly id: string;
  readonly type: string;
  readonly message: string;
  readonly createdAt: string;
}

export interface OrderNote {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrderListItem {
  readonly id: string;
  readonly orderNumber: string;
  readonly source: OrderSource;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly status: OrderStatus;
  readonly paymentStatus: OrderPaymentStatus;
  readonly itemCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface OrderDetail extends OrderListItem {
  readonly customerPhone?: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly shippingAddress: Readonly<OrderAddress>;
  readonly tracking?: Readonly<OrderTracking>;
  readonly items: readonly OrderItem[];
  readonly events: readonly OrderEvent[];
  readonly notes: readonly OrderNote[];
}

export interface OrderDashboardSummary {
  readonly totalOrders: number;
  readonly pendingOrders: number;
  readonly fulfilledOrders: number;
  readonly revenueCents: number;
  readonly currency: string;
  readonly asOf: string;
}
