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

Complete. Released source is `89cc73218f2a7113f2fd593ca743e45e51621a98` from `codex/settings-approved-ui`. Cemo coordinated the single four-target rollout, followed by the fresh private PostgreSQL backup and final SQL165 application. All four applications are finished and healthy. No remaining P1/P2. Mira independently verified deployed source, SQL evidence, HTTP and authenticated Siora UI acceptance.

A complete WCAG contrast audit was not claimed. The existing muted helper token has a borderline contrast on the canvas; visible principal text and interaction targets were accepted.

## Completed deployment

| Target | Deployment | Result |
|---|---|---|
| panel-net | `i118qvye36lonxaf94h7tkx2` | Finished; exact source/runtime passed |
| panel-site | `thlao99pmks8ndvotngykh9b` | Finished; exact source/runtime passed |
| storefront-net | `purxjjnpyhpxja7aua2qlf52` | Finished; exact source/runtime passed |
| storefront-site | `tq83nl29608yttypk4qgi67m` | Finished; exact source/runtime passed |

- Independent exact-image/source verification:276 per-runtime source hash matches,68 compiled route gates,no mismatch. Both shared panel families cover tenant admin panels, including Siora, Güzide staging and Güzide `.com`/`.com.tr` custom addresses.
- Final private database backup validated before SQL165. Migration committed and assertions passed. Ten of ten design versions,drafts,visible categories and announcements preserved;no drift,missing or additional design. ACL,ownership and RLS checks passed. Final live workspace/public design/public presentation parsers each passed10/10. [Sanitized independent review](evidence/settings-approved-release/live/independent-runtime-sql-review.json).
- Cemo's final raw-configuration preservation guard and global queue-idle verification passed. Automatic/preview deployment and existing payment approval scopes were preserved. Sanitized artifacts summarize the guard;private environment values were not inspected/emitted by Mira.
- [Final live smoke](evidence/settings-approved-release/live/live-final-smoke.json) records normal-client health,anonymous design guards and actual Next streaming redirect/not-found markers.

## Authenticated live presentation

- Siora hub:1680/1440/1024/390px;general1440px;design1440/390px. Correctcanvas,no overflow/brokenimage/unexpectedalert. Settings page headings visually hidden;preview productheading intentionally visible.
- General loads its four editable settings inputs and remains clean,Save disabled. No setting edited/saved.
- Design has seven inline steps and ten realproduct preview options. Selecting a second preview loads correctcontent; saved-but-unpublished draftstatus and pre-existing bannercontent notice remain unchanged. No realdraft edited/published. Consoleerror/warning list empty.
- Güzide correctly requires existing central SSO;this Chrome profile had no authenticatedGüzide session. No authenticatedGüzide interaction claimed. SITEexactsource/runtime/route/HTTP evidence establishes its deployment.
- NormalChrome loads Güzide publicstorefront fully with no consoleerror. DefaultPythonURLlib gets Cloudflare1010/403;browserhealth navigation blockedbyclient. These limits are retained;no bypassattempted. Cemo normal-client/origin healthchecks pass. This is not reported as a storefrontapplicationfailure or all-clientHTTPpass.
- Live screenshots show only genericSettingshub and7stepcontrols;fieldvalues/customerPII notrecorded. [Live measurements](evidence/settings-approved-release/live/readonly-metrics.json).
- Viewportreset,isolateddevserversstopped,testtabsclosed,userexistingtabs preserved. LiveSioraSettings tabretainedforreview.

QA documentation resides on separate `codex/settings-live-qa-evidence`. A first QA-only commit briefly advanced the source branch after deployment; it was safely preserved on the evidence branch and source ref restored using an exact lease. Origin `codex/settings-approved-ui` and all live source pins remain `89cc73218f2a7113f2fd593ca743e45e51621a98`. No deployment was triggered by the documentation update.
