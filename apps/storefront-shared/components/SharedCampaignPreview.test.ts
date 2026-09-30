import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "../../customer-panel/components/settings/design/design-editor-test-utils.ts";

test("shared campaign row keeps manual order and Güzide rails with inert preview cards", () => {
  const { CampaignProductRowFrame } = compile<{ CampaignProductRowFrame: (props: Record<string, unknown>) => ReactNode }>(new URL("./CampaignProductRowFrame.tsx", import.meta.url));
  const products = ["second", "first"].map(id => ({ id, slug: id, title: id, currency: "TRY", priceCents: 100, available: true, media: [] }));
  let selected: readonly { id: string }[] = [];
  const markup = renderToStaticMarkup(React.createElement(CampaignProductRowFrame, {
    section: { kind: "product_row", key: "manual_row", source: "manual", heading: "Seçilenler", limit: 4 }, products, locale: "tr", visualTheme: "guzide-deniz", prefetch: false,
    renderProductGrid: (items: readonly { id: string }[]) => { selected = items; return React.createElement("div", { className: "product-grid", "data-inert-cards": true }, ...items.map(item => React.createElement("article", { key: item.id }, item.id))); },
  }));
  assert.equal(selected, products);
  assert.match(markup, /SEÇKİ/);
  assert.match(markup, /id="guzide-product-row-manual_row"/);
  assert.match(markup, /Seçilenler, önceki ürünler/);
  assert.match(markup, /<article>second<\/article><article>first<\/article>/);
  assert.match(markup, /data-inert-cards/);
  assert.doesNotMatch(markup, /Sepete ekle/);
});

test("shared Güzide footer renders V4 links and the supplied inert newsletter", () => {
  const { GuzideFooter } = compile<{ GuzideFooter: (props: Record<string, unknown>) => ReactNode }>(new URL("../themes/guzide/GuzideFooter.tsx", import.meta.url));
  const newsletter = { enabled: true, heading: "Haberler", body: "Yenilikler", consentLabel: "Kabul ediyorum" };
  let selected: unknown;
  const markup = renderToStaticMarkup(React.createElement(GuzideFooter, {
    groups: [{ heading: "Mağaza", links: [{ label: "Ürünler", destination: "/products" }] }],
    presentation: { schemaVersion: 4, displayName: "Güzide", logo: null, footer: { newsletter, social: [] } },
    storefront: { canonicalUrl: "https://guzide.example", hostname: "guzide.example", locale: "tr", currency: "TRY" },
    renderNewsletter: (value: unknown) => { selected = value; return React.createElement("div", { "data-inert-newsletter": true }, React.createElement("input", { disabled: true }), React.createElement("button", { disabled: true }, "Kaydol")); },
  }));
  assert.equal(selected, newsletter);
  assert.match(markup, /guzide-footer__mobile-groups/);
  assert.match(markup, /href="\/urunler"/);
  assert.match(markup, /Haberler/);
  assert.match(markup, /data-inert-newsletter/);
  assert.doesNotMatch(markup, /<form/);
});

test("Güzide preview disables prefetch for every shared footer navigation link", () => {
  const values: Array<boolean | undefined> = [];
  const { GuzideFooter } = compile<{ GuzideFooter: (props: Record<string, unknown>) => ReactNode }>(new URL("../themes/guzide/GuzideFooter.tsx", import.meta.url), {
    "next/link": { __esModule: true, default: ({ prefetch, children, ...props }: { prefetch?: boolean; children: ReactNode }) => { values.push(prefetch); return React.createElement("a", props, children); } },
  });
  renderToStaticMarkup(React.createElement(GuzideFooter, {
    groups: [{ heading: "Mağaza", links: [{ label: "Ürünler", destination: "/products" }] }], prefetch: false,
    presentation: { schemaVersion: 4, displayName: "Güzide", logo: null, footer: { newsletter: { enabled: false }, social: [] } },
    storefront: { canonicalUrl: "https://guzide.example", hostname: "guzide.example", locale: "tr", currency: "TRY" },
  }));
  assert.deepEqual(values, [false, false, false]);
});


test("the shared product row renders no section or heading for an empty projection", () => {
  const { CampaignProductRowFrame } = compile<{ CampaignProductRowFrame: (props: Record<string, unknown>) => ReactNode }>(new URL("./CampaignProductRowFrame.tsx", import.meta.url));
  const markup = renderToStaticMarkup(React.createElement(CampaignProductRowFrame, {
    section: { kind: "product_row", key: "empty_row", source: "manual", heading: "Selected products", limit: 4 }, products: [], locale: "tr",
    renderProductGrid: () => React.createElement("div", null, "Empty grid"),
  }));
  assert.equal(markup, "");
});
