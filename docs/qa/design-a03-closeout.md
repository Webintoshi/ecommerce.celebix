# A03 — real-data preview closeout

Status: **READ-ONLY PREVIEW IMPLEMENTED AND VERIFIED — A03 PARTIAL — LIVE ACCEPTANCE PENDING**.

## Final bounded delivery (supersedes intermediate entries below)

Exact tested application: `d5df7e5aec43bff28ce6d12a3c0a91f1d3ab9b91`. PR #79 remains draft/unmerged, on the same branch and base. A later QA-only commit adds this report, measurements and PNGs; it must not be confused with a new tested application. A01/A02/A04–A07 are preserved; this is not seven-of-seven closure or LOCK GREEN.

Implemented: existing server-session/TenantContext → canonical public storefront identity check → existing READ ONLY product/category repository and permission-checked legacy asset repository → bounded preview-card DTO → current draft composition → shared campaign presenters/renderer. Initial resources are server-prepared; `POST /api/storefront-design/preview` refreshes selected dependencies without save/publish. Source requests are deduplicated and abort/version guarded, with separate loading/empty/missing/unavailable states. No heading/color/viewport-only catalog refresh, arbitrary URL fetch, client storeId authority, private review fallback, shared cache, new grants or migrations.

Budget: one canonical storefront read; one latest list or one48-candidate sale read reused by latest; one bounded read per distinct category; one permitted asset-list read if selected; one detail read per unique hotspot not already loaded. Card transport drops description/variants/SKU/attributes/reviews and limits media to two. Response reading stops at1MiB. See [implementation and RED→GREEN evidence](evidence/design-a03-closeout/implementation.md) for exact commands and permission boundaries.

### Final validation

| Evidence | Result / source |
|---|---|
| Full Customer Panel package test script | **1426 PASS /0 FAIL /1 existing SKIP**, d5df7e5a; groups1372+54PASS. |
| Client/design/shared-renderer focused group |84/84PASS, d5df7e5a. Includes mounted lifecycle, toolbar, canvas, stale/loading and client DTO tests. |
| Server/HTTP/repository/CampaignHome focused group |45/45PASS, d5df7e5a. |
| Composer/contract group |65/65PASS on3780c449; those files/dependencies are unchanged by the final correction. |
| Disposable PG16, real repositories |18/18PASS reported on final implementation tree; exact tracked snapshot equality and unchanged before/after design workspace. |
| Panel / storefront-shared typecheck |Both PASS in implementation-owner final run; both final production builds also completed TypeScript successfully. |
| Panel production build |PASS, d5df7e5a,82 static pages. |
| Storefront-shared production build |PASS, d5df7e5a,27 static pages. |
| Independent integrated review |Approved for explicitly partial delivery; no remaining Critical/Important issue. [Review](evidence/design-a03-closeout/review.md). |
| Diff check |PASS. |

Focused groups overlap full-suite and each other; do not add them into one aggregate total. The existing opt-in pricing guard skip remains. Seven existing platform-config `MODULE_TYPELESS_PACKAGE_JSON` warnings remain in the full-suite output. Intermediate failures are retained below and in the implementation report. During continuation the old process handles were lost; the uncollected final full-suite/build result was not assumed successful and was rerun. Already recorded84/84 evidence was retained.

### Permanent real-projection isolated matrix

| Viewport | PNG | Observation |
|---|---|---|
|1440×1000|[1440](evidence/design-a03-closeout/preview-1440.png)|Two exact PG-snapshot product rows; no document overflow; all toolbar controls48px.|
|1024×1000|[1024](evidence/design-a03-closeout/preview-1024.png)|Same ordered rows/status and reachable toolbar; no document overflow.|
|390×844|[390](evidence/design-a03-closeout/preview-390.png)|Same rows/status; no document overflow; toolbar targets48px.|

[Structured measurements](evidence/design-a03-closeout/browser-results.json):1440 outer/mobile canvas390, both rows retain their product; canonical horizontal card presentation is retained. Enter on the actual product link keeps the fixture URL unchanged. Header modal Escape returns focus to the48px Areas summary with2px solid outline. The final console error/warn capture is empty, **not** an exhaustive clean-network claim. Local server returned200 after restart. Both synthetic CDN product images have `complete:true`, `naturalWidth:0`: **image bytes did not load**. Their safe canonical URL is verified by PG, not successful CDN delivery. The old fixture.invalid banner is disabled and is not new media evidence. The separate product-detail scaffold remains explicitly labelled example content.

Chrome crashed/restarted during testing; restored tabs initially lacked styles and produced1548px overflow at1440. That state was rejected. The orphaned local fixture process was restarted, actual CSS loaded, and only the subsequent passing measurements/PNGs above are acceptance evidence. No live session or data was used.

### Open A03 boundaries

1. Unpublished testimonials have no proven equivalent existing public read path and remain explicitly unavailable.
2. Existing legacy media permissions remain binding; configuration-read-only users without media authority get unavailable, not expanded permissions.
3. Synthetic PG equality covers the first product title/media URL plus full loader payload and unchanged workspace, **not exhaustive full-home renderer/order parity**. Other composition/order behavior is covered by component tests, not labelled full PG parity.
4. Successful synthetic CDN image-byte delivery and corresponding loaded-image visual acceptance remain unproven. No CDN upload or fake success was added.
5. Minor reviewed defect: missing-section status/order is present, but its identifying heading fallback is not rendered (`VisualStorefrontCanvas.tsx:217-218`). Retained explicitly; no post-verification source change.

### Push safeguard and future release

At2026-09-15 approximately07:44UTC, actual authenticated HTTPS Coolify Advanced screens again showed **Auto Deploy OFF / Preview Deployments OFF for Customer Panel, Owner, Storefront and Analytics Worker**. Each latest deployment page showed completed entries only, with the same latest IDs recorded below; this is a latest-page observation, not a global queue API audit. No setting changed. PR base/head re-read07:45UTC remained c09d59a… /4f38c98… before this push. Repository workflow remains non-matching for this branch/base.

Customer Panel is the required future release target for this read path. Shared storefront presentation source changed and its consumer build/regressions passed; enabling Panel preview does not require a simultaneous storefront runtime deployment because no remote storefront API or schema changed. Owner/Worker are not release targets. Any future storefront build will include the verified shared refactor. No application was deployed here.

Live Güzide save/publish, real CDN/media acceptance, real authorized-session preview, published/live visual parity, and publication cache behavior remain untested. Existing staging/domain/payment/auth configurations remain untouched. Next release step is a separately controlled exact-candidate Panel deployment and live acceptance; do not conceal the open A03 data/visual limits as already accepted.

## Source and scope

- PR #79 remains draft and unmerged, base `codex/design-tabs-save-fix-live` at `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`.
- Starting PR head: `4f38c98cef1865611c7d1d4d0fbffe106436afb7` (verified September15,2026).
- Prior tested application: `1badb864b64c3bcc8138f3b6157e6c4bc6c9f085`. Its 148 relevant tests overlap other suites; they are not additive acceptance totals.
- Scope now includes narrow authenticated, read-only server projection preparation/transport. This continuation must not be described as frontend-only.
- A01/A02/A04–A07 and their earlier evidence remain preserved in [the previous report](design-settings-fix.md).
- No live Güzide mutation, merge, deployment, migration, payment, DNS or authentication configuration change is authorized here.

## Data path findings

`PostgresPublicStorefrontRepository` uses READ ONLY transactions and existing host-resolver grants. `public_starter_retail_home` / CampaignHomeProjection resolve published composition, not arbitrary draft JSON. Product row queries can be reused for draft selections; selection semantics include the existing48-item sale scan and section limits, followed by availability filtering.

Low-level `public_campaign_asset` and `public_starter_review_projection` helpers do not have direct application/host-resolver EXECUTE permission. No new grant or SQL function will be introduced. Existing tenant asset-list permissions must be retained. Private admin review projections are not a substitute for public approved-review output. Any unsupported draft source must be shown unavailable and retained as an open A03 limitation.

## Read-only release safeguard observation

Authenticated Coolify Advanced screens, September15,2026 at06:14UTC:

| Application | Auto Deploy | Preview Deployments |
|---|---|---|
| Customer Panel | OFF | OFF |
| Owner | OFF | OFF |
| Storefront | OFF | OFF |
| Analytics Worker | OFF | OFF |

No setting was changed. This observes trigger settings, not an application deployment or runtime identity proof.

At06:20UTC each application's latest deployment list showed only completed entries (no queued/in-progress entry on the latest page): Panel `c9xons49la0cdfkb97ko4hsr`, Owner `i5cdnj4dadq4iqbcee342faz`, Storefront `l894vxpekp211thqfav173rc`, Worker `twxisohfg18kk3498dow9si1` were the latest successful items. These identifiers are observations, not deployments performed by this task. Refresh the safeguards before pushing after a long implementation interval.

The repository's sole current GitHub workflow targets pull requests to `main` and pushes to `codex/self-serve-db-migration-dry-run`; neither is this PR's base/source. It does not authorize or imply a deployment.

## Historical pending list (resolved only where final section explicitly says so)

- New exact application SHA and final PR head.
- Focused tests, real isolated repository path, full Panel suite, affected typechecks/builds and independent review.
- Real-projection isolated screenshots at1440/1024/390, including image-delivery fixture boundaries, console/network and responsive/focus checks.
- Exact supported and unsupported draft sources; query budget and tenant isolation evidence.
- Future deployment applications based on actual diff; live acceptance is not performed in this task.

## Current source verification (intermediate)

Application commit `3780c449531beb1a4a01c0d72aa306e5a108d5fd` contains the read-only preview integration and pure shared presentation extraction. It is not yet the final accepted source.

At07:05UTC the full Customer Panel package test command completed with exit0. It used the exact package script with Node test concurrency4 and ExperimentalWarning suppressed; no test file was omitted. The output summarizer did not preserve the reporter's aggregate counters, so no new numerical total is claimed. The existing opt-in `CELEBIX_PRICING_NEXT_GUARD` skip remains declared in the suite. Seven `MODULE_TYPELESS_PACKAGE_JSON` warnings from existing platform-config modules were observed and not hidden as clean output. The earlier1422PASS count belongs to the previous source and is not relabeled as this run's count. New preview folders also require their separately recorded focused tests.

Independent source review and the production build are still in progress. Controller hook review raised StrictMode disposal and a source-change/revert cancellation edge case for independent assessment and implementation-owner correction; neither is counted as passed here.

Subsequent results on the same application tree: Panel production build PASS (82 static pages; TypeScript included), storefront-shared production build PASS (27 static pages; TypeScript included), server/HTTP/repository/shared-focused group45/45PASS, composer/contracts group65/65PASS. Client/design group74/75PASS: the existing toolbar mounted-test loader lacked the newly imported preview hook alias. A focused repeat reproduced exactly that module-resolution failure (56/57); it is not dismissed as baseline. Implementation owner is updating the test harness, not removing its assertions.

The independent source review identified four Important issues: StrictMode/revert request cancellation, filtered-out missing category states, bubbling click prevention occurring after NextLink navigation, and lack of distinct loading state. All are pending owner corrections and re-review. Early browser measurement passed1440 toolbar/overflow; its old mobile grid selector does not match the new resolved row class, so that driver assertion is not a responsive PASS. The new row intentionally uses horizontal cards at narrow widths; equivalence and card reachability must be assessed against its existing storefront presentation rather than assumed from the old example-grid selector.

Test/fixture commit `bebdca7d` also exports/renames the existing client parser for fixture reuse; it is therefore not a strictly QA-only commit. Implementer reports18/18 disposable PostgreSQL checks. Controller inspection confirms exact loader-result/snapshot equality, first-product title and first-media URL equality against public projection, and before/after workspace equality. This narrow PG comparison is not an exhaustive rendered-home parity test. Browser displays the actual exported product twice in distinct rows. The synthetic product's CDN image has `naturalWidth=0`; this is explicitly NOT successful loaded-media evidence. The old fixture.invalid banner will not be used in the final A03 matrix.

The standalone Panel typecheck overlapped the owner's new failing regression edits and reported the not-yet-implemented `synchronize` method three times. This intermediate run is invalid as immutable-source acceptance; the final source must be checked again. Shared standalone typecheck passed. Existing successful build-included TypeScript results above remain bound to their earlier tree, not the unfinished correction.

## Independent preflight (not final code approval)

Three named risks were independently examined before implementation:

1. Durable session canonical hostname: session SQL selects the tenant's active, verified primary storefront domain. A missing resolvedHost must produce unavailable, not a fabricated hostname. Loader must compare public result ID, slug, hostname and primaryHostname to server authority before further reads.
2. Public product repository is read-only and sends both store ID and hostname into the authorized SQL functions. The repository itself does not compare a Panel TenantContext; the loader must perform that comparison, with a mismatch regression proving no subsequent product query.
3. Whole CampaignHome import is unsuitable: StorefrontFrame mounts cart/favorite providers, Footer loads server data, and app-local route aliases resolve incorrectly in Panel. Only shared pure presentation may be extracted/reused; commerce providers must not mount in preview. Such a shared source change requires storefront consumer typecheck/build/regressions.

This preflight does not replace the final independent diff review or any test gate.

The controller also checked the existing read boundaries: `createPostgresPanelSessionRepository.resolveSession` selects `resolve_panel_session` in a READ ONLY transaction; `PostgresStorefrontDesignRepository.getWorkspace` selects `storefront_design_get` through its read path. The new preview must use those reads without calling rotate/revoke/save/publish/reserveMedia. Static inspection is not substituted for the upcoming isolated no-mutation test.
