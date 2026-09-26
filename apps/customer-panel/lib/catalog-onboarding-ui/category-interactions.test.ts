import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogCategory } from "@celebix/saas-contracts";
import { buildChangedCategoryOrderGroups, moveCategoryAmongSiblings } from "./category-interactions.ts";

function category(id: string, position: number, parentId?: string, status: "active" | "archived" = "active"): CatalogCategory {
  return { id, name: id, slug: id, position, version: position + 1, status, ...(parentId ? { parentId } : {}) } as CatalogCategory;
}

test("category drag ordering moves only active siblings and preserves child positions", () => {
  const original = [category("a", 1), category("b", 2), category("child", 1, "a"), category("archived", 3, undefined, "archived")];
  const reordered = moveCategoryAmongSiblings(original, "b", "a");
  assert.equal(reordered.find((item) => item.id === "b")?.position, 1);
  assert.equal(reordered.find((item) => item.id === "a")?.position, 2);
  assert.equal(reordered.find((item) => item.id === "child"), original[2]);
  assert.equal(reordered.find((item) => item.id === "archived"), original[3]);
  assert.equal(moveCategoryAmongSiblings(original, "a", "child"), original);
  assert.equal(moveCategoryAmongSiblings(original, "a", "archived"), original);
});

test("category order payload contains each changed group's complete siblings and original versions", () => {
  const original = [category("a", 1), category("b", 2), category("x", 1, "a"), category("y", 2, "a")];
  const draft = moveCategoryAmongSiblings(moveCategoryAmongSiblings(original, "b", "a"), "y", "x");
  assert.deepEqual(buildChangedCategoryOrderGroups(original, draft), [
    { orderedCategoryIds: ["b", "a"], expectedVersions: [{ categoryId: "a", version: 2 }, { categoryId: "b", version: 3 }] },
    { parentId: "a", orderedCategoryIds: ["y", "x"], expectedVersions: [{ categoryId: "x", version: 2 }, { categoryId: "y", version: 3 }] },
  ]);
  assert.deepEqual(buildChangedCategoryOrderGroups(original, original), []);
  assert.throws(() => buildChangedCategoryOrderGroups(original, draft.filter((item) => item.id !== "x")), /category_order_draft_invalid/);
});
