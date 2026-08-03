import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const read = (name: string) => readFile(new URL(name, import.meta.url), "utf8");

async function compileProductDetailExperience() {
  const output = ts.transpileModule(await read("ProductDetailExperience.tsx"), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const empty = () => null;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "next/link") return { __esModule: true, default: ({ children, ...props }: Readonly<Record<string, unknown> & { children?: ReactNode }>) => createElement("a", props, children) };
    if (specifier === "@/lib/format.ts") return { formatTry: (value: number) => String(value) };
    if (specifier === "./ProductCard") return { ProductCard: empty };
    if (specifier === "./ProductApprovedReviews") return { ProductApprovedReviews: empty };
    if (specifier === "./ProductGallery") return { ProductGallery: empty };
    if (specifier === "./ProductInformationDisclosures") return { ProductInformationDisclosures: empty, ProductSizeGuide: empty };
    if (specifier === "./ProductPurchasePanel") return { ProductPurchasePanel: empty };
    if (specifier === "./product-detail-experience.module.css") return styles;
    if (specifier === "@celebix/saas-contracts") return {};
    throw new Error(`unexpected_product_detail_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.ProductDetailExperience as (props: Readonly<Record<string, unknown>>) => ReactNode;
}

function visit(node: ReactNode, visitor: (element: React.ReactElement<Record<string, unknown>>) => void) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visit(child.props.children as ReactNode, visitor);
  });
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement<Record<string, unknown>>(node)) return React.Children.toArray(node).map(textOf).join("");
  return textOf(node.props.children as ReactNode);
}

const product = Object.freeze({
  id: "product-1", slug: "altin-yuzuk", title: "Altın Yüzük", description: "", priceCents: 10_000, available: true, images: Object.freeze([]), categoryPath: Object.freeze([]),
  variants: Object.freeze([{ id: "variant-1", sku: "YZK-1", available: true }]),
  brand: Object.freeze({ name: "Güzide Kuyumcu", slug: "guzide-kuyumcu", logo: Object.freeze({ url: "https://media.example.test/brand.webp", altText: "Güzide Kuyumcu", width: 480, height: 160 }) }),
});
const options = Object.freeze({ showBreadcrumbs: false, showBrand: true, showSku: true, showSizeGuide: false, showApprovedReviews: false, showRelatedProducts: false, mobileStickyPurchase: true, galleryStyle: "grid", informationSections: Object.freeze([]) });

test("product detail renders a bounded logo-only brand link and hides every text fallback", async () => {
  const ProductDetailExperience = await compileProductDetailExperience();
  const rendered = ProductDetailExperience({ product, relatedProducts: [], publishedPolicies: [], options, cardStyle: "minimal", imageRatio: "portrait" });
  let brandLink: React.ReactElement<Record<string, unknown>> | undefined;
  visit(rendered, (element) => { if (element.props.className === "brand") brandLink = element; });
  assert.ok(brandLink);
  assert.equal(brandLink.props.href, "/search?q=G%C3%BCzide%20Kuyumcu");
  assert.equal(brandLink.props["aria-label"], "Güzide Kuyumcu ürünlerini ara");
  const image = React.Children.only(brandLink.props.children as ReactNode) as React.ReactElement<Record<string, unknown>>;
  assert.equal(image.type, "img");
  assert.equal(image.props.src, product.brand.logo.url);
  assert.equal(image.props.alt, product.brand.name);
  assert.equal(image.props.width, 480);
  assert.equal(image.props.height, 160);
  assert.equal(textOf(brandLink), "");

  const withoutLogo = ProductDetailExperience({ product: Object.freeze({ ...product, brand: Object.freeze({ name: product.brand.name, slug: product.brand.slug }) }), relatedProducts: [], publishedPolicies: [], options, cardStyle: "minimal", imageRatio: "portrait" });
  const hidden = ProductDetailExperience({ product, relatedProducts: [], publishedPolicies: [], options: Object.freeze({ ...options, showBrand: false }), cardStyle: "minimal", imageRatio: "portrait" });
  for (const tree of [withoutLogo, hidden]) {
    let found = false;
    visit(tree, (element) => { if (element.props.className === "brand") found = true; });
    assert.equal(found, false);
  }
});

test("related products derive store and category from persisted authority", async () => {
  const repository = await read("../../../packages/saas-data/src/storefront/repository.ts");
  assert.match(repository, /listRelatedPublicProducts/);
  assert.match(repository, /saas[.]public_storefront_related_products/);
  assert.doesNotMatch(repository, /input[.]storeId|input[.]categoryId/);
});

test("buy now reuses canonical cart before checkout", async () => {
  const source = await read("ProductPurchasePanel.tsx");
  assert.match(source, /replaceCart/);
  assert.match(source, /router[.]push\("\/checkout"\)/);
  assert.doesNotMatch(source, /window[.]location|computedTotal/);
});

test("detail experience composes canonical brand category merchandising policy and recommendation surfaces", async () => {
  const source = await read("ProductDetailExperience.tsx");
  for (const token of ["product.categoryPath", "product.brand", "product.merchandising", "product.reviews", "ProductGallery", "ProductPurchasePanel", "ProductInformationDisclosures", "ProductApprovedReviews", "relatedProducts"]) assert.match(source, new RegExp(token.replace(".", "\\.")));
  assert.doesNotMatch(source, /Organic cotton|premium linen|ready to ship|Rachel F[.]|Leslie M[.]/u);
  assert.doesNotMatch(source, /storeId|tenantId|localStorage|sessionStorage/);
});

test("product detail resolves schema-v3 controls and published policy authority", async () => {
  const page = await read("../app/products/[slug]/page.tsx");
  assert.match(page, /presentation[.]schemaVersion === 3/u);
  assert.match(page, /LEGACY_PRODUCT_DETAIL/u);
  assert.match(page, /runtime[.]content[.]getPolicy/u);
  assert.match(page, /buildPublicPolicyPage/u);
  assert.match(page, /payment_delivery/u);
  assert.match(page, /returns_exchanges/u);
  assert.doesNotMatch(page, /policy.*body\s*:/iu);
});

test("detail gallery and mobile purchase stay keyboard and viewport safe", async () => {
  const gallery = await read("ProductGallery.tsx");
  const galleryModel = await read("product-gallery-model.ts");
  const styles = await read("product-detail-experience.module.css");
  const globalStyles = await read("../app/globals.css");
  const mobileGlobalStyles = globalStyles.slice(globalStyles.indexOf("@media (max-width: 1024px)"), globalStyles.indexOf("@media (max-width: 640px)"));
  assert.match(gallery, /aria-current/);
  assert.match(gallery, /aria-modal="true"/);
  assert.match(gallery, /galleryEscapeRequested\(event[.]key\)/);
  assert.match(gallery, /scheduleGalleryFocus\(zoomTriggerRef[.]current/);
  assert.match(gallery, /productGalleryReducer/);
  assert.match(galleryModel, /key === "Escape"/);
  assert.match(galleryModel, /target\?\.focus\(\)/);
  assert.match(gallery, /style\?: "grid" \| "rail"/);
  assert.match(gallery, /gallery-\$\{style\}/);
  assert.match(gallery, /gallery-mobile-track/);
  assert.match(globalStyles, /scroll-snap-type:\s*x mandatory/);
  assert.match(globalStyles, /[.]gallery-mobile-track img\s*\{[^}]*height:\s*auto/u);
  assert.match(globalStyles, /[.]gallery-main img\s*\{[^}]*object-fit:\s*contain/u);
  assert.match(globalStyles, /[.]gallery-rail [.]gallery-mobile-track img\s*\{[^}]*object-fit:\s*contain/u);
  assert.match(mobileGlobalStyles, /[.]gallery-mobile-track img\s*\{[^}]*object-fit:\s*contain/u);
  assert.match(globalStyles, /[.]gallery-thumbnails img\s*\{[^}]*object-fit:\s*cover/u);
  assert.match(globalStyles, /[.]product-image-shell img\s*\{[^}]*object-fit:\s*cover/u);
  assert.match(globalStyles, /[.]gallery-rail [.]gallery-mobile-track/u);
  assert.match(globalStyles, /[.]gallery-rail [.]gallery-mobile-track\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2/u);
  assert.match(globalStyles, /[.]gallery-thumbnails\s*\{[^}]*flex-direction:\s*column/u);
  assert.match(globalStyles, /[.]gallery-zoom-backdrop/u);
  assert.match(styles, /position:\s*sticky/);
  assert.match(styles, /@media\s*\(max-width:\s*1024px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("product summary follows the compact jewelry detail hierarchy", async () => {
  const [experience, purchase, disclosures, styles, globalStyles] = await Promise.all([
    read("ProductDetailExperience.tsx"),
    read("ProductPurchasePanel.tsx"),
    read("ProductInformationDisclosures.tsx"),
    read("product-detail-experience.module.css"),
    read("../app/globals.css"),
  ]);

  assert.doesNotMatch(experience, />ÜRÜN DETAYI</u);
  assert.match(experience, /Ürün Kodu:/u);
  assert.match(experience, /className=\{styles[.]summaryHeader\}/u);
  assert.doesNotMatch(experience, /Siparişe hazır seçenekler mevcut[.]/u);
  assert.doesNotMatch(experience, /styles[.]stock/u);
  assert.match(experience, /available=\{product[.]available\}/u);
  assert.ok(experience.lastIndexOf("<ProductInformationDisclosures") > experience.lastIndexOf("<ProductPurchasePanel"));
  assert.match(disclosures, /aria-labelledby="product-information-title"/u);
  assert.match(disclosures, /className="sr-only" id="product-information-title">Ürün bilgileri/u);
  assert.match(disclosures, /index === 0 \? "Ürün Bilgisi"/u);
  assert.match(purchase, /showVariantChoices/u);
  assert.match(purchase, /product[.]variants[.]length > 1/u);
  assert.match(styles, /[.]experience\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1[.]12fr\)\s*minmax\(24rem,\s*[.]88fr\)[^}]*gap:\s*clamp\(2rem,\s*4vw,\s*4[.]5rem\)/u);
  assert.match(styles, /[.]summaryHeader\s*\{[^}]*display:\s*grid[^}]*grid-template-areas:\s*"brand"\s*"title"\s*"sku"/u);
  assert.match(styles, /[.]brand\s*\{[^}]*grid-area:\s*brand[^}]*width:\s*min\(9rem,\s*100%\)[^}]*height:\s*3rem[^}]*justify-self:\s*end/u);
  assert.match(styles, /[.]brand img\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*object-fit:\s*contain[^}]*object-position:\s*right center/u);
  assert.doesNotMatch(experience, />\{product[.]brand[.]name\}<\/Link>/u);
  assert.match(styles, /[.]sku\s*\{[^}]*grid-area:\s*sku[^}]*font-size:\s*[.]76rem/u);
  assert.match(styles, /[.]purchaseColumn h1\s*\{[^}]*grid-area:\s*title[^}]*max-width:\s*none[^}]*white-space:\s*nowrap[^}]*font-size:\s*clamp\(1[.]15rem,\s*1[.]4vw,\s*1[.]35rem\)/u);
  assert.doesNotMatch(styles, /minmax\(34rem,\s*1[.]28fr\)/u);
  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 1024px)"), styles.indexOf("@media (max-width: 700px)"));
  assert.match(mobileStyles, /[.]purchaseColumn h1\s*\{[^}]*white-space:\s*normal/u);
  assert.match(mobileStyles, /[.]brand\s*\{[^}]*width:\s*min\(7[.]5rem,\s*100%\)/u);
  assert.match(styles, /[.]purchaseColumn h1\s*\{[^}]*font-family:\s*Arial, Helvetica, sans-serif !important/u);
  assert.match(styles, /[.]disclosures\s*\{[^}]*display:\s*grid[^}]*border-top/u);
  assert.match(globalStyles, /[.]purchase-actions\s*\{[^}]*grid-template-columns:\s*140px\s+repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  const mobilePurchaseStyles = globalStyles.slice(globalStyles.indexOf("@media (max-width: 640px)"));
  assert.match(mobilePurchaseStyles, /[.]purchase-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(mobilePurchaseStyles, /[.]purchase-quantity\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*justify-self:\s*start/u);
});
