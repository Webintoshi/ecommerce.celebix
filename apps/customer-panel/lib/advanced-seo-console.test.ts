import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("canonical SEO screens retain server capability gates and legacy routes redirect safely", async () => {
  for (const [path, component] of [["../app/seo/page.tsx", "SeoOverview"], ["../app/seo/content/page.tsx", "SeoContent"], ["../app/seo/settings/page.tsx", "SeoSettings"]]) {
    const source = await readFile(new URL(path!, import.meta.url), "utf8");
    assert.match(source, /requireServerPanelAccess\(\)/);
    assert.match(source, new RegExp(component!));
    assert.match(source, /integrations[.]manage/);
    assert.doesNotMatch(source, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/i);
  }
  for (const route of ["geo-optimization", "internal-linking", "categories", "pages", "products", "social-preview", "code-integrations", "sitemap", "fast-indexing"]) {
    const source = await readFile(new URL(`../app/seo/${route}/page.tsx`, import.meta.url), "utf8");
    assert.match(source, /redirectLegacySeo/);
    assert.doesNotMatch(source, /MerchantModuleConsole/);
  }
});

test("the AI preference page delegates provider connections without embedding secrets", async () => {
  const page = await readFile(
    new URL("../app/settings/artificial-intelligence/page.tsx", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("toshi-provider-ui/client.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /ArtificialIntelligenceSettings/);
  assert.match(page, /configuration[.]manage/);
  assert.doesNotMatch(page, /MerchantModuleConsole|ai_setting/);
  assert.match(client, /\/api\/settings\/artificial-intelligence\/providers/);
  assert.doesNotMatch(page, /API anahtarı|apiKey|secret|fetch\s*\(/i);
  assert.doesNotMatch(`${page}\n${client}`, /içerik (?:üretildi|oluşturuldu)|senkronizasyon tamamlandı/i);
});
