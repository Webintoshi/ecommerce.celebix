export type DonorParityStatus = "complete" | "route_depth" | "provider_gated" | "legacy_rejected";
export type DonorParityAuthority = "orders" | "customers" | "catalog_admin" | "merchant_admin" | "analytics";
export type DonorParityEntry = Readonly<{
  donorPath: string;
  targetPath: string;
  status: DonorParityStatus;
  authority: DonorParityAuthority;
  evidenceTest: string;
  rejectionRationale?: string;
}>;

function entry(donorPath: string, targetPath: string, status: DonorParityStatus, authority: DonorParityAuthority): DonorParityEntry {
  const evidenceTest = status === "provider_gated"
    ? "apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts#provider workflows distinguish configuration readiness from external execution"
    : donorPath === "/ayarlar/yapay-zeka"
      ? "apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts#defines finite advanced SEO and AI preferences without a provider job"
    : "apps/customer-panel/lib/panel-ui/parity-manifest.test.ts#every evidence reference and canonical target is executable";
  const rejectionRationale = donorPath === "/ayarlar/ana-sayfa-vitrini"
    ? "duplicate storefront showcase; collections is the canonical safe target"
    : donorPath === "/muhasabe"
      ? "typo spelling; accounting is the canonical safe target"
      : donorPath === "/pazarlama/lucky-wheel"
        ? "duplicate lucky-wheel workflow; discounts is the canonical safe target"
        : undefined;
  return Object.freeze({ donorPath, targetPath, status, authority, evidenceTest, ...(rejectionRationale ? { rejectionRationale } : {}) });
}

export const HEMENAKU_DONOR_PARITY = Object.freeze([
  entry("", "/", "complete", "catalog_admin"),
  entry("/ayarlar", "/settings", "complete", "merchant_admin"),
  entry("/ayarlar/ana-sayfa-vitrini", "/products/collections", "legacy_rejected", "catalog_admin"),
  entry("/ayarlar/bildirimler", "/settings/notifications", "complete", "merchant_admin"),
  entry("/ayarlar/dil", "/settings/language", "complete", "merchant_admin"),
  entry("/ayarlar/genel", "/settings/general", "complete", "merchant_admin"),
  entry("/ayarlar/hero-banner", "/settings/hero-banner", "complete", "merchant_admin"),
  entry("/ayarlar/kargo", "/settings/shipping", "complete", "merchant_admin"),
  entry("/ayarlar/marquee", "/settings/marquee", "complete", "merchant_admin"),
  entry("/ayarlar/odeme", "/settings/payment", "complete", "merchant_admin"),
  entry("/ayarlar/odeme/[id]/duzenle", "/settings/payment/[recordId]/edit", "complete", "merchant_admin"),
  entry("/ayarlar/odeme/yeni", "/settings/payment/new", "complete", "merchant_admin"),
  entry("/ayarlar/promosyon-banner", "/settings/promotion-banner", "complete", "merchant_admin"),
  entry("/ayarlar/tasarim", "/settings/design", "complete", "merchant_admin"),
  entry("/ayarlar/yapay-zeka", "/settings/artificial-intelligence", "complete", "merchant_admin"),
  entry("/cms", "/content", "complete", "merchant_admin"),
  entry("/cms/blog", "/content/blog", "complete", "merchant_admin"),
  entry("/cms/blog/[id]", "/content/blog/[recordId]/edit", "complete", "merchant_admin"),
  entry("/cms/blog/yeni", "/content/blog/new", "complete", "merchant_admin"),
  entry("/cms/politikalar", "/content/policies", "complete", "merchant_admin"),
  entry("/cms/politikalar/[slug]", "/content/policies/[recordId]/edit", "complete", "merchant_admin"),
  entry("/cms/sayfalar", "/content/pages", "complete", "merchant_admin"),
  entry("/cms/sayfalar/[id]", "/content/pages/[recordId]/edit", "complete", "merchant_admin"),
  entry("/cms/sayfalar/yeni", "/content/pages/new", "complete", "merchant_admin"),
  entry("/indirimler", "/discounts", "complete", "merchant_admin"),
  entry("/indirimler/[id]/duzenle", "/discounts/[recordId]/edit", "complete", "merchant_admin"),
  entry("/indirimler/sans-carki", "/discounts/lucky-wheel", "complete", "merchant_admin"),
  entry("/indirimler/yeni", "/discounts/new", "complete", "merchant_admin"),
  entry("/login", "/login", "complete", "merchant_admin"),
  entry("/markets", "/marketplaces", "provider_gated", "merchant_admin"),
  entry("/muhasabe", "/accounting", "legacy_rejected", "merchant_admin"),
  entry("/muhasebe", "/accounting", "complete", "merchant_admin"),
  entry("/muhasebe/fatura-entegrasyonu", "/accounting/invoicing-integration", "provider_gated", "merchant_admin"),
  entry("/musteriler", "/customers", "complete", "customers"),
  entry("/musteriler/[id]", "/customers/[customerId]", "complete", "customers"),
  entry("/musteriler/[id]/duzenle", "/customers/[customerId]/edit", "complete", "customers"),
  entry("/musteriler/etiketler", "/customers/tags", "complete", "customers"),
  entry("/musteriler/segmentler", "/customers/segments", "complete", "customers"),
  entry("/musteriler/yeni", "/customers/new", "complete", "customers"),
  entry("/pazarlama", "/marketing", "complete", "merchant_admin"),
  entry("/pazarlama/email", "/marketing/email", "provider_gated", "merchant_admin"),
  entry("/pazarlama/lucky-wheel", "/discounts/lucky-wheel", "legacy_rejected", "merchant_admin"),
  entry("/pazarlama/phone", "/marketing/phone", "provider_gated", "merchant_admin"),
  entry("/pazarlama/whatsapp", "/marketing/whatsapp", "provider_gated", "merchant_admin"),
  entry("/seo-killer", "/seo", "complete", "merchant_admin"),
  entry("/seo-killer/geo-optimizasyon", "/seo/geo-optimization", "complete", "merchant_admin"),
  entry("/seo-killer/hizli-index", "/seo/fast-indexing", "provider_gated", "merchant_admin"),
  entry("/seo-killer/ic-linkleme", "/seo/internal-linking", "complete", "merchant_admin"),
  entry("/seo-killer/icerikler", "/seo/content", "complete", "merchant_admin"),
  entry("/seo-killer/kategoriler", "/seo/categories", "complete", "merchant_admin"),
  entry("/seo-killer/kod-entegrasyonlari", "/seo/code-integrations", "complete", "merchant_admin"),
  entry("/seo-killer/sayfalar", "/seo/pages", "complete", "merchant_admin"),
  entry("/seo-killer/sitemap", "/seo/sitemap", "complete", "merchant_admin"),
  entry("/seo-killer/sosyal-onizleme", "/seo/social-preview", "complete", "merchant_admin"),
  entry("/seo-killer/urunler", "/seo/products", "complete", "merchant_admin"),
  entry("/siparisler", "/orders", "complete", "orders"),
  entry("/siparisler/[id]", "/orders/[orderId]", "complete", "orders"),
  entry("/siparisler/[id]/yazdir", "/orders/[orderId]/print", "complete", "orders"),
  entry("/siparisler/hizli-siparis", "/orders/quick-links", "complete", "orders"),
  entry("/siparisler/sepet-terk", "/orders/abandoned-carts", "complete", "orders"),
  entry("/urunler", "/products", "complete", "catalog_admin"),
  entry("/urunler/[id]/duzenle", "/products/[productId]", "complete", "catalog_admin"),
  entry("/urunler/barkod-etiketleri", "/products/barcode-labels", "complete", "catalog_admin"),
  entry("/urunler/ekstralar", "/products/extras", "complete", "catalog_admin"),
  entry("/urunler/ekstralar/[id]", "/products/extras/[resourceId]/edit", "complete", "catalog_admin"),
  entry("/urunler/ekstralar/[id]/onizleme", "/products/extras/[resourceId]/preview", "complete", "catalog_admin"),
  entry("/urunler/ekstralar/yeni", "/products/extras/new", "complete", "catalog_admin"),
  entry("/urunler/etiketler", "/products/tags", "complete", "catalog_admin"),
  entry("/urunler/fiyat-listeleri", "/products/price-lists", "complete", "catalog_admin"),
  entry("/urunler/koleksiyonlar", "/products/collections", "complete", "catalog_admin"),
  entry("/urunler/koleksiyonlar/[id]/duzenle", "/products/collections/[resourceId]/edit", "complete", "catalog_admin"),
  entry("/urunler/koleksiyonlar/yeni", "/products/collections/new", "complete", "catalog_admin"),
  entry("/urunler/markalar", "/products/brands", "complete", "catalog_admin"),
  entry("/urunler/nitelikler", "/products/attributes", "complete", "catalog_admin"),
  entry("/urunler/nitelikler/[id]/duzenle", "/products/attributes/[resourceId]/edit", "complete", "catalog_admin"),
  entry("/urunler/nitelikler/yeni", "/products/attributes/new", "complete", "catalog_admin"),
  entry("/urunler/otomatik-yukle", "/products/auto-import", "complete", "catalog_admin"),
  entry("/urunler/satin-alma", "/products/purchasing", "complete", "catalog_admin"),
  entry("/urunler/shopify-donusturucu", "/products/shopify-converter", "complete", "catalog_admin"),
  entry("/urunler/stok-sayimi", "/products/inventory-counts", "complete", "catalog_admin"),
  entry("/urunler/tanimlamalar", "/products/definitions", "complete", "catalog_admin"),
  entry("/urunler/toplu-yukle", "/products/bulk-upload", "complete", "catalog_admin"),
  entry("/urunler/transferler", "/products/transfers", "complete", "catalog_admin"),
  entry("/urunler/yeni", "/products/new", "complete", "catalog_admin"),
  entry("/urunler/yorumlar", "/products/reviews", "complete", "catalog_admin"),
  entry("/yoneticiler", "/settings/administrators", "complete", "merchant_admin"),
] as const satisfies readonly DonorParityEntry[]);

export function getDonorParityEntry(donorPath: string) {
  return HEMENAKU_DONOR_PARITY.find((candidate) => candidate.donorPath === donorPath);
}
