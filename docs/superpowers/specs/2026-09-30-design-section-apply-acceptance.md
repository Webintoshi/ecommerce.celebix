# Section homepage and direct Apply — accepted

Completed on 2026-09-30. Implementation branch: `codex/design-section-apply`.

## Live release

| Application | Source | Deployment |
| --- | --- | --- |
| Storefront NET | `d5271cba8ae775cfc408c2a28d7488cc389c2fe0` | `bi3gexyyp1g900afmie2rz5f` |
| Storefront SITE | `d5271cba8ae775cfc408c2a28d7488cc389c2fe0` | `qpda56zvb0ui68kjjtbbhsan` |
| Customer Panel NET | `a8d4af83325a8f072a2e040f6914af3e960fee6e` | `rwhkbfc4fjvdrk6igyrqd2bi` |
| Customer Panel SITE | `a8d4af83325a8f072a2e040f6914af3e960fee6e` | `tqsbk6i6941cm4neuz73cn63` |

All deployments finished. Runtime source pins were checked; all four health endpoints returned HTTP 200 / `ok`. Both admin Redis dependencies are ready. Final rollout verification confirmed global idle, preserved build/start commands, hooks, environment row counts, previews and unrelated settings.

SQL178/179 were applied before application deployment from the reviewed single-transaction bundle. A private database backup was taken. All 11 design rows were identical before and after migration; no draft was promoted and no stored design was normalized by migration. Backup credentials, raw configuration and recovery artifacts remain private.

## Verification

- Contracts: 477 passing checks; typecheck passed.
- Native PostgreSQL combined migration / Apply scenarios: 27 passing checks. Includes real TypeScript payload parsing, source identity, authority, immutable replay, conflicts and rollback.
- Migration runner rehearsal: 4 passing checks; unchanged design rows and failure atomicity verified.
- Focused merged backend: 26 passing checks; editor behavior: 58 passing checks.
- Shared adapter checks: 7 passing; merged theme/cart/campaign checks: 35 passing.
- Final storefront and Customer Panel production builds passed.
- Browser acceptance covered insertion between sections, banner slider/stacked modes, duplicate/hide/remove/reorder, Cancel, recoverable save failure, retry, concurrent edits, keyboard focus and 50 mixed sections.
- Layouts checked at 1440, 1024 and 390 pixels. Güzide product rails, mobile cards, footer and explicit full width were checked with the actual shared presenters and theme styles.

## Live acceptance and corrected incident

The first controlled Güzide Apply exposed a React Server Components serialization error: a server callback was passed to the client banner. The correction in `d5271cba` sends plain localized href data for slide and product hotspot links. The new real React Flight regression reproduced the original error and passed after correction across 12 banner layout / presentation / preview combinations. Renderer 16/16, presenter parity 4/4, targeted typechecks and the production storefront build passed.

This correction affects storefront server rendering. Existing admin client previews remain compatible, so the two admin applications retain the accepted `a8d4af83` source. Both storefronts received the correction with a separately reviewed two-target deployment helper; NET LIVE bindings and all previews were preserved.

Authenticated live acceptance at `https://admin.guzidekuyumcu.com/settings/design` verified:

- The editor starts from published content, including the original banner and four categories, rather than the invalid old draft. The Publish/draft UI is gone.
- Editing a category heading and choosing Cancel preserves its original value.
- Direct Apply changes the heading on the actual storefront immediately. Each Apply and restore increments the publication version and operation count exactly once.
- Restoring the original heading returns the complete normalized published document to its original hash. Final publication version is 93; legacy draft version 195, draft content hash and timestamp are unchanged.
- Original banner image URL, category links/order and page headings match the pre-release website after restore; no duplicate banner was introduced.
- The live phone dialog fills the 390×844 viewport; Apply and Cancel remain accessible at bottom 830px. The viewport override was reset and the final dialog closed without changes.

Final sanitized receipts are retained under `.tmp/design-section-apply/release/`; live editor proof is `.tmp/design-section-apply/screenshots/guzide-live-editor.jpg`. These verification artifacts contain no credentials. Existing independent Güzide storefront and brand changes were merged before release.

Product page, typography, brand, header, cart and footer settings use the same direct Apply/Cancel flow. A section-based product-page builder remains the separate future scope defined in the approved plan.
