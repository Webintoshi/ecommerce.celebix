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

const { CampaignSectionContent } = compile<{ CampaignSectionContent: (props: Record<string, unknown>) => ReactNode }>(new URL("./CampaignSectionContent.tsx", import.meta.url), { "../lib/storefront-routes.ts": routes, "../lib/format.ts": format });
// Expand module-global selectors and media whitespace for Happy DOM's CSS parser.
const css = readFileSync(new URL("./campaign-home.module.css", import.meta.url), "utf8").replace(/:global\(([^)]+)\)/g, "$1").replace(/@media\(/g, "@media (");
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
