import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name: string) => readFile(new URL(name, import.meta.url), "utf8");

test("desktop navigation uses only public category slugs", async () => { const source = await read("CampaignHeader.tsx"); assert.match(source, /`\/categories\/\$\{item[.]slug\}`/); assert.doesNotMatch(source, /item[.]id|storeId|tenantId/); });
test("mobile menu restores focus and closes on Escape", async () => { const source = await read("CampaignHeaderClient.tsx"); assert.match(source, /event[.]key === "Escape"/); assert.match(source, /triggerRef[.]current[?][.]focus/); });
test("active path comparison rejects near-match products routes", async () => { const source = await read("CampaignHeaderClient.tsx"); assert.match(source, /pathname === href \|\| pathname[.]startsWith\(`\$\{href\}\/`\)/); assert.match(source, /isActivePath\(pathname, "\/products"\)/); });
test("mobile navigation has nested disclosure focus trap and backdrop closure", async () => { const source = await read("CampaignHeaderClient.tsx"); for (const token of ["<details", "focusable", "event.key === \"Tab\"", "event.target === event.currentTarget", "aria-modal=\"true\""]) assert.match(source, new RegExp(token)); });
test("campaign header keeps canonical search favorite account and cart utilities", async () => { const source = await read("CampaignHeaderClient.tsx"); assert.match(source, /StoreUtilities/); assert.doesNotMatch(source, /localStorage|sessionStorage|document[.]cookie|x-forwarded|storeId|tenantId/); });
test("campaign navigation has 48px controls reduced motion and bounded desktop mega menu", async () => { const source = await read("campaign-header.module.css"); assert.match(source, /min-(?:width|height):48px/); assert.match(source, /prefers-reduced-motion/); assert.match(source, /max-width:1440px/); assert.match(source, /[.]mega/); });
test("retail header supports the schema v3 centered wide and contained layouts", async () => { const [source, css] = await Promise.all([read("CampaignHeader.tsx"), read("campaign-header.module.css")]); assert.match(source, /schemaVersion !== 2 && presentation[.]schemaVersion !== 3/); assert.match(source, /data-header-width/); assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/); assert.match(css, /data-header-width="contained"/); });
