export const ANALYTICS_RANGES = Object.freeze(["7d", "30d", "90d"] as const);
export const ANALYTICS_METRIC_TYPES = Object.freeze(["path", "referrer", "device", "country", "event"] as const);
export const ANALYTICS_CONNECTION_STATUSES = Object.freeze(["pending", "active", "disabled", "failed"] as const);

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export type AnalyticsMetricType = (typeof ANALYTICS_METRIC_TYPES)[number];
export type AnalyticsConnectionStatus = (typeof ANALYTICS_CONNECTION_STATUSES)[number];

export type AnalyticsConnectionView = Readonly<{
  schemaVersion: 1;
  provider: "umami";
  status: AnalyticsConnectionStatus;
  configured: boolean;
  hostname: string | null;
  version: number | null;
  lastVerifiedAt: string | null;
}>;

export type AnalyticsPoint = Readonly<{ at: string; value: number }>;

export type AnalyticsSummary = Readonly<{
  schemaVersion: 1;
  range: AnalyticsRange;
  asOf: string;
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totalTimeSeconds: number;
  activeVisitors: number;
  bounceRateBasisPoints: number;
  averageVisitSeconds: number;
  comparison: Readonly<{ pageviews: number; visitors: number; visits: number; bounces: number }> | null;
  pageviewsSeries: readonly AnalyticsPoint[];
  visitsSeries: readonly AnalyticsPoint[];
}>;

export type AnalyticsMetricRow = Readonly<{ label: string; value: number }>;

export type AnalyticsMetricResult = Readonly<{
  schemaVersion: 1;
  range: AnalyticsRange;
  type: AnalyticsMetricType;
  asOf: string;
  items: readonly AnalyticsMetricRow[];
}>;

export type AnalyticsConnectionMutationResult = Readonly<{
  status: AnalyticsConnectionStatus;
  version: number;
  updatedAt: string;
  replayed: boolean;
}>;

export const ANALYTICS_PERIODS = Object.freeze(["today", "week", "month", "year"] as const);
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export interface AnalyticsSeriesPoint {
  readonly startsAt: string;
  readonly orders: number;
  readonly revenueCents: number;
}

export interface AnalyticsTopProduct {
  readonly productId: string;
  readonly title: string;
  readonly quantity: number;
  readonly revenueCents: number;
}

export interface AnalyticsDashboard {
  readonly period: AnalyticsPeriod;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly generatedAt: string;
  readonly currency: string;
  readonly revenueCents: number;
  readonly orders: Readonly<{ total: number; paid: number; cancelled: number; refunded: number }>;
  readonly customers: Readonly<{ total: number; newInPeriod: number }>;
  readonly catalog: Readonly<{ activeProducts: number; lowStockVariants: number }>;
  readonly series: readonly AnalyticsSeriesPoint[];
  readonly topProducts: readonly AnalyticsTopProduct[];
}

export const BROWSER_COMMERCE_EVENT_NAMES = Object.freeze([
  "storefront_view", "product_view", "category_view", "search",
  "add_to_cart", "remove_from_cart", "view_cart", "begin_checkout",
  "checkout_address_completed", "shipping_method_selected",
  "payment_method_selected", "checkout_validation_error", "coupon_applied",
  "whatsapp_click", "phone_click",
] as const);

export const SERVER_COMMERCE_EVENT_NAMES = Object.freeze([
  "purchase", "payment_failed", "refund", "order_cancelled",
  "cart_abandoned", "cart_resumed", "cart_recovered",
  "recovery_message_queued", "recovery_message_sent", "recovery_message_failed",
] as const);

export type BrowserCommerceEventName = (typeof BROWSER_COMMERCE_EVENT_NAMES)[number];
export type ServerCommerceEventName = (typeof SERVER_COMMERCE_EVENT_NAMES)[number];
export type CommerceEventName = BrowserCommerceEventName | ServerCommerceEventName;

export interface CommerceAnalyticsEvent {
  readonly schemaVersion: 1;
  readonly eventName: CommerceEventName;
  readonly occurredAt: string;
  readonly anonymousSessionRef?: string;
  readonly cartRef?: string;
  readonly checkoutRef?: string;
  readonly orderRef?: string;
  readonly productId?: string;
  readonly variantId?: string;
  readonly categoryId?: string;
  readonly quantity?: number;
  readonly currency?: string;
  readonly valueMinor?: number;
  readonly paymentMethod?: string;
  readonly shippingMethod?: string;
  readonly campaign?: string;
  readonly source?: string;
  readonly medium?: string;
  readonly safeErrorCode?: string;
}

export type BrowserCommerceEvent = Omit<CommerceAnalyticsEvent, "eventName"> &
  Readonly<{ eventName: BrowserCommerceEventName }>;
export type ServerCommerceEvent = Omit<CommerceAnalyticsEvent, "eventName"> &
  Readonly<{ eventName: ServerCommerceEventName }>;

export interface CommerceAnalyticsCurrencyBucket {
  readonly currency: string;
  readonly activeCarts: number;
  readonly candidateCarts: number;
  readonly eligibleCarts: number;
  readonly checkoutStarts: number;
  readonly checkoutAbandoned: number;
  readonly paymentFailures: number;
  readonly paidOrders: number;
  readonly grossRevenueMinor: number;
  readonly refundedMinor: number;
  readonly abandonedCarts: number;
  readonly abandonedValueMinor: number;
  readonly recoveredCarts: number;
  readonly recoveredGrossMinor: number;
  readonly recoveredRefundedMinor: number;
  readonly recoveredNetMinor: number;
}

export interface CommerceAnalyticsAttributionBucket {
  readonly source: string;
  readonly medium: string;
  readonly campaign: string | null;
  readonly currency: string;
  readonly paidOrders: number;
  readonly grossRevenueMinor: number;
  readonly abandonedCarts: number;
  readonly recoveredRevenueMinor: number;
}

export interface CommerceAnalyticsWorkerStatus {
  readonly pending: number;
  readonly claimed: number;
  readonly retry: number;
  readonly deadLetter: number;
  readonly oldestPendingSeconds: number;
  readonly lastSuccessfulDelivery: string | null;
  readonly deliveryLatencyMilliseconds: number;
}

export interface CommerceAnalyticsSettings {
  readonly candidateInactivityMinutes: number;
  readonly abandonedInactivityHours: number;
  readonly recoveryLinkHours: number;
  readonly automaticRecoveryEnabled: boolean;
  readonly maximumMessageAttempts: number;
  readonly minimumMessageIntervalHours: number;
  readonly trackingPolicy: "disabled" | "anonymous_commerce";
  readonly version: number;
}

export interface CommerceAnalyticsSnapshot {
  readonly schemaVersion: 1;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly currencies: readonly CommerceAnalyticsCurrencyBucket[];
  readonly attribution: readonly CommerceAnalyticsAttributionBucket[];
  readonly worker: CommerceAnalyticsWorkerStatus;
  readonly settings: CommerceAnalyticsSettings;
}
