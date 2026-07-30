import type {
  CatalogCategoryTreeEntry,
  CatalogCategoryTreeRow,
} from "./category-tree.ts";

export interface CategoryAccordionGroup<T extends CatalogCategoryTreeEntry> {
  readonly root: CatalogCategoryTreeRow<T>;
  readonly descendants: readonly CatalogCategoryTreeRow<T>[];
}

export interface CategoryAccordionPresentation<T extends CatalogCategoryTreeEntry>
  extends CategoryAccordionGroup<T> {
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly childrenId?: string;
  readonly visibleDescendants: readonly CatalogCategoryTreeRow<T>[];
}

export function buildCategoryAccordionGroups<T extends CatalogCategoryTreeEntry>(
  rows: readonly CatalogCategoryTreeRow<T>[],
): readonly CategoryAccordionGroup<T>[] {
  const groups: Array<{
    root: CatalogCategoryTreeRow<T>;
    descendants: CatalogCategoryTreeRow<T>[];
  }> = [];

  for (const row of rows) {
    if (row.depth === 1) {
      groups.push({ root: row, descendants: [] });
      continue;
    }

    groups.at(-1)?.descendants.push(row);
  }

  return Object.freeze(groups.map(({ root, descendants }) => Object.freeze({
    root,
    descendants: Object.freeze([...descendants]),
  })));
}

export function toggleCategoryAccordion(
  current: ReadonlySet<string>,
  rootId: string,
): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(rootId)) next.delete(rootId);
  else next.add(rootId);
  return next;
}

export function presentCategoryAccordion<T extends CatalogCategoryTreeEntry>(
  groups: readonly CategoryAccordionGroup<T>[],
  expandedRootIds: ReadonlySet<string>,
): readonly CategoryAccordionPresentation<T>[] {
  return Object.freeze(groups.map((group) => {
    const hasChildren = group.descendants.length > 0;
    const expanded = hasChildren && expandedRootIds.has(group.root.category.id);

    return Object.freeze({
      ...group,
      hasChildren,
      expanded,
      ...(hasChildren ? { childrenId: `category-children-${group.root.category.id}` } : {}),
      visibleDescendants: expanded ? group.descendants : Object.freeze([]),
    });
  }));
}
