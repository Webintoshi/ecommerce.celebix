# Task 8 — independent review of newly recreated runtime helpers

**Verdict: accepted for root's explicit read-only runtime execution.** No remaining P1/P2/P3 finding was established in the requested bounded source/fixture review. This acceptance applies only to the new hashes below; it does not inherit the historical107-input or old `/tmp` helper receipt.

Old `task-8-runtime-verifier-review.md` and its hashes/findings were read and retained unchanged. New sources and the author's new source-only report were inspected. The review made no remote/SSH/Docker/HTTP/SQL/provider call, imported no application/worker/provider module, and changed no application or author-helper source. Only new local review drivers/receipts and this report were created.

## Stable reviewed inputs

All mode0600 under current-user-owned mode0700 `/Users/Celebix/.codex/onboarding-release-20260929`:

| New helper | SHA256 |
| --- | --- |
| `celebix-onboarding-runtime-20260929-inspect.mjs` | `757e8d57e6f08c1a0967a31982aca9718c8154df3b26151e43b9fb14478ca144` |
| `celebix-onboarding-runtime-20260929-verify.py` | `ced3756648e68412bf212066fe5ee88d298fc838f7f65de4d8c514884833b273` |
| `celebix-onboarding-runtime-20260929-plan.json` | `53356d843e14f6022be6126d9ca3bdb84d2ee686f1862d0d059ffc99ce93a975` |
| Author's inert fixture seam `...-selftest.py` | `f35aafdf7c96a4c3797dc110ff3e8a7a01ebb609f018a7122f68b8f340308538` |

These hashes were checked before the peer fixture run and again after all bounded checks; no stable input changed during review. The Python sources parsed successfully. The author reports a separate24/24 run; the independently executed results below are new evidence.

## Frozen source and target bindings

Fresh independent `git show` byte hashing and `git rev-parse` blob checks match all **116 unique planned runtime inputs** at exact release `3de4bbcdb2808a97e4add42023356b0af2dae046`. Recreated coverage is79 changed runtime inputs plus explicit auth/health/payment inputs; the lost old107-path list was not fabricated or reported as recreated. The manifest reports this distinction. The six fixed target UUID/app/scope tables independently match the authorized release targets.

| Kind | Planned inputs | Qualified actual absence of the two build generators | Compiled routes |
| --- | ---: | ---: | ---: |
| Panel |45|43 hash matches /45 planned|8|
| Storefront |27|No qualification; both required|4|
| Owner |74|72 hash matches /74 planned|8|

The independent fixture result checks `exists:false`, `matches:null`, absent `sha256`, exactly2 packaging-qualified files and actual hash-match counts for qualified Owner/Panel omission. Present wrong generator bytes, dangling links, other missing sources and any Storefront generator omission fail. The exception names are only `scripts/generate-iyzico-sandbox-build.mjs` and `scripts/generate-paytr-build.mjs`.

Pinned frozen `nixpacks.toml` blob/hash were freshly verified: blob `5d690d48c984bc72a59f0e8e60edb93f3952102f`, SHA256 `3b5c2c5d07447f78439dc8adbf772024117c9778466795fcde84a3e91be52bff`. Exact `node:20-bookworm` and the eight-item `[start].onlyIncludeFiles` policy are required. Both wrong image and wrong include-list fail the inspector; independent in-memory plan mutations also fail `checked_plan` before any remote dispatch. Wrapper plan checking independently rederives fixed targets, source specs, routes/markers/scopes, packaging and payment data and compares the entire plan.

## Payment tuple and scope gates

All three candidate objects/digests were independently recomputed from the six frozen source inputs per provider and canonical evidence JSON, without executing the adapter/generator. They match both plan and the expected release digests:

- PayTR test: `sha256:b96dab8d08456335280414992966d7b8ac0ba7a87c67b8743f708c5d5cd519c3`.
- PayTR live: `sha256:cba8a4ce524871ef32c6682de255967e52cd352cc2d35a9a488bb7555e74fe63`.
- Iyzico test: `sha256:91760c99a9839301737cee72524a4c84896e3b0453ad5690e98348ac50e9ee59`.

NET Panel/Storefront/Owner require all compiled/generated scopes closed. SITE Panel/Storefront require PayTR test+live only. SITE Owner requires PayTR test only. Iyzico compiled/generated authority remains closed everywhere. Raw approval-mode booleans are observational and explicitly not compared with compiled scopes; independently tested Owner NET and Owner SITE fixtures accept approved raw modes together with their closed compiled/generated scopes.

The restricted parser does not evaluate JavaScript. Generated metadata/candidate/authority objects require exact keys, values, environment/version/digest/frozen source binding. Flat generic three-field compiled authority literals are separately collected and rejected unless the exact tuple is approved for the target. Duplicate literal fields are counted and rejected, extra-field metadata is not mistaken for an authority, and flat candidate literal scope/source bindings are separately checked.

Fresh independent **36/36 lexical checks passed**: all6 field orders ×3 unquoted/double/single key-value quote styles, each with trailing comma, rejecting18 stale NET authorities and accepting18 exact SITE-test authorities. Two wrong environment/version cases fail, and extra-field metadata remains accepted as nonauthority. These are static literal checks, not arbitrary computed JavaScript execution proof.

## Image, protocol, flag and read-only boundaries

Wrapper source requires exactly one UUID-patterned running container, exact `<applicationUuid>:<frozenSha>` image, matching full container/image identities and the expected tag's local image ID. Only none/healthy Docker health status is accepted, and actual inspector Node version must be20. Five fresh mocked wrapper cases matched expected outcomes: valid identity passes; wrong image, wrong tag image ID and duplicate containers reject; Node22 produces a failed result. All five use injected fake SSH responses; actual remote calls0.

Fresh inert inspector cases reject wrong `SOURCE_COMMIT`, a missing compiled route, missing worker bundle, enabled worker flag and enabled status flag in the default disabled phase. Route keys/files and compiled marker/file/hash evidence are source-checked. Worker runtime is read as text; `imported:false` and `tickExecuted:false` remain explicit. `protocolProof:static_source_and_compiled_markers_only` remains explicit and cannot establish actual signed202/authenticated session/status cookie/handoff behavior.

Inspector imports only `node:fs`, `node:path` and `node:crypto`. It does not import/evaluate application, provider or worker code, initialize/tick jobs, query a DB or request HTTP. Environment reads are limited to source SHA, three approval modes, worker/status flags and fixed edge addresses; invalid SHA/flags become null, and raw secret-like literal strings are not serialized. Docker selection requests only ID/name/image/imageId/running/health, never full env/labels. Errors are controlled categories rather than raw command stderr or exception messages. SSH host/key/strict host-key settings are fixed; there is no queue/config/rebuild mutation. Operational remote work requires explicit `--run-remote`; default CLI rejects before dispatch. New outputs are exclusive/private in the exact0700 helper directory.

## Independent executed evidence

1. `runtime-peer-review.py`: **56/56 pass**, exit0, using the author's inert fixture construction seam in an in-memory copy (stable helpers were not edited). This includes the36 lexical checks,8 packaging/policy checks, metadata/version/environment/raw-mode cases and source/route/worker/flags guards plus default dispatch/plan equality checks. Inert compiled text was read, never executed. Temporary fixture directories were removed by their owned TemporaryDirectory lifecycle.
2. `runtime-peer-bindings.py`: **116 frozen input hashes+blob IDs,6 target tables,3 independent candidates,2 local policy negative checks and5 mocked image cases pass**, exit0. Git reads were local; no actual SSH/Docker/HTTP/DB call occurred.

| New review evidence | SHA256 |
| --- | --- |
| `runtime-peer-review.py` | `7be64d8546bd7029b5f5445cd4afed49f8e3d9f0b00fc7c672e8ff211ffd2579` |
| `runtime-peer-review-20260929-result.json` | `129f54a1f5e193933e4146a9d3bbf8e15c2a9ecf9f1290980a29725850e10b7c` |
| `runtime-peer-bindings.py` | `aa5b309b36611d2dd79ca96d6ca63c16e5c5bd2c032b01d73724c9efa7a289ad` |
| `runtime-peer-bindings-20260929-result.json` | `21b8c6bff198e2019033e2c12fd2741ee806bc021ccf01f1a9d2cc323357287a` |

All evidence files are private0600. The source-only review stops here after the concrete prior regressions and recreated image/source gates were covered. Actual released image/source/compiled evidence, public health, wildcard TLS, signed browser flow, worker import/heartbeat and payment authority/config preservation remain root-owned separate gates. This report does not claim any new live runtime success or provider execution.

## Follow-up — actual-probe verifier assumptions corrected in new v2 files

The acceptance above is historical source-only evidence for the initial recreated wrapper. Root's actual first all-six receipt, `runtime-all-six-disabled-20260929.json`, subsequently exposed **two verifier assumptions**, without establishing an application regression:

1. Four Panel/Owner selected Docker identity reads failed when the original template addressed absent `.State.Health` map fields directly. The author retained a controlled Owner comparison: original dot-map format returned1 with the missing Health map-key category; the full six-field nested-index format returned0 with six JSON values and health`none`. This reviewer did not execute Docker or that comparison.
2. Both Storefront inspector results internally passed source27/routes4/payment scopes at Node22.23.3, but the initial wrapper incorrectly imposed Node20 globally. Isolated QA Node20 builds are separate evidence; they are not proof that the selected live Storefront Docker recipe runs Node20.

The author created new v2 wrapper/plan files and retained all v1 helpers/plan and the failed root receipt. Final follow-up **ACCEPT** applies to:

| Corrected input | SHA256 |
| --- | --- |
| `celebix-onboarding-runtime-20260929-verify-v2.py` | `8b7b12c430c1caba2b29f9d7cb6173e2d7d85413928b0313141d91ebef1088ab` |
| `celebix-onboarding-runtime-20260929-plan-v2.json` | `4b035b5c66d79150879b4c079781c0825d264467027f4f3d3cdeee5a3d4e1da2` |
| Selected build-config provenance | `fc2781d196d842cab7169e27ce9572e61dc578bf00d0925125bc19e61e4a030e` |
| Inspector, unchanged | `757e8d57e6f08c1a0967a31982aca9718c8154df3b26151e43b9fb14478ca144` |

Fresh independent frozen `Dockerfile.storefront` checks match blob `dccfcb75df07743d03852adffa977fee335279c2`, SHA256 `8b707a735b741c879bc5ede9b5625bdc6edcea26d2ea2263012a48d1e1466aca`, and exactly `FROM node:22-bookworm AS build` plus `FROM node:22-bookworm AS runtime`. The pinned nixpacks Node20 policy remains required for Owner/Panel. The selected provenance records only the six known application UUIDs, `build_pack` and `dockerfile_location`: Owner/Panel use nixpacks/null, Storefront uses dockerfile/`/Dockerfile.storefront`. It contains no env/labels or merchant data. Its source is the author's/root-owned selected read, not this reviewer's operational query. The plan explicitly says `freshReadDuringRemoteProbe:false`; configuration preservation/drift evidence remains root-owned.

Node acceptance is exact per target: Owner/Panel20 and Storefront22. It is not a global20-or22 range or a skipped version check. Frozen blob/byte hash and exact FROM statements, selected recipe/provenance, expected-major policy and target fields are regenerated and included in full plan equality before remote work. Bad target major, policy major, frozen FROM declaration and incompatible saved selected build recipe reject. Docker Health now uses nested map indexing and explicitly reports absence as`none`/healthcheckConfiguredfalse; unhealthy/starting or mismatched image/source identity checks remain unchanged.

The v2 diff and independent plan comparison establish that all116 source specs, candidate/payment scopes, compiled route lists and markers are unchanged. Inspector757e bytes are unchanged, so prior56/56 stale-authority/qualified-absence/flag/source checks are preserved as their historical evidence; they were not broadly rerun for this wrapper-only correction. Source count stays116/79, Panel45/SF27/Owner74; both `nixpacks.toml` and `Dockerfile.storefront` are explicit local-only packaging inputs.

### Narrow independent v2 verification

`runtime-peer-v2-node-policy.py` ran only locally with fake SSH responses and frozen Git reads: **6/6 per-kind major positive/negative cases passed** (Panel20 accepted/22 denied, Owner20 accepted/22 denied, Storefront22 accepted/20 denied), health-map index selection/absence handling passed, and **4/4 policy/provenance negatives rejected**. The actual remote command function was replaced before every `probe` invocation. No SSH/Docker/HTTP/DB/provider/app call occurred, and no application or author source changed. Stable v2/provenance/inspector hashes were rechecked. No required follow-up fix remains in this bounded review; actual root corrected runtime execution is still a separate gate.

Private0600 driver SHA256: `31e84973a87bcfc5fa1d4b7558f2d5e40b7f4350923a7fa2e32a78b3e5579421`; new private0600 `runtime-peer-v2-node-policy-20260929-result.json` SHA256: `aa9069ffd96df287c9468c2557b0596f8eb3d4ca0c5e31feac56bf766546aba3`. These are new exclusive evidence files; earlier receipts were not overwritten.
