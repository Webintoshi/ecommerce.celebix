# Mira Panel Rollout V1

User's approved implementation direction is the specification. No new design approval required.

## Global Constraints

Only apps/customer-panel presentation and tests plus QA documentation. No backend/API/SQL/auth, apps/admin, Owner/Storefront/Worker, real customer mutation, deploy/merge/environment/Auto Deploy changes. Preserve Orders PR75 and archive work; do not edit components/orders or order APIs. Preserve Dashboard/Analytics design and existing shell/sidebar. Accent #FE6100, text/primary #2B2B2B, sidebar #201C19, canvas #F8F7F5, surface #FFFDFC, border #E7E2DD. Neutral information hierarchy; no decorative blue/purple/gold/rainbow. Use existing primitives; no global CSS overrides. Preserve every action/state and draft values after failures/conflicts. Fixtures are not live certification. No cleanup. Focused tests during implementation; typecheck/visual QA per 2–3 modules, final full tests/build serial. Root coordinates heavy jobs and verifies Auto Deploy before push.

### Task 1: Customers

Read .agents/skills/mira-customer-panel-visual-system/SKILL.md and its required references first. Inventory and implement all six customer routes: list, new, detail, edit, segments, tags. Own components/customers/** and relevant Customer Panel customer presentation tests only. No API/client contract changes. Inspect current behavior before editing. Consolidate the existing 2616-line customer CSS rather than adding another giant override pile. Reuse panel primitives. Improve toolbar/action hierarchy, dense table, grouped forms/save area, detail/summary arrangement, responsive and focus states, not just colors. Remove duplicate create CTAs while retaining access. Preserve user-defined tag color data; neutralize presentation decoration/default styling without rewriting stored data. Preserve search/status/load-more/CSV, permissions, create/edit/addresses/consents, taxonomy membership, notes/archive/restore, neighbors and linked orders. Write/run meaningful regression before behavior changes; reuse existing tests and fixture tooling. No heavy full suite/build/server start until root coordinates. Existing installed dependencies will be linked by root. Commit exact owned paths only after focused checks, no push. Report full evidence/gaps to .superpowers/sdd/mira-panel-rollout-v1/task-1-report.md. No subagents.

### Task 2: Catalog

Apply the same approved scope to product list/editor/variants/media and category/collection/brand/attribute/tag/definition/extra/review/preview routes. Inventory from actual routes, preserve behavior and business calculations. Separate files from Orders and Customers. Focused tests then review.

Own components/catalog/**, components/catalog-onboarding/**, and catalog-admin resource/editor/brand logo/extra preview/review presentation plus corresponding presentation tests. Exclude barcode/import files until Task3, and do not change API/client/server modules. Read Mira skill and required references; latest user palette governs. Route inventory is already in docs/qa/mira-panel-rollout.md; use it rather than remapping the entire tree. ProductListConsole/ProductAdvancedEditor use legacy global class names: introduce bounded module-root scoping where needed, not edits to app/globals.css or a new theme. Reuse existing dialog/field/panel primitives. Preserve real summaries/unavailable metrics, search/filter/sort/pagination/URL state, selection/export/bulk confirm, variant/media upload and preview, rich description, categories/resource forms/linked products/permissions, draft guard and save reconciliation. Keep photos/logos unmodified. Improve responsive toolbar/table/form sections/action placement and detail hierarchy, not only colors; no decorative purple/blue/gold money or rainbow statuses. Keep success/error semantic and modest. Review all module CSS consumers before modifying shared catalog-admin CSS, as import/barcode may consume it; don't alter print dimensions. Customer mobile QA established fixed shell dock clearance is necessary for sticky save controls; account for it. Focused relevant product/catalog tests only (lib/product-console.test.ts, product-onboarding-console.test.ts, catalog-admin-console.test.ts, catalog-resource-console.behavior.test.ts and matching catalog UI tests); no full suite/typecheck/build/server start before root coordination. Write meaningful failing regressions before behavior changes, retain existing assertions/skip counts. Existing dependencies are linked. Root owns fixture runtime port3517 and QA docs. Commit exact owned paths, no push, no subagents; report to the task report path supplied by controller with exact tests/results, gaps and scope.

### Task 3: Stock operations

Inventory/purchasing/transfers/pricelists/barcode/import routes; preserve print dimensions and calculation semantics. Scoped presentation and regression checks.

### Task 4: Promotions

Existing list/wizard/detail/codes/simulator/reports; no promotion calculation or API changes.

### Task 5: Remaining order-adjacent pages

Drafts/quicklinks/abandonedcarts only after checking PR75 overlap; record conflicts, progress independent pages.

### Task 6: Settings and remaining routes

Settings/domains/payment/shipping/content/remaining existing modules; no authority changes. Final combined QA/review and rollout PR, no merge/deploy.
