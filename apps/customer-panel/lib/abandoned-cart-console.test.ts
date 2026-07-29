import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("abandoned-cart list and detail pages stay behind durable server access", async () => {
  for (const path of ["../app/orders/abandoned-carts/page.tsx", "../app/orders/abandoned-carts/[cartId]/page.tsx"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireServerPanelAccess\(\)/);
    assert.match(source, /createPanelChromeModel\(access\.tenantContext\)/);
    assert.doesNotMatch(source, /tenantContext=|storeId=|membershipId=/);
  }
});

test("console exposes truthful loaded empty error detail and durable mutations", async () => {
  const source = await readFile(new URL("../components/orders/AbandonedCartConsole.tsx", import.meta.url), "utf8");
  for (const evidence of ["Terk Edilen Sepetler", "Henüz terk edilmiş sepet yok", "Sepetler yüklenemedi", "Sepet ayrıntısı", "Kurtarıldı olarak işaretle", "Arşivle", "abandonedCartApi.markRecovered", "abandonedCartApi.archive"]) assert.match(source, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /fake|mock|Supabase|\/api\/admin|storeId|tenantId/i);
});

test("responsive console keeps Hemenaku geometry, 48px controls, and reduced motion", async () => {
  const css = await readFile(new URL("../components/orders/abandoned-cart-console.module.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(min-width: 1025px\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.01ms/);
});
