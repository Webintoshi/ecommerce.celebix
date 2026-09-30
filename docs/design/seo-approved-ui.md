# SEO visual workspace — approved implementation

The user approved the interactive HTML SEO design and shared-panel publication on 2026-09-30.

## Primary tasks and function inventory

- `/seo`: scan real URLs, inspect findings and open/fix their source. Keep sitemap, internal links and IndexNow tabs.
- `/seo/content`: server search products/categories/pages/blog and edit versioned meta, canonical and indexing fields, with an effective search-result preview.
- `/seo/settings`: edit store defaults, social sharing and active/default/current image selection, verification tokens, indexing and IndexNow settings.

Preserve explicit scan start and bounded polling; checked/total/status/time; published/total resource counts; maximum200 prioritized findings; safe same-origin public URL and fix links. Sitemap retains actual XML/robots addresses, URL count, indexing preferences and Search Console. Links retain server-paged source/target search, anchor, enable/disable, edit, confirm removal and conflict recovery. Notifications retain paginated catalogue selection across types,100-selection maximum, eligibility gating, submission and latest100 events with HTTP/attempt/retry/time values. Content retains four kinds, missing custom-meta filter, pagination, manage-source links and exact expectedVersion/expectedSeoVersion. Settings keep exact version/idempotency and all image/verification/index controls.

## Design boundaries

Existing Customer Panel shell and dialogue; global tokens; user canvas `#f8f7f5`; open sections and thin separators; local SVG charts and real resource/asset images. Semantic hidden page title and at most one primary action per working screen. All read-only, loading, empty and failure states remain actionable. Dirty forms warn before leaving and survive failed writes.

No API, HTTP, SQL, contract, tenant authority, owner or storefront change. Graphics use published coverage, checked progress, displayed finding groups, actual link edges and latest100 notification statuses. A checked URL is not necessarily successful. Findings can repeat; sitemap URL count is not a funnel from resource counts. No SEO score, traffic, Google ranking, inferred index success or invented trend.

## Implementation and release

Parallel ownership: Overview/Links; Content/Settings; shared visuals/CSS/integration/release. Final coordinated base c54f17a7 (live POS code dabec3f1) preserves Collections, SEO183 and POS/SQL184. Wait for the cooperating POS release's final idle queue before taking a new raw configuration snapshot. Use a guarded sequential exact-source release for panel_net and panel_site only.

Acceptance: current contract/behavior regressions, typecheck/build, genuine application fixtures at1440/1024/390, keyboard/dialog focus and page overflow, independent review, source/provider/runtime verification and public tenant health/entry checks. No real merchant content saved during acceptance.

The earlier standalone file URL was blocked by browser policy. Application acceptance uses a genuine local Next application and disposable injected data, not a re-served copy of the blocked artifact.

## Acceptance record

- Genuine application rendered at1440,1024,390px: control/content/settings/sitemap/links/notifications, real thumb and SVG visuals, empty/loading/error. The mobile link table initially exposed positioned hidden labels outside its scroll region; containing positioning fixed document width to390px.
- Native content editor fits phone viewport; clean Escape returns to trigger. Dirty close keeps one dialog. Failed save retains input, successful save restores stable trigger/search focus. Cross-page notification selections stay intact. Browser console has no errors/warnings in fixture paths.
- Independent source review repaired cleared custom-field previews, missing-filter save membership/count and failed-page reads. Link graph label lookup bounded to firstfour graph edges, maxeight references; catalogue is not preloaded.
- Disposable injected fixture saves only; merchant SEO content and provider execution were not modified during acceptance.

- Final focused SEO HTTP/UI/behavior and preserved POS regression gate:59/59 PASS; final customer-panel production build including TypeScript PASS. No dependency added.
