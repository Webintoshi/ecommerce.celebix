export type MarketplaceProvider = "trendyol" | "hepsiburada" | "n11" | "amazon_tr";

export type MarketplaceConnectionStatus = "disconnected" | "active" | "error";

export type MarketplaceSyncStatus =
  | "idle"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "manual_action_required";

export type MarketplaceListingStatus = "pending" | "active" | "inactive" | "error";

export type MarketplaceQueueDirection = "outbound" | "inbound" | "system";

export type MarketplaceQueueEntityType = "product" | "variant" | "order" | "provider" | "webhook";

export type MarketplaceQueueOperation =
  | "upsert_listing"
  | "update_inventory"
  | "pull_orders"
  | "update_order_status"
  | "acknowledge_order"
  | "reconcile";

export interface TrendyolCredentials {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  webhookApiKey?: string;
  webhookSecret?: string;
  webhookUsername?: string;
  webhookPassword?: string;
}

export interface HepsiburadaCredentials {
  merchantId: string;
  integrationUsername: string;
  serviceKey: string;
  webhookUsername?: string;
  webhookPassword?: string;
}

export interface N11Credentials {
  appKey: string;
  appSecret: string;
}

export interface AmazonTrCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string;
  marketplaceId?: string;
}

export type MarketplaceProviderCredentialsMap = {
  trendyol: TrendyolCredentials;
  hepsiburada: HepsiburadaCredentials;
  n11: N11Credentials;
  amazon_tr: AmazonTrCredentials;
};

export type MarketplaceProviderCredentials<P extends MarketplaceProvider = MarketplaceProvider> =
  MarketplaceProviderCredentialsMap[P];

export interface MarketplaceFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "password" | "url" | "number";
  placeholder?: string;
  description?: string;
}

export interface MarketplaceProviderDefinition {
  id: MarketplaceProvider;
  name: string;
  description: string;
  websiteUrl: string;
  docsUrl?: string;
  logo: string;
  logoComponent?: React.FC<{ size?: number }>;
  color: string;
  supportsWebhook: boolean;
  credentialFields: MarketplaceFieldDefinition[];
  mappingFields: MarketplaceFieldDefinition[];
  capabilities: string[];
}

export interface MarketplaceConnectionInput {
  credentials: Record<string, string> | MarketplaceProviderCredentials;
  settings?: Record<string, unknown>;
  fieldMappings?: Record<string, string>;
}

export interface MarketplaceProviderConnection {
  id: string;
  provider: MarketplaceProvider;
  status: MarketplaceConnectionStatus;
  settings: Record<string, unknown>;
  fieldMappings: Record<string, string>;
  supportsWebhook: boolean;
  lastHealthcheckAt: string | null;
  lastHealthcheckStatus: "ok" | "failed" | null;
  lastHealthcheckMessage: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceQueueStats {
  queued: number;
  failed: number;
  manualActionRequired: number;
}

export interface MarketplaceListingStats {
  total: number;
  active: number;
  error: number;
}

export interface MarketplaceIntegrationView {
  provider: MarketplaceProviderDefinition;
  connection: MarketplaceProviderConnection | null;
  queueStats: MarketplaceQueueStats;
  listingStats: MarketplaceListingStats;
}

export interface MarketplaceListingView {
  provider: MarketplaceProvider;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: string | null;
  variantId: string;
  variantName: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  stock: number;
  externalListingId: string | null;
  externalSku: string | null;
  status: MarketplaceListingStatus;
  lastSyncedPrice: number | null;
  lastSyncedStock: number | null;
  lastError: string | null;
  issue: string | null;
  updatedAt: string | null;
}

export interface MarketplaceSyncLogView {
  id: string;
  provider: MarketplaceProvider;
  direction: MarketplaceQueueDirection;
  entityType: string;
  entityId: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MarketplaceListingSyncItem {
  productId: string;
  productName: string;
  productSlug: string;
  productDescription: string | null;
  variantId: string;
  variantName: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  stock: number;
  images: string[];
  brand: string | null;
  isActive: boolean;
}

export interface MarketplaceListingUpsertResultItem {
  variantId: string;
  externalListingId: string;
  externalSku: string | null;
  status: MarketplaceListingStatus;
  raw?: Record<string, unknown>;
}

export interface MarketplaceInventorySyncItem {
  variantId: string;
  sku: string | null;
  externalListingId: string | null;
  stock: number;
  price: number;
}

export interface MarketplaceInventorySyncResultItem {
  variantId: string;
  externalListingId: string | null;
  raw?: Record<string, unknown>;
}

export interface MarketplacePulledOrderItem {
  externalListingId?: string | null;
  sku?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
}

export interface MarketplacePulledOrder {
  externalOrderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  notes?: string | null;
  customer: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  shippingAddress: Record<string, unknown>;
  items: MarketplacePulledOrderItem[];
  raw: Record<string, unknown>;
}

export interface MarketplaceProviderAdapterResult {
  success: boolean;
  message: string;
  externalId?: string | null;
  latencyMs?: number | null;
  providerStatusCode?: number | null;
  providerErrorCode?: string | null;
  raw?: Record<string, unknown>;
}

export interface MarketplaceWebhookVerificationResult {
  success: boolean;
  statusCode?: 401 | 403;
  message?: string;
}

export interface MarketplaceOrderStatusUpdateInput {
  externalOrderId: string;
  status: string;
  paymentStatus: string;
  shippingCarrier?: string | null;
  trackingNumber?: string | null;
}

export interface MarketplaceProviderAdapter {
  connect(input: {
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
  }): Promise<MarketplaceProviderAdapterResult>;
  testConnection(input: {
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
  }): Promise<MarketplaceProviderAdapterResult>;
  upsertListings(input: {
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
    listings: MarketplaceListingSyncItem[];
    existingMappings: Array<{
      variantId: string;
      externalListingId: string | null;
      externalSku: string | null;
    }>;
  }): Promise<MarketplaceListingUpsertResultItem[]>;
  updateInventory(input: {
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
    inventory: MarketplaceInventorySyncItem[];
  }): Promise<MarketplaceInventorySyncResultItem[]>;
  pullOrders(input: {
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
    since?: string;
  }): Promise<MarketplacePulledOrder[]>;
  acknowledgeOrder(input: {
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
    externalOrderId: string;
  }): Promise<MarketplaceProviderAdapterResult>;
  updateOrderStatus(input: {
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
    update: MarketplaceOrderStatusUpdateInput;
  }): Promise<MarketplaceProviderAdapterResult>;
  verifyWebhookSignature?(input: {
    credentials: Record<string, string>;
    rawBody: string;
    headers: Record<string, string>;
    settings?: Record<string, unknown>;
  }): Promise<MarketplaceWebhookVerificationResult>;
  normalizeError(error: unknown): string;
}
