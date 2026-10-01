import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";
import { compile } from "../../customer-panel/components/settings/design/design-editor-test-utils.ts";
import * as routes from "../lib/storefront-routes.ts";
import * as format from "../lib/format.ts";

const banner = compile<Record<string, unknown>>(new URL("../../../packages/storefront-design-ui/src/StorefrontBanner.tsx", import.meta.url));
const sectionContainer = compile<Record<string, unknown>>(new URL("../../../packages/storefront-design-ui/src/HomepageSectionContainer.tsx", import.meta.url));
const { CampaignSectionContent } = compile<{ CampaignSectionContent: (props: Record<string, unknown>) => ReactNode }>(new URL("./CampaignSectionContent.tsx", import.meta.url), { "../lib/storefront-routes.ts": routes, "../lib/format.ts": format, "@celebix/storefront-design-ui": { ...banner, ...sectionContainer } });
// Expand module-global selectors and media whitespace for Happy DOM's CSS parser.
const css = readFileSync(new URL("./campaign-home.module.css", import.meta.url), "utf8").replace(/:global\(([^)]+)\)/g, "$1").replace(/@media\(/g, "@media (");
const designCss = readFileSync(new URL("../../../packages/storefront-design-ui/src/storefront-design.css", import.meta.url), "utf8");
const image = { url: "https://fixture.invalid/category.webp", mediaType: "image/webp", altText: "Category", width: 800, height: 800 } as const;
const sections: readonly PublicStarterHomeSection[] = [
 { kind:"category_grid",heading:"Duo",layout:"duo",items:[{name:"Category",slug:"category",image}] },
 { kind:"category_grid",heading:"Grid",layout:"grid",items:[{name:"Category",slug:"category",image}] },
 { kind:"split_campaign",panels:[{heading:"First",image,destination:"/"},{heading:"Second",image,destination:"/"}] },
 { kind:"brand_story",heading:"Story",body:"Body",image },
 { kind:"value_propositions",items:[{icon:"shield",heading:"Trust",body:"Trust body"},{icon:"truck",heading:"Delivery",body:"Delivery body"}] },
 { kind:"testimonials",heading:"Reviews",items:[{reviewerName:"Reviewer",rating:5,body:"Approved review"}] },
];
function markup(mode?: "desktop" | "mobile") {
 return renderToStaticMarkup(React.createElement(React.Fragment, null, ...sections.map((section, index) => React.createElement(CampaignSectionContent, { key:index, section, presentation:{},productRows:[],locale:"tr",prefetch:false,previewMode:mode,renderProductRow:()=>null }))));
}
async function layout(width: number, mode?: "desktop" | "mobile") {
 const window = new Window();window.happyDOM.setWindowSize({width,height:900});
 window.document.head.innerHTML="<style>"+css+"</style>";window.document.body.innerHTML=markup(mode);
 const style=(selector:string)=>{const element=window.document.querySelector(selector);assert.ok(element);return window.getComputedStyle(element);};
 try { return { duo:style(".categoryGridDuo").gridTemplateColumns, grid:style(".categoryGridGrid").gridTemplateColumns, panels:style(".panels").gridTemplateColumns, panelHeight:style(".panels > a").minHeight, story:style(".story").gridTemplateColumns, values:style(".values ul").gridTemplateColumns, valueHeight:style(".values li").minHeight, reviews:style(".testimonials ul").display, reviewOverflow:style(".testimonials ul").overflowX }; }
 finally { await window.happyDOM.close(); }
}

test("explicit mobile campaign preview matches the live 390px section layouts inside a wide browser", async () => {
 const live=await layout(390);
 assert.deepEqual(live,{duo:"1fr",grid:"repeat(2, minmax(0, 1fr))",panels:"1fr",panelHeight:"440px",story:"1fr",values:"repeat(2, minmax(0, 1fr))",valueHeight:"190px",reviews:"flex",reviewOverflow:"auto"});
 assert.deepEqual(await layout(1440,"mobile"),live);
});

test("desktop preview and live desktop keep their original campaign section layouts", async () => {
 const live=await layout(1440);
 assert.deepEqual(live,{duo:"repeat(2, minmax(0, 1fr))",grid:"repeat(4, minmax(0, 1fr))",panels:"repeat(2, minmax(0, 1fr))",panelHeight:"600px",story:"repeat(2, minmax(0, 1fr))",values:"repeat(4, minmax(0, 1fr))",valueHeight:"220px",reviews:"grid",reviewOverflow:""});
 assert.deepEqual(await layout(1440,"desktop"),live);
 assert.doesNotMatch(markup("desktop"),/data-campaign-preview-mode/);
 assert.doesNotMatch(markup(),/data-campaign-preview-mode/);
});

test("optional section styling preserves the legacy wrapper and matches mobile preview spacing", async () => {
  const section = sections[0]!;
  const render = (styled: boolean, mode?: "desktop" | "mobile") => renderToStaticMarkup(React.createElement(CampaignSectionContent, {
    section: { ...section, ...(styled ? { style: { background: "dark", width: "contained", spacing: "small" } } : {}) },
    presentation: {}, productRows: [], locale: "tr", previewMode: mode, renderProductRow: () => null,
  }));
  assert.doesNotMatch(render(false), /celebix-store-section/);
  const spacing = async (width: number, mode?: "desktop" | "mobile") => {
    const window = new Window(); window.happyDOM.setWindowSize({ width, height: 900 });
    window.document.head.innerHTML = `<style>${designCss}</style>`;
    window.document.body.innerHTML = `<div class="celebix-store-design"${mode ? ` data-preview-mode="${mode}"` : ""}>${render(true, mode)}</div>`;
    const element = window.document.querySelector(".celebix-store-section"); assert.ok(element);
    const selected = window.getComputedStyle(element);
    try { return [selected.getPropertyValue("padding-block"), selected.backgroundColor, selected.color]; }
    finally { await window.happyDOM.close(); }
  };
  assert.deepEqual(await spacing(1440), ["16px", "#171717", "#fff"]);
  assert.deepEqual(await spacing(1024), ["16px", "#171717", "#fff"]);
  assert.deepEqual(await spacing(390), ["8px", "#171717", "#fff"]);
  assert.deepEqual(await spacing(1440, "mobile"), await spacing(390));
});

test("explicit section widths override tenant gutters for full and contained layouts", async () => {
  // Happy DOM drops min(calc(...)) values; preserve the real theme selectors
  // with a supported gutter width to verify their actual cascade precedence.
  for (const theme of ["guzide", "siora"] as const) {
  const themeCss = readFileSync(new URL(`../themes/${theme}/${theme}.css`, import.meta.url), "utf8").replace(/width: min\(calc\(100% - var\(--(?:guzide|siora)-gutter\) \* 2\), (?:1328|1440)px\);/g, "width: 80%;");
  for (const width of [1440, 390]) for (const sectionWidth of ["full", "contained"] as const) {
    const window = new Window(); window.happyDOM.setWindowSize({ width, height: 900 });
    window.document.head.innerHTML = `<style>${css}${designCss}${themeCss}</style>`;
    window.document.body.innerHTML = `<div data-storefront-theme="${theme}-deniz">${renderToStaticMarkup(React.createElement(CampaignSectionContent, {
      section: { ...sections[0]!, style: { background: "theme", width: sectionWidth, spacing: "normal" } },
      presentation: {}, productRows: [], locale: "tr", renderProductRow: () => null,
    }))}</div>`;
    const content = window.document.querySelector(".celebix-store-section-content > *"); assert.ok(content);
    const style = window.getComputedStyle(content);
    try { assert.equal(style.width, "100%", `${theme} ${width}px ${sectionWidth} child uses its selected container width`); assert.equal(style.getPropertyValue("margin-inline"), "0"); }
    finally { await window.happyDOM.close(); }
  }
  }
});
