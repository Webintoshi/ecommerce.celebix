import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ADVANCED_SEO_ROUTES = [
  ["../app/seo/geo-optimization/page.tsx", "seo_geo_profile", "integrations.manage"],
  ["../app/seo/internal-linking/page.tsx", "seo_internal_link", "integrations.manage"],
  ["../app/seo/content/page.tsx", "seo_content_entry", "integrations.manage"],
  ["../app/seo/categories/page.tsx", "seo_category_entry", "integrations.manage"],
  ["../app/seo/pages/page.tsx", "seo_page_entry", "integrations.manage"],
  ["../app/seo/products/page.tsx", "seo_product_entry", "integrations.manage"],
  ["../app/settings/artificial-intelligence/page.tsx", "ai_setting", "configuration.manage"],
] as const;

test("advanced SEO routes bind fixed server-owned kinds and capabilities", async () => {
  for (const [path, kind, capability] of ADVANCED_SEO_ROUTES) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireServerPanelAccess\(\)/);
    assert.match(source, /MerchantModuleConsole/);
    assert.match(source, new RegExp(`kind=["']${kind}["']`));
    assert.match(source, new RegExp(capability.replace(".", "\\.")));
    assert.doesNotMatch(source, /searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/i);
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
  assert.match(client, /\/api\/settings\/artificial-intelligence\/providers/);
  assert.doesNotMatch(page, /API anahtarı|apiKey|secret|fetch\s*\(/i);
  assert.doesNotMatch(`${page}\n${client}`, /içerik (?:üretildi|oluşturuldu)|senkronizasyon tamamlandı/i);
});
