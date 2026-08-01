import type { PublicCart } from "@celebix/saas-contracts";

type PublicCartCheckoutBlocker = PublicCart["checkoutBlocker"];

const CHECKOUT_BLOCKER_COPY = Object.freeze({
  empty_cart: "Sepetiniz boş.",
  stock_unavailable: "Sepetinizde stok veya fiyatı değişen bir ürün var.",
  shipping_unavailable: "Teslimat yöntemi henüz yapılandırılmadı.",
  payment_unavailable: "Ödeme yöntemi henüz yapılandırılmadı.",
} satisfies Record<Exclude<PublicCartCheckoutBlocker, null>, string>);

export function checkoutBlockerMessage(blocker: PublicCartCheckoutBlocker): string | null {
  return blocker === null ? null : CHECKOUT_BLOCKER_COPY[blocker];
}

export function checkoutFailureMessage(code: unknown): string {
  if (code === "cart_empty") return CHECKOUT_BLOCKER_COPY.empty_cart;
  if (code === "price_changed" || code === "stock_unavailable") return CHECKOUT_BLOCKER_COPY.stock_unavailable;
  if (code === "shipping_unavailable") return CHECKOUT_BLOCKER_COPY.shipping_unavailable;
  if (code === "payment_unavailable") return CHECKOUT_BLOCKER_COPY.payment_unavailable;
  return "Sipariş özeti alınamadı. Lütfen sepetinizi kontrol edin.";
}
