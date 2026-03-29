import { createServerClient } from "@/lib/supabase";
import {
  getAccountingProviderAdapter,
  getAccountingProviderDefinition,
  isAccountingProvider,
  ACCOUNTING_PROVIDER_DEFINITIONS,
} from "@/lib/accounting-providers";
import { decryptAccountingCredentials, encryptAccountingCredentials } from "@/lib/accounting-crypto";
import type {
  AccountingConnectionInput,
  AccountingIntegrationView,
  AccountingOrderSnapshot,
  AccountingOverviewData,
  AccountingProvider,
  AccountingProviderConnection,
  AccountingSyncStatus,
  InvoiceLifecycleStatus,
} from "@/types/accounting";

type ProviderConnectionRow = {
  id: string;
  provider: string;
  status: "disconnected" | "active" | "error";
  encrypted_credentials: string | null;
  sync_mode: "safe_hybrid";
  field_mappings: Record<string, string> | null;
  settings: Record<string, unknown> | null;
  supports_webhook: boolean;
  last_healthcheck_at: string | null;
  last_healthcheck_status: "ok" | "failed" | null;
  last_healthcheck_message: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceQueueRow = {
  id: string;
  order_id: string;
  provider: string;
  payload: Record<string, unknown> | null;
  status: AccountingSyncStatus;
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  processed_at: string | null;
  updated_at: string;
};

type AccountingInvoiceRow = {
  id: string;
  order_id: string;
  provider: string;
  external_invoice_id: string | null;
  invoice_no: string | null;
  invoice_url: string | null;
  status: string;
  total_amount: number | null;
  issued_at: string | null;
  updated_at: string;
};

const MAX_RETRY_COUNT = 5;

function isMissingRelationError(error: unknown) {
  const code = typeof error === "object" && error ? String((error as { code?: string }).code || "") : "";
  const message = typeof error === "object" && error ? String((error as { message?: string }).message || "") : "";
  return code === "42P01" || code === "PGRST205" || message.toLowerCase().includes("does not exist");
}

function buildMissingTableError() {
  return new Error("Muhasebe tablolari bulunamadi. Once sql/accounting_runtime.sql dosyasini calistirin.");
}

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInvoiceStatus(value: string | null | undefined): InvoiceLifecycleStatus | null {
  if (!value) return null;
  if (
    value === "draft" ||
    value === "ready" ||
    value === "sent" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "cancelled"
  ) {
    return value;
  }
  return null;
}

function toSyncStatus(value: string | null | undefined): AccountingSyncStatus {
  if (
    value === "idle" ||
    value === "queued" ||
    value === "syncing" ||
    value === "synced" ||
    value === "failed" ||
    value === "manual_action_required"
  ) {
    return value;
  }
  return "idle";
}

function computeNextRetryDate(attemptCount: number) {
  const minutes = Math.min(5 * Math.pow(2, Math.max(0, attemptCount - 1)), 12 * 60);
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function mapConnection(row: ProviderConnectionRow): AccountingProviderConnection {
  return {
    id: row.id,
    provider: row.provider as AccountingProvider,
    status: row.status,
    syncMode: row.sync_mode || "safe_hybrid",
    fieldMappings: row.field_mappings || {},
    settings: row.settings || {},
    supportsWebhook: Boolean(row.supports_webhook),
    lastHealthcheckAt: row.last_healthcheck_at,
    lastHealthcheckStatus: row.last_healthcheck_status,
    lastHealthcheckMessage: row.last_healthcheck_message,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertSyncLog(input: {
  provider: AccountingProvider;
  direction: "outbound" | "inbound" | "system";
  entityType: string;
  entityId: string | null;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
}) {
  const supabase = createServerClient();
  await supabase.from("accounting_sync_logs").insert({
    provider: input.provider,
    direction: input.direction,
    entity_type: input.entityType,
    entity_id: input.entityId,
    status: input.status,
    error_code: input.errorCode || null,
    error_message: input.errorMessage || null,
    payload: input.payload || {},
  });
}

async function getProviderConnectionRow(provider: AccountingProvider) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("accounting_provider_connections")
    .select("*")
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  return (data as ProviderConnectionRow | null) || null;
}

async function getDefaultActiveProvider() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("accounting_provider_connections")
    .select("provider")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  if (!data?.provider || !isAccountingProvider(data.provider)) {
    return null;
  }
  return data.provider;
}

export async function listAccountingIntegrations(): Promise<AccountingIntegrationView[]> {
  const supabase = createServerClient();
  const [{ data: connectionRows, error: connectionError }, { data: queueRows, error: queueError }] = await Promise.all([
    supabase.from("accounting_provider_connections").select("*"),
    supabase.from("accounting_invoice_queue").select("provider,status"),
  ]);

  if (connectionError) {
    if (isMissingRelationError(connectionError)) throw buildMissingTableError();
    throw connectionError;
  }

  if (queueError) {
    if (isMissingRelationError(queueError)) throw buildMissingTableError();
    throw queueError;
  }

  const connectionMap = new Map<string, ProviderConnectionRow>();
  for (const row of (connectionRows || []) as ProviderConnectionRow[]) {
    connectionMap.set(row.provider, row);
  }

  const queueMap = new Map<string, { queued: number; failed: number; manualActionRequired: number }>();
  for (const row of (queueRows || []) as Array<{ provider: string; status: string }>) {
    const current = queueMap.get(row.provider) || { queued: 0, failed: 0, manualActionRequired: 0 };
    if (row.status === "queued" || row.status === "syncing") current.queued += 1;
    if (row.status === "failed") current.failed += 1;
    if (row.status === "manual_action_required") current.manualActionRequired += 1;
    queueMap.set(row.provider, current);
  }

  return ACCOUNTING_PROVIDER_DEFINITIONS.map((provider) => ({
    provider,
    connection: connectionMap.has(provider.id) ? mapConnection(connectionMap.get(provider.id) as ProviderConnectionRow) : null,
    queueStats: queueMap.get(provider.id) || { queued: 0, failed: 0, manualActionRequired: 0 },
  }));
}

export async function saveAccountingConnection(provider: AccountingProvider, input: AccountingConnectionInput) {
  const definition = getAccountingProviderDefinition(provider);
  if (!definition) {
    throw new Error("Gecersiz saglayici secimi.");
  }

  const missingField = definition.credentialFields.find(
    (field) => field.required && !input.credentials?.[field.key]?.trim(),
  );
  if (missingField) {
    throw new Error(`Zorunlu alan eksik: ${missingField.label}`);
  }

  const encryptedCredentials = encryptAccountingCredentials(input.credentials || {});
  const adapter = getAccountingProviderAdapter(provider);
  const connectionResult = await adapter.connect({ credentials: input.credentials || {} });

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("accounting_provider_connections")
    .upsert(
      {
        provider,
        status: connectionResult.success ? "active" : "error",
        encrypted_credentials: encryptedCredentials,
        sync_mode: "safe_hybrid",
        field_mappings: input.fieldMappings || {},
        settings: input.settings || {},
        supports_webhook: definition.supportsWebhook,
        last_healthcheck_at: now,
        last_healthcheck_status: connectionResult.success ? "ok" : "failed",
        last_healthcheck_message: connectionResult.message,
      },
      { onConflict: "provider" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  await insertSyncLog({
    provider,
    direction: "system",
    entityType: "connection",
    entityId: provider,
    status: connectionResult.success ? "connected" : "failed",
    errorMessage: connectionResult.success ? null : connectionResult.message,
  });

  return {
    connection: mapConnection(data as ProviderConnectionRow),
    testResult: connectionResult,
  };
}

export async function testAccountingConnection(provider: AccountingProvider) {
  const definition = getAccountingProviderDefinition(provider);
  if (!definition) throw new Error("Gecersiz saglayici.");

  const connection = await getProviderConnectionRow(provider);
  if (!connection) {
    throw new Error("Saglayici baglantisi bulunamadi.");
  }

  const credentials = decryptAccountingCredentials(connection.encrypted_credentials);
  const adapter = getAccountingProviderAdapter(provider);
  const result = await adapter.testConnection({ credentials });
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("accounting_provider_connections")
    .update({
      status: result.success ? "active" : "error",
      last_healthcheck_at: now,
      last_healthcheck_status: result.success ? "ok" : "failed",
      last_healthcheck_message: result.message,
    })
    .eq("provider", provider);

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  await insertSyncLog({
    provider,
    direction: "system",
    entityType: "healthcheck",
    entityId: provider,
    status: result.success ? "ok" : "failed",
    errorMessage: result.success ? null : result.message,
  });

  return result;
}

export async function queueInvoiceCandidateFromOrder(
  orderId: string,
  options?: {
    provider?: AccountingProvider;
    triggerSource?: string;
    force?: boolean;
  },
) {
  const supabase = createServerClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, total, subtotal, discount, payment_status, created_at, customer_id, shipping_address")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error("Siparis bulunamadi.");
  }

  if (!options?.force && order.payment_status !== "completed") {
    throw new Error("Sadece odemesi tamamlanan siparisler faturalastirilabilir.");
  }

  const [itemsResponse, customerResponse] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, product_name, variant_name, quantity, price, total")
      .eq("order_id", orderId),
    order.customer_id
      ? supabase
          .from("customers")
          .select("id, email, first_name, last_name, phone")
          .eq("id", order.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsResponse.error) {
    throw new Error(itemsResponse.error.message);
  }

  const provider = options?.provider || (await getDefaultActiveProvider());
  if (!provider) {
    throw new Error("Aktif muhasebe saglayicisi bulunamadi.");
  }

  const payload = {
    orderId: order.id,
    orderNumber: order.order_number,
    orderTotal: parseNumber(order.total),
    subtotal: parseNumber(order.subtotal),
    discount: parseNumber(order.discount),
    createdAt: order.created_at,
    paymentStatus: order.payment_status,
    shippingAddress: order.shipping_address || {},
    customer: customerResponse?.data || {},
    items: itemsResponse.data || [],
  };

  const { data, error } = await supabase
    .from("accounting_invoice_queue")
    .upsert(
      {
        order_id: order.id,
        provider,
        payload,
        status: "queued",
        attempt_count: 0,
        next_retry_at: new Date().toISOString(),
        last_error: null,
        trigger_source: options?.triggerSource || "payment_completed",
        processed_at: null,
      },
      { onConflict: "order_id,provider" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  await insertSyncLog({
    provider,
    direction: "outbound",
    entityType: "invoice_queue",
    entityId: order.id,
    status: "queued",
    payload,
  });

  return data as InvoiceQueueRow;
}

export async function processAccountingInvoiceQueue(options?: {
  provider?: AccountingProvider;
  orderId?: string;
  limit?: number;
}) {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const limit = Math.max(1, Math.min(options?.limit || 20, 100));

  let query = supabase
    .from("accounting_invoice_queue")
    .select("*")
    .in("status", ["queued", "failed"])
    .lte("next_retry_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options?.provider) {
    query = query.eq("provider", options.provider);
  }

  if (options?.orderId) {
    query = query.eq("order_id", options.orderId);
  }

  const { data: queueRows, error } = await query;
  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  let syncedCount = 0;
  let failedCount = 0;
  let manualCount = 0;

  for (const row of (queueRows || []) as InvoiceQueueRow[]) {
    if (!isAccountingProvider(row.provider)) continue;

    const connection = await getProviderConnectionRow(row.provider);
    if (!connection || connection.status !== "active") {
      await supabase
        .from("accounting_invoice_queue")
        .update({
          status: "manual_action_required",
          last_error: "Aktif saglayici baglantisi bulunamadi.",
          attempt_count: MAX_RETRY_COUNT,
          next_retry_at: null,
        })
        .eq("id", row.id);
      manualCount += 1;
      await insertSyncLog({
        provider: row.provider,
        direction: "system",
        entityType: "invoice",
        entityId: row.order_id,
        status: "manual_action_required",
        errorMessage: "Aktif saglayici baglantisi bulunamadi.",
      });
      continue;
    }

    let credentials: Record<string, string>;
    try {
      credentials = decryptAccountingCredentials(connection.encrypted_credentials);
    } catch (decryptError) {
      await supabase
        .from("accounting_invoice_queue")
        .update({
          status: "manual_action_required",
          last_error: decryptError instanceof Error ? decryptError.message : "Credential sifresi cozulmedi.",
          attempt_count: MAX_RETRY_COUNT,
          next_retry_at: null,
        })
        .eq("id", row.id);
      manualCount += 1;
      continue;
    }

    await supabase
      .from("accounting_invoice_queue")
      .update({ status: "syncing" })
      .eq("id", row.id);

    const adapter = getAccountingProviderAdapter(row.provider);
    try {
      const result = await adapter.createInvoice({
        credentials,
        payload: (row.payload || {}) as Record<string, unknown>,
      });

      if (!result.success) {
        throw new Error(result.message || "Saglayici faturayi reddetti.");
      }

      const amount = parseNumber((row.payload || {}).orderTotal, 0);
      const issuedAt = new Date().toISOString();
      const { error: invoiceError } = await supabase
        .from("accounting_invoices")
        .upsert(
          {
            order_id: row.order_id,
            provider: row.provider,
            external_invoice_id: result.externalId || null,
            invoice_no: result.invoiceNo || null,
            invoice_url: result.invoiceUrl || null,
            status: "sent",
            total_amount: amount,
            issued_at: issuedAt,
            payload: result.raw || {},
          },
          { onConflict: "order_id,provider" },
        );

      if (invoiceError) {
        if (isMissingRelationError(invoiceError)) throw buildMissingTableError();
        throw invoiceError;
      }

      await supabase
        .from("accounting_invoice_queue")
        .update({
          status: "synced",
          processed_at: issuedAt,
          last_error: null,
        })
        .eq("id", row.id);

      await supabase
        .from("accounting_provider_connections")
        .update({ last_sync_at: issuedAt })
        .eq("provider", row.provider);

      await insertSyncLog({
        provider: row.provider,
        direction: "outbound",
        entityType: "invoice",
        entityId: row.order_id,
        status: "synced",
        payload: result.raw || {},
      });

      syncedCount += 1;
    } catch (syncError) {
      const nextAttempt = (row.attempt_count || 0) + 1;
      const finalStatus = nextAttempt >= MAX_RETRY_COUNT ? "manual_action_required" : "failed";
      const errorMessage =
        syncError instanceof Error ? syncError.message : "Saglayici senkronizasyon hatasi.";

      await supabase
        .from("accounting_invoice_queue")
        .update({
          status: finalStatus,
          attempt_count: nextAttempt,
          last_error: errorMessage,
          next_retry_at: finalStatus === "failed" ? computeNextRetryDate(nextAttempt) : null,
        })
        .eq("id", row.id);

      await insertSyncLog({
        provider: row.provider,
        direction: "outbound",
        entityType: "invoice",
        entityId: row.order_id,
        status: finalStatus,
        errorMessage,
      });

      if (finalStatus === "manual_action_required") {
        manualCount += 1;
      } else {
        failedCount += 1;
      }
    }
  }

  return {
    queuedCount: (queueRows || []).length,
    syncedCount,
    failedCount,
    manualCount,
  };
}

export async function enqueueAndProcessInvoiceForOrder(orderId: string, options?: { provider?: AccountingProvider }) {
  const queued = await queueInvoiceCandidateFromOrder(orderId, {
    provider: options?.provider,
    triggerSource: "payment_completed",
  });

  const syncResult = await processAccountingInvoiceQueue({
    provider: queued.provider as AccountingProvider,
    orderId,
    limit: 1,
  });

  return syncResult;
}

export async function createInvoiceFromOrder(orderId: string, provider?: AccountingProvider) {
  await queueInvoiceCandidateFromOrder(orderId, {
    provider,
    triggerSource: "manual_create_invoice",
  });

  const result = await processAccountingInvoiceQueue({
    provider,
    orderId,
    limit: 1,
  });

  const snapshot = await getOrderAccountingSnapshot(orderId);
  return { result, snapshot };
}

export async function runAccountingSync(provider?: AccountingProvider) {
  const supabase = createServerClient();
  const activeProviders: AccountingProvider[] = [];

  if (provider) {
    activeProviders.push(provider);
  } else {
    const { data, error } = await supabase
      .from("accounting_provider_connections")
      .select("provider")
      .eq("status", "active");

    if (error) {
      if (isMissingRelationError(error)) throw buildMissingTableError();
      throw error;
    }

    for (const row of data || []) {
      if (row.provider && isAccountingProvider(row.provider)) {
        activeProviders.push(row.provider);
      }
    }
  }

  const summaries: Array<{
    provider: AccountingProvider;
    queuedCount: number;
    syncedCount: number;
    failedCount: number;
    manualCount: number;
    paymentsPulled: number;
  }> = [];

  for (const activeProvider of activeProviders) {
    const jobStart = new Date().toISOString();
    const { data: jobRow } = await supabase
      .from("accounting_sync_jobs")
      .insert({
        provider: activeProvider,
        job_type: "manual_sync",
        status: "running",
        started_at: jobStart,
        scheduled_at: jobStart,
      })
      .select("id")
      .maybeSingle();

    const queueSummary = await processAccountingInvoiceQueue({ provider: activeProvider, limit: 50 });
    let paymentsPulled = 0;

    try {
      const connection = await getProviderConnectionRow(activeProvider);
      if (connection) {
        const credentials = decryptAccountingCredentials(connection.encrypted_credentials);
        const adapter = getAccountingProviderAdapter(activeProvider);
        const pulled = await adapter.pullPayments({
          credentials,
          since: connection.last_sync_at || undefined,
        });

        for (const payment of pulled) {
          const { error: upsertError } = await supabase
            .from("accounting_payments")
            .upsert(
              {
                provider: activeProvider,
                order_id: payment.orderId,
                external_payment_id: payment.externalPaymentId,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                paid_at: payment.paidAt,
                payload: payment.raw,
              },
              { onConflict: "provider,external_payment_id" },
            );
          if (!upsertError) paymentsPulled += 1;
        }
      }
    } catch (paymentError) {
      await insertSyncLog({
        provider: activeProvider,
        direction: "inbound",
        entityType: "payment_reconcile",
        entityId: null,
        status: "failed",
        errorMessage: paymentError instanceof Error ? paymentError.message : "Tahsilat cekme hatasi",
      });
    }

    const finishTime = new Date().toISOString();
    if (jobRow?.id) {
      await supabase
        .from("accounting_sync_jobs")
        .update({
          status: "completed",
          finished_at: finishTime,
          metadata: {
            ...queueSummary,
            paymentsPulled,
          },
        })
        .eq("id", jobRow.id);
    }

    await supabase
      .from("accounting_provider_connections")
      .update({ last_sync_at: finishTime })
      .eq("provider", activeProvider);

    summaries.push({
      provider: activeProvider,
      ...queueSummary,
      paymentsPulled,
    });
  }

  return summaries;
}

export async function reconcileAccountingPayments(provider?: AccountingProvider) {
  const summaries = await runAccountingSync(provider);
  return {
    providers: summaries,
    totalProviders: summaries.length,
    totalPayments: summaries.reduce((sum, current) => sum + current.paymentsPulled, 0),
  };
}

export async function getProviderSyncLogs(provider: AccountingProvider, limit = 30) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("accounting_sync_logs")
    .select("*")
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  return data || [];
}

export async function getOrderAccountingSnapshot(orderId: string): Promise<AccountingOrderSnapshot> {
  const supabase = createServerClient();
  const [invoiceResponse, queueResponse] = await Promise.all([
    supabase
      .from("accounting_invoices")
      .select("*")
      .eq("order_id", orderId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("accounting_invoice_queue")
      .select("*")
      .eq("order_id", orderId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (invoiceResponse.error && isMissingRelationError(invoiceResponse.error)) {
    throw buildMissingTableError();
  }
  if (queueResponse.error && isMissingRelationError(queueResponse.error)) {
    throw buildMissingTableError();
  }
  if (invoiceResponse.error) throw invoiceResponse.error;
  if (queueResponse.error) throw queueResponse.error;

  const invoice = invoiceResponse.data as AccountingInvoiceRow | null;
  const queue = queueResponse.data as InvoiceQueueRow | null;

  if (invoice) {
    return {
      provider: isAccountingProvider(invoice.provider) ? invoice.provider : null,
      syncStatus: "synced",
      invoiceStatus: toInvoiceStatus(invoice.status),
      invoiceNo: invoice.invoice_no,
      invoiceUrl: invoice.invoice_url,
      lastError: null,
      attemptCount: queue?.attempt_count || 0,
      updatedAt: invoice.updated_at,
    };
  }

  if (queue) {
    return {
      provider: isAccountingProvider(queue.provider) ? queue.provider : null,
      syncStatus: toSyncStatus(queue.status),
      invoiceStatus: null,
      invoiceNo: null,
      invoiceUrl: null,
      lastError: queue.last_error,
      attemptCount: queue.attempt_count || 0,
      updatedAt: queue.updated_at,
    };
  }

  return {
    provider: null,
    syncStatus: "idle",
    invoiceStatus: null,
    invoiceNo: null,
    invoiceUrl: null,
    lastError: null,
    attemptCount: 0,
    updatedAt: null,
  };
}

export async function getAccountingOverview(): Promise<AccountingOverviewData> {
  const supabase = createServerClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const todayIso = today.toISOString();

  const [
    invoicesResponse,
    queueResponse,
    openReceivablesResponse,
    monthOrdersResponse,
    storeSettingsResponse,
    connectionsResponse,
  ] = await Promise.all([
    supabase.from("accounting_invoices").select("id,status,total_amount,created_at").gte("created_at", todayIso),
    supabase.from("accounting_invoice_queue").select("id,status"),
    supabase
      .from("orders")
      .select("id,order_number,total,created_at,payment_status,status")
      .neq("payment_status", "completed")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("orders")
      .select("subtotal,discount,payment_status,status,created_at")
      .gte("created_at", monthStart)
      .eq("payment_status", "completed")
      .neq("status", "cancelled"),
    supabase.from("settings").select("value").eq("key", "store_info").maybeSingle(),
    supabase.from("accounting_provider_connections").select("status,last_sync_at"),
  ]);

  for (const response of [
    invoicesResponse,
    queueResponse,
    openReceivablesResponse,
    monthOrdersResponse,
    connectionsResponse,
  ]) {
    if (response.error) {
      if (isMissingRelationError(response.error)) throw buildMissingTableError();
      throw response.error;
    }
  }

  const invoices = invoicesResponse.data || [];
  const queueRows = queueResponse.data || [];
  const openOrders = openReceivablesResponse.data || [];
  const monthOrders = monthOrdersResponse.data || [];
  const storeInfo = (storeSettingsResponse.data?.value || {}) as { taxRate?: number };
  const taxRate = parseNumber(storeInfo.taxRate, 20);

  const syncedCount = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "accepted").length;
  const queuedCount = queueRows.filter((queue) => queue.status === "queued" || queue.status === "syncing").length;
  const invoicedAmount = invoices.reduce((sum, invoice) => sum + parseNumber(invoice.total_amount, 0), 0);

  const pendingQueue = queueRows.filter((queue) => queue.status === "queued" || queue.status === "syncing").length;
  const failedQueue = queueRows.filter(
    (queue) => queue.status === "failed" || queue.status === "manual_action_required",
  ).length;

  const openReceivableAmount = openOrders.reduce((sum, order) => sum + parseNumber(order.total, 0), 0);

  const taxBase = monthOrders.reduce(
    (sum, order) => sum + Math.max(0, parseNumber(order.subtotal, 0) - parseNumber(order.discount, 0)),
    0,
  );
  const taxAmount = (taxBase * taxRate) / 100;

  const connections = connectionsResponse.data || [];
  const activeConnections = connections.filter((connection) => connection.status === "active").length;
  const lastSyncAt = connections
    .map((connection) => connection.last_sync_at)
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  return {
    today: {
      invoiceCount: invoices.length,
      syncedCount,
      queuedCount,
      invoicedAmount,
    },
    openReceivables: {
      orderCount: openOrders.length,
      amount: openReceivableAmount,
      orders: openOrders.map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        total: parseNumber(order.total, 0),
        createdAt: order.created_at,
        paymentStatus: order.payment_status,
      })),
    },
    vatSummary: {
      rate: taxRate,
      taxBase,
      taxAmount,
      grossAmount: taxBase + taxAmount,
    },
    syncStatus: {
      activeConnections,
      pendingQueue,
      failedQueue,
      lastSyncAt,
    },
  };
}

export async function recordAccountingWebhook(
  provider: AccountingProvider,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
) {
  const supabase = createServerClient();

  await insertSyncLog({
    provider,
    direction: "inbound",
    entityType: "webhook",
    entityId: String(payload.orderId || payload.order_id || payload.externalInvoiceId || ""),
    status: "received",
    payload: {
      headers,
      payload,
    },
  });

  const orderId = typeof payload.orderId === "string" ? payload.orderId : typeof payload.order_id === "string" ? payload.order_id : null;
  const externalInvoiceId =
    typeof payload.externalInvoiceId === "string"
      ? payload.externalInvoiceId
      : typeof payload.external_invoice_id === "string"
        ? payload.external_invoice_id
        : null;
  const invoiceStatus = typeof payload.status === "string" ? payload.status : null;

  if (orderId && externalInvoiceId) {
    await supabase
      .from("accounting_invoices")
      .upsert(
        {
          order_id: orderId,
          provider,
          external_invoice_id: externalInvoiceId,
          status: invoiceStatus || "sent",
          payload,
        },
        { onConflict: "order_id,provider" },
      );
  }

  return { success: true };
}

