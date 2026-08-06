import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const COMPONENT = new URL("./OrderShipmentConsole.tsx", import.meta.url);
const CSS = new URL("./order-shipment.module.css", import.meta.url);
const ORDER_DETAIL = new URL("../orders/OrderDetailConsole.tsx", import.meta.url);

test("order detail exposes controlled Basit Kargo quote and shipment creation", async () => {
  const [component, orderDetail] = await Promise.all([readFile(COMPONENT, "utf8"), readFile(ORDER_DETAIL, "utf8")]);
  for (const token of ["Kargo teklifi al", "Gönderiyi oluştur", "Paket ölçüleri", "Takip numarası", "Durumu güncelle", "Etiket hazırla", "Gönderiyi iptal et", "İade başlat"]) assert.match(component, new RegExp(token, "u"));
  assert.match(component, /shippingFulfillmentApi\.quote/u);
  assert.match(component, /shippingFulfillmentApi\.createShipment/u);
  assert.match(component, /shippingFulfillmentApi\.shipmentAction/u);
  assert.match(orderDetail, /OrderShipmentConsole/u);
});

test("shipment console remains flat responsive and does not expose provider authority fields", async () => {
  const [component, css] = await Promise.all([readFile(COMPONENT, "utf8"), readFile(CSS, "utf8")]);
  assert.match(css, /border-bottom/u);
  assert.match(css, /@media/u);
  assert.doesNotMatch(css, /box-shadow/u);
  assert.doesNotMatch(component, /token|providerShipmentId|handlerCode|storeId/u);
});
