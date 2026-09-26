import type { CatalogCategory } from "@celebix/saas-contracts";

export type CategoryOrderGroup = Readonly<{
  parentId?: string;
  orderedCategoryIds: readonly string[];
  expectedVersions: readonly Readonly<{ categoryId: string; version: number }>[];
}>;

const rootKey = "__root__";
const compare = (left: CatalogCategory, right: CatalogCategory) => left.position - right.position
  || left.name.localeCompare(right.name, "tr-TR") || left.id.localeCompare(right.id);

function activeSiblingGroups(categories: readonly CatalogCategory[]) {
  const groups = new Map<string, CatalogCategory[]>();
  for (const category of categories) {
    if (category.status !== "active") continue;
    const key = category.parentId ?? rootKey;
    const siblings = groups.get(key) ?? [];
    siblings.push(category);
    groups.set(key, siblings);
  }
  for (const siblings of groups.values()) siblings.sort(compare);
  return groups;
}

export function moveCategoryAmongSiblings(
  categories: readonly CatalogCategory[],
  categoryId: string,
  targetId: string,
): readonly CatalogCategory[] {
  const category = categories.find((item) => item.id === categoryId);
  const target = categories.find((item) => item.id === targetId);
  if (!category || !target || categoryId === targetId || category.status !== "active"
    || target.status !== "active" || category.parentId !== target.parentId) return categories;
  const siblings = activeSiblingGroups(categories).get(category.parentId ?? rootKey)!;
  const sourceIndex = siblings.findIndex((item) => item.id === categoryId);
  const targetIndex = siblings.findIndex((item) => item.id === targetId);
  siblings.splice(sourceIndex, 1);
  siblings.splice(targetIndex, 0, category);
  const positions = new Map(siblings.map((item, index) => [item.id, index + 1]));
  return Object.freeze(categories.map((item) => positions.has(item.id)
    ? Object.freeze({ ...item, position: positions.get(item.id)! }) : item));
}

export function buildChangedCategoryOrderGroups(
  baseline: readonly CatalogCategory[],
  draft: readonly CatalogCategory[],
): readonly CategoryOrderGroup[] {
  const originalGroups = activeSiblingGroups(baseline);
  const draftGroups = activeSiblingGroups(draft);
  if (originalGroups.size !== draftGroups.size) throw new TypeError("category_order_draft_invalid");
  const changed: CategoryOrderGroup[] = [];
  for (const [parent, originals] of originalGroups) {
    const next = draftGroups.get(parent);
    if (!next || next.length !== originals.length || next.some((item) => !originals.some((original) => original.id === item.id))) {
      throw new TypeError("category_order_draft_invalid");
    }
    if (next.every((item, index) => item.id === originals[index]?.id)) continue;
    changed.push(Object.freeze({
      ...(parent === rootKey ? {} : { parentId: parent }),
      orderedCategoryIds: Object.freeze(next.map((item) => item.id)),
      expectedVersions: Object.freeze(originals.map((item) => Object.freeze({ categoryId: item.id, version: item.version }))),
    }));
  }
  return Object.freeze(changed);
}
