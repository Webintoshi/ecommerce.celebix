# Sole final correction wave report

## Status and scope

Implemented both review corrections from base `508eb54260c9fbbec55d36b03177b59b9ca2ad19` in the isolated `codex/mira-design-settings-fix` worktree.

Scoped implementation commit: `8cf59075` (`fix(customer-panel): preserve section IDs and preview counts`).

- V3 product-row source replacement now retains the existing stable `sectionId` through the central update path.
- Product scaffolds now require an explicit bounded count: both legacy composer-preview call sites retain three cards, while the design canvas derives 4/8/12 examples from each product row's `limit`.
- No validator, shared contract, API, repository, SQL, auth, runtime, config, deployment, live browser, or lifecycle source was changed.
- No full Customer Panel suite or production build was run; those remain the controller's integrated final gate.

## RED evidence

Regression command before production changes:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts
```

Result: exit 1; **11 tests, 8 pass, 3 fail, 0 skipped**.

Exact behavioral failures:

```text
✖ switching a V3 category product row source preserves its stable identity and order
AssertionError: latest should emit one valid composition
0 !== 1

✖ product-row scaffolds render the exact count requested by each row contract
AssertionError: 4 !== 8

✖ legacy composer preview keeps its established three-card cap
AssertionError: 4 !== 3
```

The first failure proves the unchanged strict serializer rejected the identity-less replacement and invoked no callback. The latter two prove canvas examples were hard-coded to four and the shared scaffold exposed four real products instead of the legacy cap.

## Minimal implementation

- `StarterThemeComposer`'s central `updateSection` now copies `sectionId` from the existing row when—and only when—the validated row has one. Identity-less V2 rows remain identity-less; V3 keeps its literal existing ID.
- `ProductCards` accepts a required `count: 3 | 4 | 8 | 12`, slices real catalog titles to that count, and creates exactly that many fallback examples.
- Both legacy `StarterThemePreview` uses pass `count={3}`.
- `VisualStorefrontCanvas` passes the validated product-row `section.limit` directly.

## GREEN evidence

Immediate focused regression command after the minimal production fix:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts
```

Result: exit 0; **11 tests, 11 pass, 0 fail, 0 skipped**.

Final focused source/test/model verification (warning suppression applies only to Node's accepted experimental-runner warning):

```text
node --disable-warning=ExperimentalWarning --experimental-transform-types --test \
  apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts \
  apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts \
  apps/customer-panel/components/settings/design/DesignWorkspace.test.ts
```

Result: exit 0; **67 tests, 67 pass, 0 fail, 0 cancelled, 0 skipped**, duration 1854.349 ms.

Behavior specifically proven:

- Mounted literal-ID V3 category row switches independently to both `latest` and `sale`.
- Each edit emits exactly one payload accepted by `parseStarterThemeCompositionConfig`.
- Schema V3, the exact three-ID order, the edited row's literal ID, and all other section objects remain unchanged.
- Canvas product rows configured for 4, 8, and 12 render exactly 4, 8, and 12 example cards.
- The legacy composer preview renders exactly three cards for both a four-title catalog input and an empty-catalog fallback.

Targeted TypeScript program command:

```text
node --input-type=module -e 'import ts from "typescript"; import path from "node:path"; const app=path.resolve("apps/customer-panel"); const configPath=path.join(app,"tsconfig.json"); const configFile=ts.readConfigFile(configPath,ts.sys.readFile); if(configFile.error){throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText,"\n"));} const parsed=ts.parseJsonConfigFileContent(configFile.config,ts.sys,app); const roots=["next-env.d.ts","components/settings/StarterThemeComposer.tsx","components/settings/StarterThemeComposer.behavior.test.ts","components/settings/StarterThemePreview.tsx","components/settings/StarterThemePreviewScaffolds.tsx","components/settings/design/VisualStorefrontCanvas.tsx","components/settings/design/VisualStorefrontCanvas.behavior.test.ts"].map(file=>path.join(app,file)); const program=ts.createProgram({rootNames:roots,options:{...parsed.options,noEmit:true},projectReferences:parsed.projectReferences}); const diagnostics=ts.getPreEmitDiagnostics(program); if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>"\n"})); process.exit(1);} console.log("targeted TypeScript check passed (6 changed source/test files)");'
```

Result: exit 0; `targeted TypeScript check passed (6 changed source/test files)`.

`git diff --check`: exit 0, no whitespace errors. Pre-commit staged-name inspection contained exactly the six source/test files listed below.

## Changed task-owned files

- `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- `apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts`
- `apps/customer-panel/components/settings/StarterThemePreview.tsx`
- `apps/customer-panel/components/settings/StarterThemePreviewScaffolds.tsx`
- `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx`
- `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts`
- `.superpowers/sdd/2026-09-14-design-settings-fix/final-fix-report.md` (uncommitted controller evidence)

## Self-review

- The ID fix is central rather than source-control-specific, so all same-row replacement objects inherit their validated V3 identity.
- The conditional identity copy does not invent IDs, does not migrate V2, and cannot reorder rows.
- No production `any`, type assertion, validator relaxation, fallback composition, initialization write, or error-swallowing path was added.
- The card count is supplied explicitly at every call site and is bounded by legacy/card-contract values.
- Existing component visual structure and classes are unchanged; only rendered cardinality now follows the correct authority.
- Root-owned QA documentation, browser driver, browser evidence JSON, and final-review evidence were not staged or edited.

## Concerns / downstream notes

- The canvas intentionally shows examples rather than resolved live catalog data; this correction changes only the number of examples to match the stored row contract.
- A03 remains explicitly partial/open because server projection is outside this frontend correction wave.
- Final full-suite, full typecheck/build, responsive screenshots, browser matrix, and held-PATCH serialization remain the controller's deferred integrated validation.
