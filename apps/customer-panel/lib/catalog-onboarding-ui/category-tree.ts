export interface CatalogCategoryTreeEntry {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly position: number;
}

export interface CatalogCategoryTreeRow<T extends CatalogCategoryTreeEntry> {
  readonly category: T;
  readonly depth: number;
  readonly path: readonly string[];
  readonly label: string;
}

export interface CatalogCategoryHierarchy<T extends CatalogCategoryTreeEntry> {
  readonly valid: boolean;
  readonly rows: readonly CatalogCategoryTreeRow<T>[];
  labelFor(id: string): string | undefined;
  descendantIds(id: string): readonly string[];
}

const compare = <T extends CatalogCategoryTreeEntry>(left: T, right: T) =>
  left.position - right.position
  || left.name.localeCompare(right.name, "tr-TR")
  || left.id.localeCompare(right.id);

function invalidHierarchy<T extends CatalogCategoryTreeEntry>(): CatalogCategoryHierarchy<T> {
  const empty = Object.freeze([]) as readonly CatalogCategoryTreeRow<T>[];
  return Object.freeze({ valid: false, rows: empty, labelFor: () => undefined, descendantIds: () => Object.freeze([]) });
}

function validHierarchy<T extends CatalogCategoryTreeEntry>(source: readonly CatalogCategoryTreeRow<T>[]): CatalogCategoryHierarchy<T> {
  const rows = Object.freeze([...source]);
  const byId = new Map(rows.map((row) => [row.category.id, row]));
  const descendants = new Map<string, string[]>();
  for (const row of rows) {
    let parentId = row.category.parentId;
    while (parentId !== undefined) {
      const values = descendants.get(parentId) ?? [];
      values.push(row.category.id);
      descendants.set(parentId, values);
      parentId = byId.get(parentId)?.category.parentId;
    }
  }
  return Object.freeze({
    valid: true,
    rows,
    labelFor: (id: string) => byId.get(id)?.label,
    descendantIds: (id: string) => Object.freeze([...(descendants.get(id) ?? [])]),
  });
}

export function buildCatalogCategoryHierarchy<T extends CatalogCategoryTreeEntry>(categories: readonly T[]): CatalogCategoryHierarchy<T> {
  const byId = new Map<string, T>();
  for (const category of categories) {
    if (byId.has(category.id)) return invalidHierarchy<T>();
    byId.set(category.id, category);
  }
  const children = new Map<string | undefined, T[]>();
  for (const category of categories) {
    if (category.parentId !== undefined && !byId.has(category.parentId)) return invalidHierarchy<T>();
    const branch = children.get(category.parentId) ?? [];
    branch.push(category);
    children.set(category.parentId, branch);
  }
  const rows: CatalogCategoryTreeRow<T>[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (category: T, path: readonly string[]) => {
    if (visiting.has(category.id) || path.length >= 8) return false;
    visiting.add(category.id);
    const nextPath = Object.freeze([...path, category.name]);
    rows.push(Object.freeze({ category, depth: nextPath.length, path: nextPath, label: nextPath.join(" › ") }));
    for (const child of [...(children.get(category.id) ?? [])].sort(compare)) if (!walk(child, nextPath)) return false;
    visiting.delete(category.id);
    visited.add(category.id);
    return true;
  };
  for (const root of [...(children.get(undefined) ?? [])].sort(compare)) if (!walk(root, [])) return invalidHierarchy<T>();
  if (visited.size !== categories.length) return invalidHierarchy<T>();
  return validHierarchy(rows);
}
