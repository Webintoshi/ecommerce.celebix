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

test("all storefront pages render through the shared published design surface", async () => {
  const frame = await source("../components/StorefrontFrame.tsx");
  const home = await source("../app/page.tsx");
  const products = await source("../app/products/page.tsx");
  const product = await source("../app/products/[slug]/page.tsx");
  const globals = await source("../app/globals.css");

  assert.match(frame, /StorefrontDesignRenderer/);
  assert.match(frame, /design:\s*PublicStorefrontDesign/);
  assert.doesNotMatch(frame, /<Header/);
  assert.match(home, /design=\{design\}/);
  assert.match(home, /design\.brand\.favicon/);
  assert.doesNotMatch(home, /home-hero|YENİ NESİL MAĞAZA|MAĞAZA DENEYİMİ/);
  assert.match(products, /showHomeSurfaces=\{false\}/);
  assert.match(product, /showHomeSurfaces=\{false\}/);
  assert.match(globals, /@celebix\/storefront-design-ui\/styles\.css/);
});
