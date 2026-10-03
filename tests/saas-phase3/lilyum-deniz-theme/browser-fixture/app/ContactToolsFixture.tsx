import Link from "next/link";
import { createDefaultContactWidgetConfig, createDefaultStarterThemeComposition, type ContactWidgetConfig } from "@celebix/saas-contracts";
import { ContactWidget } from "../../../../../apps/storefront-shared/components/ContactWidget";
import { StorefrontFrame } from "../../../../../apps/storefront-shared/components/StorefrontFrame";
import { ProductDetailExperience } from "../../../../../apps/storefront-shared/components/ProductDetailExperience";
import { ProductCard } from "../../../../../apps/storefront-shared/components/ProductCard";
import { GuzideProductDetailExperience } from "../../../../../apps/storefront-shared/themes/guzide/GuzideProductDetailExperience";
import { SioraProductDetailExperience } from "../../../../../apps/storefront-shared/themes/siora/SioraProductDetailExperience";
import { LilyumProductDetailExperience } from "../../../../../apps/storefront-shared/themes/lilyum/LilyumProductDetailExperience";
import { storefront, design, products, presentation } from "./data";

const themes = {
  lilyum: { id: storefront.id, name: "Lilyum Flora Ordu", color: "#FF5A00" },
  guzide: { id: "a828862c-4cc1-475a-89cc-5fbee31eb43f", name: "Güzide", color: "#34342c" },
  siora: { id: "ff465e64-1491-40ef-8840-c66281155a1d", name: "Butik Siora", color: "#22221f" },
  alpler: { id: "9f1f6aed-8719-407e-b64c-fd8e956d3277", name: "Alpler Spor", color: "#173751" },
};

export function ContactToolsFixture({ theme = "lilyum", productPage = false, checkout = false, appearance = "brand", left = false }: { theme?: string; productPage?: boolean; checkout?: boolean; appearance?: string; left?: boolean }) {
  const themeKey = Object.hasOwn(themes, theme) ? theme as keyof typeof themes : "lilyum";
  const selected = themes[themeKey];
  const store = { ...storefront, id: selected.id, name: selected.name, presentation: { ...presentation, displayName: selected.name, logo: themeKey === "lilyum" ? presentation.logo : null } };
  const selectedDesign = { ...design, brand: { ...design.brand, primaryColor: selected.color, logo: themeKey === "lilyum" ? design.brand.logo : null } };
  const defaults = createDefaultContactWidgetConfig();
  const config: ContactWidgetConfig = { ...defaults, enabled: true, title: "Nasıl yardımcı olabiliriz?", greeting: "Ürünlerimiz ve siparişiniz için bize ulaşabilirsiniz.", buttonLabel: "Bize ulaşın", position: left ? "bottom-left" : "bottom-right", theme: appearance === "dark" || appearance === "light" ? appearance : "brand", includeProductLink: true, whatsappMessage: "Merhaba, bilgi almak istiyorum.", channels: [
    { type: "whatsapp", enabled: true, label: "WhatsApp’tan yazın", value: "+905551234567" },
    { type: "phone", enabled: true, label: "Bizi arayın", value: "+905551234567" },
    { type: "email", enabled: true, label: "E-posta gönderin", value: "destek@example.com" },
    { type: "instagram", enabled: true, label: "Instagram", value: "celebix_fixture" },
    { type: "contact_page", enabled: true, label: "İletişim bilgileri", value: "/pages/contact-tools" },
  ] };
  const product = products[0], options = createDefaultStarterThemeComposition().productDetail;
  const productProps = { product, storefrontId: store.id, locale: "tr", relatedProducts: products.slice(1), publishedPolicies: [], options, cardStyle: presentation.theme.productCardStyle, imageRatio: presentation.theme.productImageRatio, showQuantitySelector: true };
  const suffix = `?theme=${themeKey}&appearance=${appearance}${left ? "&left=1" : ""}`;
  return <>
    <nav aria-label="Yerel iletişim aracı kontrolü" style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 16px", background: "#f1f2ee", font: "12px system-ui", alignItems: "center" }}>
      {Object.entries(themes).map(([key, value]) => <Link key={key} style={{ padding: "8px 12px", minHeight: 44, border: "1px solid #c9cfc9", borderRadius: 8, display: "inline-flex", alignItems: "center", background: key === themeKey ? "white" : "transparent" }} href={`${productPage ? `/products/${product.slug}` : "/pages/contact-tools"}?theme=${key}`}>{value.name}</Link>)}
      <Link style={{ padding: "8px", minHeight: 44, display: "inline-flex", alignItems: "center" }} href={`${productPage ? "/pages/contact-tools" : `/products/${product.slug}`}${suffix}`}>{productPage ? "İçerik sayfası" : "Ürün sayfası"}</Link>
      <Link style={{ padding: "8px", minHeight: 44, display: "inline-flex", alignItems: "center" }} href={`/checkout${suffix}`}>Ödeme kontrolü</Link>
      <Link style={{ padding: "8px", minHeight: 44, display: "inline-flex", alignItems: "center" }} href={`${productPage ? `/products/${product.slug}` : "/pages/contact-tools"}?theme=${themeKey}&appearance=${appearance === "dark" ? "light" : "dark"}`}>Açık / koyu</Link>
    </nav>
    <StorefrontFrame storefront={store} design={selectedDesign} persistentGuzide={themeKey === "guzide"} immersiveProduct={productPage && themeKey === "siora"} checkout={checkout}>
      {productPage ? <><span hidden data-contact-product-title={product.title} data-contact-product-path={`/products/${product.slug}`} />{themeKey === "guzide" ? <GuzideProductDetailExperience {...productProps} /> : themeKey === "siora" ? <SioraProductDetailExperience {...productProps} /> : themeKey === "lilyum" ? <LilyumProductDetailExperience {...productProps} /> : <ProductDetailExperience {...productProps} />}</> : <article className="store-container" style={{ paddingBlock: "52px 100px", minHeight: "65vh" }}>
        <p style={{ fontSize: 12, color: "#72776f", letterSpacing: ".12em" }}>YEREL TEMA KONTROLÜ</p>
        <h1 style={{ marginBlock: "12px 16px", fontSize: "clamp(28px, 4vw, 44px)" }}>{checkout ? "Ödeme ekranı" : "Her an kolayca iletişim kurun"}</h1>
        <p style={{ maxWidth: 560, lineHeight: 1.8 }}>Mağaza iletişim panelini açıp klavyeyle kapatın. Mobil menü ve sepet açıldığında balon gizlenir. Bağlantılar yalnız önizleme içindir.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 24, marginTop: 36 }}>{products.map(item => <ProductCard key={item.id} product={item} locale="tr" cardStyle={presentation.theme.productCardStyle} imageRatio={presentation.theme.productImageRatio} />)}</div>
      </article>}
    </StorefrontFrame>
    <ContactWidget config={config} storefrontName={selected.name} hostname={store.hostname} brandColor={selected.color} />
  </>;
}
