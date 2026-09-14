# Design settings fixes — A01–A07

Status: implementation and isolated acceptance in progress. No live mutation, deployment or merge.

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

## Final acceptance

Pending: remaining fixes, task reviews, final integrated tests/typechecks/build, after screenshots, final independent review, safe normal push and one PR. Live post-deployment acceptance is explicitly outside this authorization.

## Findings ledger (in progress)

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

## Scope decisions

1. A03 remains bounded to data already available in the frontend workspace; no server projection/API authority is added. Existing Panel example scaffolds and shared renderer are reused, with unresolved content labeled. Cost: the preview remains less complete until a narrowly approved server-projection follow-up.
2. Independent A04–A07 work continues while that A03 dependency stays explicitly open, as requested. Cost: this PR cannot be represented as seven of seven fully closed.
3. Narrow frontend propagation of a non-authoritative recovery scope from already-required session/principal/store context is permitted solely to partition bounded in-memory drafts. No authentication decision or API authority changes. Cost: the extra page prop/helper needs review; volatile recovery does not survive browser process termination and must not cross identity scope or silently save.
