# Task 4 acceptance-defect correction report

## Status and scope

Implemented the two bounded acceptance corrections from base `8cf59075d9117b6ee16dfcbb4b581290c75144f8` in the isolated `codex/mira-design-settings-fix` worktree.

Scoped implementation commit: `1badb864` (`fix(customer-panel): close design acceptance regressions`).

- Added one design-canvas-scoped cascade override so the shared legacy mobile rule cannot hide the third configured canvas card based on the outer browser width.
- Updated only the exact design route behavior fixture to provide the production page's real `node:crypto` dependency and a synthetic session ID, then asserted the literal opaque recovery scope.
- No production page, auth, session, API, repository, SQL, backend, runtime, config, deployment, lifecycle, or theme contract was changed.
- No full Customer Panel suite, production build, live browser, or live API was run; the controller owns the integrated final gate.

## RED evidence

### Effective CSS cascade

The regression loads the real design and shared-preview stylesheets into Happy DOM in the demonstrated cascade order, mounts a mobile-mode canvas grid, and reads the third card's computed `display` at both outer widths.

Command before the CSS fix:

```text
node --disable-warning=ExperimentalWarning --experimental-transform-types --test \
  --test-name-pattern='mobile canvas keeps the third product card visible' \
  apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts
```

Result: exit 1; **1 test, 0 pass, 1 fail**.

Exact failure:

```text
AssertionError: outer 390, mobile 390 canvas
'none' !== 'grid'
```

This is the actual failure mode: the third article exists but the effective cascade hides it only when the outer viewport activates the legacy `max-width: 700px` rule.

### Canonical design route fixture

Command before the fixture fix:

```text
node --disable-warning=ExperimentalWarning --experimental-transform-types --test \
  apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts
```

Result: exit 1; **7 tests, 6 pass, 1 fail**.

Exact failure:

```text
✖ design settings mounts the canonical unified workspace
Error: unexpected_unified_design_import:node:crypto
```

The page's real code could not execute because the test module loader did not expose the newly used built-in dependency; its server-access double also lacked the `session.id` read by the page.

## Minimal correction

- Added `.previewViewport .canvasProductGrid article:nth-child(3) { display: grid; }` to the design canvas stylesheet. Its canvas scope preserves the legacy composer's narrow-screen third-card hiding, while its higher specificity wins independently of stylesheet order and outer window width.
- Added real `node:crypto` to the exact compiled-route fixture loader.
- Added the synthetic session `{ id: "fixture-design-session" }` to the fixture's existing authenticated server-access result.
- Preserved all existing workspace, permission, and initial-location assertions.
- Added literal assertions for the SHA-256 recovery scope `55d45995d09039aab1c1270c9e3bd19cdaeeb1414055711abee49a92954d9108` and the React key, proving the client receives an opaque scoped value rather than the session ID.

## GREEN evidence

Immediate commands after the minimal fixes:

```text
node --disable-warning=ExperimentalWarning --experimental-transform-types --test \
  --test-name-pattern='mobile canvas keeps the third product card visible' \
  apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts

node --disable-warning=ExperimentalWarning --experimental-transform-types --test \
  apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts
```

Results: CSS regression exit 0, **1/1 pass**; route behavior exit 0, **7/7 pass**.

Final combined focused verification:

```text
node --disable-warning=ExperimentalWarning --experimental-transform-types --test \
  apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts \
  apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts
```

Result (fresh pre-commit rerun): exit 0; **15 tests, 15 pass, 0 fail, 0 cancelled, 0 skipped**, duration 2068.745625 ms.

Targeted TypeScript program command:

```text
node --input-type=module -e 'import ts from "typescript"; import path from "node:path"; const app=path.resolve("apps/customer-panel"); const configPath=path.join(app,"tsconfig.json"); const configFile=ts.readConfigFile(configPath,ts.sys.readFile); if(configFile.error){throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText,"\n"));} const parsed=ts.parseJsonConfigFileContent(configFile.config,ts.sys,app); const roots=["next-env.d.ts","components/settings/design/VisualStorefrontCanvas.behavior.test.ts","lib/merchant-admin-ui/route-behavior.test.ts"].map(file=>path.join(app,file)); const program=ts.createProgram({rootNames:roots,options:{...parsed.options,noEmit:true},projectReferences:parsed.projectReferences}); const diagnostics=ts.getPreEmitDiagnostics(program); if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>"\n"})); process.exit(1);} console.log("targeted TypeScript check passed (2 changed test files)");'
```

Result: exit 0; `targeted TypeScript check passed (2 changed test files)`.

`git diff --check`: exit 0, no whitespace errors.

## Changed task-owned files

- `apps/customer-panel/components/settings/design-settings.module.css`
- `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts`
- `apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts`
- `.superpowers/sdd/2026-09-14-design-settings-fix/acceptance-fix-report.md` (uncommitted controller evidence)

## Self-review

- Removing the new CSS rule makes the regression fail at outer width 390 with computed `display: none`; the outer 1440/mobile-390 case remains visible, matching the reported asymmetric browser behavior.
- The override is scoped beneath the design canvas viewport and cannot change the legacy composer preview.
- Card generation, row limits, DOM cardinality, grid columns, and theme selection remain unchanged.
- The route test executes the production page source and real SHA-256 implementation. The expected digest is a hand-recorded literal, not computed by the assertion.
- Production authorization and server access were not weakened or mocked in production; only the stale test fixture was completed.
- Root-owned QA documentation, browser driver, screenshots, and JSON evidence were not edited or staged.

## Concerns / downstream notes

- Happy DOM proves the effective `display` cascade using the real stylesheet sources; the controller's already-scoped Chrome rerun remains the final browser evidence.
- A03 remains explicitly partial/open because storefront server projection is outside this frontend acceptance correction.
- Full-suite, full typecheck/build, browser matrix, screenshots, and QA status updates remain the controller's deferred integrated validation.
