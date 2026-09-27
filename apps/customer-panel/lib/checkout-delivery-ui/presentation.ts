import type { CheckoutDeliveryWorkspace } from "./client.ts";
import { readCheckoutDeliverySettings } from "./model.ts";
export function deliveryPriceInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
export function checkoutDeliveryPresentation(workspace: CheckoutDeliveryWorkspace) {
  const settings = workspace.settings;
  const label = workspace.record === null ? "Tanımlanmadı" : settings === null ? "Ücret tanımlanmadı" : workspace.record.status === "active" ? "Etkin" : "Taslak";
  const fee = settings === null ? "" : settings.shippingPriceCents === 0 ? "Ücretsiz teslimat" : `${deliveryPriceInput(settings.shippingPriceCents)} TL`;
  const detail = settings === null ? "Teslimat ücretini açıkça tanımlayın." : workspace.record?.status === "active" ? "Ödeme adımında kullanılıyor." : "Taslak ayar ödeme adımında kullanılmaz.";
  const active = workspace.activeRecord === undefined ? workspace.record?.status === "active" ? workspace.record : null : workspace.activeRecord;
  const activeSettings = active ? readCheckoutDeliverySettings(active.config) : null;
  const checkoutDetail = active?.id === workspace.record?.id && active !== null ? "" : active === null ? workspace.activeStatus === "unknown" ? "Ödeme adımındaki etkin teslimat ayarı şu anda doğrulanamıyor." : "Ödeme adımında etkin teslimat ayarı yok." : activeSettings === null ? "Ödeme adımındaki etkin kayıtta ücret tanımlanmadı." : activeSettings.shippingPriceCents === 0 ? "Ödeme adımında ücretsiz teslimat kullanılıyor." : `Ödeme adımında ${deliveryPriceInput(activeSettings.shippingPriceCents)} TL kullanılıyor.`;
  return Object.freeze({ label, fee, detail, checkoutDetail });
}
export function checkoutDeliveryDaysInput(workspace: CheckoutDeliveryWorkspace): string {
  if (workspace.record === null) return "";
  readCheckoutDeliverySettings(workspace.record.config);
  return workspace.record.config.estimatedDays === undefined ? "" : String(workspace.record.config.estimatedDays);
}
