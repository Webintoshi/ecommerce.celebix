import type { StarterFixedPolicyKey, StarterFooterLinkConfig } from "@celebix/saas-contracts";

export const STARTER_FOOTER_POLICIES = Object.freeze([
  ["privacy_security", "Gizlilik ve Güvenlik"],
  ["distance_sales", "Mesafeli Satış Sözleşmesi"],
  ["kvkk", "KVKK"],
  ["payment_delivery", "Ödeme ve Teslimat"],
  ["cookie_usage", "Çerez Kullanımı"],
  ["returns_exchange", "İade ve Değişim"],
  ["membership", "Üyelik"],
] as const satisfies readonly (readonly [StarterFixedPolicyKey, string])[]);

export const STARTER_FOOTER_SYSTEM_LINKS = Object.freeze([
  ["/", "Ana sayfa"],
  ["/products", "Ürünler"],
  ["/favorites", "Favoriler"],
  ["/account", "Hesabım"],
] as const satisfies readonly (readonly [Extract<StarterFooterLinkConfig, { kind: "system" }>["destination"], string])[]);
