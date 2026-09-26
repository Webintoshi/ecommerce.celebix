import assert from "node:assert/strict";
import test from "node:test";
import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { categorySeoConfig, categorySeoState, createCategorySeoClient } from "./category-seo.ts";

const categoryId = "10000000-0000-4000-8000-000000000001";
const record: MerchantAdminRecord = { id: "20000000-0000-4000-8000-000000000001", kind: "seo_category_entry", name: "Özel SEO", config: { resourceId: categoryId, canonicalPath: "/categories/ozel", metaTitle: "Başlık", metaDescription: "Açıklama" }, status: "active", version: 3, createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z" };
test("category SEO updates retain custom canonical path and clear empty overrides", () => {
  assert.deepEqual(categorySeoConfig(record, categoryId, { metaTitle: "  Yeni başlık  ", metaDescription: "" }), { resourceId: categoryId, canonicalPath: "/categories/ozel", metaTitle: "Yeni başlık" });
  assert.deepEqual(categorySeoState([{ ...record, status: "archived" }], categoryId).draft, { metaTitle: "", metaDescription: "" });
  assert.throws(() => categorySeoState([record, { ...record, id: "30000000-0000-4000-8000-000000000001" }], categoryId), /birden fazla/);
});
test("category SEO client uses existing record version and preserves draft publication state", async () => {
  let supplied: Parameters<typeof import("../merchant-admin-ui/client.ts").merchantAdminApi.save>[1] | undefined;
  const draftRecord = { ...record, status: "draft" as const };
  const client = createCategorySeoClient({
    records: async () => [draftRecord],
    save: async (_kind, value) => { supplied = value;return { id: record.id, kind: "seo_category_entry", version: 4, status: "draft", updatedAt: record.updatedAt, replayed: false }; },
    record: async () => ({ ...draftRecord, version: 4, config: { ...record.config, metaTitle: "Yeni" } }),
  });
  const state = await client.load(categoryId);
  const result = await client.save(categoryId, "Kategori", state, { metaTitle: "Yeni", metaDescription: "Açıklama" });
  assert.equal(supplied?.recordId, record.id);assert.equal(supplied?.expectedVersion, 3);assert.equal(supplied?.status, "draft");assert.equal(result.record?.version, 4);
});

test("category SEO retries an uncertain saved result with the same proof", async () => {
  const proofs: string[] = [];
  let reads = 0;
  const client = createCategorySeoClient({
    records: async () => [record],
    save: async (_kind, _value, operationId) => { proofs.push(operationId!);return { id: record.id, kind: "seo_category_entry", version: 4, status: "active", updatedAt: record.updatedAt, replayed: proofs.length > 1 }; },
    record: async () => { if (++reads === 1) throw new Error("read_failed");return { ...record, version: 4, config: { ...record.config, metaTitle: "Yeni" } }; },
  });
  const state = await client.load(categoryId);
  const draft = { metaTitle: "Yeni", metaDescription: "Açıklama" };
  await assert.rejects(client.save(categoryId, "Kategori", state, draft), /read_failed/);
  const saved = await client.save(categoryId, "Kategori", state, draft);
  assert.equal(proofs[0], proofs[1]);assert.equal(saved.record?.version, 4);
});
