# Approved policies frontend

Baseline: `89cc73218f2a7113f2fd593ca743e45e51621a98` (shared settings release).
Branch: `codex/policies-approved-ui`.

## Primary task and preserved functions

Edit and publish one of the seven existing fixed storefront policies. Existing names, routes, saved publication states, timestamps, list refresh, read-only access, close, body editing, formatted preview, save/version handling and explicit conflict recovery are retained. Creation, archive and deletion remain unavailable, matching the existing fixed-policy model.

The approved HTML direction is implemented as a compact policy picker and inline editor on the `#f8f7f5` canvas. Content workspace tabs remain. No repeated visible working-page heading or promotional text. The mobile picker replaces the desktop list; the save bar sits above the shared mobile dock. Two small inline SVG illustrations and the existing icon/font system are used.

## Editing and data safety

- Visual editor loads separately using existing Tiptap dependencies.
- Loading, switching views or policies, and read-only inspection leave the original HTML/Markdown source intact.
- Actual visual edits use the existing shared safe HTML representation and sanitizer. Unsupported structures stay source-editable instead of being silently flattened.
- Source and preview tabs remain available. Side-by-side preview is optional on wide screens.
- Publication choice is distinct from the saved publication status. One primary Save action submits the existing exact API contract.
- UTF-8 100,000-byte bound and rendered-empty publication checks prevent invalid dispatch.
- Drafts stay independent per policy. Busy operations lock edits and selection synchronously.
- Version conflicts preserve local text. Failed canonical reads and unknown commit outcomes block mutation until explicit recovery. An already-committed matching record is reconciled without another mutation.
- Explicit revert uses a native confirmation dialog. Navigation guards preserve drafts; same-document returns can restore browser-memory snapshots scoped by an opaque session/principal/store hash. No persistent storage, history payload or new authority is introduced. Fresh version comparison runs before a restored draft can save.

Backend/API/repository/SQL/auth/infrastructure files changed: **NONE**. The two server page edits only provide the existing frontend recovery scope pattern; access rules are unchanged. No new dependencies.

## Verification

- Customer Panel TypeScript verification passed.
- 34 focused frontend/editor/client/navigation tests passed.
- 8 existing policy HTTP/runtime authority tests passed.
- Scoped policy presentation/transport fixture tests passed.
- Read-only Atlas code and screenshot review: approved; no actionable findings.
- Local real app compiled and rendered with its shared panel shell. Desktop 1440px: zero horizontal overflow, all enabled operation buttons at least 44px, canvas confirmed `rgb(248,247,245)`. Mobile 390px screenshot confirms collapsed picker and save bar above the shared dock.
- Final loaded-state browser QA completed at 1440, 1024 and 390px after the connection recovered. Horizontal overflow was zero at all three widths; all enabled main operation targets were at least 44px. Mobile save bottom: 780px; dock top: 783px.
- Source edits survived policy switches, arrow-key tab selection opened the preview, Save reconciled its canonical record, the native revert dialog initially focused Cancel, cancellation retained the text, and Ctrl/Command-S saved the mobile draft. Browser error/warning log was empty.
- Screenshots: `/Users/Celebix/.codex/visualizations/2026/09/25/01a0d5e7-979f-74e0-a9a5-657befede0df/policies-implementation/{desktop-1440,tablet-1024,mobile-390}.png`. Dimensions verified against the requested viewports.
- Full Customer Panel optimized production build passed, including TypeScript and route generation. No deployment was performed in this coding turn.
- Earlier host disk exhaustion and browser disconnection were resolved. Only this worktree's generated fixture cache was removed; local fixture opt-in memory cache keeps QA disk use bounded.

## Local review

`http://127.0.0.1:3742/content/policies?session=review-29`

Test-only fixture scenarios: `normal`, `readonly`, `loading`, `empty`, `list-error`, `save-error`, `conflict`, `conflict-refresh-error`, `commit-unknown`, `slow-save`. These use only synthetic data and never connect to a live store.
