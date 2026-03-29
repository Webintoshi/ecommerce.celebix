export type AccountingProvider =
  | "parasut"
  | "bizimhesap"
  | "mikro"
  | "logo_isbasi"
  | "kolaybi"
  | "mukellef";

export type AccountingSyncStatus =
  | "idle"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "manual_action_required";

export type InvoiceLifecycleStatus =
  | "draft"
  | "ready"
  | "sent"
  | "accepted"
  | "rejected"
  | "cancelled";

export type AccountingDirection = "outbound" | "inbound" | "system";

export interface AccountingFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "password" | "url" | "number";
  placeholder?: string;
  description?: string;
}

export interface AccountingProviderDefinition {
  id: AccountingProvider;
  name: string;
  description: string;
  websiteUrl: string;
  docsUrl?: string;
  supportsWebhook: boolean;
  credentialFields: AccountingFieldDefinition[];
  mappingFields: AccountingFieldDefinition[];
}

export interface AccountingConnectionInput {
  credentials: Record<string, string>;
  syncMode?: "safe_hybrid";
  fieldMappings?: Record<string, string>;
  settings?: Record<string, unknown>;
}

export interface AccountingProviderConnection {
  id: string;
  provider: AccountingProvider;
  status: "disconnected" | "active" | "error";
  syncMode: "safe_hybrid";
  fieldMappings: Record<string, string>;
  settings: Record<string, unknown>;
  supportsWebhook: boolean;
  lastHealthcheckAt: string | null;
  lastHealthcheckStatus: "ok" | "failed" | null;
  lastHealthcheckMessage: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingIntegrationView {
  provider: AccountingProviderDefinition;
  connection: AccountingProviderConnection | null;
  queueStats: {
    queued: number;
    failed: number;
    manualActionRequired: number;
  };
}

export interface AccountingOverviewData {
  today: {
    invoiceCount: number;
    syncedCount: number;
    queuedCount: number;
    invoicedAmount: number;
  };
  openReceivables: {
    orderCount: number;
    amount: number;
    orders: Array<{
      id: string;
      orderNumber: string;
      total: number;
      createdAt: string;
      paymentStatus: string;
    }>;
  };
  vatSummary: {
    rate: number;
    taxBase: number;
    taxAmount: number;
    grossAmount: number;
  };
  syncStatus: {
    activeConnections: number;
    pendingQueue: number;
    failedQueue: number;
    lastSyncAt: string | null;
  };
}

export interface AccountingOrderSnapshot {
  provider: AccountingProvider | null;
  syncStatus: AccountingSyncStatus;
  invoiceStatus: InvoiceLifecycleStatus | null;
  invoiceNo: string | null;
  invoiceUrl: string | null;
  lastError: string | null;
  attemptCount: number;
  updatedAt: string | null;
}

export interface AccountingProviderAdapterResult {
  success: boolean;
  message: string;
  externalId?: string | null;
  invoiceNo?: string | null;
  invoiceUrl?: string | null;
  raw?: Record<string, unknown>;
}

export interface AccountingPaymentPullResult {
  externalPaymentId: string;
  orderId: string | null;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  raw: Record<string, unknown>;
}

