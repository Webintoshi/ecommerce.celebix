import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { componentLoader } from "./product-variant-media-test-utils.ts";

test("Hızlı homepage gives product hotspots to the shared banner and owns announcements once", () => {
  let rendered: any;
  let banner: any;
  const load = componentLoader({
    "next/link": { __esModule: true, default: (props: any) => React.createElement("a", props) },
    "@celebix/storefront-design-ui": {
      HomepageSectionContainer: ({children}: any) => children,
      StorefrontDesignRenderer: (props: any) => { rendered = props; return props.children; },
    },
    "../../components/StorefrontFrame": { StorefrontFrame: ({children}: any) => children },
    "../../components/CampaignSectionContent": { CampaignSectionContent: (props: any) => { banner = props.section; return React.createElement("div", {"data-real-banner":true}); } },
    "../../components/CampaignProductRow": { CampaignProductRow: () => null },
    "../../components/campaign-home-sections": { composeCampaignHomeSections: (p: any) => p.sections, campaignHomeSectionKey: (_s: unknown, index: number) => String(index) },
  });
  const { HizliHome } = load<{ HizliHome: React.ComponentType<any> }>(new URL("../themes/hizli-kutu/HizliHome.tsx", import.meta.url));
  const slide = { enabled: true, headline: "Gerçek ürün", destination: null, hotspot: { productSlug: "kutu", title: "Kutu", priceCents: 100, currency: "TRY" } };
  const presentation = { schemaVersion:4, displayName:"Hızlı Kutu", announcement:{items:["Duyuru"],destination:"/products"}, sections:[{ kind:"banner",layout:"single",presentation:"overlay",slides:[slide] }] };
  const design = { publicationVersion:2, announcement:{enabled:true,items:["Duyuru"]}, hero:{enabled:false,slides:[]}, promotion:{destination:null} };
  const html = renderToStaticMarkup(React.createElement(HizliHome,{storefront:{locale:"tr",presentation},design}));
  assert.match(html,/data-real-banner/);
  assert.equal(banner.slides[0].hotspot.productSlug,"kutu");
  assert.equal(rendered.presentation.announcement,undefined);
  assert.equal(rendered.design.announcement.enabled,false);
});

test("Hızlı header preserves the localized published announcement destination", () => {
  const load = componentLoader({ "./HizliHeaderClient": { HizliHeaderClient: () => null } });
  const { HizliHeader } = load<{ HizliHeader: (props:any) => React.ReactElement<any> }>(new URL("../themes/hizli-kutu/HizliHeader.tsx",import.meta.url));
  const output = HizliHeader({storefront:{locale:"tr",presentation:{schemaVersion:4,displayName:"Hızlı Kutu",visual:{},sections:[],navigation:{items:[]},announcement:{items:["Duyuru"],destination:"/products"}}},design:{publicationVersion:2,brand:{}}});
  assert.deepEqual(output.props.announcement,{text:"Duyuru",destination:"/urunler"});
  const legacy = HizliHeader({storefront:{locale:"tr",presentation:{schemaVersion:1,displayName:"Hızlı Kutu"}},design:{publicationVersion:1}});
  assert.equal(legacy.props.announcement,undefined);
});
