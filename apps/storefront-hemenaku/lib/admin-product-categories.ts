import type { CategoryInfo } from "@/types/product";

export interface ProductCategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  children: ProductCategoryNode[];
}

function compareCategories(a: ProductCategoryNode, b: ProductCategoryNode) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  return a.name.localeCompare(b.name, "tr-TR");
}

function sortCategoryTree(nodes: ProductCategoryNode[]) {
  nodes.sort(compareCategories);

  for (const node of nodes) {
    sortCategoryTree(node.children);
  }
}

export function buildProductCategoryTree(
  categories: CategoryInfo[]
): ProductCategoryNode[] {
  const nodes = categories
    .filter((category) => category.is_active !== false)
    .map<ProductCategoryNode>((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parent_id ?? null,
      sortOrder: category.sort_order ?? 0,
      children: [],
    }));

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const roots: ProductCategoryNode[] = [];

  for (const node of nodes) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)?.children.push(node);
      continue;
    }

    roots.push(node);
  }

  sortCategoryTree(roots);
  return roots;
}

export function getChildCategoriesByParentSlug(
  categoryTree: ProductCategoryNode[],
  parentSlug: string
) {
  return categoryTree.find((category) => category.slug === parentSlug)?.children ?? [];
}

export function buildCategoryLabelMap(categories: CategoryInfo[]) {
  return new Map(
    categories
      .filter((category) => category.is_active !== false)
      .map((category) => [category.slug, category.name])
  );
}
