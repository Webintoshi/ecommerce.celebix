# A03 real-data preview closeout

Spec: `/Users/Celebix/.codex/attachments/bf1a5457-b71e-4ce9-b727-c01beef3ce36/pasted-text.txt`.

## Goal and architecture

Connect the existing authenticated DesignWorkspace to read-only storefront projection resources, retaining the published storefront's selection, media and section composition rules. Keep draft editing independent of persistence. Reuse CampaignHomeProjection, composeCampaignHomeSections, existing campaign presenters and StorefrontDesignRenderer; do not create a second theme engine.

## Global Constraints

- Same worktree `/Users/Celebix/Documents/ChatGPT/mira-design-settings-fix`, branch `codex/mira-design-settings-fix`, PR #79. Starting head `4f38c98cef1865611c7d1d4d0fbffe106436afb7`; base `c09d59a21944fb24ef82cf904db5e444ec1d4fd5`.
- Preserve A01/A02/A04/A05/A06/A07, section IDs, autosave/publish and bounded volatile draft recovery.
- Read-only server preparation/handler allowed. No SQL/migration/auth permission changes, new credentials, arbitrary server URL fetch, shared cache, whole-catalog download, live mutation, merge or deploy.
- Authority exclusively from current server session/TenantContext plus existing configuration.read and resource permissions. No client storeId authority. Public host from matching durable resolvedHost; verify public store identity before reading.
- Real data unavailable is never replaced by apparently real examples. Separate empty, unavailable, missing media and loading.
- Preserve frontend navigation/focus/toolbar and canvas responsiveness. Actual storefront content may keep its own established theme styling.
- Only controller pushes after reading Auto Deploy/Preview state; agent commits exact scoped paths only. Independent review required.

## Verified constraint and decision

Existing public_starter_retail_home accepts published composition only. Product read repositories are available under the existing host-resolver role, in READ ONLY transactions. Low-level legacy asset and review projection functions are not directly granted. Asset list is permitted only to existing media-management roles; configuration.read alone does not grant it. Reuse authorized asset listing where permitted and safe published media otherwise. Reuse published reviews only when their original source/limit/rating signature proves equivalence. Never widen permissions or substitute private admin review rows. If arbitrary draft testimonial selection cannot be satisfied by existing public functions, show unavailable and report A03 partial explicitly. This is an evidence-based scope limit, not an invented implementation shortcut.

## Function inventory

Primary task: inspect actual storefront data while editing unpublished design.
Visible information: draft brand, hero, ordered enabled sections, product rows, media, footer; publication and save status.
Actions: toolbar surface selection, desktop/mobile, editor open/close, edit/upload, autosave, publish, recovery/conflict actions, guarded navigation.
Preserve all current actions and read-only states. Preview itself does not perform commerce or persistence mutations.
Pattern: existing settings workspace, no redesign.

### Task 1: Read-only projection integration and focused regressions

Single implementation owner. Read the spec and current code before editing.

Files: narrowly add Panel `lib/server-storefront-design-preview/`, preview HTTP/client/model/hook modules alongside existing design modules; integrate `app/settings/design/page.tsx`, `DesignWorkspace`, `DesignPreview`, `VisualStorefrontCanvas`. Reuse/extract pure campaign section/product presentation from `apps/storefront-shared/components` only if needed to avoid importing cart/auth/client commerce runtime into Panel. Existing storefront rendering output and behavior must remain equivalent. No source ownership overlap with controller QA.

1. Add failing tests before implementation for missing server-to-workspace resources, request-source deduplication, latest/category/sale rows and limits, stable IDs/order, stale response, cross-tenant refusal and no mutation. Capture RED.
2. Implement a bounded read-only loader using PostgresPublicStorefrontRepository and existing authorized legacy asset list. Reuse the already approved Panel DB configuration/pool if practical; do not add environments/permissions. Canonical hostname must be durable and belong to the tenant. Never client-fetch a storefront host or copy credentials.
3. Requests carry strict parsed draft input or minimal bounded selection only, no authority IDs. Same-origin authenticated POST preview-read may use existing request/session/origin validation, explicitly configuration.read, no manage requirement merely because HTTP method is POST. No-store, safe errors and finite response parsing. Keep write handlers' protections unchanged.
4. Initial server-prepared resources reach workspace. A separate abort/version-protected preview hook refreshes on selected source/media dependencies, not headings/colors/viewport/order. Source results are keyed independently and shared within one request; immutable latest input is recomposed with current draft so old labels/IDs cannot overwrite it. No new cross-request cache system.
5. Compose a draft CampaignHomeProjection from current normalized composition and safe resources. Use exact row rules from migration 113 (sale public list48, discounted filter, limit, then available; category/latest limit then available). Reuse published categoryShowcase single authority through composeCampaignHomeSections. Resolve selected legacy assets only from tenant-owned permitted resources; never transport object keys. Unsupported/missing resources have truthful per-section states. Testimonials require proof of source equivalence to existing public review output; no private review fallback.
6. Render actual products/media through shared existing campaign presentation and shared renderer. If extraction is needed, prefer a small pure content component with injected non-mutating preview actions; storefront retains its existing interactive wrapper. No cart/favorite/API actions run from preview. Maintain footer/brand and empty-home behavior.
7. Tests cover the user's ten scenarios, real loader/repository path in isolated synthetic context, and related current regressions. Add/reuse disposable PG harness if needed; do not claim mocked DB rows as real PG. Add fixture wiring/real local images if it shares source interfaces; controller handles browser captures after final source.
8. Run focused tests/typechecks during iteration, self-review, commit scoped source/test files. Do not run full Panel suite/build yet (controller once integrated). Report exact source changes, RED/GREEN evidence, query/permission budgets, remaining gaps, and any affected storefront consumer.

### Task 2: Independent review and final verification

Controller-owned after Task 1. Review the complete implementation diff independently, resolve findings through implementation owner with covering tests. Run relevant tests, full Panel suite once at accepted app SHA, affected typechecks, production Panel build and narrow storefront regression/build as required by changed shared sources. Preserve baseline skip/warnings; avoid double-counting overlapping suites. Validate real projection fixture in Chrome at1440/1024/390 including loading/error, source refresh, media load, focus and overflow. Capture source-bound PNGs and record console/network observations. Never claim live acceptance.

### Task 3: PR closeout (no merge/deploy)

Controller-owned: write A03 evidence/report with honest closed/partial status, future deployment impact and remaining live checks. Read four staging Auto Deploy/Preview settings and queue state before normal push. Preserve user files and source branch; update PR #79 description to state read-only server/handler scope. QA-only final commit may follow tested application SHA without rerunning unchanged source tests.
