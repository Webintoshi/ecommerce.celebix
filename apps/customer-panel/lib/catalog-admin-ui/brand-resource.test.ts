import assert from "node:assert/strict";
import test from "node:test";
import { nextBrandSlug, saveBrandResource } from "./brand-resource.ts";

test("brand names generate a bounded Turkish URL and the first available suffix", () => {
  assert.equal(nextBrandSlug("Arpaş", new Set(["arpas", "arpas-2"])), "arpas-3");
  assert.equal(nextBrandSlug("Çiçek Dünyası", new Set()), "cicek-dunyasi");
  const long = "a".repeat(120);
  assert.equal(nextBrandSlug(long, new Set([long])).length, 120);
});

test("brand creation retries only a concurrent URL collision and keeps the logo and products", async () => {
  const saved: Array<{ slug: string; config: unknown; productIds: readonly string[] }> = [];
  const logo = "74000000-0000-4000-8000-000000000001";
  const result = await saveBrandResource({
    resources: async () => [{ slug: "arpas" }],
    saveResource: async (_kind, value) => { saved.push(value); if (saved.length === 1) throw Object.assign(new Error(), { code: "slug_conflict" }); return { id: "saved" }; },
  }, { name: "Arpaş", config: { logoAssetId: logo }, productIds: ["product-a"] });
  assert.deepEqual(saved.map((value) => value.slug), ["arpas-2", "arpas-3"]);
  assert.ok(saved.every((value) => value.config && value.productIds[0] === "product-a"));
  assert.deepEqual(result, { id: "saved" });
});

test("editing keeps the existing URL and does not load other brands", async () => {
  let reads = 0;
  let slug = "";
  await saveBrandResource({ resources: async () => { reads++; return []; }, saveResource: async (_kind, value) => { slug = value.slug; } }, { resourceId: "brand-a", expectedVersion: 2, existingSlug: "arpas", name: "Yeni ad", config: {}, productIds: [] });
  assert.equal(slug, "arpas");
  assert.equal(reads, 0);
});

test("brand validation errors are not retried as naming collisions", async () => {
  let attempts = 0;
  await assert.rejects(() => saveBrandResource({ resources: async () => [], saveResource: async () => { attempts++; throw Object.assign(new Error("invalid"), { code: "invalid_input" }); } }, { name: "Arpaş", config: {}, productIds: [] }), /invalid/);
  assert.equal(attempts, 1);
});
