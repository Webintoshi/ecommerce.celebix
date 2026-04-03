export type ShippingDispatchProvider = "basit-kargo" | "shipink" | "geliver";
export type ShippingDispatchOrderTrigger = "manual" | "confirmed" | "preparing";
export type ShippingDispatchTrigger = "confirmed" | "preparing";

export interface ShippingDispatchIntegrationRecord {
  provider: ShippingDispatchProvider;
  displayName: string;
  enabled: boolean;
  credentials: Record<string, string>;
  configuration: Record<string, string>;
  automation: {
    autoCreateShipment: boolean;
    orderTrigger: ShippingDispatchOrderTrigger;
  };
}

export interface ShippingDispatchSettings {
  version?: number;
  defaultProvider: ShippingDispatchProvider | null;
  integrations: ShippingDispatchIntegrationRecord[];
}

export interface ShippingDispatchOrder {
  id: string;
  orderNumber: string;
  total: number;
  paymentMethod?: string | null;
  shippingAddress?: Record<string, unknown> | null;
}

export interface ShippingDispatchOrderItem {
  productName: string;
  variantName?: string | null;
  quantity: number;
  code?: string | null;
}

export interface BasitKargoDispatchResult {
  provider: "basit-kargo";
  remoteOrderId: string | null;
  barcode: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  raw: Record<string, unknown>;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("90") && digits.length > 10) {
    digits = digits.slice(-10);
  }

  if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  return digits.slice(-10);
}

function getEffectiveAutomation(
  settingsVersion: number,
  integration: ShippingDispatchIntegrationRecord,
) {
  let autoCreateShipment = integration.automation?.autoCreateShipment ?? false;
  let orderTrigger = integration.automation?.orderTrigger ?? "preparing";

  // Compatibility for the first shared shipping rollout:
  // Basit Kargo had no working outbound dispatcher yet, so existing "false/preparing"
  // settings should behave like an active post-payment automation.
  if (settingsVersion <= 1 && integration.provider === "basit-kargo") {
    autoCreateShipment = true;
    if (orderTrigger === "preparing") {
      orderTrigger = "confirmed";
    }
  }

  return { autoCreateShipment, orderTrigger };
}

export function resolveDispatchIntegration(
  settings: ShippingDispatchSettings,
  trigger: ShippingDispatchTrigger,
) {
  const orderedIntegrations = settings.defaultProvider
    ? [
        ...settings.integrations.filter(
          (integration) => integration.provider === settings.defaultProvider,
        ),
        ...settings.integrations.filter(
          (integration) => integration.provider !== settings.defaultProvider,
        ),
      ]
    : settings.integrations;

  const settingsVersion = Number(settings.version || 1);

  for (const integration of orderedIntegrations) {
    if (!integration.enabled) continue;

    const automation = getEffectiveAutomation(settingsVersion, integration);
    if (!automation.autoCreateShipment) continue;
    if (automation.orderTrigger === "manual") continue;
    if (automation.orderTrigger !== trigger) continue;

    return integration;
  }

  return null;
}

export function buildBasitKargoOrderPayload(
  order: ShippingDispatchOrder,
  items: ShippingDispatchOrderItem[],
) {
  const shippingAddress = order.shippingAddress || {};
  const firstName =
    getStringValue(shippingAddress.firstName) ||
    getStringValue(shippingAddress.first_name);
  const lastName =
    getStringValue(shippingAddress.lastName) ||
    getStringValue(shippingAddress.last_name);
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    getStringValue(shippingAddress.name) ||
    order.orderNumber;

  const city =
    getStringValue(shippingAddress.city) ||
    getStringValue(shippingAddress.province) ||
    "Istanbul";
  const town =
    getStringValue(shippingAddress.district) ||
    getStringValue(shippingAddress.town) ||
    city;
  const postalCode =
    getStringValue(shippingAddress.postalCode) ||
    getStringValue(shippingAddress.postal_code);
  const addressLine =
    [
      getStringValue(shippingAddress.address),
      getStringValue(shippingAddress.addressLine1),
      getStringValue(shippingAddress.addressLine2),
      postalCode,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || city;

  const phone = normalizePhone(
    getStringValue(shippingAddress.phone) ||
      getStringValue(shippingAddress.mobilePhone),
  );

  const contentItems = items.map((item, index) => ({
    name: [item.productName, item.variantName].filter(Boolean).join(" - "),
    code: item.code || `${order.orderNumber}-${index + 1}`,
    quantity: item.quantity,
  }));

  const payload: Record<string, unknown> = {
    type: "OUTGOING",
    client: {
      name: fullName,
      phone,
      city,
      town,
      address: addressLine,
    },
    content: {
      name: order.orderNumber,
      code: order.orderNumber,
      productPrice: Number(order.total || 0),
      items: contentItems,
      packages: [
        {
          height: 10,
          width: 15,
          depth: 5,
          weight: 1,
        },
      ],
    },
  };

  if (order.paymentMethod === "cash-on-delivery" || order.paymentMethod === "cod") {
    payload.collect = Number(order.total || 0);
    payload.collectOnDeliveryType = "CASH";
  }

  return payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function parseBasitKargoDispatchResult(
  payload: unknown,
  fallbackCarrier: string,
): BasitKargoDispatchResult {
  const data = asRecord(payload);
  const handler = asRecord(data.handler);
  const barcode =
    getStringValue(data.barcode) ||
    getStringValue(data.orderBarcode) ||
    getStringValue(data.cargoBarcode) ||
    null;
  const trackingNumber =
    getStringValue(data.handlerShipmentCode) ||
    getStringValue(data.trackingNumber) ||
    barcode;
  const carrier =
    getStringValue(handler.name) ||
    getStringValue(data.handlerName) ||
    fallbackCarrier;
  const remoteOrderId =
    getStringValue(data.id) ||
    getStringValue(data.orderId) ||
    null;

  return {
    provider: "basit-kargo",
    remoteOrderId,
    barcode,
    trackingNumber,
    carrier,
    raw: data,
  };
}
