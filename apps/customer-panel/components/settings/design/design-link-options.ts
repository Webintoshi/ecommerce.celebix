import { FIXED_STOREFRONT_POLICIES, type StorefrontDesignDestinationOption } from "@celebix/saas-contracts";
import { STARTER_FOOTER_SYSTEM_LINKS } from "../starter-footer-options.ts";

export const DESIGN_LINK_GROUPS = Object.freeze({
  product: "Ürünler", collection: "Kategoriler", catalog_collection: "Koleksiyonlar", page: "Sayfalar",
});

export const DESIGN_STORE_LINKS = Object.freeze(STARTER_FOOTER_SYSTEM_LINKS.map(([path, label]) => ({ path, label, group: "Mağaza sayfaları" })));

// Old announcement destinations retain their exact saved route; only their label changes.
const LEGACY_POLICY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  "gizlilik-guvenlik": "Gizlilik ve Güvenlik", "gizlilik-ve-guvenlik": "Gizlilik ve Güvenlik",
  "mesafeli-satis-sozlesmesi": "Mesafeli Satış Sözleşmesi", kvkk: "KVKK",
  "odeme-teslimat": "Ödeme ve Teslimat", "odeme-ve-teslimat": "Ödeme ve Teslimat",
  "cerez-kullanimi": "Çerez Kullanımı", "iade-degisim": "İade ve Değişim",
  "iade-ve-degisim": "İade ve Değişim", "uyelik-sozlesmesi": "Üyelik",
});

export function designPathLabel(path: string, destinations: readonly StorefrontDesignDestinationOption[]): string {
  return destinations.find(item => item.path === path)?.label
    ?? DESIGN_STORE_LINKS.find(item => item.path === path)?.label
    ?? FIXED_STOREFRONT_POLICIES.find(item => item.route === path)?.label
    ?? LEGACY_POLICY_NAMES[path.replace(/^\/pages\//, "")]
    ?? "Mevcut bağlantı";
}

export function designPathOptions(destinations: readonly StorefrontDesignDestinationOption[]) {
  const options = [...DESIGN_STORE_LINKS, ...destinations.map(item => ({ path: item.path, label: item.label, group: DESIGN_LINK_GROUPS[item.kind] }))];
  return options.filter((item, index) => options.findIndex(candidate => candidate.path === item.path) === index);
}
