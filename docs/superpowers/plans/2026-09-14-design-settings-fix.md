# Design Settings Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve audit A01–A07 without altering live store data or runtime contracts.
**Architecture:** Keep the existing versioned design document and shared renderer. Correct the editor adapter, then scoped canvas/toolbar rendering, then the existing workspace save lifecycle; no new theme engine or backend authority.
**Tech Stack:** TypeScript, React 19, Next 16, node:test, happy-dom, existing disposable PostgreSQL harness.
**Spec:** /Users/Celebix/.codex/attachments/04632d2f-79d0-421e-9524-5d189e06db4d/pasted-text.txt
**Audit:** /Users/Celebix/Documents/ChatGPT/Saas-Celebix/docs/qa/design-settings-audit.md

## Global Constraints

- Work only in /Users/Celebix/Documents/ChatGPT/mira-design-settings-fix on codex/mira-design-settings-fix, base c09d59a21944fb24ef82cf904db5e444ec1d4fd5.
- Preserve supported contract versions, stable sectionId, ordering, visibility, media references and untouched selected fields. No validator relaxation, type assertion/any to hide errors, defaults replacing invalid input, new schema, API/repository/SQL/auth changes.
- No live mutations, deployment, migration, payment rebind, DNS/configuration changes, merge or force-push. Controller alone checks triggers and pushes/opens one PR.
- Preserve original audit and 10 PNGs. Only frontend helpers proven necessary and relevant tests/QA are in scope.
- Each implementation task must record reproduction, failing behavioral regression, minimal fix and passing evidence. Keep existing 119 relevant tests; no source-regex-only new regressions.
- Full Panel tests/typecheck/build run once on integrated final source, not each edit. Existing APIs may be mocked for UI tests but not labeled durable persistence evidence.
- Do not spawn further agents. Commit only task-owned files; do not bulk-stage QA/user files.

### Task 1: A01 — lossless editor conversion and safe field opening

**Files:** `apps/customer-panel/lib/starter-theme-composer-model.ts` and its tests; `components/settings/StarterThemeComposer.tsx`, `components/settings/design/DesignStepEditor.tsx` and relevant component tests. A narrow new editor adapter/test helper beside these files is permitted if it prevents duplicating serializers.
**Interface:** consume `StorefrontDesignDocument.composition` in its existing supported versions; preserve V3 output and stable IDs when editing V3. Do not change shared contracts. Existing callbacks must retain the same full document authority.

- [ ] Read audit A01 and spec section 2. Reproduce the existing valid V3 default crash with the existing adapter before editing code.
- [ ] Write behavioral regression: valid V3 sections with distinct IDs and selected non-default footer/navigation/product/cart values open every composer panel without write callbacks; change one field; parse the resulting full save payload and assert all untouched fields, section identity/order and media references unchanged. Cover legacy supported versions and invalid input with explicit error/no callback. At minimum the regression must assert `result.sections.map(s => s.sectionId)` equals a literal ID list and `result.footer` equals the supplied untouched fixture footer, not rebuilt defaults.
- [ ] Run focused node tests; record the expected RED failure. Fix only conversion and error presentation: no implicit downgrade, no initialization autosave, no swallowed default. Keep draft outside a recoverable editor error boundary.
- [ ] Re-run focused regressions plus existing composer/model tests, inspect own diff, commit only this task. Write red/green commands/results and any downstream interface effect in the task report.

### Task 2: A02/A03/A07 — accessible toolbar and faithful draft canvas

**Files:** `components/settings/design/VisualStorefrontCanvas.tsx`, `DesignPreview.tsx`, `DesignWorkspace.tsx` (toolbar/labels only), `components/settings/design-settings.module.css`; narrowly scoped shared renderer frontend helper/CSS only if needed; relevant tests. Do not alter storefront runtime behavior.
**Interface:** Consume existing normalized composition and local `previewMode`; preserve Task 1 document callback types. Save lifecycle remains Task 3-owned. Share CSS with Task 3 only by additive scoped classes.

- [ ] Add RED real-render tests for ordered visible sections, multiple product rows, intentionally empty homepage, V3 footer groups/options and retained brand/typography. Expected order example is literal `['FIRST_PRODUCTS', 'SECOND_CATEGORIES', 'THIRD_PRODUCTS']`; no fabricated sections when input is empty. Use safe placeholders labeled as examples where catalog data is unavailable, not invented customer content.
- [ ] Add breakpoint regression/isolated browser fixture proving toolbar visible and focusable at 1440/1024/390; preserve role/validation/publish disabling. Controls at least 44×44; no horizontal overflow. Add mobile preview test: narrow canvas at desktop outer width uses its own mobile breakpoints.
- [ ] Record RED. Render existing composition in order, with stable keys and enabled filtering; render existing footer options; reuse existing renderer/adapters rather than a second theme engine. Clearly label draft preview vs published store. Use preview-container/mode-scoped responsive rules; no global storefront behavior change.
- [ ] Make toolbar accessible on small screens with minimal approved-style placement; ensure dialog focus restore targets stay visible. Keep save/publish conditions intact. Run focused tests and typecheck covering changed interfaces; record GREEN and commit task-owned files.

### Task 3: A04/A05/A06 — draft safety and controlled recovery

**Files:** `components/settings/design/DesignWorkspace.tsx`, `workspace-model.ts`, narrow save-session hook/helper if needed; existing panel unsaved-change helper; relevant lifecycle tests and scoped CSS.
**Interface:** Existing `storefrontDesignApi.workspace/saveDraft/publish` and document/version contracts unchanged. Use existing server versions; never blindly override conflicts. Preserve Task 2 toolbar and preview.

- [ ] Inspect existing navigation/dirty helpers. Write RED mounted real workspace regressions for leave before debounce, failed save retry, 409 then controlled reload/compare recovery preserving local input, queued edits, tab/section/device changes, publish-before-flush failure, forbidden publish. Assert visible recovery/error/dirty behavior and persisted fixture state, not only mock response codes.
- [ ] Preserve pending/dirty input on navigation with explicit guard/recovery; no hidden live writes after intentional discard. Flush chain failures must stay within a handled boundary. Keep latest local revision when older responses arrive. Provide a safe explicit conflict path (read latest, preserve/compare user changes, require deliberate overwrite/discard choice); do not simply reuse fresh version to silently overwrite.
- [ ] Guard read-only roles and concurrent publishing; use truthful draft vs published statuses. No backend changes or browser tokens/storage credentials. Record RED/GREEN, run focused tests and commit task-owned files.

### Task 4: integrated QA, persistence evidence and delivery

**Files:** `docs/qa/design-settings-fix.md`, safe `docs/qa/evidence/design-settings-fix/`, related isolated fixture/tests if coverage gaps remain. Controller performs this task and schedules independent whole-branch review.

- [ ] Run the existing 119 relevant tests and all new regressions on final application source; run Customer Panel full tests, affected package typechecks, Panel production build and diff-check once. Record baseline warnings/skips/errors honestly.
- [ ] Inspect and run existing disposable PostgreSQL design harness only against its isolated test database/container, never live URLs. Prove load/edit/save/re-read and draft/publish/public re-read through real existing repository or actual isolated SQL; if unavailable, report exact dependency, never equate mocked 200 to persistence.
- [ ] Use a localhost isolated fixture of real components (no live session copy) to collect 1440/1024/390 before/after screenshots, modal/focus, overflow and console evidence. Include field-edit/save/re-read and failed-save/conflict paths. No production-only fixture route or build behavior.
- [ ] Independent final review of branch diff vs spec, covering data preservation/concurrency/roles/preview and test evidence; fix actionable findings with focused regressions.
- [ ] Read-only verify Auto/Preview triggers and deployment queue before push. If safe, normal push exact branch and one PR to codex/design-tabs-save-fix-live. Never merge/deploy; retain branch. Report exact candidate SHA, seven-ID table, future affected app deployments and live acceptance still pending.
