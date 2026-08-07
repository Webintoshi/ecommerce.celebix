import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("page context resolves only the tenant published design projection", async () => {
  const context = await source("./page-context.ts");

  assert.match(context, /PublicStorefrontDesign/);
  assert.match(context, /getPublicStorefrontDesign\(\{\s*storefront:\s*selected\.storefront,\s*now\s*\}\)/);
  assert.doesNotMatch(context, /draft/i);
});

test("storefront runtime requires the reviewed public design authority", async () => {
  const runtime = await source("./default-runtime.ts");

  assert.match(runtime, /migration_081/);
  assert.match(runtime, /storefront_design_get_public\(uuid,text,timestamp with time zone\)/);
  assert.match(runtime, /row\.migration_081 !== true/);
});

test("published design augments the complete storefront without removing commerce chrome", async () => {
  const frame = await source("../components/StorefrontFrame.tsx");
  const home = await source("../app/page.tsx");
  const products = await source("../app/products/page.tsx");
  const product = await source("../app/products/[slug]/page.tsx");
  const globals = await source("../app/globals.css");

  assert.match(frame, /design:\s*PublicStorefrontDesign/);
  assert.match(frame, /<Header[^>]+design=\{design\}/);
  assert.match(frame, /<Footer/);
  assert.match(frame, /publicationVersion > 1/);
  assert.match(frame, /createStorefrontTypographyResources\(design[.]typography\)/);
  assert.match(frame, /rel="stylesheet" href=\{typography[.]stylesheetUrl\}/);
  assert.match(frame, /https:\/\/fonts[.]googleapis[.]com/);
  assert.match(frame, /https:\/\/fonts[.]gstatic[.]com/);
  assert.match(home, /StorefrontDesignRenderer/);
  assert.match(home, /showHeader=\{false\}/);
  assert.match(home, /publicationVersion > 1/);
  assert.match(home, /design\.brand\.favicon/);
  assert.match(home, /<CampaignHome/);
  assert.match(home, /if \(context[.]campaign\)/);
  assert.doesNotMatch(home, /context[.]campaign && design[.]publicationVersion === 1/);
  assert.match(await source("../components/CampaignHome.tsx"), /designHeroActive/);
  assert.match(await source("../components/CampaignHome.tsx"), /section[.]kind !== "hero"/);
  assert.match(await source("../components/CampaignHome.tsx"), /<StorefrontDesignRenderer/);
  assert.match(products, /design=\{design\}/);
  assert.match(product, /design=\{selected\.design\}/);
  assert.match(globals, /@celebix\/storefront-design-ui\/styles\.css/);
  assert.match(globals, /data-published-design="true"[^}]+--ink:\s*var\(--store-text\)/s);
  assert.match(globals, /data-published-design="true"[^}]+--accent:\s*var\(--store-accent\)/s);
  assert.match(globals, /data-published-design="true"[^}]+--paper:\s*var\(--store-background\)/s);
  assert.match(globals, /font-family:\s*var\(--store-body-font/);
  assert.match(globals, /font-size:\s*var\(--store-body-size/);
  assert.match(globals, /font-family:\s*var\(--store-heading-font/);
  assert.match(globals, /font-size:\s*var\(--store-heading-size/);
});
