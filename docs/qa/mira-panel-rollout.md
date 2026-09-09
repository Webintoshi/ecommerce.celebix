# Mira Customer Panel Rollout

Status: IN PROGRESS — no live certification or deployment.

Branch: codex/mira-panel-rollout-v1. Base: 455a4a538f4ff78915d38d37247956949aa2f15e. Existing Orders PR75 and archive branches untouched.

## Approved scope and method

Use existing Mira/Dashboard/Analytics primitives; user palette overrides older skill canvas/border. No new theme/sidebar/global CSS. Preserve actions, authority and API behavior. Focused tests during changes; typecheck/visual QA per 2–3 modules; full Panel tests/typecheck/build at final delivery. Fixtures are not authenticated QA.

## Current package status

| Package | Code/review | Validation and next gate |
|---|---|---|
| Customers | Source8c6dd656, scoped review clean | Focused10/10; fixture18 viewport captures; broader accessibility/artifact/auth gates partial |
| Catalog | Source91097ad7, scoped round1 review clean; fixturefd753440 | Focused77/77; final Panel typecheck at91097ad7 exit0; browser matrix partial, no authenticated evidence |
| Stock / purchasing / transfers / price lists / barcode / import | In progress from1385e76c (QA-only commit following91097ad7) | Focused implementation/tests next; preserve print geometry and import safety |
| Promotions / independent order-adjacent / remaining settings and content | Pending | Same approved scope; no further design approval needed |

No push/PR yet: fresh Auto Deploy read remains required. No deployment, merge, real mutation or cleanup. Earlier entries below are chronological evidence, not superseding this current status.

## Customer task inventory

Primary task: find a customer and maintain profile, addresses, consents and classification.
List: summary, server search, active/archive filter, cursor load-more, CSV, links, permission-bound create, loading/empty/error/retry, desktop table/mobile cards.
Create/edit: identity/contact/address/consent, inline validation, save/cancel, version conflict. Detail: linked orders, previous/next, contact/address/notes, tags/segments, permission-bound edit/archive. Taxonomy: list/create, names/colors/descriptions, customer counts, validation/loading/error.
No new server sorting/filter/count or restore endpoint is fabricated. Missing capabilities will be recorded separately.

### Customer package working evidence (2026-09-09)

- Baseline focused customer tests: 15 passed, 0 failed (`/tmp/mira-rollout-customer-baseline.log`). This is the pre-change baseline, not final combined validation.
- Browser: existing isolated acceptance app at `127.0.0.1:3517`, actual Customer Panel components and shared shell, controlled `example.test` records only. No authenticated session, database or provider used. List/taxonomy fixture composition now mirrors `CustomerWorkspace` + embedded consoles; earlier standalone-list captures are component-only evidence.
- Browser search `Ada` removed `Deniz` from displayed results. Next navigation changed actual displayed identity from Ada QA to Deniz QA and exposed previous navigation.
- Controlled create POST returns HTTP 409 `version_conflict`; inline error appeared and entered first/last names were retained. No successful save or real customer mutation claimed.
- Measured page overflow was 0 at 390 for list/create/detail and at 1024 for create. Captures were emitted inline in the task; durable screenshot files and full six-view/three-size matrix remain pending.
- Mobile QA found summary density and save-bar overlap with the fixed shell navigation. Implementer amended scoped styles; final retest pending. Temporary HMR errors during CSS replacement are development evidence, not a clean final console run.
- Retest: canonical workspace list summary is 2×2/179 px high at390; scoped edit save button is y711–755 above the dock, submits the controlled409 and keeps `Deniz Korunan`. Tags409 preserves `Korunan QA etiketi`. Detail, edit, tags and segments mobile captures are visually inspected; list1024 and segments1440 also captured, each with measured overflow0. These are uncommitted working-source fixture checks, not complete matrix certification.
- Full suite/typecheck/build, independent review, authenticated QA, push trigger verification and PR are pending. No deploy or cleanup performed.
- Customer package initial source commit: `630ce77d30105292dc8f64f40b850828f52b4ef5`. `npm run typecheck --workspace @celebix/customer-panel` completed exit0 on that source, not a later combined-head certification. Full tests/build remain pending. Fixture helpers were subsequently committed at `6149af66` and checked separately because they are not covered by the Panel tsconfig.
- Fixture validation: default acceptance-app tsconfig check exited2 (strictfalse / missing `.ts` import option generated broad compiler diagnostics); no baseline reproduction is claimed. Rechecking the same app with `--strict --allowImportingTsExtensions` (matching the passing Panel compiler policy) completed exit0 with an empty log `/tmp/mira-rollout-fixture-typecheck.log`. No config or application validation was weakened.
- Additional keyboard fixture check: Tab moved from first-name to last-name with visible focus ring at1440; current new-customer page console read returned no error/warning entries. This is not an all-route clean-console assertion. New/edit desktop captures inspected. Address add/remove in edit changed only local unsaved form controls; no customer save issued.
- Fix-round working UI: detail1024 now collapses to one column and overflow0. Tags1440/1024 and segments1024 were captured inline. Mobile menu Escape closed the menu; DOM focus returned to `Panel menüsünü aç`. Detail console read contains one development Fast Refresh full-reload warning (06:39:33Z); no claim of console0 for the package.
- At committed `9db64d28`, detail1024 DOM recheck: viewport1024×900, overflow0, visible action text `rgb(43,43,43)` on `rgb(255,253,252)` and primary action inverse. Calculated contrast for graphite/surface13.96:1; muted `#667085`/surface4.91:1; shell-muted `#6B7280`/surface4.77:1. These sampled pairs are not a whole-app accessibility certification.
- Scoped review round1: original append-error, detail-tablet and raw-draft findings addressed. Two Important findings remain for round2: stale append response after search/status replacement and tablet save/dock overlap. Edit1024 screenshot captured inline; DOM save button y818.5–862.5 overlaps dock y839–900 despite overflow0. Not a responsive PASS.
- New-customer390×844 retake at9db64d28: inline capture inspected, page overflow0, create action y711–755 above dock y783–844. This closes the earlier mobile create footer retake gap, not the1024 issue or whole matrix.
- Round2 source `8c6dd65674e278384d97c1fba7c447490d0cf8e6`: deferred-query regressions and1024 clearance check RED7pass/2fail → final focused3-file run10pass/0fail (6.305s), exact staged diff-check clean. Browser retake of both new/edit1024×900: primary action y767–811 above dock y839–900, overflow0; screenshots inspected inline. Scoped round2 re-review pending; full combined suite/build and authenticated QA remain pending.
- Final customer code review: both round2 findings ADDRESSED, no new scoped breakage. Edit1440×1000 and390×844 retakes on unchanged8c6dd656 customer source have overflow0. At390 keyboard End on the cancel link reaches the final consent fields and visible save/cancel controls above the dock; visible focus ring inspected. Inline evidence only, not a persistent screenshot artifact or live QA.
- Final customer source8c6dd656 retakes: list1440/1024/390 and detail1440/1024/390 captured inline. DOM overflow0 measured for all list sizes and detail1440/1024; detail390 screenshot visually inspected (the immediately preceding390 measurement belonged to the still-transitioning edit page and is not counted as a new detail measurement). This distinction is preserved instead of assigning the wrong screenshot/DOM evidence to a route.
- Push safety partial check: the sole tracked workflow `self-serve-db-migration-rehearsal.yml` targets `codex/self-serve-db-migration-dry-run` pushes and `main` PRs with unrelated paths; it is not a deployment workflow. Historical Orders checkpoint records all four staging Auto Deploy settings OFF, but that history is not a fresh settings check. No rollout push until current trigger configuration is verified.

| Screen | Missing capability | User impact |
|---|---|---|
| Customer archive | Current customer client has archive but no restore endpoint | No fabricated restore action added; backend capability must be supplied before a genuine restore action can be exposed. |

## Route inventory

### Customer viewport matrix — isolated fixture, source8c6dd656

| View | 1440×1000 | 1024×900 | 390×844 |
|---|---|---|---|
| List | Inline inspected; overflow0 | Inline inspected; overflow0 | Inline inspected; overflow0 |
| New | Inline inspected; overflow0 | Inline inspected; overflow0; dock clear | Inline inspected; overflow0; dock clear |
| Edit | Inline inspected; overflow0 | Inline inspected; overflow0; dock clear | Inline inspected; overflow0; End/focus check |
| Detail | Inline inspected; overflow0 | Inline inspected; overflow0; one column | Inline inspected; overflow0; path+Ada heading verified |
| Tags | Inline inspected; overflow0 | Inline inspected; overflow0 | Inline inspected; overflow0 |
| Segments | Inline inspected; overflow0 | Inline inspected; overflow0 | Inline inspected; overflow0 |

All18 are controlled-data viewport captures emitted in this task, not durable files or authenticated screenshots. Broad clipping/keyboard/contrast/console/network certification is still partial; sampled controls and observed warnings are recorded above. No invented screenshot links. Final whole-branch review must also triage partial-order-history empty wording and summary status-chip sizing.

Catalog fixture preparation note: before catalog edits, the old acceptance fallback `/products` loaded its shell but `/api/catalog/onboarding/options` returned400 and product list parsing rendered an unavailable state despite HTTP200. This is incomplete/old fixture-contract evidence, not an authenticated product outage or a catalog regression. A compatible controlled catalog fixture is needed for loaded/editor visual checks.

Catalog RED (implementer report, pending scoped review):74 focused tests,71 passed and3 new expected failures for named keyboard-focusable table region, scoped onboarding palette/dock clearance, catalog-admin palette/dock clearance. Implementation is in progress; this is not a passing catalog package.

Catalog working evidence (uncommitted, not a final SHA): implementer reports75/75 focusedGREEN including advanced-editor pending-save lock/richdescription. Root loaded `/mira-catalog/list`1440 and actualfixture `/products`1024/390 with one contract-valid controlled product; pageoverflow0. Mobile uses readable cards and adjacentfilter/refresh. Desktophoisted primaryCTA stillorange anddisabledbulkbuttonstillpaleviolet were sent back for scopedfix. Fixtureunknownroutefallback/filter semantics/navigation are being checked; no authenticated, export, filter orpaginationPASS claimed from staticloadeddata. NewIABtab2 navigation initiallytimedout duringNextcompilation, thenloaded; HMRreloadsduringedits arenot productoutagecertification. FinalstableQA deferred untilimplementercommit.

Single initial mapping includes non-menu new/edit/detail/preview. Navigation: lib/panel-ui/navigation.ts and workspace-navigation.ts.

| Route | Presentation entry | Status |
|---|---|---|
| `/` | @/components/dashboard/PanelDashboardHomeView | REFERENCE — no redesign |
| `/accounting` | Inspect route composition | PENDING |
| `/accounting/invoicing-integration` | Inspect route composition | PENDING |
| `/accounting/invoicing-integration/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/accounting/invoicing-integration/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/analytics` | @/components/analytics/CommerceAnalyticsWorkspace | REFERENCE — no redesign |
| `/content` | @/components/merchant-admin/MerchantFamilyOverview, @/components/panel/PanelWorkspaceShell | PENDING |
| `/content/blog` | @/components/merchant-admin/MerchantModuleConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/content/blog/[recordId]/edit` | @/components/merchant-admin/MerchantRecordEditor | PENDING |
| `/content/blog/new` | @/components/merchant-admin/MerchantRecordEditor | PENDING |
| `/content/pages` | @/components/merchant-admin/MerchantModuleConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/content/pages/[recordId]/edit` | @/components/merchant-admin/MerchantRecordEditor | PENDING |
| `/content/pages/new` | @/components/merchant-admin/MerchantRecordEditor | PENDING |
| `/content/policies` | @/components/content/PolicyConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/content/policies/[policyKey]/edit` | @/components/content/PolicyConsole | PENDING |
| `/content/policies/new` | Inspect route composition | PENDING |
| `/customers` | @/components/customers/CustomerListConsole, @/components/customers/CustomerWorkspace | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/customers/[customerId]` | @/components/customers/CustomerDetailConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/customers/[customerId]/edit` | @/components/customers/CustomerEditConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/customers/new` | @/components/customers/CustomerFormConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/customers/segments` | @/components/customers/CustomerTaxonomyConsole, @/components/customers/CustomerWorkspace | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/customers/tags` | @/components/customers/CustomerTaxonomyConsole, @/components/customers/CustomerWorkspace | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/discounts` | @/components/promotions/PromotionStudio | PENDING |
| `/discounts/[promotionId]` | @/components/promotions/PromotionStudio | PENDING |
| `/discounts/[promotionId]/analytics` | @/components/promotions/PromotionAnalytics | PENDING |
| `/discounts/[promotionId]/codes` | @/components/promotions/PromotionCodes | PENDING |
| `/discounts/[promotionId]/edit` | @/components/promotions/PromotionStudio | PENDING |
| `/discounts/lucky-wheel` | Inspect route composition | PENDING |
| `/discounts/lucky-wheel/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/discounts/lucky-wheel/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/discounts/new` | @/components/promotions/PromotionStudio | PENDING |
| `/login` | Inspect route composition | AUTH BOUNDARY — presentation audit only |
| `/marketing` | @/components/merchant-admin/MerchantMarketingOverview, @/components/panel/PanelWorkspaceShell | PENDING |
| `/marketing/email` | @/components/merchant-admin/MerchantModuleConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/marketing/email/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/marketing/email/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/marketing/phone` | @/components/merchant-admin/MerchantModuleConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/marketing/phone/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/marketing/phone/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/marketing/whatsapp` | @/components/merchant-admin/MerchantModuleConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/marketing/whatsapp/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/marketing/whatsapp/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/marketplaces` | Inspect route composition | PENDING |
| `/marketplaces/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/marketplaces/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/orders` | @/components/orders/OrderListConsole, @/components/panel/PanelShell | EXCLUDED — PR75 dependency |
| `/orders/[orderId]` | @/components/orders/OrderDetailConsole, @/components/panel/PanelShell | EXCLUDED — PR75 dependency |
| `/orders/[orderId]/print` | @/components/orders/OrderPrintView | EXCLUDED — PR75 dependency |
| `/orders/abandoned-carts` | @/components/orders/AbandonedCartConsole, @/components/panel/PanelShell | PENDING |
| `/orders/abandoned-carts/[cartId]` | @/components/orders/AbandonedCartConsole, @/components/panel/PanelShell | PENDING |
| `/orders/drafts` | @/components/orders/OrderDraftListConsole, @/components/panel/PanelShell | PENDING |
| `/orders/drafts/[draftId]` | @/components/orders/OrderDraftEditor, @/components/panel/PanelShell | PENDING |
| `/orders/drafts/new` | @/components/orders/OrderDraftEditor, @/components/panel/PanelShell | PENDING |
| `/orders/quick-links` | @/components/orders/QuickOrderLinksConsole, @/components/panel/PanelShell | PENDING |
| `/products` | @/components/catalog/ProductListConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/[productId]` | @/components/catalog/ProductDetailConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/[productId]/preview` | @/components/catalog/ProductStorefrontPreview | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/attributes` | @/components/catalog-admin/CatalogResourceConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/attributes/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/attributes/new` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/auto-import` | @/components/catalog-admin/CatalogImportPreparationConsole, @/components/panel/PanelWorkspaceShell | IN PROGRESS — TASK3 |
| `/products/barcode-labels` | @/components/catalog-admin/BarcodeLabelStudio | IN PROGRESS — TASK3 |
| `/products/brands` | @/components/catalog-admin/CatalogResourceConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/brands/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/brands/new` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/bulk-upload` | @/components/catalog-admin/CatalogBulkImportConsole | IN PROGRESS — TASK3 |
| `/products/categories` | @/components/catalog-onboarding/CategoryManager | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/collections` | @/components/catalog-admin/CatalogResourceConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/collections/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/collections/new` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/definitions` | @/components/catalog-admin/CatalogResourceConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/definitions/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/definitions/new` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/extras` | @/components/catalog-admin/CatalogResourceConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/extras/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/extras/[resourceId]/preview` | @/components/catalog-admin/CatalogExtraPreview | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/extras/new` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/inventory-counts` | @/components/inventory/InventoryCountConsole | IN PROGRESS — TASK3 |
| `/products/inventory-counts/[countId]` | @/components/inventory/InventoryCountConsole | IN PROGRESS — TASK3 |
| `/products/inventory-counts/new` | @/components/inventory/InventoryCountConsole | IN PROGRESS — TASK3 |
| `/products/new` | @/components/catalog/ProductCreateForm | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/price-lists` | @/components/pricing/PriceListConsole | IN PROGRESS — TASK3 |
| `/products/price-lists/[priceListId]` | @/components/pricing/PriceListConsole | IN PROGRESS — TASK3 |
| `/products/price-lists/new` | @/components/pricing/PriceListConsole | IN PROGRESS — TASK3 |
| `/products/purchasing` | @/components/inventory/PurchasingConsole | IN PROGRESS — TASK3 |
| `/products/purchasing/[purchaseOrderId]` | @/components/inventory/PurchasingConsole | IN PROGRESS — TASK3 |
| `/products/purchasing/new` | @/components/inventory/PurchasingConsole | IN PROGRESS — TASK3 |
| `/products/reviews` | @/components/catalog-admin/ProductReviewConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/shopify-converter` | @/components/catalog-admin/CatalogImportPreparationConsole, @/components/panel/PanelWorkspaceShell | IN PROGRESS — TASK3 |
| `/products/tags` | @/components/catalog-admin/CatalogResourceConsole | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/tags/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/tags/new` | @/components/catalog-admin/CatalogResourceEditor | IMPLEMENTED / CODE REVIEW PASS / QA PARTIAL |
| `/products/transfers` | @/components/inventory/InventoryTransferConsole | IN PROGRESS — TASK3 |
| `/products/transfers/[transferId]` | @/components/inventory/InventoryTransferConsole | IN PROGRESS — TASK3 |
| `/products/transfers/new` | @/components/inventory/InventoryTransferConsole | IN PROGRESS — TASK3 |
| `/seo` | Inspect route composition | PENDING |
| `/seo/categories` | @/components/merchant-admin/MerchantModuleConsole | PENDING |
| `/seo/categories/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/categories/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/code-integrations` | Inspect route composition | PENDING |
| `/seo/code-integrations/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/code-integrations/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/content` | @/components/merchant-admin/MerchantModuleConsole | PENDING |
| `/seo/content/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/content/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/fast-indexing` | Inspect route composition | PENDING |
| `/seo/fast-indexing/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/fast-indexing/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/geo-optimization` | @/components/merchant-admin/MerchantModuleConsole | PENDING |
| `/seo/geo-optimization/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/geo-optimization/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/internal-linking` | @/components/merchant-admin/MerchantModuleConsole | PENDING |
| `/seo/internal-linking/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/internal-linking/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/pages` | @/components/merchant-admin/MerchantModuleConsole | PENDING |
| `/seo/pages/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/pages/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/products` | @/components/merchant-admin/MerchantModuleConsole | PENDING |
| `/seo/products/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/products/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/seo/sitemap` | Inspect route composition | PENDING |
| `/seo/social-preview` | Inspect route composition | PENDING |
| `/settings` | @/components/merchant-admin/MerchantFamilyOverview | PENDING |
| `/settings/administrators` | Inspect route composition | PENDING |
| `/settings/administrators/[recordId]/edit` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/settings/administrators/new` | @/components/merchant-admin/render-merchant-record-page | PENDING |
| `/settings/analytics` | @/components/analytics/AnalyticsSettingsConsole | PENDING |
| `/settings/artificial-intelligence` | @/components/toshi-settings/ArtificialIntelligenceSettings | PENDING |
| `/settings/category-showcase` | Inspect route composition | PENDING |
| `/settings/design` | @/components/settings/design/DesignWorkspace, @/components/settings/design/workspace-navigation-model | PENDING |
| `/settings/domains` | @/components/settings/domains/StoreDomainSettings | PENDING |
| `/settings/general` | Inspect route composition | PENDING |
| `/settings/hero-banner` | Inspect route composition | PENDING |
| `/settings/language` | Inspect route composition | PENDING |
| `/settings/marquee` | Inspect route composition | PENDING |
| `/settings/notifications` | @/components/merchant-admin/MerchantModuleConsole | PENDING |
| `/settings/payment` | @/components/settings/payment/PaymentSettingsConsole | PENDING |
| `/settings/payment/[recordId]/edit` | Inspect route composition | PENDING |
| `/settings/payment/new` | Inspect route composition | PENDING |
| `/settings/promotion-banner` | Inspect route composition | PENDING |
| `/settings/shipping` | @/components/shipping/ShippingSettingsConsole | PENDING |
| `/settings/theme` | Inspect route composition | PENDING |
| `/setup` | Inspect route composition | AUTH BOUNDARY — presentation audit only |
| `/toshi` | @/components/toshi/ToshiWorkspace | PENDING |
| `/unauthorized` | Inspect route composition | AUTH BOUNDARY — presentation audit only |

## Evidence

### Catalog working-tree package checkpoint

Serial checks on the settled catalog working tree after `13bb5f0b` (before the following browser-requested fixes): Customer Panel `npm run typecheck --workspace @celebix/customer-panel` exit0; fixture `tsc -p tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/tsconfig.json --noEmit --strict --allowImportingTsExtensions` exit0; `git diff --check` exit0. These are not final-source certification. Available space before/after:11,940,364,288 /10,779,361,280 bytes; no cleanup performed.

Real components in the isolated catalog fixture at port3517: list1440/1024/390 captures inspected; latest1440/390 primary action graphite and disabled bulk action neutral. Product detail1440/1024/390 captured, page overflow0 at each size. At1024, however, the identity column is squeezed and breadcrumb overlaps actions: responsive FAIL pending bounded fix. Media lifecycle tabs render unstyled and empty-media surface needs neutralization. Quick-add390 opens with focus in product name and Escape closes, but focus returns to body instead of opener: keyboard FAIL pending fix. Implementer received all findings before committing.

Fixture contains one controlled product and no next cursor; this does not prove multi-page navigation. Fixture mutations intentionally return409, without persistence or provider calls. Inline captures are not durable screenshot links. No authenticated or live catalog QA claim, no console/network-zero claim during development reloads.

Category working-tree fixture loaded1440/1024/390, captures inspected; measured page overflow0 at1024/390. Mobile selected-category bottom sheet fits form/save controls, but initial AX focus remains on the underlying selected row. Subsequent Tab/Escape attempt timed out in browser-control `Emulation.setFocusEmulationEnabled`; result UNKNOWN, not application failure proof. Duplicate category shell/page heading and equal duplicate create actions were sent for hierarchy correction. Product detail1024 overlap, media tabs/empty surface and quick-add focus-return also remain pre-fix evidence until retested.

Post-commit candidate `fd753440052f7e6aa0a237a7de22f3fe36125a88` (source `0ce402fc`): focused77/77, report read, independent catalog review underway. Browser connection recovered in a new fixture tab. Category390 focus now enters name; Escape closes and returns to selected row. Page overflow0 at390/1024. New regression: hoisted New category/refresh actions are hidden at both390/1024; New category DOM bounds0×0 and absent from AX. Reported to reviewer; action-access FAIL remains open. Earlier passing typechecks precede final focus/hierarchy edits and are not final candidate type certification.

Same candidate: quick-create390 Escape restores focus to Ürün Ekle; detail1024 header now has760px title width, stacked actions and no overlap/overflow; media tabs44px and empty surface neutral. Variant inline form390 save button is reachable (bottom464 before dock783), page overflow0; however thick orange/peach outer decoration and pale-blue inner surface remain, sent to reviewer as an incomplete neutral-form presentation finding. No form submission or real mutation performed during these checks.

Additional controlled-fixture mutation check, same source: edited product name to `Mira QA korunacak taslak`, submitted to the isolated409 transport. UI reports version conflict and explicitly offers server reload; AX confirms the exact draft name remains. This is conflict/draft-preservation evidence only, not successful save, authenticated QA or live mutation. Mobile editing layout page overflow0; normal draft not discarded by the failed response.

Root resolution of catalog review's cross-task questions: existing route imports confirm product/list/detail/new/preview and category routes use owned catalog/onboarding components; collection/brand/attribute/definition/tag/extra list/new/edit routes reuse CatalogResourceConsole/Editor, extra preview uses CatalogExtraPreview, reviews use ProductReviewConsole. This establishes source coverage, not per-route rendered QA. BarcodeLabelStudio does not import the changed catalog-admin module; print route delegates to an unchanged handler generating a self-contained HTML stylesheet with millimetre dimensions (`lib/barcode-label-http/handler.ts:564`), not Panel CSS. Import preparation/bulk consumers do reuse generic primary/list/status/actions styles; their operational layout and print/consumer regressions stay explicitly in Task3/final validation, not assumed PASS. Final combined typecheck/build remains pending by the user's package cadence.

At reviewed source91097ad7: category action-access fix retested390/1024/1440, one visible create action per viewport, page overflow0. New-category390 opens focused on name and Escape restores create-button focus. Native inline screenshots inspected. Final Panel typecheck exit0 (12,136,062,976→11,076,182,016 available bytes; no cleanup). Collection list1440/1024/390 also captured and measured overflow0; existing create/edit/archive affordances remain visible. Brand loaded QA is still blocked by isolated fixture variant-choices HTTP400, not a production outage; Task3 will add that test transport without changing production APIs.

New-product editor1440/1024/390 captured, page overflow0 at all three. Responsive FAIL at1024: summary occupies the wide left column while the form is squeezed into the narrow right column; final fix/review required.390 price/stock inputs are reachable with keyboard/pointer and save bar clears the dock. Duplicate shell/page creation heading remains a hierarchy finding. Attempted dirty-exit QA: filled a controlled draft title and clicked back; browser input operation timed out, subsequent dialog query returned undefined and route was `/products`. This does not establish successful “stay on page” protection; guard result UNKNOWN pending an isolated reproduction/controlled dialog retest, not automatically a product regression or PASS.

Customer baseline15/15 and focused implementation/fix checks10/10 passed. Final customer source `8c6dd65674e278384d97c1fba7c447490d0cf8e6`; scoped round2 review APPROVE, no open Important/Critical customer code findings. QA/plan-only commit13bb5f0b follows it. Fixture helpers committed at `6149af662df292ea5f0f9d846e1913972a193a09`. The browser-fixture customer routes are isolated presentation evidence, no production auth changes. POST fixtures return controlled conflict and never persist. Catalog implementation in progress from13bb5f0b; no push or PR yet.

Screenshots/viewport/overflow/keyboard: PARTIAL, see customer evidence above; inline captures are not durable screenshot links or a complete final matrix. Console/network: no all-route clean claim (development warning and intentional409 fixtures separately recorded). Authenticated preview: NOT VERIFIED.

Extra-preview controlled fixture loaded at1024/390: inline captures inspected, page overflow0; fee and option cards retain neutral hierarchy. Small eyebrow text renders10.88px in#FE6100 on the light surface, insufficient normal-text contrast; final bounded correction/review pending. The screen's “Canlı müşteri görünümü” is its preview label, not evidence of live certification.

Product-review fixture subsequently loaded:1440/1024/390 inline captures inspected and overflow0. Mobile actions stack; text/titles remain neutral and reply field has an accessible label. Entered a controlled reply draft without submitting; Tab reaches Publish and draft remains. Focus outline computes rgba(254,97,0,0.16) solid3px with no shadow, requiring final focus-contrast review rather than unconditional accessibility PASS. Current tab error/warning log query returned[]; this limited observation is not a whole-app console/network certification. No review moderation or real mutation executed.

Commit/push/PR: pending implementation and trigger checks. Merge/deploy/real customer mutations: NONE.
