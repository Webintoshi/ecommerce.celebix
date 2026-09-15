# Design settings fixes — A01–A07

September15 continuation: the narrowly authorized read-only A03 implementation, newer source/test evidence and remaining limits are recorded in [A03 closeout](design-a03-closeout.md). The following report remains the historical frontend-only acceptance record, not the current A03 scope or source identity.

Status: **FRONTEND FIXES VERIFIED — 6 CLOSED / A03 PARTIAL — LIVE ACCEPTANCE PENDING**. No live mutation, deployment or merge. Final application source: `1badb864b64c3bcc8138f3b6157e6c4bc6c9f085`. Later evidence-only commits do not change that application source.

## Source and protected evidence

- Base canonical: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5` (fresh remote read).
- Branch/worktree: `codex/mira-design-settings-fix` / `mira-design-settings-fix`.
- Coolify Panel running-commit link: same `c09d59a…`; this is management evidence, not a separate container metadata inspection.
- Original [audit](design-settings-audit.md) and its ten [screenshots](evidence/design-settings-audit/) copied unchanged from the original checkout.
- Live target remains staging: https://admin.guzidekuyumcu.com/settings/design. No settings were saved or published there.

## Isolated evidence types

1. Mounted React/happy-dom behavioral regressions use real components/adapters, with external collaborators isolated. These are not live or database acceptance.
2. Browser fixture: real Panel shell and DesignWorkspace at `http://127.0.0.1:3427/design-settings-fix`, synthetic data only; test-only routes persist validated documents to a unique temporary JSON file. It does not use the production repository, identity or credentials.
3. Disposable native PostgreSQL 16: existing SQL authority, unique local Unix socket/temporary cluster, synthetic store. No live database URL. The harness stops and removes only its own generated cluster after execution.

## Before screenshots

Captured before A02/A03/A07 implementation using the current canonical canvas/CSS (A01 work does not affect these screenshots).

| Width | Before | Observed |
|---|---|---|
| 1440 | [PNG](evidence/design-settings-fix/before-1440.png) | Product/category order reversed; second product row missing; custom V3 footer absent. |
| 1024 | [PNG](evidence/design-settings-fix/before-1024.png) | Shared shell hides design toolbar. |
| 390 | [PNG](evidence/design-settings-fix/before-390.png) | Publish button rectangle width 0; document scrollWidth 390. |

The fixture banner deliberately uses a non-customer `fixture.invalid` URL. Its missing-image network error is a fixture limitation, not storefront availability evidence.

## Recorded test evidence (intermediate, not final integrated acceptance)

- A01 task source `e713998f`: focused 59 PASS / 0 FAIL / 0 SKIP; targeted TypeScript PASS. New-section V3 identity review fix `ef3d19f2` passed its mounted regression (3/3) and scoped re-review. A separate product-source switch identity issue is retained for final review/fix; A01 is not fully closed yet.
- Controller subset: 44 PASS / 0 FAIL; Node's existing ExperimentalWarning for transform-types retained. Not an additional full-suite acceptance.
- Existing disposable homepage-builder harness: 14/14 PASS before extending its scenarios.
- Extended harness with actual editor session adapter: 17/17 PASS on `e713998f` plus test-only harness changes. It loads the V3 document, changes header width through the real adapter, saves through `saas.storefront_design_save_draft`, re-reads exact JSON, denies a stale overwrite, publishes, and verifies published JSON plus public presentation. The fixture's homepage at this stage is intentionally empty; non-empty identity/order is covered separately by mounted regressions and original PostgreSQL backfill scenarios.
- Local file-persistence harness on `ef3d19f2` plus test-only scaffolding: actual API client → adapter edit → save → independent GET → stale rejection → publish → independent GET → actual shared renderer output comparison PASS (exit 0). The three non-empty sections, footer and media references remained equal. Command: `node --experimental-transform-types tests/saas-phase3/hemenaku-admin-presentation/design-settings-persistence.mjs`. No mocked fetch response; HTTP goes only to the hardcoded localhost fixture. This is not production repository/auth/catalog or browser E2E acceptance.

## Push safety (read-only management check, 2026-09-14)

| Staging application | Auto Deploy | Preview Deployments | Queue / latest visible completed run |
|---|---|---|---|
| Customer Panel | OFF | OFF | No active item in latest list; success 18:09:32–18:09:49 UTC, `c9xons49la0cdfkb97ko4hsr`. |
| Owner | OFF | OFF | No active item in latest list; success 2026-09-04 04:34:47–04:40:09 UTC. |
| Analytics Worker | OFF | OFF | No active item in latest list; success 2026-09-07 19:38:23–19:39:59 UTC. |
| Storefront | OFF | OFF | No active item in latest list; success 18:15:15–18:17:29 UTC, `l894vxpekp211thqfav173rc`. |

Only the existing GitHub workflow was inspected. Its push branch is `codex/self-serve-db-migration-dry-run`; PR base filter is `main`, with unrelated owner migration paths. This task branch/base and frontend changes do not match. No settings were changed. GitHub CLI authenticated via keyring as `Celebixco`.

Fresh repeat at **2026-09-14 21:20 UTC / 2026-09-15 00:20 Türkiye**: all four actual Advanced-page Auto Deploy and Preview checkboxes remained0/OFF; latest deployment lists still showed the same completed runs and no active item. Owner latest deployment ID `i5cdnj4dadq4iqbcee342faz`; Worker `twxisohfg18kk3498dow9si1`. This was read-only HTTPS management UI inspection, not a global queue API audit. Remote canonical also remained `c09d59a…`; this branch had no existing remote PR.

Before-push trigger repeat at **2026-09-14 21:51 UTC**: Customer Panel, Owner, Storefront and Analytics Worker Auto Deploy and Preview Deployments remained0/OFF on their actual Advanced pages. No setting was changed. Remote canonical was still `c09d59a…`; no task PR existed.

## Final acceptance

Final Panel tests: **1422 PASS /0 FAIL /1 existing SKIP**. Relevant coverage: **148 PASS**, including all original119 tests and29 added regressions. Affected typechecks, final Panel production build, diff-check and independent reviews pass. Exact command/source mappings and the initially failed tests are retained below. Live post-deployment acceptance is explicitly outside this authorization.

Final evidence destinations: [validation commands/results](evidence/design-settings-fix/validation.md), [independent review and follow-ups](evidence/design-settings-fix/final-review.md), [first final correction](evidence/design-settings-fix/final-fix-implementation.md).

The full affected typechecks passed on `8cf59075d9117b6ee16dfcbb4b581290c75144f8`; the subsequent correction changes only scoped canvas CSS and two tests, both separately typechecked. Final production build on `1badb864b64c3bcc8138f3b6157e6c4bc6c9f085` passed, including Panel TypeScript. Persistence and lifecycle source remain unchanged, so their exact8cf59075/45af25dc evidence is explicitly reused instead of relabeled as a new live run.

## Finding-by-finding delivery

| ID / original severity | Root cause | Correction | Regression | Visual / functional result | Remaining dependency |
|---|---|---|---|---|---|
| A01 / P1 | V3 identities/version were lost in editor conversion and replacement. | Version-aware session; strict serialization; stable append/replacement IDs; field-level recoverable error. | Mounted real composer opens all panels, edits, appends and changes latest/sale while preserving literal IDs/order/untouched fields; invalid document does not write. | Isolated functional PASS; no opening/reset write. | Live read-only acceptance after an authorized Panel deployment. |
| A02 / P1 | Shell hid its command slot at tablet/mobile widths. | Single workspace toolbar with existing permission/validation locks and focus restoration. | Mounted toolbar authority; actual Chrome1440/1024/390 and390×480 viewport checks. | Four controls visible, pointer-center reachable, at least48px high; no horizontal overflow; Enter/Escape focus returns with2px solid outline. | Physical mobile soft keyboard not exercised; reduced-height viewport is not an actual-device claim. |
| A03 / P1 | Fixed order/first match omitted repeated rows and V3 footer. | Ordered enabled V3 rows, honest example rows, actual footer options and brand typography; empty remains empty; existing renderer/scaffolds reused. | Actual SSR order/empty/repeated rows/footer/typography/hero-owner/row limits; file and PostgreSQL publication/re-read. | PARTIAL: supported configuration now agrees; no fabricated resolved images, products or reviews. | Workspace lacks server-only CampaignHomeProjection/legacy-asset mapping. Requires a separately authorized narrow projection follow-up; no API/SQL/runtime change included here. |
| A04 / P1 | Debounce cleanup lost unsent input on leaving. | Existing navigation guard plus identity-scoped, bounded in-memory recovery; restored input pauses writes until explicit comparison. | Mounted link/unload/history/back-forward/scope/discard; actual Chrome NextLink→Back→Forward; real page route fixture with opaque scope/key. | CLOSED in isolated acceptance: exact unsaved input recovered; no automatic publish/overwrite. | Volatile recovery does not survive browser process termination/full document reload. |
| A05 / P1 | Conflict had no fresh-version comparison or recovery route. | Explicit read/field diff and deliberate conditional overwrite/discard; second conflict still denied. | Mounted409/reload failure/second409; real file-backed concurrent version change, compare/save/reload; PostgreSQL stale rejection. | Exact input retained and deliberate recovery persists; no blind version bump. | Live concurrent-user scenario not exercised. |
| A06 / P2 | Pre-publish flush rejection escaped handled publish boundary. | Shared handled flush/publish path, clear retry state and synchronous publication lock. | Mounted publish-before-debounce failure/unhandled-rejection guard/explicit retry/permission rejection/queued changes; actual held PATCH with newer edit. | Retry is truthful; old save response does not erase newer edits; reload retains newest value. | Real provider or live publication was not exercised. |
| A07 / P2 | Child responsive CSS followed outer window rather than canvas mode. | Scoped canvas breakpoints for nav/product/category grids; canvas-only override of legacy third-card hiding. | Actual desktop-window/mobile-canvas columns and category grid/duo; effective CSS cascade; Chrome card-visibility assertion. | CLOSED: RED3≠4→GREEN4/4 in both rows at outer390 and1440; product grids2, category grid2/duo1, desktop nav hidden in mobile mode. | No storefront runtime stylesheet change or actual physical-device certification. |

Closure distribution: **A01, A02, A04, A05, A06, A07 closed within isolated frontend acceptance; A03 partial/open for the named server-projection dependency.** This is not seven-of-seven, a live deployment acceptance, or a whole-panel certification.

## Permanent visual matrix

All after images use final application source `1badb864b64c3bcc8138f3b6157e6c4bc6c9f085`; synthetic fixture only. The original ten live audit PNGs are separately preserved unchanged.

| Viewport | Before | After |
|---|---|---|
| 1440×1000 | [Before](evidence/design-settings-fix/before-1440.png) | [After](evidence/design-settings-fix/after-1440.png) |
| 1024×1000 | [Before](evidence/design-settings-fix/before-1024.png) | [After](evidence/design-settings-fix/after-1024.png) |
| 390×844 | [Before](evidence/design-settings-fix/before-390.png) | [After](evidence/design-settings-fix/after-390.png), [viewport](evidence/design-settings-fix/after-390-viewport.png) |

[Working Header editor at390](evidence/design-settings-fix/after-header-390.png), [conflict comparison](evidence/design-settings-fix/conflict-390.png), [history recovery](evidence/design-settings-fix/history-recovery-390.png), [final browser measurements](evidence/design-settings-fix/browser-layout-final.json). Full-page screenshots include the fixed mobile navigation at its viewport position; they are not stitched claims about scrolling behavior.

Console capture on final fixture: no error/warn entries. Server logs show successful200 requests plus deliberately injected409/503 in their respective scenarios. The non-customer `fixture.invalid` banner intentionally does not load. Browser-control timeouts and a transient392.57px width during the existing200ms width animation were not treated as application failures; the driver now waits by bounded rendered-width observations before asserting390px. This is not an exhaustive clean-network claim.

## Future release and live acceptance

Only **Customer Panel** needs a future deployment to deliver this PR's frontend changes. Storefront, Owner and Worker are not release targets for this patch. No deployment is authorized or performed here. A03's future server projection is a separate scope, not a concealed part of this branch.

The new and old domains, current staging session, payment bindings and database settings remain untouched. Live Güzide save/publish, media upload/delete, real concurrency, publication cache invalidation and published-storefront visual comparison were **not** tested. All mutations in this report use synthetic localhost or disposable PostgreSQL data.

## Historical findings ledger (intermediate statuses; final table supersedes these)

| ID / original severity | Root cause | Scoped correction / regression | Current acceptance boundary |
|---|---|---|---|
| A01 / P1 | V3 conversion removed section identities; opening an editor threw before its error boundary. | Version-aware editor session, identity-preserving serialization, field-contained failure; mounted V3 panel tests. | Source-switch identity regression still scheduled for final fix; not closed yet. |
| A02 / P1 | Shared shell hid the entire design command slot at tablet/mobile widths. | One workspace toolbar, 48px controls, keyboard focus and return target; real browser computed visibility/center-hit at three widths. | Intermediate browser PASS; final-source matrix pending. |
| A03 / P1 | First-match/fixed-order preview ignored repeated sections and V3 footer. | Ordered V3 configuration summaries, repeated product example rows, actual footer options, honest unresolved media/catalog labels; SSR behavior tests. | PARTIAL: complete storefront media/catalog fidelity requires the server-only CampaignHomeProjection/legacy asset resolution not supplied to this workspace. No API/runtime change included. |
| A04 / P1 | Leaving before debounce discarded unsent input without a guard. | Draft lifecycle implementation in progress. | Pending. |
| A05 / P1 | Conflict retained obsolete expected version without a recovery path. | Controlled conflict read/compare/recovery in progress. | Pending. |
| A06 / P2 | Pre-publish flush rejection occurred outside the handled boundary. | Shared flush/publish failure handling and retry in progress. | Pending. |
| A07 / P2 | Preview width changed, but child breakpoints followed the outer window. | Canvas-scoped responsive styles; real browser mobile-mode measurements. | Intermediate PASS: 1440 outer / 390 canvas; product grids2 columns; category grid2, duo1; hidden desktop navigation. Final-source rerun pending. |

Category interaction evidence at `3a704338`: the synthetic `Giyim · izole QA` selection was made through the actual homepage modal, autosaved, and retained after a full reload. Both category layout radios were exercised. These measurements verify frontend layout and local-file persistence, not real storefront catalogue/image resolution.

Lifecycle browser evidence at `a20adfe4378a786f6a858e3b2bd678afe66f00db` (intermediate, history-navigation fix still pending):

- Real localhost file fixture rejected the next save. Editing the banner displayed `Kaydedilemedi`, retained the exact local heading, and exposed an explicit retry. Retry saved; a full browser reload read the same heading from the file-backed endpoint.
- A synthetic second session advanced the persisted version. The next local edit produced conflict; explicit comparison fetched the latest draft and showed separate banner/promotion differences without replacing local input. Deliberate overwrite performed a conditional save; full reload preserved the chosen local heading.
- [390px conflict screenshot](evidence/design-settings-fix/conflict-390.png): viewport/document width390, all three recovery buttons322×48. Error/warn console capture empty; this does not claim an exhaustive network trace. No live data or session was used.
- Independent review found same-document browser Back/Forward was not covered by the existing unload/link guard. A04 remains pending that fix and regression; successful retry/conflict scenarios do not close it.

History follow-up at `45af25dc9287505392e64ad8b7cffcf7111b29f3`: three new mounted history cases RED→GREEN, full focused design-folder53/53 and Panel typecheck passed. Actual Chrome/Next acceptance used a synthetic local history landing route and NextLink navigation, then a rejected save. Browser Back left the workspace; Forward restored the exact unsaved heading with automatic writes paused and publication disabled. Explicit comparison showed the different file-persisted heading; explicit discard restored that saved value. [390px recovery](evidence/design-settings-fix/history-recovery-390.png). Captured console error/warn list empty. Recovery is bounded volatile memory, not durable browser storage or authenticated live acceptance. Scoped re-review pending.

The scoped history re-review subsequently passed with no new breakage. On unchanged application source, actual browser queued-edit acceptance also passed: the first PATCH was held, a newer heading entered, then release allowed both serialized saves. The older response did not overwrite the newer heading, and a full reload retained the newest value. [Structured interaction evidence](evidence/design-settings-fix/browser-interactions.json). Fixture logs showed the intentionally injected503/409 and successful200 save/read responses; no exhaustive network-clean claim is made.

## Scope decisions

1. A03 remains bounded to data already available in the frontend workspace; no server projection/API authority is added. Existing Panel example scaffolds and shared renderer are reused, with unresolved content labeled. Cost: the preview remains less complete until a narrowly approved server-projection follow-up.
2. Independent A04–A07 work continues while that A03 dependency stays explicitly open, as requested. Cost: this PR cannot be represented as seven of seven fully closed.
3. Narrow frontend propagation of a non-authoritative recovery scope from already-required session/principal/store context is permitted solely to partition bounded in-memory drafts. No authentication decision or API authority changes. Cost: the extra page prop/helper needs review; volatile recovery does not survive browser process termination and must not cross identity scope or silently save.
4. Reuse an existing independent review seat after both attempts to obtain the highest-capability reviewer hit the tool's thread limit. The reviewer authored no implementation. Cost: less fresh context and lower reviewer capability could miss a cross-task defect; independent scoped re-review and integrated acceptance remain required.
5. The subsequent full-suite/browser gate exposed two defects beyond the original final-review findings. Complete one additional narrowly bounded frontend/test correction under the user's explicit finish-fixes requirement, rather than park them solely because the process skill normally caps final fix waves. Cost: an extra correction/review cycle and validation time; scope must stay canvas CSS and the exact test fixture. No additional backend or live authority is inferred.
