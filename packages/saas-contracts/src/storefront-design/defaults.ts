import type { StarterThemeCompositionConfigV2 } from "../storefront/types.ts";

export function createDefaultStarterThemeComposition(): StarterThemeCompositionConfigV2 {
  return Object.freeze({
    schemaVersion: 2,
    visual: Object.freeze({ colorScheme: "neutral", headingStyle: "serif", cornerStyle: "square", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait", headerWidth: "wide", headerLayout: "menu_logo_actions", sectionSpacing: "balanced" }),
    announcement: Object.freeze({ enabled: true, items: Object.freeze(["Güvenli alışveriş"]), destination: "/pages/odeme-teslimat" }),
    navigation: Object.freeze({ rootCategoryIds: Object.freeze([]) }),
    sections: Object.freeze([Object.freeze({ kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 })]),
    productDetail: Object.freeze({ galleryStyle: "grid", showSku: true, showBrand: true, showBreadcrumbs: true, showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true, showSizeGuide: true, informationSections: Object.freeze(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const) }),
    cart: Object.freeze({ showCheckoutReadiness: true, showShippingProgress: false, showQuantitySelector: true, trustMessage: "Güvenli ödeme" }),
    footer: Object.freeze({
      tone: "dark",
      groups: Object.freeze([
        Object.freeze({ heading: "Mağaza", links: Object.freeze([Object.freeze({ kind: "system", destination: "/products" }), Object.freeze({ kind: "system", destination: "/favorites" })]) }),
        Object.freeze({ heading: "Hesap", links: Object.freeze([Object.freeze({ kind: "system", destination: "/account" })]) }),
      ]),
      newsletter: Object.freeze({ enabled: false, heading: "Bizden haber alın", body: "Yeni ürün ve mağaza duyurularını e-postanızda alın.", consentLabel: "Aydınlatma metnini okudum ve iletişime izin veriyorum." }),
      social: Object.freeze([]),
    }),
  });
}
