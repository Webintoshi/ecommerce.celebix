import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { decryptMarketplaceCredentials, encryptMarketplaceCredentials } from "@/lib/marketplace-crypto";
import {
  getMarketplaceProviderAdapter,
  getMarketplaceProviderDefinition,
  isMarketplaceProvider,
  MARKETPLACE_PROVIDER_DEFINITIONS,
} from "@/lib/marketplace-providers";
import { createOrder } from "@/lib/db/orders";
import type {
  MarketplaceConnectionInput,
  MarketplaceIntegrationView,
  MarketplaceListingStats,
  MarketplaceListingSyncItem,
  MarketplaceListingView,
  MarketplaceProvider,
  MarketplaceProviderAdapterResult,
  MarketplaceProviderConnection,
  MarketplacePulledOrder,
  MarketplaceQueueDirection,
  MarketplaceQueueOperation,
  MarketplaceSyncLogView,
  MarketplaceSyncStatus,
} from "@/types/marketplace";

type ProviderConnectionRow = {
  id: string;
  provider: string;
  status: "disconnected" | "active" | "error";
  encrypted_credentials: string | null;
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

type ListingRow = {
  id: string;
  provider: string;
  product_id: string;
  variant_id: string;
  external_listing_id: string | null;
  external_sku: string | null;
  status: "pending" | "active" | "inactive" | "error";
  last_synced_price: number | null;
  last_synced_stock: number | null;
  payload_snapshot: Record<string, unknown> | null;
  last_error: string | null;
  updated_at: string;
};

type MarketplaceOrderRow = {
  id: string;
  provider: string;
  external_order_id: string;
  order_status: string | null;
  import_status: MarketplaceSyncStatus;
  internal_order_id: string | null;
  raw_payload: Record<string, unknown> | null;
  normalized_payload: Record<string, unknown> | null;
  last_error: string | null;
  updated_at: string;
};

type QueueRow = {
  id: string;
  provider: string;
  direction: MarketplaceQueueDirection;
  entity_type: string;
  entity_id: string;
  operation: MarketplaceQueueOperation;
  payload: Record<string, unknown> | null;
  status: MarketplaceSyncStatus;
  attempt_count: number;
  next_retry_at: string | null;
  idempotency_key: string;
  last_error: string | null;
  processed_at: string | null;
  updated_at: string;
};

type SyncLogRow = {
  id: string;
  provider: string;
  direction: MarketplaceQueueDirection;
  entity_type: string;
  entity_id: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type ProductVariantRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  stock: number | null;
  images: string[] | null;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: string[] | null;
  brand: string | null;
  status: string | null;
  is_active: boolean | null;
  variants?: ProductVariantRow[];
};

type ProductVariantWithProduct = ProductVariantRow & {
  product: ProductRow | null;
};

const MAX_RETRY_COUNT = 5;

function isMissingRelationError(error: unknown) {
  const code = typeof error === "object" && error ? String((error as { code?: string }).code || "") : "";
  const message = typeof error === "object" && error ? String((error as { message?: string }).message || "") : "";
  return code === "42P01" || code === "PGRST205" || message.toLowerCase().includes("does not exist");
}

function buildMissingTableError() {
  return new Error("Marketplace runtime tablolari bulunamadi. Migration dosyasini calistirin.");
}

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mergeAdapterSettings(input: {
  settings?: Record<string, unknown> | null;
  fieldMappings?: Record<string, string> | null;
}) {
  return {
    ...(input.settings || {}),
    ...(input.fieldMappings || {}),
  };
}

function extractProviderErrorCode(payload: Record<string, unknown>) {
  const direct = payload.providerErrorCode;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = toRecord(payload.raw || {}).providerErrorCode;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return null;
}

function extractProviderErrorContext(error: unknown) {
  const raw = toRecord((error as { responseBody?: unknown })?.responseBody);
  return {
    message: error instanceof Error ? error.message : "Provider islemi basarisiz.",
    providerStatusCode: parseNumber((error as { status?: unknown })?.status, 0) || null,
    providerErrorCode: extractProviderErrorCode(raw),
    raw,
  };
}

function buildPayloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function computeNextRetryDate(attemptCount: number) {
  const baseMinutes = Math.min(5 * Math.pow(2, Math.max(0, attemptCount - 1)), 12 * 60);
  const jitterSeconds = Math.min(300, attemptCount * 11);
  const date = new Date();
  date.setMinutes(date.getMinutes() + baseMinutes);
  date.setSeconds(date.getSeconds() + jitterSeconds);
  return date.toISOString();
}

function mapConnection(row: ProviderConnectionRow): MarketplaceProviderConnection {
  return {
    id: row.id,
    provider: row.provider as MarketplaceProvider,
    status: row.status,
    settings: row.settings || {},
    fieldMappings: row.field_mappings || {},
    supportsWebhook: Boolean(row.supports_webhook),
    lastHealthcheckAt: row.last_healthcheck_at,
    lastHealthcheckStatus: row.last_healthcheck_status,
    lastHealthcheckMessage: row.last_healthcheck_message,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSyncLog(row: SyncLogRow): MarketplaceSyncLogView {
  return {
    id: row.id,
    provider: row.provider as MarketplaceProvider,
    direction: row.direction,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    payload: row.payload || {},
    createdAt: row.created_at,
  };
}

async function insertSyncLog(input: {
  provider: MarketplaceProvider;
  direction: MarketplaceQueueDirection;
  entityType: string;
  entityId: string | null;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
}) {
  const supabase = createServerClient();
  await supabase.from("marketplace_sync_logs").insert({
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

async function getProviderConnectionRow(provider: MarketplaceProvider) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("marketplace_provider_connections")
    .select("*")
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  return (data as ProviderConnectionRow | null) || null;
}

async function listActiveProviderRows(provider?: MarketplaceProvider) {
  const supabase = createServerClient();
  let query = supabase
    .from("marketplace_provider_connections")
    .select("*")
    .eq("status", "active");

  if (provider) {
    query = query.eq("provider", provider);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  return (data || []) as ProviderConnectionRow[];
}

async function buildCanonicalListingsForProduct(productId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,slug,description,images,brand,status,is_active,variants:product_variants(id,product_id,name,sku,barcode,price,stock,images)")
    .eq("id", productId)
    .single();

  if (error) {
    throw error;
  }

  const product = data as ProductRow;
  const variants = Array.isArray(product.variants) ? product.variants : [];

  return variants.map<MarketplaceListingSyncItem>((variant) => ({
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    productDescription: product.description,
    variantId: variant.id,
    variantName: variant.name,
    sku: variant.sku,
    barcode: variant.barcode,
    price: parseNumber(variant.price, 0),
    stock: parseNumber(variant.stock, 0),
    images: Array.isArray(variant.images) && variant.images.length > 0 ? variant.images : product.images || [],
    brand: product.brand,
    isActive: Boolean(product.is_active) && product.status !== "archived",
  }));
}

async function getListingsByVariantIds(provider: MarketplaceProvider, variantIds: string[]) {
  if (variantIds.length === 0) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("provider", provider)
    .in("variant_id", variantIds);

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  return (data || []) as ListingRow[];
}

async function claimQueueRowForSync(supabase: ReturnType<typeof createServerClient>, row: QueueRow) {
  const { data, error } = await supabase
    .from("marketplace_sync_queue")
    .update({ status: "syncing" })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  return Boolean(data?.id);
}

async function loadVariantWithProductById(variantId: string) {
  const supabase = createServerClient();
  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select("id,product_id,name,sku,barcode,price,stock,images")
    .eq("id", variantId)
    .single();

  if (variantError) {
    throw variantError;
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id,name,slug,description,images,brand,status,is_active")
    .eq("id", variant.product_id)
    .single();

  if (productError) {
    throw productError;
  }

  return {
    ...(variant as ProductVariantRow),
    product: (product as ProductRow) || null,
  } as ProductVariantWithProduct;
}

async function loadVariantWithProductBySku(sku: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select("id")
    .eq("sku", sku)
    .limit(2);

  if (error) {
    throw error;
  }

  if (!data || data.length !== 1) {
    return null;
  }

  return loadVariantWithProductById(data[0].id);
}

async function upsertListingRows(input: {
  provider: MarketplaceProvider;
  listings: MarketplaceListingSyncItem[];
  synced: Array<{
    variantId: string;
    externalListingId: string;
    externalSku: string | null;
    status: string;
    raw?: Record<string, unknown>;
  }>;
}) {
  if (input.synced.length === 0) return;

  const syncMap = new Map(input.synced.map((item) => [item.variantId, item] as const));
  const payload = input.listings
    .map((listing) => {
      const synced = syncMap.get(listing.variantId);
      if (!synced) return null;

      return {
        provider: input.provider,
        product_id: listing.productId,
        variant_id: listing.variantId,
        external_listing_id: synced.externalListingId,
        external_sku: synced.externalSku,
        status: synced.status,
        last_synced_price: listing.price,
        last_synced_stock: listing.stock,
        payload_snapshot: synced.raw || {},
        last_error: null,
      };
    })
    .filter(Boolean);

  if (payload.length === 0) return;

  const supabase = createServerClient();
  const { error } = await supabase
    .from("marketplace_listings")
    .upsert(payload, { onConflict: "provider,variant_id" });

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }
}

async function markListingError(provider: MarketplaceProvider, variantId: string, errorMessage: string) {
  const supabase = createServerClient();
  await supabase
    .from("marketplace_listings")
    .update({
      status: "error",
      last_error: errorMessage,
    })
    .eq("provider", provider)
    .eq("variant_id", variantId);
}

function mapMarketplaceOrderStatusToInternal(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("refund")) return "refunded";
  if (normalized.includes("deliver")) return "delivered";
  if (normalized.includes("ship") || normalized.includes("cargo")) return "shipped";
  if (normalized.includes("prepar")) return "preparing";
  if (normalized.includes("confirm") || normalized.includes("approve")) return "confirmed";
  return "pending";
}

function mapMarketplacePaymentStatusToInternal(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("refund")) return "refunded";
  if (normalized.includes("fail") || normalized.includes("declin")) return "failed";
  if (normalized.includes("process")) return "processing";
  if (normalized.includes("paid") || normalized.includes("complete") || normalized.includes("success")) {
    return "completed";
  }
  return "pending";
}

function normalizeShippingAddress(
  rawAddress: Record<string, unknown>,
  customer: MarketplacePulledOrder["customer"],
) {
  return {
    firstName:
      (typeof rawAddress.firstName === "string" && rawAddress.firstName) ||
      customer.firstName ||
      "",
    lastName:
      (typeof rawAddress.lastName === "string" && rawAddress.lastName) ||
      customer.lastName ||
      "",
    phone:
      (typeof rawAddress.phone === "string" && rawAddress.phone) ||
      customer.phone ||
      "",
    address:
      (typeof rawAddress.address === "string" && rawAddress.address) ||
      (typeof rawAddress.addressLine1 === "string" && rawAddress.addressLine1) ||
      "",
    city: (typeof rawAddress.city === "string" && rawAddress.city) || "",
    district:
      (typeof rawAddress.district === "string" && rawAddress.district) ||
      (typeof rawAddress.town === "string" && rawAddress.town) ||
      "",
    postalCode:
      (typeof rawAddress.postalCode === "string" && rawAddress.postalCode) ||
      (typeof rawAddress.zipCode === "string" && rawAddress.zipCode) ||
      "",
  };
}

async function resolveVariantForMarketplaceItem(
  provider: MarketplaceProvider,
  item: MarketplacePulledOrder["items"][number],
) {
  const supabase = createServerClient();

  if (item.externalListingId) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("variant_id")
      .eq("provider", provider)
      .eq("external_listing_id", item.externalListingId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.variant_id) {
      return loadVariantWithProductById(data.variant_id);
    }
  }

  if (item.sku) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("variant_id")
      .eq("provider", provider)
      .eq("external_sku", item.sku)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.variant_id) {
      return loadVariantWithProductById(data.variant_id);
    }

    return loadVariantWithProductBySku(item.sku);
  }

  return null;
}

async function upsertMarketplaceOrderRow(input: {
  provider: MarketplaceProvider;
  externalOrderId: string;
  orderStatus: string;
  importStatus: MarketplaceSyncStatus;
  internalOrderId?: string | null;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  lastError?: string | null;
}) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("marketplace_orders")
    .upsert(
      {
        provider: input.provider,
        external_order_id: input.externalOrderId,
        order_status: input.orderStatus,
        import_status: input.importStatus,
        internal_order_id: input.internalOrderId || null,
        raw_payload: input.rawPayload,
        normalized_payload: input.normalizedPayload,
        last_error: input.lastError || null,
      },
      { onConflict: "provider,external_order_id" },
    );

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }
}

async function importPulledOrder(provider: MarketplaceProvider, pulledOrder: MarketplacePulledOrder) {
  const supabase = createServerClient();
  const { data: existingRow, error: existingError } = await supabase
    .from("marketplace_orders")
    .select("*")
    .eq("provider", provider)
    .eq("external_order_id", pulledOrder.externalOrderId)
    .maybeSingle();

  if (existingError) {
    if (isMissingRelationError(existingError)) throw buildMissingTableError();
    throw existingError;
  }

  const resolvedItems = [];
  const unresolvedItems: string[] = [];

  for (const item of pulledOrder.items) {
    const variant = await resolveVariantForMarketplaceItem(provider, item);
    if (!variant?.product) {
      unresolvedItems.push(item.sku || item.externalListingId || item.name);
      continue;
    }

    resolvedItems.push({
      variant,
      quantity: parseNumber(item.quantity, 0),
      price: parseNumber(item.unitPrice, 0),
    });
  }

  const normalizedPayload = {
    externalOrderId: pulledOrder.externalOrderId,
    orderNumber: pulledOrder.orderNumber,
    status: pulledOrder.status,
    paymentStatus: pulledOrder.paymentStatus,
    customer: pulledOrder.customer,
    shippingAddress: pulledOrder.shippingAddress,
    items: pulledOrder.items,
  } satisfies Record<string, unknown>;

  if ((existingRow as MarketplaceOrderRow | null)?.internal_order_id) {
    await upsertMarketplaceOrderRow({
      provider,
      externalOrderId: pulledOrder.externalOrderId,
      orderStatus: pulledOrder.status,
      importStatus: "synced",
      internalOrderId: (existingRow as MarketplaceOrderRow).internal_order_id,
      rawPayload: pulledOrder.raw,
      normalizedPayload,
      lastError: null,
    });

    return {
      imported: false,
      manual: false,
    };
  }

  if (unresolvedItems.length > 0) {
    const errorMessage = `SKU veya listing eslesmesi bulunamadi: ${unresolvedItems.join(", ")}`;
    await upsertMarketplaceOrderRow({
      provider,
      externalOrderId: pulledOrder.externalOrderId,
      orderStatus: pulledOrder.status,
      importStatus: "manual_action_required",
      rawPayload: pulledOrder.raw,
      normalizedPayload,
      lastError: errorMessage,
    });

    await insertSyncLog({
      provider,
      direction: "inbound",
      entityType: "order_import",
      entityId: pulledOrder.externalOrderId,
      status: "manual_action_required",
      errorMessage,
      payload: normalizedPayload,
    });

    return {
      imported: false,
      manual: true,
    };
  }

  const shippingAddress = normalizeShippingAddress(pulledOrder.shippingAddress, pulledOrder.customer);
  const order = await createOrder({
    items: resolvedItems.map((item) => ({
      productId: item.variant.product_id,
      variantId: item.variant.id,
      productName: item.variant.product?.name || item.variant.name,
      variantName: item.variant.name,
      price: item.price,
      quantity: item.quantity,
      category: item.variant.product?.slug || "",
    })),
    shippingAddress,
    billingAddress: shippingAddress,
    paymentMethod: "bank-transfer",
    contactEmail: pulledOrder.customer.email || undefined,
    notes: `Pazaryeri: ${provider} | Dis siparis: ${pulledOrder.orderNumber}`,
  });

  const internalStatus = mapMarketplaceOrderStatusToInternal(pulledOrder.status);
  const internalPaymentStatus = mapMarketplacePaymentStatusToInternal(pulledOrder.paymentStatus);
  await supabase
    .from("orders")
    .update({
      status: internalStatus,
      payment_status: internalPaymentStatus,
      notes: `Pazaryeri: ${provider} | Dis siparis: ${pulledOrder.orderNumber}`,
    })
    .eq("id", order.id);

  await upsertMarketplaceOrderRow({
    provider,
    externalOrderId: pulledOrder.externalOrderId,
    orderStatus: pulledOrder.status,
    importStatus: "synced",
    internalOrderId: order.id,
    rawPayload: pulledOrder.raw,
    normalizedPayload,
    lastError: null,
  });

  await insertSyncLog({
    provider,
    direction: "inbound",
    entityType: "order_import",
    entityId: pulledOrder.externalOrderId,
    status: "synced",
    payload: {
      internalOrderId: order.id,
      externalOrderId: pulledOrder.externalOrderId,
    },
  });

  return {
    imported: true,
    manual: false,
  };
}

async function handleProductListingSync(
  provider: MarketplaceProvider,
  queueRow: QueueRow,
  credentials: Record<string, string>,
  settings: Record<string, unknown>,
) {
  const listings = await buildCanonicalListingsForProduct(queueRow.entity_id);
  if (listings.length === 0) {
    throw new Error("Senkronize edilecek varyant bulunamadi.");
  }

  const adapter = getMarketplaceProviderAdapter(provider);
  const existingMappings = await getListingsByVariantIds(
    provider,
    listings.map((listing) => listing.variantId),
  );

  const synced = await adapter.upsertListings({
    credentials,
    settings,
    listings,
    existingMappings: existingMappings.map((mapping) => ({
      variantId: mapping.variant_id,
      externalListingId: mapping.external_listing_id,
      externalSku: mapping.external_sku,
    })),
  });

  await upsertListingRows({ provider, listings, synced });

  const firstRaw = toRecord(synced[0]?.raw || {});

  return {
    entityCount: listings.length,
    payload: {
      productId: queueRow.entity_id,
      syncedVariants: synced.length,
      providerStatusCode: parseNumber(firstRaw.providerStatusCode, 0) || null,
      providerErrorCode: extractProviderErrorCode(firstRaw),
    },
  };
}

async function handleInventorySync(
  provider: MarketplaceProvider,
  queueRow: QueueRow,
  credentials: Record<string, string>,
  settings: Record<string, unknown>,
) {
  const adapter = getMarketplaceProviderAdapter(provider);
  const variant = await loadVariantWithProductById(queueRow.entity_id);
  const existingMappings = await getListingsByVariantIds(provider, [variant.id]);
  let mapping = existingMappings[0] || null;

  if (!mapping) {
    await handleProductListingSync(
      provider,
      {
        ...queueRow,
        entity_id: variant.product_id,
        entity_type: "product",
        operation: "upsert_listing",
      },
      credentials,
      settings,
    );

    const refreshedMappings = await getListingsByVariantIds(provider, [variant.id]);
    mapping = refreshedMappings[0] || null;
  }

  if (!mapping) {
    throw new Error("Marketplace listing eslesmesi olusturulamadi.");
  }

  const syncResults = await adapter.updateInventory({
    credentials,
    settings,
    inventory: [
      {
        variantId: variant.id,
        sku: variant.sku,
        externalListingId: mapping.external_listing_id,
        stock: parseNumber(variant.stock, 0),
        price: parseNumber(variant.price, 0),
      },
    ],
  });

  const supabase = createServerClient();
  const { error } = await supabase
    .from("marketplace_listings")
    .update({
      status: variant.product?.status === "archived" ? "inactive" : "active",
      last_synced_price: parseNumber(variant.price, 0),
      last_synced_stock: parseNumber(variant.stock, 0),
      last_error: null,
    })
    .eq("provider", provider)
    .eq("variant_id", variant.id);

  if (error) {
    throw error;
  }

  const firstRaw = toRecord(syncResults[0]?.raw || {});
  return {
    entityCount: 1,
    payload: {
      variantId: variant.id,
      stock: variant.stock,
      price: variant.price,
      providerStatusCode: parseNumber(firstRaw.providerStatusCode, 0) || null,
      providerErrorCode: extractProviderErrorCode(firstRaw),
    },
  };
}

async function handleOrderStatusSync(
  provider: MarketplaceProvider,
  queueRow: QueueRow,
  credentials: Record<string, string>,
  settings: Record<string, unknown>,
) {
  const supabase = createServerClient();
  const [{ data: orderRow, error: orderError }, { data: marketplaceOrder, error: marketplaceOrderError }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id,status,payment_status,shipping_carrier,tracking_number")
        .eq("id", queueRow.entity_id)
        .maybeSingle(),
      supabase
        .from("marketplace_orders")
        .select("*")
        .eq("provider", provider)
        .eq("internal_order_id", queueRow.entity_id)
        .maybeSingle(),
    ]);

  if (orderError) throw orderError;
  if (marketplaceOrderError) throw marketplaceOrderError;

  if (!orderRow || !marketplaceOrder) {
    return {
      entityCount: 0,
      payload: {
        skipped: true,
        reason: "linked_marketplace_order_not_found",
      },
    };
  }

  const adapter = getMarketplaceProviderAdapter(provider);
  const providerResult = await adapter.updateOrderStatus({
    credentials,
    settings,
    update: {
      externalOrderId: marketplaceOrder.external_order_id,
      status: orderRow.status,
      paymentStatus: orderRow.payment_status,
      shippingCarrier: orderRow.shipping_carrier,
      trackingNumber: orderRow.tracking_number,
    },
  });

  await supabase
    .from("marketplace_orders")
    .update({
      order_status: orderRow.status,
      last_error: null,
    })
    .eq("provider", provider)
    .eq("external_order_id", marketplaceOrder.external_order_id);

  return {
    entityCount: 1,
    payload: {
      externalOrderId: marketplaceOrder.external_order_id,
      status: orderRow.status,
      providerStatusCode: providerResult.providerStatusCode || null,
      providerErrorCode: providerResult.providerErrorCode || null,
      providerMessage: providerResult.message,
    },
  };
}

export async function listMarketplaceIntegrations(): Promise<MarketplaceIntegrationView[]> {
  const supabase = createServerClient();
  const [{ data: connectionRows, error: connectionError }, { data: queueRows, error: queueError }, { data: listingRows, error: listingError }] =
    await Promise.all([
      supabase.from("marketplace_provider_connections").select("*"),
      supabase.from("marketplace_sync_queue").select("provider,status"),
      supabase.from("marketplace_listings").select("provider,status"),
    ]);

  if (connectionError) {
    if (isMissingRelationError(connectionError)) throw buildMissingTableError();
    throw connectionError;
  }
  if (queueError) {
    if (isMissingRelationError(queueError)) throw buildMissingTableError();
    throw queueError;
  }
  if (listingError) {
    if (isMissingRelationError(listingError)) throw buildMissingTableError();
    throw listingError;
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

  const listingMap = new Map<string, MarketplaceListingStats>();
  for (const row of (listingRows || []) as Array<{ provider: string; status: string }>) {
    const current = listingMap.get(row.provider) || { total: 0, active: 0, error: 0 };
    current.total += 1;
    if (row.status === "active") current.active += 1;
    if (row.status === "error") current.error += 1;
    listingMap.set(row.provider, current);
  }

  return MARKETPLACE_PROVIDER_DEFINITIONS.map((provider) => ({
    provider,
    connection: connectionMap.has(provider.id) ? mapConnection(connectionMap.get(provider.id) as ProviderConnectionRow) : null,
    queueStats: queueMap.get(provider.id) || { queued: 0, failed: 0, manualActionRequired: 0 },
    listingStats: listingMap.get(provider.id) || { total: 0, active: 0, error: 0 },
  }));
}

export async function saveMarketplaceConnection(provider: MarketplaceProvider, input: MarketplaceConnectionInput) {
  const definition = getMarketplaceProviderDefinition(provider);
  if (!definition) {
    throw new Error("Gecersiz pazaryeri secimi.");
  }

  const credentials = (input.credentials || {}) as Record<string, string>;
  const missingField = definition.credentialFields.find(
    (field) => field.required && !credentials[field.key]?.trim(),
  );
  if (missingField) {
    throw new Error(`Zorunlu alan eksik: ${missingField.label}`);
  }

  const encryptedCredentials = encryptMarketplaceCredentials(credentials);
  const adapterSettings = mergeAdapterSettings({
    settings: input.settings || {},
    fieldMappings: input.fieldMappings || {},
  });
  const adapter = getMarketplaceProviderAdapter(provider);
  const connectionResult: MarketplaceProviderAdapterResult = await adapter
    .connect({
      credentials,
      settings: adapterSettings,
    })
    .catch((error) => {
      const context = extractProviderErrorContext(error);
      return {
        success: false,
        message: adapter.normalizeError(error) || context.message,
        latencyMs: null,
        providerStatusCode: context.providerStatusCode,
        providerErrorCode: context.providerErrorCode,
        raw: context.raw,
      };
    });

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("marketplace_provider_connections")
    .upsert(
      {
        provider,
        status: connectionResult.success ? "active" : "error",
        encrypted_credentials: encryptedCredentials,
        settings: adapterSettings,
        field_mappings: input.fieldMappings || {},
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
    errorCode: connectionResult.providerErrorCode || null,
    errorMessage: connectionResult.success ? null : connectionResult.message,
    payload: {
      settings: adapterSettings,
      providerStatusCode: connectionResult.providerStatusCode || null,
      latencyMs: connectionResult.latencyMs || null,
      raw: connectionResult.raw || {},
    },
  });

  return {
    connection: mapConnection(data as ProviderConnectionRow),
    testResult: connectionResult,
  };
}

export async function testMarketplaceConnection(provider: MarketplaceProvider) {
  const definition = getMarketplaceProviderDefinition(provider);
  if (!definition) throw new Error("Gecersiz pazaryeri secimi.");

  const connection = await getProviderConnectionRow(provider);
  if (!connection) {
    throw new Error("Pazaryeri baglantisi bulunamadi.");
  }

  const credentials = decryptMarketplaceCredentials(connection.encrypted_credentials);
  const adapter = getMarketplaceProviderAdapter(provider);
  const adapterSettings = mergeAdapterSettings({
    settings: connection.settings || {},
    fieldMappings: connection.field_mappings || {},
  });
  const result: MarketplaceProviderAdapterResult = await adapter
    .testConnection({
      credentials,
      settings: adapterSettings,
    })
    .catch((error) => {
      const context = extractProviderErrorContext(error);
      return {
        success: false,
        message: adapter.normalizeError(error) || context.message,
        latencyMs: null,
        providerStatusCode: context.providerStatusCode,
        providerErrorCode: context.providerErrorCode,
        raw: context.raw,
      };
    });
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("marketplace_provider_connections")
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
    errorCode: result.providerErrorCode || null,
    errorMessage: result.success ? null : result.message,
    payload: {
      providerStatusCode: result.providerStatusCode || null,
      latencyMs: result.latencyMs || null,
      raw: result.raw || {},
    },
  });

  return result;
}

export async function getMarketplaceProviderSyncLogs(provider: MarketplaceProvider, limit = 30) {
  const supabase = createServerClient();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const { data, error } = await supabase
    .from("marketplace_sync_logs")
    .select("*")
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  return ((data || []) as SyncLogRow[]).map(mapSyncLog);
}

export async function listMarketplaceListings(provider: MarketplaceProvider, limit = 40): Promise<MarketplaceListingView[]> {
  const supabase = createServerClient();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id,name,slug,status,is_active,variants:product_variants(id,product_id,name,sku,barcode,price,stock)")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (productsError) {
    throw productsError;
  }

  const variants = ((products || []) as ProductRow[]).flatMap((product) =>
    (product.variants || []).map((variant) => ({
      provider,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      productStatus: product.status,
      variantId: variant.id,
      variantName: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      price: parseNumber(variant.price, 0),
      stock: parseNumber(variant.stock, 0),
    })),
  );

  const listingRows = await getListingsByVariantIds(
    provider,
    variants.map((variant) => variant.variantId),
  );
  const listingMap = new Map(listingRows.map((row) => [row.variant_id, row] as const));

  return variants.map((variant) => {
    const listing = listingMap.get(variant.variantId);
    let issue: string | null = null;

    if (!variant.sku?.trim()) {
      issue = "SKU eksik";
    } else if (!listing?.external_listing_id) {
      issue = "External listing baglantisi yok";
    } else if (listing.status === "error") {
      issue = listing.last_error || "Son sync hatali";
    }

    return {
      provider,
      productId: variant.productId,
      productName: variant.productName,
      productSlug: variant.productSlug,
      productStatus: variant.productStatus,
      variantId: variant.variantId,
      variantName: variant.variantName,
      sku: variant.sku,
      barcode: variant.barcode,
      price: variant.price,
      stock: variant.stock,
      externalListingId: listing?.external_listing_id || null,
      externalSku: listing?.external_sku || null,
      status: listing?.status || "pending",
      lastSyncedPrice: listing?.last_synced_price || null,
      lastSyncedStock: listing?.last_synced_stock || null,
      lastError: listing?.last_error || null,
      issue,
      updatedAt: listing?.updated_at || null,
    };
  });
}

export async function processMarketplaceSyncQueue(options?: {
  provider?: MarketplaceProvider;
  limit?: number;
}) {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const limit = Math.max(1, Math.min(options?.limit || 20, 100));

  let query = supabase
    .from("marketplace_sync_queue")
    .select("*")
    .in("status", ["queued", "failed"])
    .lte("next_retry_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options?.provider) {
    query = query.eq("provider", options.provider);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  const queueRows = (data || []) as QueueRow[];
  let syncedCount = 0;
  let failedCount = 0;
  let manualCount = 0;

  for (const row of queueRows) {
    if (!isMarketplaceProvider(row.provider)) continue;

    const claimed = await claimQueueRowForSync(supabase, row);
    if (!claimed) {
      continue;
    }

    const connection = await getProviderConnectionRow(row.provider);
    if (!connection || connection.status !== "active") {
      await supabase
        .from("marketplace_sync_queue")
        .update({
          status: "manual_action_required",
          last_error: "Aktif pazaryeri baglantisi bulunamadi.",
          attempt_count: MAX_RETRY_COUNT,
          next_retry_at: null,
        })
        .eq("id", row.id)
        .eq("status", "syncing");

      manualCount += 1;
      await insertSyncLog({
        provider: row.provider,
        direction: row.direction,
        entityType: row.entity_type,
        entityId: row.entity_id,
        status: "manual_action_required",
        errorMessage: "Aktif pazaryeri baglantisi bulunamadi.",
      });
      continue;
    }

    let credentials: Record<string, string>;
    try {
      credentials = decryptMarketplaceCredentials(connection.encrypted_credentials);
    } catch (decryptError) {
      await supabase
        .from("marketplace_sync_queue")
        .update({
          status: "manual_action_required",
          last_error: decryptError instanceof Error ? decryptError.message : "Credential sifresi cozulmedi.",
          attempt_count: MAX_RETRY_COUNT,
          next_retry_at: null,
        })
        .eq("id", row.id)
        .eq("status", "syncing");
      manualCount += 1;
      continue;
    }
    const adapterSettings = mergeAdapterSettings({
      settings: connection.settings || {},
      fieldMappings: connection.field_mappings || {},
    });

    try {
      let result: { entityCount: number; payload: Record<string, unknown> };
      if (row.operation === "upsert_listing") {
        result = await handleProductListingSync(row.provider, row, credentials, adapterSettings);
      } else if (row.operation === "update_inventory") {
        result = await handleInventorySync(row.provider, row, credentials, adapterSettings);
      } else if (row.operation === "update_order_status") {
        result = await handleOrderStatusSync(row.provider, row, credentials, adapterSettings);
      } else {
        result = {
          entityCount: 0,
          payload: { skipped: true, operation: row.operation },
        };
      }

      const finishedAt = new Date().toISOString();
      await supabase
        .from("marketplace_sync_queue")
        .update({
          status: "synced",
          processed_at: finishedAt,
          last_error: null,
        })
        .eq("id", row.id)
        .eq("status", "syncing");

      await supabase
        .from("marketplace_provider_connections")
        .update({ last_sync_at: finishedAt })
        .eq("provider", row.provider);

      await insertSyncLog({
        provider: row.provider,
        direction: row.direction,
        entityType: row.entity_type,
        entityId: row.entity_id,
        status: "synced",
        payload: {
          operation: row.operation,
          ...result.payload,
        },
      });

      syncedCount += 1;
    } catch (syncError) {
      const adapter = getMarketplaceProviderAdapter(row.provider);
      const errorMessage = adapter.normalizeError(syncError);
      const nextAttempt = (row.attempt_count || 0) + 1;
      const finalStatus = nextAttempt >= MAX_RETRY_COUNT ? "manual_action_required" : "failed";

      await supabase
        .from("marketplace_sync_queue")
        .update({
          status: finalStatus,
          attempt_count: nextAttempt,
          last_error: errorMessage,
          next_retry_at: finalStatus === "failed" ? computeNextRetryDate(nextAttempt) : null,
        })
        .eq("id", row.id)
        .eq("status", "syncing");

      if (row.entity_type === "variant") {
        await markListingError(row.provider, row.entity_id, errorMessage);
      }

      const errorPayload = toRecord((syncError as { responseBody?: unknown })?.responseBody);
      const providerErrorCode = extractProviderErrorCode(errorPayload);
      const providerStatusCode = parseNumber((syncError as { status?: unknown })?.status, 0) || null;
      await insertSyncLog({
        provider: row.provider,
        direction: row.direction,
        entityType: row.entity_type,
        entityId: row.entity_id,
        status: finalStatus,
        errorCode: providerErrorCode,
        errorMessage,
        payload: {
          operation: row.operation,
          idempotencyKey: row.idempotency_key,
          providerStatusCode,
          providerErrorCode,
          providerErrorPayload: errorPayload,
        },
      });

      if (finalStatus === "manual_action_required") {
        manualCount += 1;
      } else {
        failedCount += 1;
      }
    }
  }

  return {
    queuedCount: queueRows.length,
    syncedCount,
    failedCount,
    manualCount,
  };
}

export async function pullOrdersForProvider(
  provider: MarketplaceProvider,
  options?: { since?: string },
) {
  const connection = await getProviderConnectionRow(provider);
  if (!connection || connection.status !== "active") {
    throw new Error("Aktif pazaryeri baglantisi bulunamadi.");
  }

  const credentials = decryptMarketplaceCredentials(connection.encrypted_credentials);
  const adapter = getMarketplaceProviderAdapter(provider);
  const adapterSettings = mergeAdapterSettings({
    settings: connection.settings || {},
    fieldMappings: connection.field_mappings || {},
  });
  const orders = await adapter.pullOrders({
    credentials,
    settings: adapterSettings,
    since: options?.since || connection.last_sync_at || undefined,
  });

  let importedCount = 0;
  let duplicateCount = 0;
  let manualCount = 0;

  for (const pulledOrder of orders) {
    const result = await importPulledOrder(provider, pulledOrder);
    if (result.manual) {
      manualCount += 1;
    } else if (result.imported) {
      try {
        const ackResult = await adapter.acknowledgeOrder({
          credentials,
          settings: adapterSettings,
          externalOrderId: pulledOrder.externalOrderId,
        });
        if (!ackResult.success) {
          await insertSyncLog({
            provider,
            direction: "system",
            entityType: "order_ack",
            entityId: pulledOrder.externalOrderId,
            status: "failed",
            errorCode: ackResult.providerErrorCode || null,
            errorMessage: ackResult.message,
            payload: {
              providerStatusCode: ackResult.providerStatusCode || null,
              raw: ackResult.raw || {},
            },
          });
        }
      } catch (ackError) {
        await insertSyncLog({
          provider,
          direction: "system",
          entityType: "order_ack",
          entityId: pulledOrder.externalOrderId,
          status: "failed",
          errorMessage: adapter.normalizeError(ackError),
        });
      }
      importedCount += 1;
    } else {
      duplicateCount += 1;
    }
  }

  const finishedAt = new Date().toISOString();
  const supabase = createServerClient();
  await supabase
    .from("marketplace_provider_connections")
    .update({ last_sync_at: finishedAt })
    .eq("provider", provider);

  await insertSyncLog({
    provider,
    direction: "inbound",
    entityType: "order_pull",
    entityId: provider,
    status: "synced",
    payload: {
      importedCount,
      duplicateCount,
      manualCount,
      receivedCount: orders.length,
    },
  });

  return {
    receivedCount: orders.length,
    importedCount,
    duplicateCount,
    manualCount,
  };
}

async function runMarketplaceReconciliation(provider: MarketplaceProvider) {
  const supabase = createServerClient();
  const [{ count: listingCount, error: listingError }, { count: orderCount, error: orderError }] = await Promise.all([
    supabase
      .from("marketplace_listings")
      .select("*", { count: "exact", head: true })
      .eq("provider", provider),
    supabase
      .from("marketplace_orders")
      .select("*", { count: "exact", head: true })
      .eq("provider", provider),
  ]);

  if (listingError) throw listingError;
  if (orderError) throw orderError;

  await insertSyncLog({
    provider,
    direction: "system",
    entityType: "reconcile",
    entityId: provider,
    status: "completed",
    payload: {
      listings: listingCount || 0,
      orders: orderCount || 0,
    },
  });

  return {
    listingCount: listingCount || 0,
    orderCount: orderCount || 0,
  };
}

export async function runMarketplaceSync(options?: {
  provider?: MarketplaceProvider;
  forceOrders?: boolean;
  forceReconciliation?: boolean;
}) {
  const supabase = createServerClient();
  const activeProviders = await listActiveProviderRows(options?.provider);
  const now = new Date();
  const shouldPullOrders = Boolean(options?.forceOrders) || now.getMinutes() % 5 === 0;
  const shouldReconcile = Boolean(options?.forceReconciliation) || (now.getHours() === 2 && now.getMinutes() === 0);

  const summaries: Array<{
    provider: MarketplaceProvider;
    queueSummary: {
      queuedCount: number;
      syncedCount: number;
      failedCount: number;
      manualCount: number;
    };
    orderSummary: {
      receivedCount: number;
      importedCount: number;
      duplicateCount: number;
      manualCount: number;
    };
    reconciliation: {
      listingCount: number;
      orderCount: number;
    } | null;
  }> = [];

  for (const connection of activeProviders) {
    if (!isMarketplaceProvider(connection.provider)) continue;

    const provider = connection.provider;
    const startedAt = new Date().toISOString();
    const { data: jobRow } = await supabase
      .from("marketplace_sync_jobs")
      .insert({
        provider,
        job_type: shouldPullOrders ? "full_sync" : "queue_drain",
        status: "running",
        started_at: startedAt,
        scheduled_at: startedAt,
      })
      .select("id")
      .maybeSingle();

    try {
      const queueSummary = await processMarketplaceSyncQueue({ provider, limit: 50 });
      const orderSummary = shouldPullOrders
        ? await pullOrdersForProvider(provider)
        : { receivedCount: 0, importedCount: 0, duplicateCount: 0, manualCount: 0 };
      const reconciliation = shouldReconcile ? await runMarketplaceReconciliation(provider) : null;

      const finishedAt = new Date().toISOString();
      if (jobRow?.id) {
        await supabase
          .from("marketplace_sync_jobs")
          .update({
            status: "completed",
            finished_at: finishedAt,
            metadata: {
              queueSummary,
              orderSummary,
              reconciliation,
            },
          })
          .eq("id", jobRow.id);
      }

      summaries.push({
        provider,
        queueSummary,
        orderSummary,
        reconciliation,
      });
    } catch (providerSyncError) {
      const finishedAt = new Date().toISOString();
      if (jobRow?.id) {
        await supabase
          .from("marketplace_sync_jobs")
          .update({
            status: "failed",
            finished_at: finishedAt,
            metadata: {
              error:
                providerSyncError instanceof Error
                  ? providerSyncError.message
                  : "Provider sync failed.",
            },
          })
          .eq("id", jobRow.id);
      }

      await insertSyncLog({
        provider,
        direction: "system",
        entityType: "sync_job",
        entityId: provider,
        status: "failed",
        errorMessage:
          providerSyncError instanceof Error
            ? providerSyncError.message
            : "Provider sync failed.",
      });
    }
  }

  return summaries;
}

export async function verifyMarketplaceWebhook(
  provider: MarketplaceProvider,
  rawBody: string,
  headers: Record<string, string>,
) {
  const definition = getMarketplaceProviderDefinition(provider);
  if (!definition) {
    throw new Error("Gecersiz pazaryeri secimi.");
  }

  if (!definition.supportsWebhook) {
    return {
      success: false,
      statusCode: 403 as const,
      message: "Bu provider webhook desteklemiyor.",
    };
  }

  const connection = await getProviderConnectionRow(provider);
  if (!connection || connection.status !== "active") {
    return {
      success: false,
      statusCode: 403 as const,
      message: "Aktif provider baglantisi bulunamadi.",
    };
  }

  const adapter = getMarketplaceProviderAdapter(provider);
  if (!adapter.verifyWebhookSignature) {
    return {
      success: false,
      statusCode: 403 as const,
      message: "Provider webhook dogrulama uygulanmamis.",
    };
  }

  try {
    const credentials = decryptMarketplaceCredentials(connection.encrypted_credentials);
    const settings = mergeAdapterSettings({
      settings: connection.settings || {},
      fieldMappings: connection.field_mappings || {},
    });
    return adapter.verifyWebhookSignature({
      credentials,
      rawBody,
      headers,
      settings,
    });
  } catch (error) {
    return {
      success: false,
      statusCode: 403,
      message: error instanceof Error ? error.message : "Webhook dogrulamasi basarisiz.",
    };
  }
}

export async function recordMarketplaceWebhook(
  provider: MarketplaceProvider,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  options?: {
    signatureValid?: boolean;
    signatureMessage?: string | null;
  },
) {
  const definition = getMarketplaceProviderDefinition(provider);
  if (!definition) {
    throw new Error("Gecersiz pazaryeri secimi.");
  }

  if (!definition.supportsWebhook) {
    throw new Error("Bu pazaryeri v1 webhook desteklemiyor.");
  }

  const supabase = createServerClient();
  const externalEventId =
    (typeof payload.eventId === "string" && payload.eventId) ||
    (typeof payload.id === "string" && payload.id) ||
    (typeof payload.externalOrderId === "string" && payload.externalOrderId) ||
    null;

  const payloadHash = buildPayloadHash(payload);
  const { data, error } = await supabase
    .from("marketplace_webhook_events")
    .upsert(
      {
        provider,
        external_event_id: externalEventId,
        payload_hash: payloadHash,
        signature_valid: options?.signatureValid ?? false,
        payload,
        headers,
        processing_status: "received",
      },
      { onConflict: "provider,payload_hash" },
    )
    .select("id,processed_at")
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) throw buildMissingTableError();
    throw error;
  }

  await insertSyncLog({
    provider,
    direction: "inbound",
    entityType: "webhook",
    entityId: externalEventId,
    status: "received",
    errorCode: options?.signatureValid ? null : "webhook_signature_invalid",
    payload: {
      signatureValid: options?.signatureValid ?? false,
      signatureMessage: options?.signatureMessage || null,
      headers,
      payload,
    },
  });

  const syncSummary = await runMarketplaceSync({
    provider,
    forceOrders: true,
  });

  await supabase
    .from("marketplace_webhook_events")
    .update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", data?.id || "");

  return {
    success: true,
    duplicate: Boolean(data?.processed_at),
    syncSummary,
  };
}
