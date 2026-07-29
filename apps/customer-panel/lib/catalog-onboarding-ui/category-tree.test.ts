import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogCategoryHierarchy } from "./category-tree.ts";

test("projects a stable root-to-leaf category tree", () => {
  const result = buildCatalogCategoryHierarchy([
    { id: "b", name: "Yüzük", parentId: "a", position: 2 },
    { id: "c", name: "Kolye", parentId: "a", position: 1 },
    { id: "a", name: "Takı", position: 0 },
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.rows.map(({ category, label, depth }) => [category.id, label, depth]), [
    ["a", "Takı", 1],
    ["c", "Takı › Kolye", 2],
    ["b", "Takı › Yüzük", 2],
  ]);
  assert.deepEqual(result.descendantIds("a"), ["c", "b"]);
});

test("fails closed for orphan and cyclic category graphs", () => {
  assert.equal(buildCatalogCategoryHierarchy([{ id: "a", parentId: "missing", name: "A", position: 0 }]).valid, false);
  assert.equal(buildCatalogCategoryHierarchy([
    { id: "a", parentId: "b", name: "A", position: 0 },
    { id: "b", parentId: "a", name: "B", position: 0 },
  ]).valid, false);
});

test("rejects category depth above eight", () => {
  const categories = Array.from({ length: 9 }, (_, index) => ({
    id: String(index), name: `Seviye ${index + 1}`, position: index,
    ...(index === 0 ? {} : { parentId: String(index - 1) }),
  }));
  assert.equal(buildCatalogCategoryHierarchy(categories).valid, false);
});

test("distinguishes equal leaf names by their complete paths", () => {
  const result = buildCatalogCategoryHierarchy([
    { id: "a", name: "Kadın", position: 0 }, { id: "b", name: "Erkek", position: 1 },
    { id: "c", parentId: "a", name: "Yüzük", position: 0 },
    { id: "d", parentId: "b", name: "Yüzük", position: 0 },
  ]);
  assert.deepEqual([result.labelFor("c"), result.labelFor("d")], ["Kadın › Yüzük", "Erkek › Yüzük"]);
});

test("returns frozen rows, paths, and descendant copies", () => {
  const result = buildCatalogCategoryHierarchy([
    { id: "a", name: "Takı", position: 0 }, { id: "b", parentId: "a", name: "Yüzük", position: 0 },
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rows), true);
  assert.equal(Object.isFrozen(result.rows[1]?.path), true);
  assert.equal(Object.isFrozen(result.descendantIds("a")), true);
});
