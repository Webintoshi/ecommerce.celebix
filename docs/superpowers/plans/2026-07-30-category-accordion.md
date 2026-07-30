# Category Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render customer-panel catalog categories as collapsed root groups whose descendants open directly beneath the selected root.

**Architecture:** A small pure presentation helper groups the existing validated preorder hierarchy and immutably toggles a set of expanded root IDs. `CategoryManager` remains the only stateful surface and preserves every existing CRUD/API authority while rendering accessible root toggles and conditional descendant regions.

**Tech Stack:** React 19, Next.js 16, TypeScript, CSS Modules, Node test runner.

## Global Constraints

- Initial state is fully collapsed.
- More than one root group may remain open.
- Existing `buildCatalogCategoryHierarchy` remains the hierarchy and ordering authority.
- Category CRUD payloads, API requests, TenantContext, slugs, PostgreSQL rows and Güzide relationships remain unchanged.
- No dependency, migration, Owner, storefront, R2 or production change.
- Interactive targets remain at least 48×48 pixels and reduced motion remains approximately `0.01ms`.

---

## File Map

- Create `apps/customer-panel/lib/catalog-onboarding-ui/category-accordion.ts`: pure grouping and immutable toggle model.
- Modify `apps/customer-panel/lib/product-onboarding-console.test.ts`: red/green behavior and source accessibility coverage.
- Modify `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx`: controlled expanded-root state and grouped rendering.
- Modify `apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css`: group, child region, toggle and responsive styles.

### Task 1: Accessible multi-open category accordion

**Files:**
- Create: `apps/customer-panel/lib/catalog-onboarding-ui/category-accordion.ts`
- Modify: `apps/customer-panel/lib/product-onboarding-console.test.ts:1-100`
- Modify: `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx:3-85`
- Modify: `apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css:88-150`

**Interfaces:**
- Consumes: `readonly CatalogCategoryTreeRow<T>[]` from `buildCatalogCategoryHierarchy`.
- Produces: `buildCategoryAccordionGroups<T>(rows): readonly CategoryAccordionGroup<T>[]` and `toggleCategoryAccordion(current: ReadonlySet<string>, rootId: string): ReadonlySet<string>`.

- [ ] **Step 1: Write the failing pure behavior test**

Add imports and one test to `product-onboarding-console.test.ts`:

```ts
import { buildCatalogCategoryHierarchy } from "./catalog-onboarding-ui/category-tree.ts";
import {
  buildCategoryAccordionGroups,
  toggleCategoryAccordion,
} from "./catalog-onboarding-ui/category-accordion.ts";

test("category accordion groups descendants under roots and toggles roots independently", () => {
  const rows = buildCatalogCategoryHierarchy([
    { id: "root-a", name: "Kolyeler", position: 0 },
    { id: "child-a", parentId: "root-a", name: "Kolye Ucu", position: 0 },
    { id: "root-b", name: "Saatler", position: 1 },
    { id: "child-b", parentId: "root-b", name: "Kadın Saat", position: 0 },
    { id: "root-empty", name: "Setler", position: 2 },
  ]).rows;
  const groups = buildCategoryAccordionGroups(rows);
  assert.deepEqual(groups.map(({ root, descendants }) => [root.category.id, descendants.map(({ category }) => category.id)]), [
    ["root-a", ["child-a"]],
    ["root-b", ["child-b"]],
    ["root-empty", []],
  ]);

  const openedA = toggleCategoryAccordion(new Set(), "root-a");
  const openedBoth = toggleCategoryAccordion(openedA, "root-b");
  const closedA = toggleCategoryAccordion(openedBoth, "root-a");
  assert.deepEqual([...openedA], ["root-a"]);
  assert.deepEqual([...openedBoth], ["root-a", "root-b"]);
  assert.deepEqual([...closedA], ["root-b"]);
  assert.equal(Object.isFrozen(groups), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-onboarding-console.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `category-accordion.ts`.

- [ ] **Step 3: Add the minimal pure model**

Create `category-accordion.ts`:

```ts
import type {
  CatalogCategoryTreeEntry,
  CatalogCategoryTreeRow,
} from "./category-tree.ts";

export interface CategoryAccordionGroup<T extends CatalogCategoryTreeEntry> {
  readonly root: CatalogCategoryTreeRow<T>;
  readonly descendants: readonly CatalogCategoryTreeRow<T>[];
}

export function buildCategoryAccordionGroups<T extends CatalogCategoryTreeEntry>(
  rows: readonly CatalogCategoryTreeRow<T>[],
): readonly CategoryAccordionGroup<T>[] {
  const groups: Array<{ root: CatalogCategoryTreeRow<T>; descendants: CatalogCategoryTreeRow<T>[] }> = [];
  for (const row of rows) {
    if (row.depth === 1) groups.push({ root: row, descendants: [] });
    else groups.at(-1)?.descendants.push(row);
  }
  return Object.freeze(groups.map(({ root, descendants }) => Object.freeze({ root, descendants: Object.freeze([...descendants]) })));
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
```

- [ ] **Step 4: Run the focused test and verify the model is GREEN**

Run the Step 2 command.

Expected: all `product-onboarding-console.test.ts` tests PASS.

- [ ] **Step 5: Add failing component/source assertions**

Extend the existing category manager test:

```ts
assert.match(manager, /useState<ReadonlySet<string>>\(\(\) => new Set\(\)\)/);
assert.match(manager, /aria-expanded=\{expanded\}/);
assert.match(manager, /aria-controls=\{childrenId\}/);
assert.match(manager, /descendants\.length > 0/);
assert.match(manager, /expanded \? descendants\.map/);
assert.doesNotMatch(manager, /\/\{category[.]slug\}/);

const css = await source("components/catalog-onboarding/product-onboarding.module.css");
assert.match(css, /categoryToggle[^}]*min-width:\s*48px[^}]*min-height:\s*48px/s);
assert.match(css, /categoryToggle\[aria-expanded="true"\]/);
assert.match(css, /prefers-reduced-motion[\s\S]*categoryToggle/);
```

- [ ] **Step 6: Run the focused test and verify component assertions RED**

Run the Step 2 command.

Expected: FAIL because `CategoryManager` has no expanded-root state, ARIA toggle or conditional descendant rendering.

- [ ] **Step 7: Implement the controlled category groups**

In `CategoryManager.tsx`:

```tsx
import { Archive, ChevronDown, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { buildCategoryAccordionGroups, toggleCategoryAccordion } from "@/lib/catalog-onboarding-ui/category-accordion";

const [expandedRootIds, setExpandedRootIds] = useState<ReadonlySet<string>>(() => new Set());
const groups = buildCategoryAccordionGroups(hierarchy.rows);

function toggleRoot(rootId: string) {
  setExpandedRootIds((current) => toggleCategoryAccordion(current, rootId));
}
```

Replace the flat `hierarchy.rows.map` with root groups. Preserve the existing article contents and actions in a shared render helper. For roots with descendants, add:

```tsx
const childrenId = `category-children-${root.category.id}`;
const expanded = expandedRootIds.has(root.category.id);
<button
  type="button"
  className={styles.categoryToggle}
  aria-expanded={expanded}
  aria-controls={childrenId}
  aria-label={`${root.category.name} alt kategorilerini ${expanded ? "kapat" : "aç"}`}
  onClick={() => toggleRoot(root.category.id)}
>
  <ChevronDown aria-hidden="true" />
</button>
{expanded ? <div id={childrenId} className={styles.categoryChildren}>{descendants.map(renderCategoryRow)}</div> : null}
```

Do not render the toggle when `descendants.length === 0`.

- [ ] **Step 8: Add the accordion styles**

Add CSS Module rules:

```css
.categoryGroup { display: grid; gap: 8px; }
.categoryChildren { display: grid; gap: 8px; border-left: 2px solid #ffe1cc; margin-left: 24px; padding-left: 14px; }
.categoryToggle { display: grid; min-width: 48px; min-height: 48px; place-items: center; border: 1px solid #d8dee8; border-radius: 12px; background: #fff; color: #475467; }
.categoryToggle svg { width: 18px; transition: transform 160ms ease; }
.categoryToggle[aria-expanded="true"] svg { transform: rotate(180deg); }
```

At `max-width: 560px`, reduce only the child-region margin while preserving the 48px target. Extend the existing reduced-motion selector with `.categoryToggle svg`.

- [ ] **Step 9: Run focused and workspace verification**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-onboarding-console.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
git diff --check
```

Expected: all focused/workspace tests PASS; typecheck/build exit `0`; diff check is empty.

- [ ] **Step 10: Run authenticated browser acceptance**

Deploy only customer-panel isolated staging from the exact final SHA, then verify:

1. Initial `/products/categories` shows 14 roots and zero visible children.
2. `Kolyeler` opens to show its descendants.
3. `Saatler` opens without closing `Kolyeler`.
4. Closing `Kolyeler` leaves `Saatler` open.
5. Keyboard/ARIA behavior, 48px targets, no slug text and zero console errors.

- [ ] **Step 11: Commit and push**

```bash
git add apps/customer-panel/lib/catalog-onboarding-ui/category-accordion.ts \
  apps/customer-panel/lib/product-onboarding-console.test.ts \
  apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx \
  apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css \
  docs/superpowers/plans/2026-07-30-category-accordion.md
git commit -m "feat(catalog): group child categories in dropdowns"
git push origin codex/guzide-staging-integration
```

Expected: local and remote SHA match; Owner/storefront/production deploy count remains zero.
