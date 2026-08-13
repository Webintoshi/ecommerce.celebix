import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name: string) => readFile(new URL(name, import.meta.url), "utf8");

test("desktop navigation uses only locale-aware public category slugs", async () => { const source = await read("CampaignHeader.tsx"); assert.match(source, /categoryPath\(storefront[.]locale, item[.]slug\)/); assert.doesNotMatch(source, /item[.]id|storeId|tenantId/); });
test("mobile menu restores focus and closes on Escape", async () => { const source = await read("CampaignHeaderClient.tsx"); assert.match(source, /event[.]key === "Escape"/); assert.match(source, /triggerRef[.]current[?][.]focus/); });
test("active path comparison rejects near-match locale product routes", async () => { const source = await read("CampaignHeaderClient.tsx"); assert.match(source, /pathname === href \|\| pathname[.]startsWith\(`\$\{href\}\/`\)/); assert.match(source, /isActivePath\(pathname, productIndexPath\(locale\)\)/); });
test("mobile navigation has nested disclosure focus trap and backdrop closure", async () => { const source = await read("CampaignHeaderClient.tsx"); for (const token of ["<details", "focusable", "event.key === \"Tab\"", "event.target === event.currentTarget", "aria-modal=\"true\""]) assert.match(source, new RegExp(token)); });
test("campaign header keeps canonical search favorite account and cart utilities", async () => { const source = await read("CampaignHeaderClient.tsx"); assert.match(source, /StoreUtilities/); assert.doesNotMatch(source, /localStorage|sessionStorage|document[.]cookie|x-forwarded|storeId|tenantId/); });
test("campaign navigation has 48px controls reduced motion and bounded desktop mega menu", async () => { const source = await read("campaign-header.module.css"); assert.match(source, /min-(?:width|height):48px/); assert.match(source, /prefers-reduced-motion/); assert.match(source, /max-width:1440px/); assert.match(source, /[.]mega/); });
test("desktop mega menu fills empty space and keeps featured navigation balanced", async () => {
  const [source, css] = await Promise.all([
    read("CampaignHeader.tsx"),
    read("campaign-header.module.css"),
  ]);
  assert.match(source, /data-featured=\{item[.]featured \? "true" : "false"\}/);
  assert.match(source, /className=\{styles[.]megaLinks\}/);
  assert.match(css, /[.]mega\[data-featured="false"\]\{[^}]*grid-template-columns:1fr/);
  assert.match(css, /[.]mega\[data-featured="false"\] [.]megaLinks\{[^}]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /[.]megaLinks\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /[.]mega\{[^}]*max-height:min\(70vh,620px\);[^}]*overflow:auto/);
  assert.match(css, /[.]megaLinks>a\{[^}]*min-height:48px/);
});
test("retail header supports the schema v3 centered wide and contained layouts", async () => { const [source, css] = await Promise.all([read("CampaignHeader.tsx"), read("campaign-header.module.css")]); assert.match(source, /schemaVersion !== 2 && presentation[.]schemaVersion !== 3/); assert.match(source, /data-header-width/); assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/); assert.match(css, /data-header-width="contained"/); });
test("merchant header selection reaches three exact desktop layouts without changing mobile navigation", async () => {
  const [source, css] = await Promise.all([read("CampaignHeader.tsx"), read("campaign-header.module.css")]);
  assert.match(source, /data-header-layout=/);
  assert.match(source, /presentation[.]visual[.]headerLayout/);
  assert.match(source, /menu_logo_actions/);
  for (const layout of ["menu_logo_actions", "logo_menu_actions", "stacked"]) assert.match(css, new RegExp(`data-header-layout=["']${layout}["']`));
  assert.match(css, /grid-template-areas/);
  assert.match(css, /@media\(max-width:1024px\)/);
  assert.doesNotMatch(source, /searchParams|cookies\(|headers\(|localStorage|sessionStorage/);
});
test("campaign logo uses the approved larger responsive scale without stretching", async () => {
  const css = await read("campaign-header.module.css");
  assert.match(css, /[.]wordmark img\{[^}]*width:auto;[^}]*max-width:240px;[^}]*height:56px;[^}]*object-fit:contain/);
  assert.match(css, /@media\(max-width:1024px\)\{[\s\S]*[.]wordmark img\{height:42px\}/);
});
