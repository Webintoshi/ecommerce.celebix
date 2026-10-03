import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { buildDefaultStarterPresentation, FIXED_STOREFRONT_POLICIES, type PublicStorefront } from "@celebix/saas-contracts";
import { mergePublishedPolicyFooterGroups } from "../lib/footer-policies.ts";
import { localizeStorefrontPath } from "../lib/storefront-routes.ts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const tenantCases = [
  { name: "Siora", id: "ff465e64-1491-40ef-8840-c66281155a1d", footerClass: "siora-footer" },
  { name: "Alpler", id: "9f1f6aed-8719-407e-b64c-fd8e956d3277", footerClass: "alpler-footer" },
  { name: "Guzide", id: "a828862c-4cc1-475a-89cc-5fbee31eb43f", footerClass: "guzide-footer" },
  { name: "Generic", id: "00000000-0000-4000-8000-000000000001", footerClass: "retail-footer" },
] as const;

function storefront(id: string, name: string, legacy = false): PublicStorefront {
  const defaults = buildDefaultStarterPresentation({ name });
  return {
    schemaVersion: 2, id, name, slug: "fixture-store", hostname: "fixture.invalid", primaryHostname: "fixture.invalid",
    canonicalUrl: "https://fixture.invalid/", currency: "TRY", locale: "tr", themeKey: "starter",
    presentation: legacy ? {
      schemaVersion: 1, displayName: name, theme: defaults.theme, hero: defaults.hero, seo: defaults.seo,
    } : {
      ...defaults,
      footer: { ...defaults.footer, groups: [{ heading: "Admin menüsü", links: [{ label: "Koleksiyon", destination: "/products" }] }] },
    },
  };
}

async function renderFooter(store: PublicStorefront, checkout: boolean, run: (container: HTMLElement) => Promise<void>) {
  const load = componentLoader({
    "@/lib/page-context.ts": { resolveStorefrontPage: async () => ({ kind: "active", context: { storefront: store, runtime: { content: { listPolicies: async () => FIXED_STOREFRONT_POLICIES.map(definition => ({ ...definition, published: definition.key === "kvkk" })) } } } }) },
    "@/lib/footer-policies.ts": { mergePublishedPolicyFooterGroups },
    "@/lib/storefront-routes.ts": { localizeStorefrontPath },
    "next/link": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => React.createElement("a", props, children) },
  });
  const { Footer } = load<{ Footer: (props: { storefront: PublicStorefront; checkout: boolean; logo: { url: string; altText: string } }) => Promise<React.ReactNode> }>(new URL("./Footer.tsx", import.meta.url));
  const element = await Footer({ storefront: store, checkout, logo: { url: "https://media.example/tenant-logo.png", altText: "Mağaza logosu" } });
  await withProductBrowser(async ({ container, render }) => { await render(element); await run(container); });
}

function assertSignature(container: HTMLElement) {
  const footer = container.querySelector("footer");
  assert.ok(footer);
  assert.equal(container.querySelectorAll("footer").length, 1, "the signature does not introduce a nested footer");
  const links = footer.querySelectorAll<HTMLAnchorElement>('a[href="https://celebix.net/tr/e-ticaret-paketleri"]');
  assert.equal(links.length, 1, "the actual footer contains exactly one Celebix signature");
  const link = links[0];
  assert.match(link.getAttribute("aria-label") ?? "", /Celebix/);
  assert.equal(link.getAttribute("target"), null, "the destination uses a normal same-tab anchor");
  const logo = link.querySelector<HTMLImageElement>("img");
  assert.equal(logo?.getAttribute("src"), "/brand/celebix-dark.svg");
  assert.equal(logo?.getAttribute("alt"), "Celebix");
  assert.ok(Number(logo?.getAttribute("width")) > 0 && Number(logo?.getAttribute("height")) > 0, "the logo reserves its aspect ratio");
  assert.equal(footer.textContent?.includes("Celebix altyapısıyla sunulur"), false, "the old text signature is replaced");
  assert.ok(footer.querySelector('a[href="/policies/kvkk"]'), "published policies remain in the actual footer");
}

for (const tenant of tenantCases) {
  for (const checkout of [false, true]) {
    test(`${tenant.name} ${checkout ? "checkout" : "storefront"} footer contains one real Celebix logo/link and preserves tenant content`, async () => {
      const store = storefront(tenant.id, tenant.name);
      await renderFooter(store, checkout, async (container) => {
        assertSignature(container);
        assert.ok(container.querySelector(`footer.${checkout ? "shared-checkout-footer" : tenant.footerClass}`), "the current tenant footer dispatch is preserved");
        assert.match(container.querySelector("footer")?.textContent ?? "", new RegExp(`© .*${tenant.name}`));
        if (!checkout) {
          assert.ok(container.querySelector('a[href="/urunler"]'), "the admin menu link keeps its Turkish storefront route");
          if (tenant.name !== "Generic") assert.ok(container.querySelector('img[alt="Mağaza logosu"]'), "the tenant logo is preserved");
        }
      });
    });
  }
}

test("legacy footer replaces its old text signature without changing navigation or copyright", async () => {
  await renderFooter(storefront(tenantCases[3].id, "Legacy", true), false, async (container) => {
    assertSignature(container);
    assert.match(container.querySelector("footer")?.textContent ?? "", /© .*Legacy/);
    assert.ok(container.querySelector('a[href="/favorites"]'));
  });
});

test("the shipped signature is the exact supplied SVG asset", () => {
  const asset = readFileSync(new URL("../public/brand/celebix-dark.svg", import.meta.url));
  assert.equal(createHash("sha256").update(asset).digest("hex"), "216cd8cd8d0a4c4598af888618813cb595ac09604d084cc0290b5e35022500d0");
});
