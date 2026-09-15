# Task 3 — scoped draft lifecycle safety

Status: complete. Commit: `a20adfe4` — `fix(customer-panel): protect draft lifecycle and recovery` (only the four owned files). This report is intentionally uncommitted scratch evidence.

## Scope and reproduction

Worktree: `/Users/Celebix/Documents/ChatGPT/mira-design-settings-fix`, branch `codex/mira-design-settings-fix`; implementation started from `3a704338bd3f74f7d6f3f575f7c7b8826bf64728`. Earlier adapter, toolbar and preview work is preserved. A03 server projection remains a separate dependency.

Original workspace behavior: leaving before the 700 ms debounce had no dirty-navigation guard and cleanup silently cleared pending input; save failures exposed no explicit retry; a conflict left no compare/reload/discard/overwrite path; publish awaited its flush before entering its try/catch; duplicate publish attempts could begin before publishing status was set; field callbacks had no read-only guard. Strict Mode effect cleanup also permanently set the mounted ref false, suppressing save-result and failure updates after effect reinstallation.

## Behavioral regressions and RED

Command from the worktree root:

`node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignWorkspace.lifecycle.test.ts`

After correcting test setup (actual surface label `Logo ve marka` and a valid hero media reference), the original production code failed **9/9 mounted behavioral tests** in 7.4 s. Failure evidence included before-unload false instead of true, missing save/conflict/retry states, read-only preview changing to Unauthorized, and application navigation accepted during an active flush. All fixtures mount the real DesignWorkspace, toolbar, modal, state model and dirty-navigation guard, under React StrictMode. Only external API access, topbar host and heavyweight field/canvas presenters are controlled collaborators. Tests assert local visible values, navigation effects and versioned in-memory persisted draft/publication state.

Follow-up RED command:

`node --experimental-transform-types --test --test-name-pattern='409 recovery' apps/customer-panel/components/settings/design/DesignWorkspace.lifecycle.test.ts`

Failed on missing accessible local/remote difference table, before replacing raw comparison dumps with a readable field comparison.

Follow-up RED command:

`node --experimental-transform-types --test --test-name-pattern='forbidden publication' apps/customer-panel/components/settings/design/DesignWorkspace.lifecycle.test.ts`

Failed because publication failure still displayed Kaydedilemedi instead of Yayınlanamadı, before distinguishing failed operations and adding the explicit publication retry action.

## Minimal fix

- Reuse createDirtyNavigationGuard without editing the shared helper. Bind before-unload and normal same-origin application-link navigation; refused navigation retains local fields. Explicit discard invalidates queued work and clears debounce. Active write/publish prevents intentional application navigation until settled, avoiding a false promise that an already accepted request can be rolled back.
- Keep synchronous current-editor refs, versioned serial writes and monotonic saved revisions. Epoch and mount checks suppress abandoned responses; abort on unmount and refuse queued jobs afterward. Reinstall mounted state correctly under StrictMode.
- Save jobs return handled success/failure values. Retry clears a recoverable failure deliberately. Editing after failure/conflict preserves local input and does not silently resume autosave.
- A 409 pauses writes. Explicit comparison reads the latest workspace and displays changed local/remote fields without replacing local input. Only a deliberate whole-draft overwrite adopts the read version for a conditional write. Explicit discard installs the read draft without writing. A further remote edit produces another ordinary 409. Failed comparison keeps local state and remains retryable.
- Acquire publish lock before waiting/flushing, guard read-only mutation callbacks, and disable fields during publication. A failed flush never publishes. Published revision/timestamp update only on successful publication. Save, publication failure, saved draft and published statuses are distinct.
- Recovery controls are placed inside the open modal or outside when closed, keeping them keyboard reachable. Existing toolbar and preview are preserved. Comparison rows are presentational only and never transform the design sent to the existing API.

## Owned files

- `apps/customer-panel/components/settings/design/DesignWorkspace.tsx`
- `apps/customer-panel/components/settings/design/workspace-model.ts`
- `apps/customer-panel/components/settings/design-settings.module.css`
- `apps/customer-panel/components/settings/design/DesignWorkspace.lifecycle.test.ts`

No API, repository, SQL, authentication, contract/validator, infrastructure, browser fixture, controller harness or audit-file changes. No further agents and no live browser/session/infrastructure operations.

## GREEN and verification

Initial command:

`node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignWorkspace.lifecycle.test.ts apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts`

Passed **10/10** (9 lifecycle + existing toolbar).

Expanded focused command:

`node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignWorkspace.lifecycle.test.ts apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts apps/customer-panel/components/settings/design/workspace-model.test.ts`

Passed **22/22** after adding failed reload/second conflict and unmount queue cancellation cases. No failure, cancellation or skipped tests.

Final focused coverage command:

`node --experimental-transform-types --test --experimental-test-coverage apps/customer-panel/components/settings/design/*.test.ts`

Passed **50/50**, exit 0, duration 18.1 s, zero failures/skips/cancellations. This includes all existing design-folder tests plus 11 mounted lifecycle regressions. V8 coverage output was generated; dynamically transpiled mounted component modules are not reliably attributed to their original TSX paths, so this report does not claim an overall production-component coverage percentage.

Final typecheck:

`npm run typecheck --workspace @celebix/customer-panel`

Passed, exit 0. The full Panel suite/build is intentionally reserved for controller integration.

## Self-review and limits

Checked latest input retention against older responses, saved-vs-published fixture state, strict permission callbacks, duplicate publication, explicit conflict choice, second remote conflict, failed reload, unmount queue cleanup, unchanged stable IDs/media references/schema and unstaged controller files. `git diff --check` passes.

The mounted collaborator is **in-memory fixture persistence**, not durable server or PostgreSQL evidence. Controller owns real localhost file-persistence and isolated PostgreSQL verification. The shared navigation helper covers before-unload and application anchor clicks; it does not intercept arbitrary imperative router/history navigation. An already server-accepted request cannot be undone by aborting its client; application navigation is therefore blocked during an active write. Full document comparison uses positional array rows so section ordering changes are visible; no automatic merge or silent overwrite exists. Existing API semantics remain authoritative.

Node's experimental transform-types warning is expected. Initial typecheck found two fixture-only typing issues (public brand media shape and happy-dom confirm assignment); those were fixed explicitly, without type assertions to suppress errors.

## Fix round 1 — same-document history recovery

Status: complete. Scoped fix commit: `45af25dc` — `fix(customer-panel): recover drafts after history navigation`. Report remains uncommitted.

Independent review correctly identified that the existing shared navigation guard does not intercept client-side Back/Forward. The earlier navigation limitation is **repaired by recovery**, not treated as accepted draft loss. Fix base: `a20adfe4378a786f6a858e3b2bd678afe66f00db`.

### RED

`node --disable-warning=ExperimentalWarning --experimental-transform-types --test --test-name-pattern='same-document|history recovery' apps/customer-panel/components/settings/design/DesignWorkspace.lifecycle.test.ts`

Failed **3/3** against the fix base. Actual happy-dom `history.back()` / `history.forward()` events drive a minimal React route host that unmounts/remounts the real workspace. Pre-debounce input returned as Original rather than History pending; failed input returned as the fresher Remote rather than History failed; returning to the original scope also lost Only scope A. The route host is a controlled collaborator, not the real Next router; controller owns actual browser acceptance.

An additional RED assertion (`--test-name-pattern='same-document Back/Forward'`) demonstrated that restored pending input incorrectly claimed another session had changed it. The corrected label explicitly says an unsaved draft was restored and does not claim a confirmed remote conflict.

### Fix and scope

- Added `draft-navigation-recovery.ts`, a browser-lifetime module Map bounded to eight unsaved drafts. Unmount retains unsaved editor state before canceling pending writes. Clean saves and both explicit-discard paths clear the matching entry. There are no storage APIs, history payloads, cookies, credentials or network operations in this helper.
- `DesignWorkspace` accepts an optional opaque `recoveryScope`; missing scope disables retention rather than inventing identity. Recovered input is shown immediately with autosave/publication paused. A fresh workspace read through the existing comparison action is required before deliberate whole-draft overwrite or discard, even if remounted router props appear current. The existing conditional write protects against a further remote edit.
- The real design page already resolves authenticated session and tenant context. It now hashes the existing session identity, principal identity and store identity into a non-authoritative frontend scope, and uses the scope as the React key. Only that opaque digest reaches workspace props. This is frontend cache isolation and remount identity; neither the scope nor any new identity field reaches APIs, repository calls or mutation authority. Authentication, session resolution, contracts and runtime behavior are unchanged. No real identifiers or credentials were used in tests or recorded here.
- Tests cover pre-debounce recovery, failed-save recovery against a newer remote version, no silent resumed writes, mandatory comparison, different-scope isolation, conflict discard clearing and intentional navigation discard clearing. Fixtures use synthetic scope names only.
- Parent confirmed the identity-bound frontend propagation is within scope and added its own synthetic fixture scope; this task did not edit controller fixtures.

### Verification

The three history regressions passed **3/3** after the fix. The final focused command was `node --disable-warning=ExperimentalWarning --experimental-transform-types --test --experimental-test-coverage apps/customer-panel/components/settings/design/*.test.ts` (output filtered for concise reporting with shell pipefail enabled). It passed **53/53**, exit 0, duration 20.4 s, zero failures/cancellations/skips. `npm run typecheck --workspace @celebix/customer-panel` passed, exit 0. `git diff --check` passed.

Runner diagnostic: the repository uses Node's experimental type-transform runner. Its standard ExperimentalWarning is an accepted runner diagnostic, not an application warning. This round uses Node's supported `--disable-warning=ExperimentalWarning` flag to suppress that diagnostic only; test failures and application/React warnings are not suppressed. All round-1 commands above completed without that diagnostic. No localhost requests, live browser operations, runtime/configuration changes, full Panel tests or build were performed by this task.

### Self-review

Recovered state cannot silently adopt a fresh server version. Scope changes key a new workspace and cannot read another scope's retained entry. Explicit discard clears retention before queued-work cleanup, while successful save clears it only once the newest local revision is saved. StrictMode reinstallation retains dirty state without starting extra requests. In-flight abort semantics remain unchanged: an already accepted server write is reconciled by explicit latest comparison on return. Retention is bounded, ephemeral browser memory and does not survive a full document reload; the existing before-unload warning protects that separate path. Actual Next/browser history acceptance and integrated tests/build remain controller work.

Round-1 owned files: `app/settings/design/page.tsx`, `components/settings/design/DesignWorkspace.tsx`, `components/settings/design/draft-navigation-recovery.ts`, and `components/settings/design/DesignWorkspace.lifecycle.test.ts` under `apps/customer-panel`.
