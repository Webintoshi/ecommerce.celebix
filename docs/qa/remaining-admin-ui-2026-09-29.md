# Remaining merchant admin UI — 2026-09-29

## Request and scope

The user authorized revising all remaining merchant screens with the existing Mira design language. The runtime target is the shared `apps/customer-panel`, used by the NET and SITE admin deployments. This record describes implementation verification; the completed deployment is recorded in [shared admin release](remaining-admin-shared-release-2026-09-29.md).

| Area | Preserved primary tasks |
| --- | --- |
| Marketing | Channel overview, campaign search/status, create/edit/archive, provider preparation and history |
| Content | Canonical Blog/Pages/Policies navigation, localized content records, publication controls |
| Marketplaces/accounting | Connection configuration, fiscal identity, provider readiness, preparation and queue controls |
| SEO | Store metadata, sitemap, social preview, public integrations, indexing, geo/internal links, resource SEO records |
| Customers | Search/status/export/paging, addresses and permissions, create/edit/detail, tags and segments |
| Promotions/lucky wheel | Templates, five-step editor, targeting, simulator, lifecycle, codes, reporting and rewards |
| Supplementary catalog/imports | Collections, brands/logos, attributes, extras, definitions, tags, reviews and existing import steps |
| Inventory/pricing | Purchasing, counts, locations/transfers, price rules, variants and server comparison preview |
| Order adjacent | Draft orders, payment links, abandoned-cart lists/detail/recovery |

Approved Dashboard, Analytics, main Products/new/edit, Categories, Orders/detail, Barcode and Settings presentation remains in place. The shared header now suppresses repeated working-page text from the first render. The policy workspace has one semantic heading.

## Design and interaction

- Exact user canvas `#f8f7f5`; shared `--cp-*` graphite/surface/border and restrained Celebix orange tokens.
- Open sections and operational tables; hidden semantic page headings, visible contextual field/section labels.
- No new dependency, external font, raster asset, animation library or production data request.
- Applied filter clearing, meaningful empty/retry states, independent record loading, bounded table scrolling and 44 px targets.
- API save errors retain editor fields; pending saves protect their submitted snapshot. Provider readiness is explicitly distinct from external execution.
- Customer/campaign paging failures retain loaded records. Review replies are stored per record and survive filtering.
- Payment-link creation stays mounted when returning to the list; draft dialogs and archive completion restore keyboard focus.

## Verification

### Automated checks

- Final combined merchant/customer/promotion/payment-link/abandoned-cart/catalog/policy/header selection: **301/301 passed**. It exercises actual pages, client/handler route matrices, permissions, conflicts, replay, stale responses and retained-list behavior.
- Catalog/inventory/pricing/import selection with review draft regression: **105/105 passed**.
- Shared topbar/chrome selection: **12/12 passed**, including route transitions, default title suppression, explicit bridge precedence, context/actions and tenant storefront resolution.
- Final typecheck and production build: **passed** on the finalized source.
- Diff whitespace check: clean. Modified production CSS module references resolve to existing classes.
- Test harness corrections: the header bridge stub now accepts `hideHeading`; review DOM lookup narrows to a textarea; the generic fixture uses an explicit TypeScript import; the existing recovery-link fixture follows the production `/cart/recover#token` URL. These changes do not weaken behavior assertions.
- A missing external dependency symlink was replaced by installing the existing lockfile locally. This restored one module identity for the promotion error trust registry; the three previously failing handler cases pass. Package manifests and lockfile are unchanged.

### Browser checks

Local test-only fixture on port 3742; sample data is synthetic. Browser state is not evidence of a live tenant rollout.

- Catalog/inventory/pricing: all 24 fixture views at 1024 and 390 px; representative desktop captures at 1440 px. Page overflow zero and one semantic heading. Review search/status round trips, location modal focus/Tab/Escape, line add/remove, zero count, transfer validation, rule priority/period and import keyboard tabs checked.
- Order adjacent: all six views plus payment-link form at 1440/1024/390 px. Page overflow zero, one hidden heading and no application console/network errors. Draft error retention, archive focus, payment status filtering and cart paging retry verified with controlled synthetic responses.
- Generic merchant screens: marketing/content hubs, SEO list/modal, marketplace readiness, lucky-wheel form/preview and fiscal identity form checked at 1440/1024/390 px. No page overflow. Search/clear, disclosure Enter, modal Escape/focus return, live preview and failed-save field retention checked.
- Customers/promotions: 390 px list/create/edit/detail/taxonomy, promotion steps/targets/templates/simulator and populated codes/reporting; 1024 px populated lists, customer form, promotion editor/codes/reporting; 1440 px populated promotion editor. Page overflow zero and one semantic heading. Validation focus, form value retention after 409, retained code groups/actions, synthetic CSV download and keyboard scrolling within the report table verified. The shared graphite focus indicator was verified after the final CSS adjustment. Nine direct fixture checks passed, including default empty/503 reads and all four mutation conflicts.

### Limits

- This is frontend verification. No real provider execution, inventory mutation, import or payment was performed.
- Chrome extension file access prevented native file-chooser completion. The isolated import fixture has no server preview POST; import preparation/controller tests cover the preserved behavior.
- Local test resource pressure was resolved by stopping the owned fixture process and clearing regenerable build caches. No source, database or worktree was deleted.
- A final repeat of the 1440 px customer tour and temporary viewport/tab cleanup could not be completed after the Chrome automation connection timed out. Earlier populated 1024/390 checks and 1440 editor checks passed; no further viewport claims are made. Browser test tabs remain ephemeral.

## Independent review

Atlas reviews found and closed: duplicate embedded policy heading; settings retry that could reset dirty fields; small disclosure target; draft archive focus; mobile monetary text size; filtered review reply loss. The remaining review found no action/field loss, production CSS leakage, or API/calculation edits.

## Backend and deployment

Production backend files changed: **NONE**. Contracts, auth/tenant resolution, repositories, SQL, calculation models, environment and infrastructure are unchanged. The fixture-only GET additions provide bounded synthetic browser evidence and keep production routes untouched.

Release status: **deployed to both shared admin applications**. See the [release record](remaining-admin-shared-release-2026-09-29.md) for exact source, runtime and public acceptance evidence.

## Saved evidence

- [Payment links, desktop](artifacts/remaining-admin-ui-2026-09-29/quick-links-1440.png)
- [Payment-link builder, mobile](artifacts/remaining-admin-ui-2026-09-29/quick-create-390.png)
- [Draft editor, desktop](artifacts/remaining-admin-ui-2026-09-29/draft-edit-1440.png)
- [Abandoned-cart detail, mobile](artifacts/remaining-admin-ui-2026-09-29/abandoned-cart-detail-390.png)
- [Interaction checks](artifacts/remaining-admin-ui-2026-09-29/results-interactions.json)
- [Order viewport measurements](artifacts/remaining-admin-ui-2026-09-29/results-1024-390.json)

- [Customer list, tablet](artifacts/remaining-admin-ui-2026-09-29/customers-1024.png)
- [Populated promotion codes, mobile](artifacts/remaining-admin-ui-2026-09-29/promotion-codes-filled-390.png)
- [Populated promotion analytics, tablet](artifacts/remaining-admin-ui-2026-09-29/promotion-analytics-filled-1024.png)
