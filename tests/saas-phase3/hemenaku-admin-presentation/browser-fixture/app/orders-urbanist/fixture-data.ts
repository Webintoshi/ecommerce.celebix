import { parseOrderDetailV2, parseOrderEditWorkspace, parseShippingQuoteSession, type ShippingPackage } from "@celebix/saas-contracts";
import { createFixtureOrders } from "../mira-orders-approved/orders-approved-data";

export const ORDER_ID = "94000000-0000-4000-8000-000000000001";
export const OPTION_ID = "94000000-0000-4000-8000-000000001001";
export const SHIPMENT_ID = "94000000-0000-4000-8000-000000001002";
const sourceOrder = createFixtureOrders()[0];
export const PRINT_ORDER = parseOrderDetailV2(JSON.parse(JSON.stringify({ ...sourceOrder, billingAddress: sourceOrder.shippingAddress, customerId: null, currentCustomer: null, salesChannel: null, socialPlatform: null, socialReference: null, fulfillmentMethod: "shipping" })));
export const EDIT_WORKSPACE = parseOrderEditWorkspace({
  orderId: ORDER_ID, orderNumber: PRINT_ORDER.orderNumber, version: 1, currency: "TRY", source: "manual_import",
  canEdit: true, blockReason: null, canEditPrices: true, discountLimitBps: 9999,
  customerName: PRINT_ORDER.customerName, customerEmail: PRINT_ORDER.customerEmail, customerPhone: PRINT_ORDER.customerPhone ?? null,
  shippingAddress: PRINT_ORDER.shippingAddress, billingAddress: PRINT_ORDER.billingAddress,
  subtotalCents: PRINT_ORDER.subtotalCents, shippingCents: PRINT_ORDER.shippingCents,
  discountCents: PRINT_ORDER.discountCents, totalCents: PRINT_ORDER.totalCents,
  lines: PRINT_ORDER.items.map(item => ({ lineId: item.id, productId: null, variantId: null, quantity: item.quantity, unitPriceCents: item.unitPriceCents, discountCents: item.discountCents, productName: item.productName, variantName: item.variantName, sku: item.sku, lineTotalCents: item.lineTotalCents })),
  finance: { collectedCents: 1000000, settlementDiscountCents: 10000, dueCents: Math.max(0, PRINT_ORDER.totalCents - 1010000), refundDueCents: Math.max(0, 1010000 - PRINT_ORDER.totalCents) },
});
export function fixtureQuote(packages: readonly ShippingPackage[]) {
  return parseShippingQuoteSession({
    credential: "urbanist_fixture_quote_credential_0000000001", status: "quoted", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), currency: "TRY", packages,
    options: [
      { id: OPTION_ID, handlerCode: "YURTICI", handlerName: "Yurtiçi Kargo", desiKg: 2, priceCents: 12990, currency: "TRY" },
      { id: "94000000-0000-4000-8000-000000001003", handlerCode: "ARAS", handlerName: "Aras Kargo", desiKg: 2, priceCents: 11990, currency: "TRY" },
    ],
  });
}
export const SHIPMENT = {
  id: SHIPMENT_ID, providerCode: "basit_kargo", direction: "outgoing", status: "ready", carrier: "Yurtiçi Kargo", barcode: "ORNEK-123", trackingNumber: "DEMO-123",
  priceCents: 12990, codAmountCents: 0, currency: "TRY", items: PRINT_ORDER.items.map(item => ({ orderItemId: item.id, productName: item.productName, quantity: item.quantity })),
  events: [], label: { available: false }, version: 2, createdAt: PRINT_ORDER.createdAt, updatedAt: PRINT_ORDER.updatedAt,
};
