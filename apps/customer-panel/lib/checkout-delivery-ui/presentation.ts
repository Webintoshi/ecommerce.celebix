import type { CheckoutDeliveryWorkspace } from "./client.ts";
export function deliveryPriceInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
export function checkoutDeliveryPresentation(workspace: CheckoutDeliveryWorkspace) {
  const settings = workspace.settings;
  const label = workspace.record === null ? "Tanımlanmadı" : settings === null ? "Ücret tanımlanmadı" : workspace.record.status === "active" ? "Etkin" : "Taslak";
  const fee = settings === null ? "" : settings.shippingPriceCents === 0 ? "Ücretsiz teslimat" : `${deliveryPriceInput(settings.shippingPriceCents)} TL`;
  const detail = settings === null ? "Teslimat ücretini açıkça tanımlayın." : workspace.record?.status === "active" ? "Ödeme adımında kullanılıyor." : "Taslak ayar ödeme adımında kullanılmaz.";
  return Object.freeze({ label, fee, detail });
}
