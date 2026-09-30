import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React, { type ReactNode } from "react";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";
import { compile } from "../../customer-panel/components/settings/design/design-editor-test-utils.ts";
import * as routes from "../lib/storefront-routes.ts";

const require = createRequire(import.meta.url);
const flight = require("next/dist/compiled/react-server-dom-webpack/server.node") as {
  registerClientReference: (component: (props: Record<string, unknown>) => ReactNode, module: string, name: string) => React.ComponentType<Record<string, unknown>>;
  renderToReadableStream: (element: ReactNode, manifest: Record<string, unknown>, options: { onError: (error: unknown) => void }) => Promise<ReadableStream<Uint8Array>>;
};
const clientModule = "fixture/StorefrontBanner";
const clientBanner = flight.registerClientReference(() => { throw new Error("client_banner_must_not_execute_on_server"); }, clientModule, "StorefrontBanner");
const container = compile<Record<string, unknown>>(new URL("../../../packages/storefront-design-ui/src/HomepageSectionContainer.tsx", import.meta.url));
const { CampaignSectionContent } = compile<{ CampaignSectionContent: (props: Record<string, unknown>) => ReactNode }>(new URL("./CampaignSectionContent.tsx", import.meta.url), {
  "@celebix/storefront-design-ui": { ...container, StorefrontBanner: clientBanner },
  "../lib/storefront-routes.ts": routes,
  "./CampaignHero": {}, "./CampaignPanels": {}, "./CampaignTestimonials": {}, "./CampaignValuePropositions": {},
});

const media = { url: "https://media.celebix.site/banner.webp", altText: "Banner", mediaType: "image/webp", width: 1600, height: 900 } as const;
function banner(layout: "single" | "slider" | "stacked", presentation: "image_only" | "overlay"): Extract<PublicStarterHomeSection, { kind: "banner" }> {
  return { kind: "banner", sectionId: "home_banner_rsc", layout, presentation, autoplay: true, style: { background: "dark", width: "contained", spacing: "small" }, slides: [
    { slideId: "slide_one", enabled: true, headline: "Bir", body: "Metin", desktopImage: media, mobileImage: null, destination: "/products/kolye?view=all#details", hotspot: { productSlug: "kupe", title: "Küpe", priceCents: 10000, currency: "TRY" } },
    { slideId: "slide_two", enabled: true, headline: "İki", body: "", desktopImage: media, mobileImage: null, destination: "/categories/takilar" },
  ] };
}

test("all banner layouts cross the real RSC client boundary with serializable localized link data", async () => {
  for (const layout of ["single", "slider", "stacked"] as const) for (const presentation of ["image_only", "overlay"] as const) for (const previewMode of [undefined, "mobile"] as const) {
    const errors: unknown[] = [];
    const stream = await flight.renderToReadableStream(React.createElement(CampaignSectionContent, {
      section: banner(layout, presentation), presentation: {}, productRows: [], locale: "tr", previewMode, priority: true, renderProductRow: () => null,
    }), { [`${clientModule}#StorefrontBanner`]: { id: clientModule, name: "StorefrontBanner", chunks: [] } }, { onError: error => { errors.push(error); } });
    const payload = await new Response(stream).text();
    assert.deepEqual(errors, [], `${layout}/${presentation}/${previewMode ?? "live"} serializes successfully`);
    assert.match(payload, /destinationHrefs/);
    assert.match(payload, /\/urun\/kolye\?view=all#details/);
    assert.match(payload, /\/urun\/kupe/);
    assert.match(payload, /\/kategori\/takilar/);
    assert.doesNotMatch(payload, /Functions cannot be passed directly/);
  }
});
