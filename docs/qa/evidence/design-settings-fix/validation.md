# Final validation record

## Intermediate integrated source: 8cf59075d9117b6ee16dfcbb4b581290c75144f8

- Relevant regression groups:66+16+65 =147 PASS /0 FAIL /0 SKIP; original119 retained,28 added. Commands below.
- `npm run typecheck --workspace @celebix/customer-panel`:PASS.
- `npm run typecheck --workspace @celebix/saas-contracts`:PASS.
- `npm run typecheck --workspace @celebix/storefront-design-ui`:PASS.
- `npm run build --workspace @celebix/customer-panel`:PASS; webpack compile91s, TypeScript24.5s,81 static pages. No Coolify release wrapper or payment generator was run.
- Disposable native PostgreSQL16 harness:17/17 PASS, including real adapter save/re-read, stale rejection, publication/public read, backup/restore and own-session cleanup.
- Local file-persistence harness:PASS actual client+adapter HTTP save/independentGET/stale409/publication/GET/actual shared renderer comparison. No mocked200 response and no live tenant.
- `git diff --check`:PASS.

Relevant regression commands (Node24.11.1):

```sh
node --disable-warning=ExperimentalWarning --experimental-transform-types --test apps/customer-panel/components/settings/design/*.test.ts apps/customer-panel/lib/storefront-design-ui/*.test.ts packages/storefront-design-ui/src/*.test.ts
node --disable-warning=ExperimentalWarning --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/storefront-design-http/*.test.ts apps/customer-panel/lib/server-storefront-design/*.test.ts packages/saas-data/src/storefront-design/*.test.ts
node --disable-warning=ExperimentalWarning --experimental-transform-types --test apps/customer-panel/lib/starter-theme-composer-model.test.ts apps/customer-panel/components/settings/StorefrontAssetManager.test.ts apps/customer-panel/components/settings/StarterTheme*.test.ts packages/saas-contracts/src/storefront-design/*.test.ts
node --disable-warning=ExperimentalWarning --experimental-transform-types tests/saas-phase3/homepage-builder/postgres-harness.mjs
node --disable-warning=ExperimentalWarning --experimental-transform-types tests/saas-phase3/hemenaku-admin-presentation/design-settings-persistence.mjs
```

The ordinary npm full Panel test returned exit1. Its initial captured report was truncated; it is not counted as acceptance. A diagnostic rerun preserved the exact package-script file groups with `--test-concurrency=4`; first group1369 tests,1367 PASS,1 FAIL,1 existing SKIP. Failure: `design settings mounts the canonical unified workspace`, `unexpected_unified_design_import:node:crypto`. Since `&&` stopped the script, its unchanged react-server second group was run independently:54/54 PASS. Combined intermediate result1421 PASS /1 FAIL /1 SKIP, not green.

Existing skip: `price-list-console.test.ts` actual Next pricing guard is opt-in (`CELEBIX_PRICING_NEXT_GUARD=1`). It was not enabled or hidden in this task. Ordinary run reports Node ExperimentalWarning; bounded first group155 such warnings. Existing `MODULE_TYPELESS_PACKAGE_JSON` for platform-config remains, without changing unrelated package metadata. Focused commands suppress only the accepted ExperimentalWarning diagnostic.

Final acceptance correction and its exact source/results are appended after verification. Do not add overlapping focused and full-suite counts into a fictitious unique grand total.

## Final application source: 1badb864b64c3bcc8138f3b6157e6c4bc6c9f085

The only changes after8cf59075 are one scoped canvas CSS rule, its computed-style regression and the exact existing route test fixture. No adapter, workspace lifecycle, persistence, SQL, shared contract or renderer implementation changed.

- Full Panel suite, exact package-script file groups with concurrency4: **1422 PASS /0 FAIL /1 existing SKIP** (1368+54 PASS;1369+54 total). Exit0; first group61.5s, second1.4s. Only Node ExperimentalWarning suppressed;7 existing MODULE_TYPELESS_PACKAGE_JSON diagnostics remain visible/counted.
- Changed design regression group rerun: **67/67 PASS**. Unchanged groups16 and65 retain their exact8cf59075 proof; total relevant coverage **148 PASS**, original119 retained plus29 regressions. Counts overlap the full Panel suite and are not added to it.
- Acceptance fix focused source/test review:15/15 PASS, targeted TypeScript for both changed tests PASS. Full three-package typechecks at8cf59075 remain applicable: no typed application source changed afterward. Final production build also includes Panel TypeScript checking.
- Real Chrome card visibility regression:RED3≠4 before the CSS correction; GREEN4/4 in each of two rows at outer390 and1440 with mobile mode.
- Final1440×1000,1024×1000,390×844 PNGs captured on this source. Four toolbar controls visible,48px height,center-hit,keyboard access and zero horizontal overflow. Only synthetic data is captured.
- Disposable PostgreSQL17/17 and actual file-backed save/publication/renderer comparison at8cf59075 remain exact persistence/adapter proof because those source files are identical in1badb864. No redundant DB run was used as live acceptance.

Full-suite runner (preserves both package-script groups and their shell expansion; no tests omitted):

```js
const command = JSON.parse(readFileSync("apps/customer-panel/package.json", "utf8"))
  .scripts.test.replaceAll("node --", "node --disable-warning=ExperimentalWarning --test-concurrency=4 --");
spawnSync(command, { cwd: "apps/customer-panel", shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
```

Final `npm run build --workspace @celebix/customer-panel`: **PASS**, exit0 on1badb864; webpack compile36.5s, Panel TypeScript18.0s,81 static pages generated. No release wrapper, payment approval generator, environment copy or deployment was run. QA-only commits afterward do not change the tested application source.

Final browser source1badb864: toolbar matrix at1440/1024/390 plus390×480 passes; menu→Header→Escape focus restoration passes; live computed third-card visibility4/4 at390 and1440 passes; synthetic category grid2 andduo1 at390 canvas in1440 outer pass, duo persisted through full reload. Captured console errors/warnings empty. The test-only browser driver observes the existing200ms width animation until its rendered390px target rather than failing on a transient392.57px width.
