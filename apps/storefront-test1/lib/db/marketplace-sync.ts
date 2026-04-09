import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import type {
  MarketplaceProvider,
  MarketplaceQueueDirection,
  MarketplaceQueueEntityType,
  MarketplaceQueueOperation,
} from "@/types/marketplace";

type QueueInsertInput = {
  provider: MarketplaceProvider;
  direction: MarketplaceQueueDirection;
  entityType: MarketplaceQueueEntityType;
  entityId: string;
  operation: MarketplaceQueueOperation;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
};

type OrderStatusSnapshot = {
  status: string | null;
  payment_status: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
};

function buildIdempotencyKey(parts: Array<string | number | null | undefined>) {
  const serialized = parts.map((part) => String(part || "")).join(":");
  return createHash("sha256").update(serialized).digest("hex");
}

async function getActiveMarketplaceProviders() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("marketplace_provider_connections")
    .select("provider")
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => (typeof row.provider === "string" ? (row.provider as MarketplaceProvider) : null))
    .filter(Boolean) as MarketplaceProvider[];
}

async function insertQueueRows(rows: QueueInsertInput[]) {
  if (rows.length === 0) return;

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    provider: row.provider,
    direction: row.direction,
    entity_type: row.entityType,
    entity_id: row.entityId,
    operation: row.operation,
    payload: row.payload || {},
    status: "queued",
    attempt_count: 0,
    next_retry_at: now,
    idempotency_key:
      row.idempotencyKey ||
      buildIdempotencyKey([row.provider, row.direction, row.entityType, row.entityId, row.operation]),
    last_error: null,
    processed_at: null,
  }));

  const { error } = await supabase
    .from("marketplace_sync_queue")
    .upsert(payload, { onConflict: "idempotency_key" });

  if (error) {
    throw error;
  }
}

export async function enqueueProductListingSync(productId: string, providers?: MarketplaceProvider[]) {
  const targetProviders = providers && providers.length > 0 ? providers : await getActiveMarketplaceProviders();
  await insertQueueRows(
    targetProviders.map((provider) => ({
      provider,
      direction: "outbound",
      entityType: "product",
      entityId: productId,
      operation: "upsert_listing",
      payload: { productId },
      idempotencyKey: buildIdempotencyKey([provider, "outbound", "product", productId, "upsert_listing"]),
    })),
  );
}

export async function enqueueInventorySyncByVariantIds(variantIds: string[], providers?: MarketplaceProvider[]) {
  if (variantIds.length === 0) return;

  const uniqueVariantIds = [...new Set(variantIds)];
  const targetProviders = providers && providers.length > 0 ? providers : await getActiveMarketplaceProviders();

  const rows: QueueInsertInput[] = [];
  for (const provider of targetProviders) {
    for (const variantId of uniqueVariantIds) {
      rows.push({
        provider,
        direction: "outbound",
        entityType: "variant",
        entityId: variantId,
        operation: "update_inventory",
        payload: { variantId },
        idempotencyKey: buildIdempotencyKey([provider, "outbound", "variant", variantId, "update_inventory"]),
      });
    }
  }

  await insertQueueRows(rows);
}

async function getMarketplaceOrderProviders(orderId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("marketplace_orders")
    .select("provider")
    .eq("internal_order_id", orderId);

  if (error) {
    throw error;
  }

  return [...new Set((data || []).map((row) => row.provider as MarketplaceProvider))];
}

async function getOrderStatusSnapshot(orderId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("status,payment_status,shipping_carrier,tracking_number")
    .eq("id", orderId)
    .single();

  if (error) {
    throw error;
  }

  return data as OrderStatusSnapshot;
}

export async function enqueueOrderStatusSync(orderId: string, providers?: MarketplaceProvider[]) {
  const targetProviders = providers && providers.length > 0 ? providers : await getMarketplaceOrderProviders(orderId);
  if (targetProviders.length === 0) return;

  const snapshot = await getOrderStatusSnapshot(orderId);
  await insertQueueRows(
    targetProviders.map((provider) => ({
      provider,
      direction: "outbound",
      entityType: "order",
      entityId: orderId,
      operation: "update_order_status",
      payload: {
        orderId,
        status: snapshot.status,
        paymentStatus: snapshot.payment_status,
        shippingCarrier: snapshot.shipping_carrier,
        trackingNumber: snapshot.tracking_number,
      },
      idempotencyKey: buildIdempotencyKey([
        provider,
        "outbound",
        "order",
        orderId,
        "update_order_status",
        snapshot.status,
        snapshot.payment_status,
        snapshot.shipping_carrier,
        snapshot.tracking_number,
      ]),
    })),
  );
}
