import assert from "node:assert/strict";
import test from "node:test";
import { compile, mounted } from "../../lib/mira-final-test-support.ts";

const createdAt = "2026-10-30T09:00:00.000Z";
const id = "93000000-0000-4000-8000-000000000001";
const production = () => compile("components/orders/OrderDetailConsole.tsx", {
  "@/lib/order-ui/client": { OrderApiError: Error, orderApi: {} },
  "@/components/accounting/OrderFinancePanel": { OrderFinancePanel: () => null },
  "@/components/shipping/OrderShipmentConsole": { OrderShipmentConsole: () => null },
  "@/components/shared/ProductThumbnail": { ProductThumbnail: () => null },
});

test("order history renders the stored automatic status examples and technical event types in Turkish", async () => {
  const events = Object.freeze([
    ["order_created", "Storefront siparişi oluşturuldu."],
    ["status_changed", "Order status changed to preparing"],
    ["status_changed", "Order status changed to shipped"],
    ["status_changed", "Order status changed to delivered"],
    ["payment_changed", "Order payment changed to completed"],
    ["shipping_updated", "Order shipping updated"],
  ].map(([type, message], index) => Object.freeze({ id: String(index), type, message, createdAt })));
  const before = JSON.stringify(events);
  const { OrderDetailPresentation } = production();
  const detail = { id, orderNumber: "WEB-1", source: "storefront", customerName: "Test müşteri", customerEmail: null, customerPhone: null, currency: "TRY", totalCents: 10000, subtotalCents: 10000, shippingCents: 0, discountCents: 0, status: "delivered", paymentStatus: "completed", createdAt, updatedAt: createdAt, version: 1, items: [], events, notes: [] };
  await mounted(OrderDetailPresentation, { state: "loaded", detail, capabilities: { fulfill: false, manage: false, payment: false, shipping: false, note: false }, busy: "", error: "", notice: "" }, async host => {
    const history = host.querySelector("#timeline-title")!.closest("section")!;
    assert.deepEqual([...history.querySelectorAll("li strong")].map(node => node.textContent), [
      "Online mağaza siparişi oluşturuldu.",
      "Sipariş durumu: Hazırlanıyor",
      "Sipariş durumu: Kargolandı",
      "Sipariş durumu: Teslim edildi",
      "Ödeme durumu: Başarılı",
      "Kargo bilgileri güncellendi.",
    ]);
    assert.doesNotMatch(history.textContent!, /Storefront|order_created|status_changed|payment_changed|shipping_updated|preparing|shipped|delivered/);
    assert.match(history.textContent!, /Sipariş oluşturuldu|Sipariş durumu değişti|Ödeme durumu değişti|Kargo bilgileri güncellendi/);
  });
  assert.equal(JSON.stringify(events), before);
});

test("history formatter labels every stored event type and projection alias without exposing unknown technical codes", () => {
  const { formatOrderHistoryEvent } = production();
  for (const [type, label] of [
    ["order_created", "Sipariş oluşturuldu"],
    ["status_changed", "Sipariş durumu değişti"],
    ["status_transition", "Sipariş durumu değişti"],
    ["payment_changed", "Ödeme durumu değişti"],
    ["payment_transition", "Ödeme durumu değişti"],
    ["shipping_updated", "Kargo bilgileri güncellendi"],
    ["note_added", "Not eklendi"],
    ["note_archived", "Not arşivlendi"],
    ["order_edited", "Sipariş düzenlendi"],
    ["provider_future_event", "Geçmiş kaydı"],
    ["toString", "Geçmiş kaydı"],
  ]) assert.deepEqual(formatOrderHistoryEvent({ type, message: "Özel açıklama" }), { label, message: "Özel açıklama" });
});

test("history formatter translates only complete known automatic status and payment values", () => {
  const { formatOrderHistoryEvent } = production();
  for (const type of ["status_changed", "status_transition"]) {
    for (const [code, label] of [["pending", "Oluşturuldu"], ["confirmed", "Onaylandı"], ["preparing", "Hazırlanıyor"], ["shipped", "Kargolandı"], ["delivered", "Teslim edildi"], ["cancelled", "İptal"], ["refunded", "İade"]]) {
      assert.equal(formatOrderHistoryEvent({ type, message: `Order status changed to ${code}` }).message, `Sipariş durumu: ${label}`);
    }
  }
  for (const type of ["payment_changed", "payment_transition"]) {
    for (const [code, label] of [["pending", "Ödeme bekleniyor"], ["processing", "İşleniyor"], ["completed", "Başarılı"], ["failed", "Başarısız"], ["refunded", "İade edildi"]]) {
      assert.equal(formatOrderHistoryEvent({ type, message: `Order payment changed to ${code}` }).message, `Ödeme durumu: ${label}`);
    }
  }
});

test("history formatter translates fixed automatic messages only for their matching event type", () => {
  const { formatOrderHistoryEvent } = production();
  for (const [type, message, translated] of [
    ["order_created", "Manual order created", "Manuel sipariş oluşturuldu."],
    ["order_created", "Quick order payment confirmed", "Hızlı sipariş ödemesi doğrulandı."],
    ["order_created", "Storefront siparişi oluşturuldu.", "Online mağaza siparişi oluşturuldu."],
    ["order_created", "Storefront kart ödemesi doğrulandı.", "Online mağaza kart ödemesi doğrulandı."],
    ["shipping_updated", "Order shipping updated", "Kargo bilgileri güncellendi."],
    ["note_added", "Order note added", "Sipariş notu eklendi."],
    ["note_archived", "Order note archived", "Sipariş notu arşivlendi."],
  ]) assert.equal(formatOrderHistoryEvent({ type, message }).message, translated);
});

test("history formatter preserves merchant reasons notes unknown messages and incomplete template matches byte for byte", () => {
  const { formatOrderHistoryEvent } = production();
  for (const [type, message] of [
    ["order_edited", "Order status changed to preparing"],
    ["order_edited", "Storefront siparişi oluşturuldu."],
    ["note_added", "preparing sipariş için Storefront ekibiyle görüşüldü"],
    ["status_changed", "Order status changed to paused"],
    ["status_changed", "Order status changed to shipped — DHL takip kodu 123"],
    ["status_changed", "Order status changed to shipped\n"],
    ["status_changed", "Order status changed to constructor"],
    ["shipping_updated", "Order shipping updated via DHL: TRACK-123"],
    ["provider_future_event", "Order status changed to preparing"],
    ["order_created", "Mağaza satışı tamamlandı"],
    ["order_created", "Trendyol siparişi alındı"],
    ["note_archived", "Not arşivlendi: müşteri talebi"],
  ]) {
    const event = Object.freeze({ type, message });
    assert.equal(formatOrderHistoryEvent(event).message, message);
    assert.deepEqual(event, { type, message });
  }
});
