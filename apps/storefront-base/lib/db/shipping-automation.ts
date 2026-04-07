import {
  buildBasitKargoOrderPayload,
  encodeBasitKargoRequestBody,
  getBasitKargoValidationFailure,
  normalizeBasitKargoShippingAddress,
  parseBasitKargoDispatchResult,
  resolveDispatchIntegration,
  type ShippingDispatchTrigger,
} from "@celebix/platform-config/src/shipping-dispatch";
import { hasRequiredProviderCredentials } from "@/lib/shipping-integrations";
import { createServerClient } from "@/lib/supabase";
import { getShippingIntegrations } from "./settings";

type OrderRow = {
  id: string;
  order_number: string;
  total: number;
  payment_method: string | null;
  shipping_address: Record<string, unknown> | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
};

type OrderItemRow = {
  product_name: string;
  variant_name: string | null;
  quantity: number;
  variant_id: string | null;
  product_id: string | null;
};

function stringifyError(payload: unknown, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return (
      (typeof record.message === "string" && record.message) ||
      (typeof record.error === "string" && record.error) ||
      fallback
    );
  }
  return fallback;
}

async function getOrderDispatchSnapshot(orderId: string) {
  const serverClient = createServerClient();
  const { data: order, error: orderError } = await serverClient
    .from("orders")
    .select(
      "id, order_number, total, payment_method, shipping_address, shipping_carrier, tracking_number",
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw orderError || new Error("Order not found.");
  }

  const { data: items, error: itemError } = await serverClient
    .from("order_items")
    .select("product_name, variant_name, quantity, variant_id, product_id")
    .eq("order_id", orderId);

  if (itemError) throw itemError;

  return {
    order: order as OrderRow,
    items: (items || []) as OrderItemRow[],
    serverClient,
  };
}

async function hasExistingProviderDispatch(orderId: string, provider: string) {
  const serverClient = createServerClient();
  const { data, error } = await serverClient
    .from("order_activity_log")
    .select("new_value")
    .eq("order_id", orderId)
    .eq("action", "shipping_updated")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Shipping activity log query error:", error);
    return false;
  }

  return (data || []).some((entry) => {
    const nextValue = entry?.new_value as Record<string, unknown> | null;
    return nextValue?.provider === provider;
  });
}

async function insertDispatchFailureLog(
  serverClient: ReturnType<typeof createServerClient>,
  order: OrderRow,
  provider: string,
  reason: string,
) {
  const { error: logError } = await serverClient.from("order_activity_log").insert({
    order_id: order.id,
    action: "shipping_dispatch_failed",
    old_value: {
      carrier: order.shipping_carrier,
      trackingNumber: order.tracking_number,
    },
    new_value: {
      provider,
      reason,
      source: "shipping-integration",
    },
    created_at: new Date().toISOString(),
  });

  if (logError) {
    console.error("Shipping dispatch failure log insert error:", logError);
  }
}

async function dispatchBasitKargoOrder(order: OrderRow, items: OrderItemRow[], apiToken: string) {
  const normalizedShippingAddress = await normalizeBasitKargoShippingAddress(
    order.shipping_address || {},
  );
  const payload = buildBasitKargoOrderPayload(
    {
      id: order.id,
      orderNumber: order.order_number,
      total: Number(order.total || 0),
      paymentMethod: order.payment_method,
      shippingAddress: normalizedShippingAddress,
    },
    items.map((item) => ({
      productName: item.product_name,
      variantName: item.variant_name,
      quantity: Number(item.quantity || 0),
      code: item.variant_id || item.product_id || undefined,
    })),
  );
  const requestBody = encodeBasitKargoRequestBody(payload);

  const response = await fetch("https://basitkargo.com/api/v2/order", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Length": String(requestBody.byteLength),
    },
    body: requestBody,
    cache: "no-store",
  });

  const responseText = await response.text();
  let parsedBody: unknown = null;

  try {
    parsedBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsedBody = responseText;
  }

  if (!response.ok) {
    throw new Error(
      stringifyError(parsedBody, `Basit Kargo order API error (${response.status})`),
    );
  }

  const validationFailure = getBasitKargoValidationFailure(parsedBody);
  if (validationFailure) {
    throw new Error(validationFailure);
  }

  return parseBasitKargoDispatchResult(parsedBody, "Basit Kargo");
}

export async function attemptOrderShippingDispatch(
  orderId: string,
  trigger: ShippingDispatchTrigger,
) {
  const settings = await getShippingIntegrations();
  const integration = resolveDispatchIntegration(
    {
      ...settings,
      integrations: settings.integrations.filter((item) =>
        hasRequiredProviderCredentials(item),
      ),
    },
    trigger,
  );

  if (!integration) {
    return { attempted: false as const, reason: "no_matching_integration" as const };
  }

  if (await hasExistingProviderDispatch(orderId, integration.provider)) {
    return { attempted: false as const, reason: "already_dispatched" as const };
  }

  const { order, items, serverClient } = await getOrderDispatchSnapshot(orderId);
  if (order.tracking_number || order.shipping_carrier) {
    return { attempted: false as const, reason: "shipping_info_exists" as const };
  }

  if (integration.provider !== "basit-kargo") {
    return { attempted: false as const, reason: "provider_not_implemented" as const };
  }

  const apiToken = integration.credentials.apiToken?.trim();
  if (!apiToken) {
    return { attempted: false as const, reason: "missing_credentials" as const };
  }

  let dispatch;
  try {
    dispatch = await dispatchBasitKargoOrder(order, items, apiToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Basit Kargo gönderimi başarısız oldu.";
    await insertDispatchFailureLog(serverClient, order, integration.provider, message);
    throw error;
  }

  const updatePayload: Record<string, unknown> = {};
  if (dispatch.carrier) updatePayload.shipping_carrier = dispatch.carrier;
  if (dispatch.trackingNumber) updatePayload.tracking_number = dispatch.trackingNumber;

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await serverClient
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (updateError) throw updateError;
  }

  const { error: logError } = await serverClient.from("order_activity_log").insert({
    order_id: orderId,
    action: "shipping_updated",
    old_value: {
      carrier: order.shipping_carrier,
      trackingNumber: order.tracking_number,
    },
    new_value: {
      provider: dispatch.provider,
      remoteOrderId: dispatch.remoteOrderId,
      barcode: dispatch.barcode,
      trackingNumber: dispatch.trackingNumber,
      carrier: dispatch.carrier,
      source: "shipping-integration",
    },
    created_at: new Date().toISOString(),
  });

  if (logError) {
    console.error("Shipping activity log insert error:", logError);
  }

  return { attempted: true as const, provider: integration.provider, dispatch };
}
