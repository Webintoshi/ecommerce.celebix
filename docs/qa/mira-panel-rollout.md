# Mira Customer Panel Rollout

Status: IN PROGRESS — no live certification or deployment.

Branch: codex/mira-panel-rollout-v1. Base: 455a4a538f4ff78915d38d37247956949aa2f15e. Existing Orders PR75 and archive branches untouched.

## Approved scope and method

Use existing Mira/Dashboard/Analytics primitives; user palette overrides older skill canvas/border. No new theme/sidebar/global CSS. Preserve actions, authority and API behavior. Focused tests during changes; typecheck/visual QA per 2–3 modules; full Panel tests/typecheck/build at final delivery. Fixtures are not authenticated QA.

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
- Customer package source commit: `630ce77d30105292dc8f64f40b850828f52b4ef5`. `npm run typecheck --workspace @celebix/customer-panel` completed exit0 on this source. Full tests/build and task review remain pending. Source fixture helpers are still uncommitted and are not covered by the Panel tsconfig.
- Fixture validation: default acceptance-app tsconfig check exited2 (strictfalse / missing `.ts` import option generated broad compiler diagnostics); no baseline reproduction is claimed. Rechecking the same app with `--strict --allowImportingTsExtensions` (matching the passing Panel compiler policy) completed exit0 with an empty log `/tmp/mira-rollout-fixture-typecheck.log`. No config or application validation was weakened.
- Additional keyboard fixture check: Tab moved from first-name to last-name with visible focus ring at1440; current new-customer page console read returned no error/warning entries. This is not an all-route clean-console assertion. New/edit desktop captures inspected. Address add/remove in edit changed only local unsaved form controls; no customer save issued.
- Push safety partial check: the sole tracked workflow `self-serve-db-migration-rehearsal.yml` targets `codex/self-serve-db-migration-dry-run` pushes and `main` PRs with unrelated paths; it is not a deployment workflow. Historical Orders checkpoint records all four staging Auto Deploy settings OFF, but that history is not a fresh settings check. No rollout push until current trigger configuration is verified.

| Screen | Missing capability | User impact |
|---|---|---|
| Customer archive | Current customer client has archive but no restore endpoint | No fabricated restore action added; backend capability must be supplied before a genuine restore action can be exposed. |

## Route inventory

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
| `/customers` | @/components/customers/CustomerListConsole, @/components/customers/CustomerWorkspace | IN PROGRESS |
| `/customers/[customerId]` | @/components/customers/CustomerDetailConsole | IN PROGRESS |
| `/customers/[customerId]/edit` | @/components/customers/CustomerEditConsole | IN PROGRESS |
| `/customers/new` | @/components/customers/CustomerFormConsole | IN PROGRESS |
| `/customers/segments` | @/components/customers/CustomerTaxonomyConsole, @/components/customers/CustomerWorkspace | IN PROGRESS |
| `/customers/tags` | @/components/customers/CustomerTaxonomyConsole, @/components/customers/CustomerWorkspace | IN PROGRESS |
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
| `/products` | @/components/catalog/ProductListConsole | PENDING |
| `/products/[productId]` | @/components/catalog/ProductDetailConsole | PENDING |
| `/products/[productId]/preview` | @/components/catalog/ProductStorefrontPreview | PENDING |
| `/products/attributes` | @/components/catalog-admin/CatalogResourceConsole | PENDING |
| `/products/attributes/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/attributes/new` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/auto-import` | @/components/catalog-admin/CatalogImportPreparationConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/products/barcode-labels` | @/components/catalog-admin/BarcodeLabelStudio | PENDING |
| `/products/brands` | @/components/catalog-admin/CatalogResourceConsole | PENDING |
| `/products/brands/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/brands/new` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/bulk-upload` | @/components/catalog-admin/CatalogBulkImportConsole | PENDING |
| `/products/categories` | @/components/catalog-onboarding/CategoryManager | PENDING |
| `/products/collections` | @/components/catalog-admin/CatalogResourceConsole | PENDING |
| `/products/collections/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/collections/new` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/definitions` | @/components/catalog-admin/CatalogResourceConsole | PENDING |
| `/products/definitions/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/definitions/new` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/extras` | @/components/catalog-admin/CatalogResourceConsole | PENDING |
| `/products/extras/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/extras/[resourceId]/preview` | @/components/catalog-admin/CatalogExtraPreview | PENDING |
| `/products/extras/new` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/inventory-counts` | @/components/inventory/InventoryCountConsole | PENDING |
| `/products/inventory-counts/[countId]` | @/components/inventory/InventoryCountConsole | PENDING |
| `/products/inventory-counts/new` | @/components/inventory/InventoryCountConsole | PENDING |
| `/products/new` | @/components/catalog/ProductCreateForm | PENDING |
| `/products/price-lists` | @/components/pricing/PriceListConsole | PENDING |
| `/products/price-lists/[priceListId]` | @/components/pricing/PriceListConsole | PENDING |
| `/products/price-lists/new` | @/components/pricing/PriceListConsole | PENDING |
| `/products/purchasing` | @/components/inventory/PurchasingConsole | PENDING |
| `/products/purchasing/[purchaseOrderId]` | @/components/inventory/PurchasingConsole | PENDING |
| `/products/purchasing/new` | @/components/inventory/PurchasingConsole | PENDING |
| `/products/reviews` | @/components/catalog-admin/ProductReviewConsole | PENDING |
| `/products/shopify-converter` | @/components/catalog-admin/CatalogImportPreparationConsole, @/components/panel/PanelWorkspaceShell | PENDING |
| `/products/tags` | @/components/catalog-admin/CatalogResourceConsole | PENDING |
| `/products/tags/[resourceId]/edit` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/tags/new` | @/components/catalog-admin/CatalogResourceEditor | PENDING |
| `/products/transfers` | @/components/inventory/InventoryTransferConsole | PENDING |
| `/products/transfers/[transferId]` | @/components/inventory/InventoryTransferConsole | PENDING |
| `/products/transfers/new` | @/components/inventory/InventoryTransferConsole | PENDING |
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

Customer baseline running. tests/.../browser-fixture/app/mira-customers routes are isolated presentation evidence, no production auth changes. POST fixtures return controlled conflict and never persist.

Screenshots/viewport/overflow/keyboard/console/network: NOT YET VERIFIED. Authenticated preview: NOT VERIFIED.

Commit/push/PR: pending implementation and trigger checks. Merge/deploy/real customer mutations: NONE.
