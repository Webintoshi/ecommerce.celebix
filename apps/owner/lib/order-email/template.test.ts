import assert from "node:assert/strict";
import test from "node:test";

import type { OrderEmailProjection } from "@celebix/saas-data";

import { renderOrderEmail } from "./template.ts";

const STORE = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";

function projection(overrides: Partial<OrderEmailProjection> = {}): OrderEmailProjection {
  return {
    recipient: "ada@example.test",
    senderLabel: "Güzide & Kuyumcu",
    replyTo: "destek@example.test",
    storeName: "Güzide <Kuyumcu>",
    primaryColor: "#8A623E",
    logoUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/33333333-3333-4333-8333-333333333333.webp`,
    storefrontOrigin: "https://guzide.example.test",
    adminOrigin: "https://admin.guzide.example.test",
    orderNumber: "GK-1042",
    customerName: "Ada <script>",
    currency: "TRY",
    subtotalCents: 125_000,
    shippingCents: 5_000,
    discountCents: 10_000,
    totalCents: 120_000,
    shippingAddress: { recipientName: "Ada", line1: "Gül Sok. <1>", city: "İstanbul", country: "TR" },
    tracking: { carrier: "Yurtiçi Kargo", trackingNumber: "YK123", trackingUrl: "https://guzide.example.test/account/orders" },
    items: [{ productName: "Kolye <özel>", variantName: "Altın", sku: "GK-1", unitPriceCents: 125_000, quantity: 1, discountCents: 10_000, lineTotalCents: 115_000 }],
    ...overrides,
  };
}

test("all approved Turkish order templates render one compact accessible layout", () => {
  const cases = [
    ["order_received", "Siparişinizi aldık"],
    ["payment_completed", "Ödemeniz tamamlandı"],
    ["order_shipped", "Siparişiniz kargoda"],
    ["order_delivered", "Siparişiniz teslim edildi"],
    ["order_cancelled", "Siparişiniz iptal edildi"],
    ["refund_completed", "İadeniz tamamlandı"],
  ] as const;
  for (const [eventType, heading] of cases) {
    const rendered = renderOrderEmail({ eventType, recipientKind: "customer", storeId: STORE, orderId: ORDER, projection: projection() });
    assert.equal(rendered.subject, `${heading} · GK-1042`);
    assert.match(rendered.html, new RegExp(heading, "u"));
    assert.match(rendered.text, new RegExp(heading, "u"));
    assert.match(rendered.html, /href="https:\/\/guzide[.]example[.]test\/account\/orders"/u);
    assert.doesNotMatch(rendered.html, /<script|<form|<style|data:|tracking|pixel/iu);
    assert.doesNotMatch(rendered.html, /Ada <script>|Kolye <özel>|Güzide <Kuyumcu>/u);
    assert.match(rendered.html, /Ada &lt;script&gt;|Kolye &lt;özel&gt;|Güzide &lt;Kuyumcu&gt;/u);
  }
});

test("merchant alert uses the authenticated admin order route and no customer account link", () => {
  const rendered = renderOrderEmail({ eventType: "merchant_new_order", recipientKind: "merchant", storeId: STORE, orderId: ORDER, projection: projection() });
  assert.equal(rendered.subject, "Yeni sipariş · GK-1042");
  assert.match(rendered.html, new RegExp(`href="https://admin[.]guzide[.]example[.]test/orders/${ORDER}"`, "u"));
  assert.doesNotMatch(rendered.html, /\/account\/orders/u);
});

test("tracking appears only for shipped mail and unsafe logos fall back to escaped store text", () => {
  const shipped = renderOrderEmail({ eventType: "order_shipped", recipientKind: "customer", storeId: STORE, orderId: ORDER, projection: projection() });
  const received = renderOrderEmail({ eventType: "order_received", recipientKind: "customer", storeId: STORE, orderId: ORDER, projection: projection() });
  assert.match(shipped.html, /YK123/u);
  assert.match(shipped.text, /YK123/u);
  assert.doesNotMatch(received.html, /YK123/u);

  const fallback = renderOrderEmail({
    eventType: "order_received", recipientKind: "customer", storeId: STORE, orderId: ORDER,
    projection: projection({ logoUrl: "https://attacker.example/pixel.gif", primaryColor: "#FFFFFF" }),
  });
  assert.doesNotMatch(fallback.html, /attacker[.]example/u);
  assert.match(fallback.html, /Güzide &lt;Kuyumcu&gt;/u);
  assert.match(fallback.html, /#171717/u);
});

