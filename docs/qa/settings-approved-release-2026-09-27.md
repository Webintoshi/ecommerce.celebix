# Approved Settings — coordinated shared release

## Source and scope

- Settings implementation: `67bc8621`; accessible search/mobile clear target and isolated browser fixtures: `3b9c545f`.
- Final concurrent design fixes: `ff56325482b942dbc2168680836cde9143e5b31b`.
- Exact merged production source: `9ee80f02`; sanitizer/announcement regression assertions updated in test-only `b543ad7f`. The final mobile dock clearance CSS correction is `b5ab994f`.
- Shared customer panel: Settings hub plus 11 existing subpages. Existing API/auth/provider actions are retained. No new provider execution, authorization or live customer mutation was performed for presentation acceptance.
- Storefront, packages and owner Git trees match Cemo's final source byte for byte. Both implementations will use one coordinated four-target release; new application code precedes SQL165.

## Rendered acceptance

Actual components were exercised through CUA in Chrome at 1440×900, 1024×900 and 390×900. [Measurements](evidence/settings-approved-release/viewport-results.json) contain 53 captures, including a duplicate administrator measurement after a failed screenshot write; 52 PNG files were successfully saved.

- Hub, general, language, administrators, invitation dialog, domains, payment, pricing, shipping, notifications, analytics, AI and merged design: no document overflow and no broken image. Canvas is `rgb(248,247,245)`.
- Page headings are visually hidden. The real product heading inside the storefront design preview remains visible, as intended.
- Hub search, clear and `/` keyboard shortcut work; search has a stable accessible name. The mobile clear button was enlarged to 44px.
- General save failure retains editable input; reverting restores the prior values; a valid retry completes and unlocks controls. Dirty forms block refresh/navigation.
- Desktop discard dialog and mobile section picker retain the form on cancel/Escape; the section selection returns to the current page.
- Invitation dialog opens, fits all three widths and closes with Escape. No real invitation is sent.
- Provider/domain/shipping presentation was exercised with read-only fixture authority, avoiding external provider effects.
- Analytics failed save retains all five numeric fields and re-enables editing.
- Merged design has seven inline steps, refreshed resources, real catalog product preview selection and published status unchanged when selecting a preview product.
- Loaded inline homepage manual product picker works at 1440/1024/390. Barcode search finds the bracelet; SKU search finds the necklace; selecting both and moving the necklace up changes the chosen order. At390, picker clientWidth and scrollWidth both356px; reorder/remove targets are44×44px. Kolyeler category image is selected from the real fixture asset list and the control fits all three widths. These isolated design changes autosave only to test data.
- Independent visual review found mobile save actions partly behind the fixed bottom dock. Scoped CSS now offsets the sticky bar above the dock at≤1024. Actual full44px button and center hit-test pass at390×900 and1024×600. Fresh evidence replaces the earlier presentation defect; the old screenshot is retained as history.
- The fixture initially retained old dependency resolution after the merge. It was stopped, generated output removed, and restarted with final dependencies. The final product preview loads correctly; console entries after the clean restart contain no error or warning. Prior stale-session entries were not treated as new release failures.

## Code and behavior gates

- Independent merged design review: no P1/P2; assets/destinations, refresh, previewProductId, publishedDraft comparison/restore, conflict/publish locks, temporary editor fields, archive and paired navigation selections preserved.
- Design/component/lifecycle regression suite: 67/67. Resource/model/loader/hook/client and react-server handler suite: 42/42.
- Final mounted Settings/provider/shipping regression plus production-client browser fixtures: 13/13.
- Original Settings implementation production build/typecheck passed (see coding report). A first merged production build failed with ENOSPC and is not accepted as a pass. Only this worktree's reproducible cache was removed. The sequential merged build passed (compile64s, TypeScript37s,90/90pages and tracing). After the final CSS correction, the final full production build passed: compile30.5s, TypeScript33.1s,90/90pages, tracing and exit0. Evidence log `/tmp/settings-merged-build-mobile-final.log`; exit file `/tmp/settings-merged-build-mobile-final.exit`.

## Release status

Extra inline homepage geometry acceptance is complete. Final post-CSS build and independent visual follow-up review passed. No remaining P1/P2. Coordinated live rollout is pending. No live pin/SQL/deployment has been initiated by Mira.

A complete WCAG contrast audit was not claimed. The existing muted helper token has a borderline contrast on the canvas; visible principal text and interaction targets were accepted.
