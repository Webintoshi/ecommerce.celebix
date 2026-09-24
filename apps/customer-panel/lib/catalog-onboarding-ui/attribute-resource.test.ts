import assert from "node:assert/strict";
import test from "node:test";

import { buildAttributeResourceMutation, saveAttributeForPicker } from "./attribute-resource.ts";

const existing = { id: "10000000-0000-4000-8000-000000000001", kind: "attribute" as const, name: "Renk", slug: "renk", config: { values: ["Siyah"] }, status: "active" as const, productIds: [], productCount: 0, version: 4, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

test("new attribute hides technical slug and accepts named values", () => {
  assert.deepEqual(buildAttributeResourceMutation({ name: "Ölçü / Beden", values: ["S", "M"] }), {
    ok: true, value: { name: "Ölçü / Beden", slug: "olcu-beden", config: { values: ["S", "M"] }, productIds: [] },
  });
});

test("adding a value keeps the existing attribute identity, version and earlier values", () => {
  assert.deepEqual(buildAttributeResourceMutation({ existing, values: ["Beyaz"] }), {
    ok: true, value: { resourceId: existing.id, expectedVersion: 4, name: "Renk", slug: "renk", config: { values: ["Siyah", "Beyaz"] }, productIds: [] },
  });
});

test("duplicate and invalid values are not submitted", () => {
  assert.equal(buildAttributeResourceMutation({ existing, values: ["siyah"] }).ok, false);
  assert.equal(buildAttributeResourceMutation({ name: "Renk", values: ["Siyah", "siyah"] }).ok, false);
  assert.equal(buildAttributeResourceMutation({ name: "Renk", values: [] }).ok, false);
});

test("inline attribute save reads back the server record before offering it to product form", async () => {
  const calls: unknown[] = [];
  const saved = { ...existing, config: { values: ["Siyah", "Beyaz"] }, version: 5 };
  const result = await saveAttributeForPicker({
    async saveResource(kind, value) { calls.push([kind, value]); return { id: existing.id }; },
    async resource(kind, id) { calls.push([kind, id]); return saved; },
  }, { existing, values: ["Beyaz"] });
  assert.equal(result, saved);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["attribute", { resourceId: existing.id, expectedVersion: 4, name: "Renk", slug: "renk", config: { values: ["Siyah", "Beyaz"] }, productIds: [] }]);
});

test("failed inline attribute save does not report a newly selected resource", async () => {
  let reads = 0;
  await assert.rejects(saveAttributeForPicker({
    async saveResource() { throw new Error("version_conflict"); },
    async resource() { reads++; return existing; },
  }, { existing, values: ["Beyaz"] }), /version_conflict/);
  assert.equal(reads, 0);
});
