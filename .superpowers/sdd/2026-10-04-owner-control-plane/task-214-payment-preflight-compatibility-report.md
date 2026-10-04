# Schema 214 payment preflight compatibility — final isolated acceptance

## Cause and narrow change

Owner startup calls keyed lifecycle preflight, which calls PayTR activation preflight. Schema 210 adds approved support authorization and new-sale admission protections to existing functions while retaining their OIDs, owners and grants. Native preflight digest literals still referenced predecessor bodies, raising `PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_INVALID` and preventing startup.

Schema 214 changes only exact expected-digest literals in seven **actively called** validators. Every protected target is first checked against its independently captured schema-208 definition SHA, saved original body, exact deterministic schema-210 transformation, and pinned approved current definition SHA. Unknown code, permissions, configuration and saved-original drift reject the entire migration. There is no bypass flag or dynamic enrollment of current hashes.

Dependency order: PayTR → single-active → Iyzico evidence → runtime; keyed and the actively called builtin donor → builtin. Uncalled legacy PayTR/keyed validators remain byte-identical. In particular, the builtin donor is called and must be updated; the old keyed donor is only fingerprinted and remains untouched.

## Exact affected validators

| Validator | Before MD5 | After MD5 |
|---|---|---|
| `saas.paytr_iframe_activation_preflight()` | `bb4800816726bbac405b5025403a2435` | `de99b659ad4557a170745a6d40f8a75a` |
| `saas.payment_method_single_active_provider_preflight()` | `85a7339bdbcebd9c69ee5489f0481ce4` | `8cf79ef23d6ce07b179ab7cccd90c651` |
| `saas.iyzico_iframe_tenant_evidence_preflight()` | `37d62c7b91d55757f9b53647569c450b` | `9e3caaf15be00bae7aabcfdda0312a04` |
| `saas.iyzico_iframe_tenant_activation_runtime_preflight()` | `d8e63f02153e7eed8d18519f283b34d9` | `1d327060429c425451460e9b64a242bf` |
| `saas.payment_provider_keyed_lifecycle_preflight()` | `8983b28d075eda62453decb82b1b5880` | `2cf86d5c5bdccf5ffc4bae5f3e344a79` |
| `saas.built_in_payment_methods_preflight_without_provider_compatibili()` | `aaf7c11ecf08eaa950ccdebe1d3b839b` | `71b42bfe3e4c923e177d505baf87078e` |
| `saas.built_in_payment_methods_preflight()` | `54c393baa4a396d0526908e8fad359a5` | `9259186766d4740ee520d18a8bfbd848` |

## Isolated acceptance evidence

Database: `celebix_owner_payment_acceptance_20261004` on the shared PostgreSQL container. Production was read only during investigation; no production mutation, payment, receipt, support session or provider authority change was performed by this agent.

- Native RED: original keyed → PayTR function digest rejection reproduced with its original `P0001` cause.
- Up, assertions, down, exact restoration and re-up all passed.
- Both application and workflow restricted roles return true for PayTR, keyed, builtin, Iyzico runtime and quick-order hosted-payment authority preflights.
- 12 protected targets retain exact approved full definitions and metadata. 11 actively fingerprinted business targets reject unknown body changes. The extra builtin-checkout target is proven unchanged but is not approved against its historically stale storefront validator.
- Seven migration-negative cases passed: protected body, validator body, predecessor backup, protected ACL/config, admission-guard removal and validator ACL.
- Three rollback-negative cases passed: validator body drift, coherently forged backup/hash and replaced function OID.
- Runtime ACL and search-path tampering remain rejected by original native checks and original error codes.
- All 318 existing tables and 384,999 existing rows remain identical, including finance, provider approval, lifecycle, lease and state records. Existing RLS, policies, triggers, constraints, indexes and sequences remain identical.
- All 1,634 function OIDs, owners, grants, configuration, security and volatility remain identical. Exactly seven validator definition hashes change, and twenty literal replacements were verified.
- Down restores all 6,438 manifest entries exactly. Before/restored manifest file SHA256: `3cefd78d2f47b5fa0699b4b4c280e7c84bb047e9d39a24b91e830de58e15b5f1`.
- Only new object: private, forced-RLS `platform_payment_preflight_compatibility_backup` with seven technical predecessor definitions; no application/runtime access.

Artifacts: `.codex-artifacts/platform-payment-preflight-214/{proof.json,before.json,after.json,restored.json,negative-up.sql,negative-down.sql,final-assertions.log,runtime-gates.json}`. Detailed closed signature/hash lists are in `manifest.json` and the migration.

## Source fingerprints

- Up: `cf4ded329788deab9d95743d3751f9e44759e9d01a24cceebcaf11357f848665`
- Down: `1b8de326f6af15d411b2b2a31225d2bf51a789756a4619a6610a80d565477aee`
- Assertions: `a4baa5b87a12c7293a98830425bcb9be971542db7e506b00281a72eebb5a3d66`

## Scope limits / pending runtime acceptance

Older uncalled PayTR/keyed validators retain their historical expectations. `storefront_checkout_preflight()` also has pre-existing stale literals for quote, terminal trigger, merchant config, builtin and hosted checkout that do not match even the saved schema-208 bodies; this validator is not called by current app code. These unrelated differences were neither silently approved nor repaired in 214.

Deployment, live worker restart/cache recovery, public Owner route acceptance and human password/TOTP setup remain the root release task. This report claims only the isolated native gate and restore results above. The backup preserves exact predecessor validators for down; future unknown code or technical-proof drift refuses rollback and requires reviewed recovery.

## Root production acceptance — 2026-10-04

Final214 UP was applied atomically under the shared release lease; actual PayTR, keyed provider, Iyzico runtime and quick-order workflow preflights returned true in BEGIN READ ONLY → ROLLBACK. Private native proof SHA256 `1b44803bd52414af3bfd6f1afe815a13f38e3844320e7d3d0e0854db35b99dc7`.

Five existing containers were restarted with the same IDs/images/source/Config/HostConfig to clear cached failed initialization; all six raw Coolify configurations and OwnerNET witness StartedAt remained unchanged. Final six runtime/generated+compiled payment maps/limited roles and actual merchant payment readiness plus12 public HTTP checks passed at01:42:04Z. Evidence SHA256 `d3266b7ee24a762ddf300b5f20078b37d5454cdc7eca8fc586c0f156e88199d0`. Both Owner login routes additionally returned HTML200. No provider or production financial mutation was invoked. Human password/TOTP setup and authenticated acceptance remain pending.
